import { dimensions, panelFilename } from './project.js';

export function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
export function imageBytes(url) {
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), char => char.charCodeAt(0));
}
export function downloadPanel(panel, index) {
  save(new Blob([imageBytes(panel.image)], { type: 'image/png' }), panelFilename(index, panel.time));
}
export async function downloadAll(project) {
  const files = {};
  project.panels.forEach((panel, index) => {
    if (panel.image) files[panelFilename(index, panel.time)] = imageBytes(panel.image);
  });
  const data = await new Promise((resolve, reject) => {
    window.fflate.zip(files, { level: 0 }, (error, result) => error ? reject(error) : resolve(result));
  });
  save(new Blob([data], { type: 'application/zip' }), 'Carizma_Panels.zip');
}

function getLayout(project, preview) {
  const entries = project.panels.flatMap((panel, index) => panel.image || project.blanks ? [{ ...panel, index }] : []);
  const cols = Math.min(project.columns, Math.max(1, entries.length));
  const rows = Math.max(1, Math.ceil(entries.length / cols));
  const [width,height] = dimensions(project.ratio, project.resolution);
  const gap = preview ? 4 : 9;
  const maxSide = preview ? 950 : 4096;
  const maxArea = preview ? 550000 : 12500000;
  const scale = Math.min(1, (maxSide - (cols + 1) * gap) / (cols * width),
    (maxSide - (rows + 1) * gap) / (rows * height),
    Math.sqrt(maxArea / ((cols * width + (cols + 1) * gap) * (rows * height + (rows + 1) * gap))));
  const w = Math.floor(width * scale), h = Math.floor(height * scale);
  return { entries, cols, rows, w, h, gap, W: cols * w + (cols + 1) * gap, H: rows * h + (rows + 1) * gap };
}

export function sheetSize(project) {
  const { W, H } = getLayout(project, false);
  return [W, H];
}
export async function makeSheet(project, preview = false) {
  const { entries, cols, w, h, gap, W, H } = getLayout(project, preview);
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cbd0d9';
  ctx.fillRect(0, 0, W, H);
  for (const [i, panel] of entries.entries()) {
    const x = gap + (i % cols) * (w + gap), y = gap + Math.floor(i / cols) * (h + gap);
    ctx.fillStyle = '#262d3a';
    ctx.fillRect(x, y, w, h);
    if (panel.image) {
      const img = new Image();
      img.src = panel.image;
      await img.decode();
      const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }
    if (project.labels) {
      const size = Math.round(Math.max(10, w * .036));
      ctx.font = `600 ${size}px system-ui`;
      ctx.textBaseline = 'top';
      ctx.direction = 'ltr';
      const label = panel.time === '' ? String(panel.index + 1) : `${panel.index + 1} · ${Number(panel.time).toFixed(1)}s`;
      ctx.fillStyle = '#101722d9';
      ctx.fillRect(x, y, ctx.measureText(label).width + size, size * 1.62);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + size / 2, y + size * .28);
    }
  }
  return canvas;
}
export async function downloadSheet(project) {
  const canvas = await makeSheet(project);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw Error('ساخت فایل PNG ناموفق بود.');
  save(blob, 'Carizma_Storyboard.png');
}
