import { softwareRenderer } from './software.js';
const base = new URL('./', import.meta.url);
const three = new URL('vendor/three.min.js', base).href;
const orbit = new URL('vendor/OrbitControls.js', base).href;
export async function loadRuntime() {
  const scripts = await Promise.all([three, orbit].map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw Error('فایل‌های Three.js بارگذاری نشدند.');
    return response.text();
  }));
  return Object.fromEntries([[three, scripts[0]], [orbit, scripts[1]]]);
}

function frameBridge(token) {
  const notify = (kind, result) => parent.postMessage({ studio: token, kind, result }, '*');
  window.__CARIZMA_NOTIFY__ = notify;
  function canvas() {
    return [...document.querySelectorAll('canvas')].find(element => element.width && element.height &&
      getComputedStyle(element).display !== 'none');
  }
  function fit(image, w, h) {
    const result = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    if (iw === w && ih === h && image instanceof HTMLImageElement) return image.src;
    const scale = Math.max(w / iw, h / ih);
    result.getContext('2d').drawImage(image, (w - iw * scale) / 2, (h - ih * scale) / 2, iw * scale, ih * scale);
    return result.toDataURL('image/png');
  }
  async function capture({ w, h }) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 3000 || h > 3000) {
      throw Error('ابعاد خروجی معتبر نیست.');
    }
    const hook = window.__CARIZMA_CAPTURE__;
    if (hook) {
      const output = await hook(w, h);
      if (output instanceof HTMLCanvasElement) return fit(output, w, h);
      if (typeof output === 'string' && output.startsWith('data:image/png;base64,')) {
        const img = new Image();
        img.src = output;
        await img.decode();
        return fit(img, w, h);
      }
      throw Error('تابع ثبت صحنه باید PNG یا canvas برگرداند.');
    }
    if (!canvas()) throw Error('بوم قابل ثبت در صحنه پیدا نشد.');
    return fit(canvas(), w, h);
  }
  window.addEventListener('message', async event => {
    const message = event.data;
    if (event.source !== parent || message?.studio !== token || !Number.isInteger(message.id)) return;
    const { id, method, value } = message;
    try {
      let result;
      if (method === 'capture') {
        result = { image: await capture(value), view: window.__CARIZMA_CAMERA__?.get() ?? null };
      } else if (method === 'apply') {
        result = { view: window.__CARIZMA_CAMERA__?.apply(value) ?? null };
      }
      notify('reply', { id, result });
    } catch (error) {
      notify('reply', { id, error: error.message });
    }
  });
  window.addEventListener('error', event => {
    if (event.message) notify('error', event.message);
  });
  window.addEventListener('unhandledrejection', event => notify('error', event.reason?.message ?? String(event.reason)));
  window.addEventListener('load', () => {
    if (window.__CARIZMA_FAILED__) return;
    const api = window.__CARIZMA_CAMERA__;
    const capture = typeof window.__CARIZMA_CAPTURE__ === 'function' || Boolean(canvas());
    notify('ready', { capture, native: typeof window.__CARIZMA_CAPTURE__ === 'function', software: window.__CARIZMA_SOFTWARE__ === true,
      view: api?.get() ?? null, presets: api?.presets ?? [] });
  });
}

function cameraApi(camera, controls, resize, select, presets = []) {
  const mouse = window.THREE.MOUSE;
  let activePreset = 0;
  let aspect = null;
  function get() {
    return { position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov, preset: activePreset };
  }
  const initial = get();
  function apply(action) {
    switch (action.kind) {
      case 'aspect':
        aspect = action.value;
        resize(aspect);
        return get();
      case 'orbit':
        controls.mouseButtons.LEFT = mouse.ROTATE;
        controls.touches.ONE = THREE.TOUCH.ROTATE;
        return get();
      case 'pan':
        controls.mouseButtons.LEFT = mouse.PAN;
        controls.touches.ONE = THREE.TOUCH.PAN;
        return get();
      case 'preset':
        activePreset = action.value;
        select?.(activePreset);
        if (aspect) resize(aspect);
        return get();
      default:
        break;
    }
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    if (action.kind === 'zoom') {
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() * action.value, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(distance));
    }
    if (action.kind === 'fov') camera.fov = action.value;
    if (action.kind === 'restore' || action.kind === 'reset') {
      const view = action.kind === 'reset' ? initial : action.value;
      if (view.preset !== activePreset && select && presets[view.preset]) {
        activePreset = view.preset;
        select(activePreset);
        if (aspect) resize(aspect);
      }
      camera.position.fromArray(view.position);
      controls.target.fromArray(view.target);
      camera.fov = view.fov;
    }
    camera.updateProjectionMatrix();
    controls.update();
    controls.enableDamping = damping;
    if (aspect) resize(aspect);
    return get();
  }
  return { get, apply, presets, markPreset: value => { activePreset = value; } };
}

