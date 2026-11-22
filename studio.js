import { demoCode } from './demo.js';
import { loadRuntime, makeFrameDocument } from './frame.js';
import { MAX_BACKUP_BYTES, MAX_SOURCE_BYTES, blank, dimensions, isPNG, isView, newProject,
  readProject, storeProject, timeText, validateProject } from './project.js';
import { downloadAll, downloadPanel, downloadSheet, makeSheet, save, sheetSize } from './export.js';

const $ = id => document.getElementById(id);
const fa = new Intl.NumberFormat('fa-IR');
const byId = (id, callback, event = 'click') => $(id).addEventListener(event, callback);
let project = newProject();
let frame = null;
let launchVersion = 0;
let dependencies;
let runtime = null;
let sequence = 0;
let loadTimer = null;
let capturing = false;
let capturePanelIndex = null;
let mode = 'orbit';
let sheetVersion = 0;
let saveQueue = Promise.resolve();
let storageProblem = false;
let saveVersion = 0;
const pending = new Map();

function status(message) {
  $('status').textContent = message;
}
function showError(error) {
  status(error.message || String(error));
}
function persist() {
  const state = structuredClone(project);
  const revision = ++saveVersion;
  $('save-status').textContent = 'در حال ذخیره…';
  saveQueue = saveQueue.catch(() => {}).then(() => storeProject(state)).then(() => {
    if (revision === saveVersion) {
      storageProblem = false;
      $('save-status').textContent = 'پروژه در این مرورگر ذخیره شد.';
    }
  }).catch(() => {
    storageProblem = true;
    if (revision === saveVersion) $('save-status').textContent = 'ذخیره در مرورگر ممکن نشد. پشتیبان پروژه را دانلود کن.';
  });
}
addEventListener('beforeunload', event => {
  if (!storageProblem) return;
  event.preventDefault();
  event.returnValue = '';
});

function packet(method, value) {
  const child = frame;
  if (!child || !runtime?.ready) return Promise.reject(Error('صحنه آماده نیست.'));
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(Error('صحنه در زمان تعیین‌شده پاسخ نداد.'));
    }, method === 'capture' ? 22000 : 5000);
    pending.set(id, { resolve, reject, timeout });
    child.contentWindow.postMessage({ studio: child.dataset.token, id, method, value }, '*');
  });
}
function syncLens(view) {
  if (!isView(view)) return;
  runtime.view = view;
  $('lens').value = view.fov;
  $('lens-value').value = `${Math.round(view.fov)}°`;
  $('presets').value = view.preset;
}
async function move(kind, value) {
  if (!runtime?.view || capturing) return;
  const response = await packet('apply', { kind, value });
  syncLens(response?.view);
}
function fitViewport() {
  const box = $('view-area');
  const [w, h] = dimensions(project.ratio, 720);
  const fit = Math.min(box.clientWidth / w, box.clientHeight / h);
  $('viewport').style.width = `${Math.round(w * fit)}px`;
  $('viewport').style.height = `${Math.round(h * fit)}px`;
}
new ResizeObserver(fitViewport).observe($('view-area'));

async function launchScene() {
  const version = ++launchVersion;
  clearTimeout(loadTimer);
  for (const task of pending.values()) {
    clearTimeout(task.timeout);
    task.reject(Error('صحنه عوض شد.'));
  }
  pending.clear();
  frame?.remove();
  frame = null;
  runtime = null;
  mode = 'orbit';
  $('orbit').setAttribute('aria-pressed', 'true');
  $('pan').setAttribute('aria-pressed', 'false');
  $('scene-name').textContent = project.source.name;
  $('loading').textContent = 'در حال بارگذاری صحنه…';
  $('loading').hidden = false;
  $('presets').hidden = true;
  renderButtons();
  try {
    dependencies ??= loadRuntime();
    const scripts = await dependencies;
    if (version !== launchVersion) return;
    attachFrame(scripts);
  } catch (error) {
    dependencies = null;
    if (version === launchVersion) $('loading').textContent = error.message;
  }
}
function attachFrame(scripts) {
  const token = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const child = document.createElement('iframe');
  child.setAttribute('sandbox', 'allow-scripts');
  child.setAttribute('referrerpolicy', 'no-referrer');
  child.title = 'نمای زندهٔ صحنهٔ سه‌بعدی';
  child.dataset.token = token;
  const source = project.source.demo ? { type: 'js', code: demoCode } : project.source;
  child.srcdoc = makeFrameDocument(source, token, scripts);
  frame = child;
  $('viewport').append(child);
  loadTimer = setTimeout(() => {
    if (!runtime?.ready) $('loading').textContent = 'صحنه آماده نشد. کد یا وابستگی‌های آن را بررسی کن.';
  }, 18000);
  renderButtons();
}

