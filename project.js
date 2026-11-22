export const RATIOS = ['9:16', '16:9', '1:1', '4:5'];
export const RESOLUTIONS = [720, 1080, 1440];
export const MAX_SOURCE_BYTES = 12 * 1024 ** 2;
export const MAX_BACKUP_BYTES = 160 * 1024 ** 2;
export const blank = () => ({ time: '', note: '', image: null, view: null });
export const isPNG = image => typeof image === 'string' && image.startsWith('data:image/png;base64,');
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
export const isView = view => view && vector(view.position) && vector(view.target) && Number.isFinite(view.fov)
  && view.fov >= 1 && view.fov <= 179 && Number.isInteger(view.preset) && view.preset >= 0;

export function newProject() {
  return { version: 1, name: 'استوری‌بورد نانوایی', ratio: '9:16', resolution: 1080,
    source: { type: 'js', name: 'نانوایی · صحنهٔ نمونه', code: '', demo: true },
    panels: Array.from({ length: 6 }, blank), active: 0, columns: 3, labels: true, blanks: false };
}

export function validateProject(state) {
  if (state?.version !== 1 || !Array.isArray(state.panels) || state.panels.length < 1 || state.panels.length > 36 ||
      !RATIOS.includes(state.ratio) || !RESOLUTIONS.includes(state.resolution) ||
      !['js', 'html'].includes(state.source?.type) || typeof state.source.code !== 'string' ||
      new Blob([state.source.code]).size > MAX_SOURCE_BYTES || (!state.source.demo && !state.source.code.trim())) {
    throw Error('ساختار فایل پشتیبان معتبر نیست.');
  }
  return {
    version: 1, name: String(state.name || 'استوری‌بورد').slice(0, 80),
    ratio: state.ratio, resolution: state.resolution,
    source: { type: state.source.type, name: String(state.source.name || 'صحنهٔ پروژه').slice(0, 150),
      code: state.source.code, demo: state.source.demo === true },
    panels: state.panels.map(panel => {
      if (!panel || (panel.image != null && !isPNG(panel.image))) throw Error('فایل پشتیبان شامل تصویر نامعتبر است.');
      return { time: timeText(panel.time), note: String(panel.note ?? '').slice(0, 120),
        image: panel.image || null, view: isView(panel.view) ? panel.view : null };
    }),
    active: Math.min(state.panels.length - 1, Math.max(0, Number.isInteger(state.active) ? state.active : 0)),
    columns: Math.min(9, Math.max(1, Math.round(Number(state.columns) || 3))),
    labels: state.labels !== false, blanks: state.blanks === true
  };
}
export function timeText(value) {
  if (value == null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number < 86400 ? String(number) : '';
}
export function dimensions(ratio, short) {
  const [x,y] = ratio.split(':').map(Number);
  const scale = short / Math.min(x, y);
  return [Math.round(x * scale), Math.round(y * scale)];
}
export function panelFilename(index, time) {
  const label = time === '' ? '' : `_${Number(time).toFixed(1)}s`;
  return `P${String(index + 1).padStart(2, '0')}${label}.png`;
}
let dbPromise;
function database() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('carizma-storyboard', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}
export async function readProject() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('workspace').objectStore('workspace').get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function storeProject(state) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('workspace', 'readwrite');
    transaction.objectStore('workspace').put(state, 'current');
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