function scriptScene(source, setupCamera, makeSoftwareRenderer) {
  const T = window.THREE;
  if (!T?.OrbitControls) throw Error('Three.js بارگذاری نشد.');
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch {
    renderer = makeSoftwareRenderer(T);
    window.__CARIZMA_SOFTWARE__ = true;
  }
  renderer.outputEncoding = T.sRGBEncoding;
  document.body.append(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color('#282934');
  const camera = new T.PerspectiveCamera(42, 1, 0.01, 1000);
  camera.position.set(5, 3.3, 7);
  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.13;
  controls.minDistance = 0.05;
  controls.target.set(0, 1.2, 0);
  controls.update();
  const studio = { presets: [], animate: null, addPreset(label, position, target, fov = 42) {
    this.presets.push({ label: String(label), position, target, fov });
  }};
  new Function('THREE', 'scene', 'camera', 'renderer', 'controls', 'studio', source)(
    T, scene, camera, renderer, controls, studio
  );
  let dirty = true;
  controls.addEventListener('change', () => { dirty = true; });
  function resize() {
    dirty = true;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / Math.max(1, innerHeight);
    camera.updateProjectionMatrix();
  }
  controls.update();
  addEventListener('resize', resize);
  resize();
  function select(index) {
    const preset = studio.presets[index];
    if (!preset) return;
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    camera.position.fromArray(preset.position);
    controls.target.fromArray(preset.target);
    camera.fov = preset.fov;
    camera.updateProjectionMatrix();
    controls.update();
    controls.enableDamping = damping;
  }
  const labels = studio.presets.length ? ['نمای اولیه', ...studio.presets.map(preset => preset.label)] : [];
  window.__CARIZMA_CAMERA__ = setupCamera(camera, controls, resize, index => { if (index > 0) select(index - 1); }, labels);
  window.__CARIZMA_CAPTURE__ ??= (w, h) => {
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    } finally {
      resize();
      renderer.render(scene, camera);
    }
  };
  renderer.setAnimationLoop(ms => {
    controls.update();
    studio.animate?.(ms / 1000);
    if (!renderer.software || dirty || studio.animate) {
      renderer.render(scene, camera);
      dirty = false;
    }
  });
}

const encode = value => JSON.stringify(value).replaceAll('<', '\\u003c');

function adaptKnownBakery(doc) {
  const script = [...doc.scripts].find(element =>
    element.textContent.includes('window.__CARIZMA_CAPTURE__ = function(w,h)') &&
    element.textContent.includes('window.parent.postMessage({type:\'CARIZMA_PRESET\'') &&
    element.textContent.includes('const aspect=selected<2?16/9:9/16')
  );
  if (!script) return;
  script.textContent = script.textContent
    .replace('const aspect=selected<2?16/9:9/16', 'const aspect=window.__CARIZMA_ASPECT__??(selected<2?16/9:9/16)')
    .replace("window.parent.postMessage({type:'CARIZMA_PRESET',key:key,label:label},'*');",
      "window.__CARIZMA_CAMERA__?.markPreset(i);window.__CARIZMA_NOTIFY__('camera',window.__CARIZMA_CAMERA__?.get());")
    .replace('select(0);', `select(0);
    window.__CARIZMA_CAMERA__=window.__CARIZMA_MAKE_CAMERA__(camera,controls,
      a=>{window.__CARIZMA_ASPECT__=a;resize()},select,presets.map(p=>p[1]));`)
    .replace("catch(error){document.getElementById('info')", "catch(error){window.__CARIZMA_FAILED__=true;window.__CARIZMA_NOTIFY__('error',error.message);document.getElementById('info')");
}

export function makeFrameDocument(source, token, dependencies) {
  const csp = `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: ${base.origin} https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: blob:; media-src blob: data:; connect-src blob: data:; worker-src blob:; base-uri 'none'; form-action 'none'`;
  const start = `(${frameBridge})(${encode(token)});window.__CARIZMA_MAKE_CAMERA__=${cameraApi};`;
  if (source.type === 'js') {
    return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body,canvas{width:100%;height:100%;margin:0;display:block;touch-action:none;overflow:hidden;background:#191c23}</style><body><script>${start}</script><script>${dependencies[three]}</script><script>${dependencies[orbit]}</script><script>try{(${scriptScene})(${encode(source.code)},window.__CARIZMA_MAKE_CAMERA__,${softwareRenderer})}catch(error){window.__CARIZMA_FAILED__=true;window.__CARIZMA_NOTIFY__('error',error.message)}</script>`;
  }
  const doc = new DOMParser().parseFromString(source.code, 'text/html');
  for (const meta of doc.querySelectorAll('meta[http-equiv]')) meta.remove();
  for (const tag of doc.querySelectorAll('base')) tag.remove();
  for (const script of doc.scripts) {
    const url = script.getAttribute('src');
    if (/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js$/.test(url)) { script.removeAttribute('src'); script.textContent = dependencies[three]; }
    if (/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/examples\/js\/controls\/OrbitControls\.js$/.test(url)) { script.removeAttribute('src'); script.textContent = dependencies[orbit]; }
  }
  adaptKnownBakery(doc);
  const bridge = doc.createElement('script');
  bridge.textContent = start;
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = csp;
  const charset = doc.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  doc.head.prepend(charset, policy, bridge);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