addEventListener('message', event => {
  const message = event.data;
  if (!frame || event.source !== frame.contentWindow || message?.studio !== frame.dataset.token) return;
  const { kind, result } = message;
  if (kind === 'ready') {
    clearTimeout(loadTimer);
    runtime = { ready: true, capture: result.capture === true, view: isView(result.view) ? result.view : null };
    $('loading').hidden = runtime.capture;
    if (!runtime.capture) $('loading').textContent = 'صحنه بوم یا تابع ثبت تصویر ندارد.';
    const presets = Array.isArray(result.presets) ? result.presets.slice(0, 80) : [];
    $('presets').replaceChildren(...presets.map((label, i) => new Option(String(label).slice(0, 80), i)));
    $('presets').hidden = !presets.length || !runtime.view;
    syncLens(runtime.view);
    applyAspect();
    renderButtons();
    if (result.software) status('نمای ساده فعال است. WebGL در این مرورگر در دسترس نیست.');
    else if (runtime.capture && !result.native) status('ثبت از بوم صحنه فعال است. وضوح اصلی به اندازهٔ بوم بستگی دارد.');
    return;
  }
  if (kind === 'camera' && runtime?.ready) {
    syncLens(result);
    return;
  }
  if (kind === 'error') {
    const error = String(result).slice(0, 220);
    if (!runtime?.ready) {
      clearTimeout(loadTimer);
      $('loading').textContent = `خطای صحنه · ${error}`;
    }
    status(`خطای صحنه · ${error}`);
    return;
  }
  if (kind === 'reply' && pending.has(result?.id)) {
    const task = pending.get(result.id);
    clearTimeout(task.timeout);
    pending.delete(result.id);
    if (result.error) task.reject(Error(String(result.error).slice(0, 220)));
    else task.resolve(result.result);
  }
});

function applyAspect() {
  const [w, h] = dimensions(project.ratio, 720);
  fitViewport();
  if (runtime?.view) move('aspect', w / h).catch(showError);
}

function choosePanel(index) {
  if (!project.panels[index]) return;
  project.active = index;
  renderPanels();
  persist();
  const selected = $('panels').children[index];
  const list = $('panels');
  if (selected.offsetTop < list.scrollTop) list.scrollTop = selected.offsetTop;
  else if (selected.offsetTop + selected.offsetHeight - list.scrollTop > list.clientHeight) {
    list.scrollTop = selected.offsetTop + selected.offsetHeight - list.clientHeight;
  }
}

