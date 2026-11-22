// Small CPU renderer for blocking scenes on devices without WebGL.
export function softwareRenderer(THREE) {
  const domElement = document.createElement('canvas');
  const ctx = domElement.getContext('2d', { alpha: false });
  if (!ctx) throw Error('مرورگر نتوانست بوم گرافیکی را بسازد.');
  const cameraPoint = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const modelView = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const lamp = new THREE.Vector3(.5, .8, .65).normalize();
  const shading = new Map();
  let ratio = 1;
  let frameId = null;
  function render(scene, camera) {
    const { width, height } = domElement;
    if (!width || !height) return;
    camera.updateMatrixWorld();
    scene.updateMatrixWorld();
    ctx.fillStyle = scene.background?.isColor ? '#' + scene.background.getHexString() : '#282934';
    ctx.fillRect(0, 0, width, height);
    const faces = [];
    scene.traverseVisible(mesh => {
      if (!mesh.isMesh || !mesh.geometry?.attributes.position || !mesh.material?.color) return;
      const { attributes, index } = mesh.geometry;
      const { position } = attributes;
      const normals = attributes.normal;
      modelView.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      const points = new Array(position.count);
      for (let i = 0; i < position.count; i++) {
        cameraPoint.fromBufferAttribute(position, i).applyMatrix4(modelView);
        if (cameraPoint.z >= -camera.near) continue;
        ndc.copy(cameraPoint).applyMatrix4(camera.projectionMatrix);
        points[i] = [(ndc.x + 1) * width / 2, (1 - ndc.y) * height / 2, cameraPoint.z];
      }
      const count = index ? index.count : position.count;
      for (let i = 0; i + 2 < count; i += 3) {
        const ia = index ? index.getX(i) : i;
        const a = points[ia];
        const b = points[index ? index.getX(i + 1) : i + 1];
        const c = points[index ? index.getX(i + 2) : i + 2];
        if (!a || !b || !c) continue;
        const winding = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (winding >= -0.03 && mesh.material.side !== THREE.DoubleSide) continue;
        const angle = normals ? normal.fromBufferAttribute(normals, ia).applyMatrix3(normalMatrix).normalize().dot(lamp) : .5;
        const light = Math.round((.58 + Math.max(0, angle) * .42) * 14);
        const key = mesh.material.color.getHex() * 16 + light;
        if (!shading.has(key)) {
          const color = mesh.material.color.clone().multiplyScalar(light / 14);
          shading.set(key, '#' + color.getHexString());
        }
        faces.push({ a, b, c, depth: (a[2] + b[2] + c[2]) / 3, fill: shading.get(key) });
      }
    });
    faces.sort((first, second) => first.depth - second.depth);
    ctx.lineWidth = .7;
    for (const { a, b, c, fill } of faces) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle = fill;
      ctx.fill();
      ctx.stroke();
    }
  }
  return {
    domElement, render, software: true,
    setPixelRatio(value) { ratio = value > 1 ? 1 : value; },
    setSize(w, h) { domElement.width = Math.max(1, Math.round(w * ratio)); domElement.height = Math.max(1, Math.round(h * ratio)); },
    setAnimationLoop(callback) {
      cancelAnimationFrame(frameId);
      if (!callback) return;
      function tick(ms) {
        callback(ms);
        frameId = requestAnimationFrame(tick);
      }
      frameId = requestAnimationFrame(tick);
    }
  };
}
