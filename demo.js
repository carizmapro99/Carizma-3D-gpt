export const demoCode = `scene.background = new THREE.Color(0xb6a59c);
scene.add(new THREE.HemisphereLight(0xffedd5, 0x695653, 1.05));
const sun = new THREE.DirectionalLight(0xffdbac, 1.2);
sun.position.set(3, 5, 1);
scene.add(sun);
const glow = new THREE.PointLight(0xff791a, 1.65, 3.8);
glow.position.set(0.15, 0.75, -2.2);
scene.add(glow);

function shape(geometry, color, x, y, z) {
  const item = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color, roughness: .88}));
  item.position.set(x, y, z);
  scene.add(item);
  return item;
}
function box(x,y,z,w,h,d,color) {
  return shape(new THREE.BoxGeometry(w,h,d),color,x,y,z);
}
function round(x,y,z,sx,sy,sz,color) {
  const item = shape(new THREE.SphereGeometry(1,18,12),color,x,y,z);
  item.scale.set(sx,sy,sz);
  return item;
}
box(0,-.13,0,5.44,.2,6.16,0x8b5d54);
const tiles = [0xa06249,0xb47455,0xba8064,0xc58a6a,0xae6552,0xc0795e];
for(let row=0;row<10;row++) for(let col=0;col<9;col++) {
  box((col-4)*.6,-.02,(row-4.5)*.61,.588,.035,.596,tiles[(row*5+col*7+row*col)%6]);
}
const plaster=0xc89b82;
box(-2.67,1.48,-.25,.16,3,5.52,plaster);
box(-1.46,1.48,-3,2.52,3,.17,plaster);
box(2.28,1.48,-3,.88,3,.17,plaster);
box(.62,.98,-3,1.67,1.96,.17,plaster);
box(.62,2.84,-3,1.67,.3,.17,plaster);
box(.62,2.32,-3.14,1.67,.72,.06,0xbfdcf2);
box(.62,2.29,-2.87,.06,.73,.12,0x634138);
box(.62,2.69,-2.88,1.73,.09,.17,0x634138);
for(let i=0;i<6;i++) box(0,2.98,2.3-i*.93,5.42,.15,.17,0x59403b);

box(-.45,.28,-2.08,2.38,.55,1.56,0xa97963);
round(-.48,.51,-2.12,1.02,1.18,.9,0xe7c4a0);
round(-.44,.63,-1.37,.41,.46,.17,0x63342a);
round(-.44,.59,-1.285,.32,.34,.12,0xf39539);
box(-.46,2.23,-2.3,.32,1.33,.32,0x3d3a3b);
box(-.46,1.62,-2.3,.46,.11,.46,0x3d3a3b);

box(-2.05,.85,.27,.81,.11,3.55,0x6c433b);
for(const z of [-1.15,1.67]) for(const x of [-2.35,-1.77]) box(x,.39,z,.12,.76,.12,0x583831);
box(-2.05,1.0,1.5,.35,.19,.27,0xbe8c3d);
round(-2.05,1.135,1.5,.23,.034,.21,0xd3a453);
round(-1.96,.95,.55,.26,.09,.24,0xb16f32);
round(-1.96,1.12,.55,.21,.18,.021,0xc18952);
box(-2.055,1.06,.56,.09,.07,.13,0xf5d493);
box(-1.92,1.06,.57,.09,.08,.12,0xf5d493);
for(let i=0;i<5;i++) round(-1.99,.94+i*.054,-.86,.31,.027,.22,0xd9a459);
box(1.83,.75,-1.89,1.06,.15,.64,0x815441);
for(const x of [1.48,2.19]) box(x,.35,-1.89,.14,.7,.46,0x6c423a);
round(2.07,.98,-1.89,.23,.25,.22,0xb68455);
round(1.55,.96,-1.89,.26,.19,.2,0xa6754b);
box(.49,.46,.54,.62,.09,.51,0x7d5140);
for(const x of [.27,.7]) for(const z of [.34,.73]) box(x,.23,z,.07,.45,.07,0x634236);

const baker=0xb76541;
round(-.77,1.0,.65,.46,.63,.33,baker);
round(-.78,1.66,.64,.20,.23,.19,0xd6905e);
round(-.78,1.79,.64,.188,.12,.18,0xf6e6cb);
for(const side of [-1,1]) {
  round(-.77+side*.48,1.11,.62,.125,.35,.125,baker).rotation.z=side*.22;
  round(-.77+side*.19,.42,.66,.115,.37,.13,0x634a3d);
  round(-.77+side*.19,.1,.72,.13,.10,.21,0x42353a);
}
camera.position.set(2.65,2.4,5.8);
controls.target.set(-.58,1.2,-.48);
camera.fov=45;
studio.addPreset('واید تنور', [2.5,2.35,5.6], [-.55,1.1,-.55], 50);
studio.addPreset('کنار پیشخوان', [.3,1.75,3.2], [-1.5,1,.2], 38);
studio.addPreset('نمای نزدیک ترازو', [-.9,1.47,2.14], [-2,1,1.5], 29);
studio.addPreset('روبه‌روی اصغر', [-.24,1.56,3.9], [-.76,1.21,.65], 32);
`;