function renderButtons() {
  const panel = project.panels[project.active];
  const recorded = project.panels.filter(item => item.image).length;
  $('capture').disabled = $('stage-capture').disabled = capturing || !runtime?.capture;
  $('capture').textContent = capturing && capturePanelIndex === project.active ? 'در حال ثبت…' : panel.image ? 'ثبت دوبارهٔ پنل' : 'ثبت پنل';
  $('stage-capture').textContent = capturing ? 'در حال ثبت…' : panel.image ? 'ثبت دوبارهٔ نما' : 'ثبت این نما';
  $('single').disabled = $('clear').disabled = !panel.image || capturing;
  $('restore').disabled = !panel.view || !runtime?.view || capturing;
  $('all').disabled = $('sheet-open').disabled = !recorded;
  for (const id of ['orbit','pan','zoom-in','zoom-out','reset','lens','presets']) $(id).disabled = !runtime?.view || capturing;
  for (const id of ['settings-open','pick-scene','scene-file','code-open','import','demo']) $(id).disabled = capturing;
}
function renderPanels() {
  const count = project.panels.length;
  const recorded = project.panels.filter(panel => panel.image).length;
  $('progress').title = project.name;
  $('progress').textContent = `${fa.format(recorded)} از ${fa.format(count)} پنل ثبت شده`;
  $('progress-bar').max = count;
  $('progress-bar').value = recorded;
  $('export-count').textContent = `${fa.format(recorded)} تصویر`;
  const host = $('panels');
  const focusedIndex = document.activeElement?.dataset.panelIndex;
  host.replaceChildren(...project.panels.map((panel, index) => {
    const button = document.createElement('button');
    const selected = project.active === index;
    button.type = 'button';
    button.className = `panel${selected ? ' selected' : ''}`;
    button.dataset.panelIndex = index;
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `پنل ${fa.format(index + 1)}، ${panel.image ? 'ثبت شده' : 'خالی'}`);
    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    if (panel.image) {
      const image = new Image();
      image.src = panel.image;
      image.alt = '';
      image.loading = 'lazy';
      thumb.append(image);
    } else thumb.textContent = '＋';
    const meta = document.createElement('span');
    meta.className = 'panel-meta';
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = String(index + 1).padStart(2, '0');
    const time = document.createElement('span');
    time.textContent = panel.time === '' ? '·' : `${Number(panel.time).toFixed(1)}s`;
    meta.append(number, time);
    button.append(thumb, meta);
    button.addEventListener('click', () => choosePanel(index));
    return button;
  }));
  if (focusedIndex !== undefined) host.children[focusedIndex]?.focus({ preventScroll: true });
  const active = project.panels[project.active];
  $('selected-title').textContent = `پنل ${fa.format(project.active + 1)}`;
  $('stage-panel').replaceChildren(...project.panels.map((panel, index) =>
    new Option(`پنل ${fa.format(index + 1)}${panel.image ? ' ✓' : ''}`, index)));
  $('stage-panel').value = project.active;
  $('time').value = active.time;
  $('note').value = active.note;
  $('aspect-badge').textContent = project.ratio;
  renderButtons();
}
async function registerCapture() {
  if (capturing || !runtime?.capture) return;
  const index = project.active;
  const panel = project.panels[index];
  if (panel.image && !confirm(`عکس فعلی پنل ${fa.format(index + 1)} جایگزین شود؟`)) return;
  const [w,h] = dimensions(project.ratio, project.resolution);
  capturing = true;
  capturePanelIndex = index;
  renderButtons();
  try {
    const result = await packet('capture', { w,h });
    if (!isPNG(result?.image)) throw Error('صحنه PNG معتبر برنگرداند.');
    const check = new Image();
    check.src = result.image;
    await check.decode();
    if (check.naturalWidth !== w || check.naturalHeight !== h) throw Error('ابعاد PNG با تنظیم پروژه منطبق نیست.');
    panel.image = result.image;
    panel.view = isView(result.view) ? result.view : null;
    persist();
    status(`پنل ${fa.format(index + 1)} ثبت شد.`);
  } catch (error) {
    showError(error);
  } finally {
    capturing = false;
    capturePanelIndex = null;
    renderPanels();
  }
}
function changeSource(source) {
  if (capturing) return false;
  if (project.panels.some(panel => panel.image) &&
      !confirm('صحنه عوض شود؟ عکس‌ها و زاویه‌های ذخیره‌شدهٔ پروژه پاک می‌شوند.')) return false;
  project.panels = project.panels.map(panel => ({ ...panel, image: null, view: null }));
  project.source = source;
  status('');
  renderPanels();
  launchScene();
  persist();
  return true;
}

function appendInput(accept, handler) {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept, hidden: true });
  document.body.append(input);
  input.addEventListener('change', async () => {
    try { if (input.files[0]) await handler(input.files[0]); }
    catch (error) { showError(error); }
    finally { input.value = ''; }
  });
  return input;
}
const backupInput = appendInput('.json', async file => {
  if (capturing) return;
  if (file.size > MAX_BACKUP_BYTES) throw Error('حجم فایل پشتیبان بیش از حد مجاز است.');
  const next = validateProject(JSON.parse(await file.text()));
  if (capturing) return;
  if (!confirm('پروژهٔ فعلی با پشتیبان جایگزین شود؟')) return;
  project = next;
  renderPanels();
  launchScene();
  applyAspect();
  persist();
  status('پروژه از فایل پشتیبان باز شد.');
});
byId('pick-scene', () => $('scene-file').click());
byId('scene-file', async () => {
  const input = $('scene-file');
  try {
    const file = input.files[0];
    if (!file || capturing) return;
    if (file.name.toLowerCase().endsWith('.json')) {
      status('برای باز کردن فایل JSON، از «بازکردن پشتیبان» استفاده کن.');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) throw Error('حجم فایل صحنه باید حداکثر ۱۲ مگابایت باشد.');
    const type = /\.html?$/i.test(file.name) ? 'html' : /\.js$/i.test(file.name) ? 'js' : null;
    if (!type) throw Error('فایل صحنه باید HTML یا JS باشد.');
    const code = await file.text();
    if (!code.trim()) throw Error('فایل صحنه خالی است.');
    changeSource({ type, code, name: file.name });
  } catch (error) { showError(error); }
  finally { input.value = ''; }
}, 'change');

byId('stage-panel', () => choosePanel(Number($('stage-panel').value)), 'change');
byId('capture', registerCapture);
byId('stage-capture', registerCapture);
byId('single', () => downloadPanel(project.panels[project.active], project.active));
byId('all', () => downloadAll(project).catch(showError));
byId('clear', () => {
  if (!confirm('عکس و زاویهٔ ذخیره‌شدهٔ این پنل حذف شود؟')) return;
  Object.assign(project.panels[project.active], { image: null, view: null });
  renderPanels();
  persist();
});
byId('time', () => {
  const panel = project.panels[project.active];
  panel.time = timeText($('time').value);
  const text = $('panels').children[project.active]?.querySelector('.panel-meta span:last-child');
  if (text) text.textContent = panel.time === '' ? '·' : `${Number(panel.time).toFixed(1)}s`;
  persist();
}, 'input');
byId('note', () => {
  project.panels[project.active].note = $('note').value;
  persist();
}, 'input');
byId('restore', () => move('restore', project.panels[project.active].view).catch(showError));
for (const kind of ['orbit', 'pan']) byId(kind, async () => {
  try {
    await move(kind);
    mode = kind;
    $('orbit').setAttribute('aria-pressed', String(mode === 'orbit'));
    $('pan').setAttribute('aria-pressed', String(mode === 'pan'));
  } catch (error) { showError(error); }
});
byId('zoom-in', () => move('zoom', .84).catch(showError));
byId('zoom-out', () => move('zoom', 1.19).catch(showError));
byId('reset', () => move('reset').catch(showError));
byId('lens', () => { $('lens-value').value = `${$('lens').value}°`; }, 'input');
byId('lens', () => move('fov', Number($('lens').value)).catch(showError), 'change');
byId('presets', () => move('preset', Number($('presets').value)).catch(showError), 'change');
const stage = document.querySelector('.stage');
byId('expand', async () => {
  if (document.fullscreenElement) return document.exitFullscreen();
  if (stage.classList.toggle('expanded', !stage.classList.contains('expanded'))) {
    $('expand').textContent = 'خروج از تمام‌صفحه';
  } else $('expand').textContent = 'تمام‌صفحه';
  fitViewport();
});
addEventListener('keydown', event => {
  if (event.key === 'Escape' && stage.classList.contains('expanded')) $('expand').click();
});
for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => button.closest('dialog').close());
}
byId('theme', () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('carizma-theme', root.dataset.theme); } catch { /* no storage */ }
});
byId('code-open', () => {
  $('code-type').value = project.source.type;
  $('code').value = project.source.demo ? '' : project.source.code;
  $('code-dialog').showModal();
});
byId('code-demo', () => { $('code-type').value = 'js'; $('code').value = demoCode; });
byId('run', () => {
  const code = $('code').value;
  if (!code.trim()) { $('code').focus(); return; }
  if (new Blob([code]).size > MAX_SOURCE_BYTES) return alert('حجم کد صحنه باید حداکثر ۱۲ مگابایت باشد.');
  if (changeSource({ type: $('code-type').value, code, name: 'کد صحنهٔ سفارشی' })) $('code-dialog').close();
});
byId('demo', () => changeSource(newProject().source));
byId('backup', () => save(new Blob([JSON.stringify(project)], { type: 'application/json' }), 'Carizma_Project.json'));
byId('import', () => backupInput.click());
byId('settings-open', () => {
  $('project-name').value = project.name;
  $('count').value = project.panels.length;
  $('ratio').value = project.ratio;
  $('resolution').value = project.resolution;
  $('settings').showModal();
});
byId('settings-form', event => {
  event.preventDefault();
  if (capturing) return;
  const count = $('count').valueAsNumber;
  const ratio = $('ratio').value;
  const resolution = +$('resolution').value;
  const removing = project.panels.slice(count).some(panel => panel.image || panel.note || panel.time !== '');
  if (removing && !confirm('با کم کردن تعداد پنل‌ها، اطلاعات انتهای فهرست حذف می‌شود. ادامه می‌دهی؟')) return;
  const needsConfirm = project.panels.slice(0,count).some(panel => panel.image) &&
    (ratio !== project.ratio || resolution !== project.resolution);
  if (needsConfirm && !confirm('ابعاد جدید برای ثبت‌های بعدی است. عکس‌های قبلی با ابعاد اصلی می‌مانند. ادامه می‌دهی؟')) return;
  project.name = $('project-name').value.trim() || 'استوری‌بورد';
  project.ratio = ratio;
  project.resolution = resolution;
  project.panels = Array.from({ length: count }, (_, index) => project.panels[index] ?? blank());
  project.active = Math.min(project.active, count - 1);
  $('settings').close();
  renderPanels();
  applyAspect();
  persist();
}, 'submit');
async function previewSheet() {
  const version = ++sheetVersion;
  const view = $('sheet-preview');
  view.textContent = 'در حال ساخت شیت…';
  const model = structuredClone(project);
  const [w,h] = sheetSize(model);
  $('sheet-size').textContent = `${fa.format(w)} × ${fa.format(h)} پیکسل`;
  try {
    const canvas = await makeSheet(model, true);
    if (version === sheetVersion) view.replaceChildren(canvas);
  } catch (error) {
    if (version === sheetVersion) view.textContent = error.message;
  }
}
byId('sheet-open', () => {
  $('columns').value = project.columns;
  $('labels').checked = project.labels;
  $('blanks').checked = project.blanks;
  $('sheet-dialog').showModal();
  previewSheet();
});
byId('columns', () => {
  const value = $('columns').valueAsNumber;
  if (!Number.isInteger(value) || value < 1 || value > 9) return;
  project.columns = value;
  persist();
  previewSheet();
}, 'input');
byId('columns', () => { $('columns').value = project.columns; }, 'blur');
for (const id of ['labels','blanks']) byId(id, () => {
  project.labels = $('labels').checked;
  project.blanks = $('blanks').checked;
  persist();
  previewSheet();
}, 'change');
byId('sheet-download', async () => {
  $('sheet-download').disabled = true;
  try { await downloadSheet(structuredClone(project)); }
  catch (error) { $('sheet-size').textContent = error.message; }
  finally { $('sheet-download').disabled = false; }
});

try { document.documentElement.dataset.theme = localStorage.getItem('carizma-theme') === 'dark' ? 'dark' : 'light'; }
catch { /* no storage */ }
try {
  const saved = await readProject();
  if (saved) project = validateProject(saved);
  $('save-status').textContent = 'تغییرات در این مرورگر خودکار ذخیره می‌شوند.';
} catch {
  $('save-status').textContent = 'پروژهٔ قبلی باز نشد. در صورت نیاز فایل پشتیبان را باز کن.';
}
fitViewport();
renderPanels();
launchScene();
