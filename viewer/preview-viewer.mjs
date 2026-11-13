import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';
import { SelectControl, icon, installIcons } from './preview-controls.mjs';
import { DimensionOverlay } from './preview-overlay.mjs';
import { geometryDimensions, dimensionsFor, ownerForFace, dimensionText, formatNumber, surfaceLabel } from './preview-dimensions.mjs';

const $ = selector => document.querySelector(selector);
installIcons();
const container = $('#viewport'), status = $('#status');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0, 0); renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', '3D-модель: выбор грани мышью, масштаб колесом'); container.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x7d94a8, 2.3));
const key = new THREE.DirectionalLight(0xffffff, 3.1); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0003;
const fill = new THREE.DirectionalLight(0xd7eaff, 1.7), rim = new THREE.DirectionalLight(0xffffff, 2); scene.add(key, key.target, fill, rim);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 10000); camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false;
const model = new THREE.Group(), ground = new THREE.Group(); scene.add(model, ground);
const meshes = [], overlay = new DimensionOverlay(container);
let data, inspection, config, graph, selected = null, selectedFeature = null, hovered = null, activeDimension = null;
let radius = 1, center = new THREE.Vector3(), fitBounds, currentFile, currentView = 'iso', allDimensions = false, outlines, frame;
const error = e => { $('#error').hidden = false; $('#error').textContent = String(e.message || e); };
const run = promise => Promise.resolve(promise).catch(error);
const readyFrame = () => new Promise(resolve => requestAnimationFrame(() => { renderNow(); requestAnimationFrame(resolve); }));

const modelSelect = new SelectControl($('#model'), { label: 'Модель или разрез', search: false, onChange: value => value.startsWith('@') ? location.assign(value.slice(1)) : run(load(value)) });
const featureSelect = new SelectControl($('#feature'), { label: 'Элемент детали', iconName: 'cube', onChange: value => selectFeature(value) });
const faceSelect = new SelectControl($('#face'), { label: 'Грань', iconName: 'edges', onChange: value => select(value) });

function metrics(target, pairs, className = 'properties-table') {
  target.replaceChildren(); const dl = document.createElement('dl'); dl.className = className; target.append(dl);
  const formatted = value => typeof value === 'number' ? Number(value.toFixed(5)).toLocaleString('ru-RU', { maximumFractionDigits: 5 }) : Array.isArray(value) ? value.map(formatted).join(' × ') : String(value);
  for (const [name, value] of pairs) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = name; dd.textContent = formatted(value); dl.append(dt, dd); }
}
function tab(name, focus = false) {
  for (const id of ['dimensions', 'properties']) {
    const button = $(`#${id}-tab`), active = id === name; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    $(`#${id}-panel`).hidden = !active; if (focus && active) button.focus();
  }
}
for (const id of ['dimensions', 'properties']) {
  $(`#${id}-tab`).addEventListener('click', () => tab(id));
  $(`#${id}-tab`).addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); tab(e.key === 'Home' ? 'dimensions' : e.key === 'End' ? 'properties' : id === 'dimensions' ? 'properties' : 'dimensions', true); } });
}
function size() {
  if (allDimensions) $('.viewer-card').style.minHeight = `${parseFloat(container.style.minHeight) + $('.viewer-toolbar').offsetHeight + $('.viewer-footer').offsetHeight + 2}px`;
  const width = container.clientWidth, height = container.clientHeight; if (!width || !height) return;
  renderer.setSize(width, height); const aspect = width / height;
  camera.left = -radius * aspect; camera.right = radius * aspect; camera.top = radius; camera.bottom = -radius;
  camera.updateProjectionMatrix(); redraw();
}
new ResizeObserver(size).observe(container); controls.addEventListener('change', redraw);
function redraw() { if (!frame) frame = requestAnimationFrame(() => { frame = null; renderNow(); }); }
function visibleDimensions() {
  if (!graph) return [];
  if (allDimensions) return graph.dimensions;
  const feature = selectedFeature || (hovered && ownerForFace(graph, sourceId(hovered.userData)));
  return feature ? dimensionsFor(graph, feature.id, sourceId((selected || hovered)?.userData)) : [];
}
function renderNow() {
  renderer.render(scene, camera); overlay.draw(visibleDimensions(), camera, activeDimension); drawAxes();
}
function drawAxes() {
  const svg = $('#axis-gizmo'); svg.replaceChildren(); camera.updateMatrixWorld();
  const origin = [32, 43], ns = 'http://www.w3.org/2000/svg';
  for (const [i, color] of ['#a96b6b', '#5f927d', '#5a83a4'].entries()) {
    const vector = new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).transformDirection(camera.matrixWorldInverse);
    const tip = [origin[0] + vector.x * 24, origin[1] - vector.y * 24], line = document.createElementNS(ns, 'line'), text = document.createElementNS(ns, 'text');
    for (const [k, v] of Object.entries({ x1: origin[0], y1: origin[1], x2: tip[0], y2: tip[1], stroke: color, 'stroke-width': 1.6 })) line.setAttribute(k, String(v));
    for (const [k, v] of Object.entries({ x: tip[0] + 5, y: tip[1] + 3, fill: color, stroke: 'none', 'font-size': 10, 'font-family': 'inherit' })) text.setAttribute(k, String(v));
    text.textContent = 'XYZ'[i]; svg.append(line, text);
  }
}
function sourceId(face) {
  if (!face) return null; if (currentFile === inspection.mesh_file) return face.id;
  const close = (a, b) => Math.abs(a - b) < 1e-4;
  const candidates = inspection.faces.filter(f => f.surface === face.surface && [0, 1, 2].every(i => face.bounds_mm[i] >= f.bounds_mm[i] - 1e-4 && face.bounds_mm[i + 3] <= f.bounds_mm[i + 3] + 1e-4));
  return candidates.find(f => {
    if (f.surface === 'plane') return f.normal.every((v, i) => close(v, face.normal[i])) && Math.abs(f.normal.reduce((sum, v, i) => sum + v * (face.origin[i] - f.origin[i]), 0)) < 1e-4;
    if (f.radius !== undefined && !close(f.radius, face.radius)) return false;
    if (f.minor_radius !== undefined && !close(f.minor_radius, face.minor_radius)) return false;
    return true;
  })?.id || null;
}
function paint() {
  const ids = new Set(selectedFeature?.faceIds || []);
  for (const m of meshes) m.material.emissive.set(m === selected || ids.has(sourceId(m.userData)) ? 0x183749 : m === hovered ? 0x1a242a : 0x000000);
  redraw();
}
function dimensionList() {
  if (!graph) return;
  const dimensions = allDimensions ? graph.dimensions : dimensionsFor(graph, selectedFeature?.id || 'body', sourceId(selected?.userData));
  $('#dimension-list-title').textContent = allDimensions ? 'Все размеры детали' : selectedFeature?.title || 'Габариты';
  $('#visible-dimension-count').textContent = `${dimensions.length} ${dimensions.length === 1 ? 'размер' : 'размеров'}`;
  const list = $('#dimension-list'); list.replaceChildren();
  for (const d of dimensions) {
    const row = document.createElement('button'); row.type = 'button'; row.className = `dimension-row${d.id === activeDimension ? ' is-active' : ''}${d.mismatch ? ' is-mismatch' : ''}`;
    row.dataset.dimensionId = d.id; row.setAttribute('aria-label', `${d.name}: ${dimensionText(d)} ${d.units || 'мм'}`);
    const symbol = document.createElement('span'); symbol.className = 'dimension-symbol'; symbol.textContent = d.prefix || /^[ØR]/.exec(dimensionText(d))?.[0] || (d.kind === 'linear' ? '↔' : 'L');
    const copy = document.createElement('span'), name = document.createElement('span'); name.className = 'dimension-name'; name.textContent = d.name; copy.append(name);
    if(d.note)row.title=d.note;
    if (d.mismatch) { const note = document.createElement('span'); note.className = 'dimension-source'; note.textContent = `Чертёж: ${formatNumber(d.expected)} мм`; copy.append(note); }
    const value = document.createElement('span'); value.className = 'dimension-value'; value.textContent = dimensionText(d); const units = document.createElement('small'); units.textContent = d.units || 'мм'; value.append(units);
    row.append(symbol, copy, value); row.addEventListener('click', () => { activeDimension = d.id; selectFeature(d.featureId, true); }); list.append(row);
  }
  if (!dimensions.length) { const p = document.createElement('p'); p.className = 'support-note'; p.textContent = 'Для этой грани доступны геометрические свойства. Все измерения модели открываются кнопкой над просмотром.'; list.append(p); }
  $('#dimension-note').textContent = config.annotationsWarning || (config.annotations ? 'Значения измерены по STEP. Звёздочки и условные обозначения сохранены из чертежа.' : 'Геометрические измерения BRep. Чертёжные обозначения для этой модели не переданы.');
}
function select(id) {
  selected = meshes.find(m => m.userData.id === Number(id)) || null; activeDimension = null;
  selectedFeature = selected ? ownerForFace(graph, sourceId(selected.userData)) : null;
  featureSelect.setValue(selectedFeature?.id || 'body'); faceSelect.setValue(selected ? String(selected.userData.id) : '');
  $('#selection-chip').hidden = !selected; $('#selection-name').textContent = selectedFeature?.title || (selected ? surfaceLabel(selected.userData.surface) : '');
  const target = $('#details');
  if (!selected) target.textContent = 'Выберите грань на модели или в списке.';
  else {
    const f = selected.userData, b = f.bounds_mm, pairs = [['Поверхность', surfaceLabel(f.surface)], ['Площадь, мм²', f.area_mm2], ['Размах по X / Y / Z, мм', [b[3]-b[0], b[4]-b[1], b[5]-b[2]]]];
    if (f.radius !== undefined) pairs.push(['Диаметр, мм', f.radius * 2]);
    if (f.minor_radius !== undefined) pairs.push(['Малый радиус тора, мм', f.minor_radius], ['Большой радиус тора, мм', f.major_radius]);
    if (f.semi_angle_deg !== undefined) pairs.push(['Полуугол конуса, °', f.semi_angle_deg]);
    pairs.push(['Номер грани в этом импорте', f.id]); metrics(target, pairs);
  }
  dimensionList(); paint();
}
function selectFeature(id, keepDimension = false) {
  const feature = graph.features.find(f => f.id === id); if (!feature) return;
  const saved = activeDimension, mesh = meshes.find(m => feature.faceIds.includes(sourceId(m.userData)));
  select(mesh?.userData.id || ''); selectedFeature = feature; featureSelect.setValue(id); if (keepDimension) activeDimension = saved;
  $('#selection-chip').hidden = id === 'body'; $('#selection-name').textContent = feature.title; dimensionList(); paint();
}
$('#clear').addEventListener('click', () => select(''));
let down;
const ray = new THREE.Raycaster();
function hit(e) {
  const r = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1), camera); return ray.intersectObjects(meshes)[0]?.object || null;
}
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => { if (e.button === 0 && down && Math.hypot(e.clientX-down[0], e.clientY-down[1]) < 4) select(hit(e)?.userData.id || ''); down = null; });
renderer.domElement.addEventListener('pointermove', e => { if (e.buttons) return; const found = hit(e); if (hovered !== found) { hovered = found; renderer.domElement.style.cursor = found ? 'pointer' : 'grab'; paint(); } });
renderer.domElement.addEventListener('pointerleave', () => { hovered = null; paint(); });
renderer.domElement.addEventListener('keydown', e => { if (e.key === 'Escape') select(''); if (e.key === '+' || e.key === '=') zoom(1.2); if (e.key === '-') zoom(1/1.2); });

function setFit(b) { fitBounds = b; center.set((b[0]+b[3])/2, (b[1]+b[4])/2, (b[2]+b[5])/2); radius = Math.max(Math.hypot(b[3]-b[0], b[4]-b[1], b[5]-b[2])*.6, 1); }
async function view(name) {
  const offsets = { iso: [1,-1.6,1.1], x: [1,0,0], y: [0,-1,0], z: [0,0,1] }; if (!offsets[name]) throw new Error('Unknown view'); currentView = name;
  const offset = new THREE.Vector3(...offsets[name]), cutaway = inspection.cutaways?.find(c => c.mesh_file === currentFile);
  if (cutaway) { const normal = new THREE.Vector3(...cutaway.plane.normal).normalize(), dot = offset.dot(normal); if (dot * (cutaway.plane.keep === 'negative' ? 1 : -1) < 0) offset.addScaledVector(normal, -2*dot); }
  camera.up.set(name === 'iso' ? .42 : 0, name === 'z' ? 1 : 0, name === 'z' ? 0 : 1);
  camera.position.copy(center).add(offset.normalize().multiplyScalar(radius*4)); camera.near = Math.max(.001,radius/10000); camera.far = radius*12;
  camera.zoom = 1; controls.target.copy(center); controls.update(); size(); camera.updateMatrixWorld(true);
  let halfWidth=0,halfHeight=0;
  for (const x of [fitBounds[0],fitBounds[3]]) for (const y of [fitBounds[1],fitBounds[4]]) for (const z of [fitBounds[2],fitBounds[5]]) { const p=new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);halfWidth=Math.max(halfWidth,Math.abs(p.x));halfHeight=Math.max(halfHeight,Math.abs(p.y)); }
  const margin = allDimensions ? .73 : .86;
  camera.zoom = margin*Math.min(radius*container.clientWidth/container.clientHeight/Math.max(halfWidth,.001),radius/Math.max(halfHeight,.001)); camera.updateProjectionMatrix();
  ground.visible = name === 'iso' && $('#toggle-grid').getAttribute('aria-pressed') === 'true';
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.view===name)));
  $('#current-view').textContent = {iso:'Изометрия',x:'Вид вдоль X',y:'Вид вдоль Y',z:'Вид вдоль Z'}[name];
  status.textContent = `${modelSelect.text.textContent}, ${$('#current-view').textContent}`; await readyFrame();
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',()=>run(view(button.dataset.view))));
function zoom(factor) { camera.zoom=Math.max(.01,Math.min(1000,camera.zoom*factor));camera.updateProjectionMatrix();redraw(); }
$('#zoom-in').addEventListener('click',()=>zoom(1.2));$('#zoom-out').addEventListener('click',()=>zoom(1/1.2));
async function fit() { setFit(data.bounds_mm); await view(currentView); }
$('#fit-model').addEventListener('click',()=>run(fit()));$('#rail-model').addEventListener('click',()=>{select('');run(fit());});
async function setDimensionsAll(value) {
  allDimensions=!!value; for(const id of ['#toggle-dimensions','#rail-dimensions']) $(id).setAttribute('aria-pressed',String(allDimensions));
  $('#toggle-dimensions>span').textContent=allDimensions?'Скрыть все размеры':'Показать все размеры';
  $('#rail-dimensions').setAttribute('aria-label',allDimensions?'Скрыть все размеры':'Показать все размеры');
  container.style.minHeight=allDimensions?`${Math.max(innerWidth<540?430:280,Math.ceil(graph.dimensions.length/2)*22+210)}px`:'';
  if (!allDimensions) $('.viewer-card').style.minHeight = '';
  dimensionList();await fit();
}
for(const id of ['#toggle-dimensions','#rail-dimensions'])$(id).addEventListener('click',()=>run(setDimensionsAll(!allDimensions)));
$('#toggle-edges').addEventListener('click',()=>{const b=$('#toggle-edges'),value=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(value));if(outlines)outlines.visible=value;redraw();});
$('#toggle-grid').addEventListener('click',()=>{const b=$('#toggle-grid'),value=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(value));ground.visible=value&&currentView==='iso';redraw();});
$('#help-toggle').addEventListener('click',()=>{const panel=$('#help-panel');panel.hidden=!panel.hidden;$('#help-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
$('#rail-section').addEventListener('click',()=>{const options=modelSelect.items.filter(item=>!item.value.startsWith('@')),i=options.findIndex(o=>o.value===currentFile);if(options.length>1)run(load(options[(i+1)%options.length].value));});

async function load(file) {
  container.setAttribute('aria-busy','true');const response=await fetch(file);if(!response.ok)throw new Error(`Cannot load ${file}`);data=await response.json();currentFile=file;modelSelect.setValue(file);
  for(const child of [...model.children]){child.geometry?.dispose();child.material?.dispose();model.remove(child);}meshes.length=0;
  for(const face of data.faces){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(face.vertices,3));geometry.setIndex(face.indices);geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color:0x9daebc,metalness:.35,roughness:.38,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
    const mesh=new THREE.Mesh(geometry,material);mesh.userData=face;mesh.castShadow=true;mesh.receiveShadow=true;model.add(mesh);meshes.push(mesh);}
  const edges=new THREE.BufferGeometry();edges.setAttribute('position',new THREE.Float32BufferAttribute(data.outline_segments,3));outlines=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:0x365267,transparent:true,opacity:.52}));outlines.visible=$('#toggle-edges').getAttribute('aria-pressed')==='true';model.add(outlines);
  setFit(data.bounds_mm);for(const child of [...ground.children]){child.geometry?.dispose();child.material?.dispose();ground.remove(child);}
  const size=radius*4,grid=new THREE.GridHelper(size,32,0xa6bbc9,0xc4d3dd);grid.rotation.x=Math.PI/2;grid.position.set(center.x,center.y,data.bounds_mm[2]-.6);grid.material.transparent=true;grid.material.opacity=.35;ground.add(grid);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.ShadowMaterial({opacity:.12}));plane.position.set(center.x,center.y,data.bounds_mm[2]-.3);plane.receiveShadow=true;ground.add(plane);
  key.position.copy(center).add(new THREE.Vector3(-2,-3,5).multiplyScalar(radius));key.target.position.copy(center);fill.position.copy(center).add(new THREE.Vector3(3,2,1).multiplyScalar(radius));rim.position.copy(center).add(new THREE.Vector3(0,2,4).multiplyScalar(radius));
  Object.assign(key.shadow.camera,{left:-radius*2,right:radius*2,top:radius*2,bottom:-radius*2,near:.01,far:radius*14});key.shadow.camera.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;
  faceSelect.setOptions([{value:'',label:'Выбрать грань',icon:'cursor'},...data.faces.map(f=>({value:String(f.id),label:`${f.id}. ${surfaceLabel(f.surface)}${f.radius!==undefined?` Ø${formatNumber(f.radius*2)}`:f.minor_radius!==undefined?` R${formatNumber(f.minor_radius)}`:''}`,icon:'edges'}))]);
  const b=data.bounds_mm,summary=currentFile===inspection.mesh_file?inspection.summary:inspection.cutaways.find(c=>c.mesh_file===currentFile).summary;
  metrics($('#summary'),[['Габариты, мм',[b[3]-b[0],b[4]-b[1],b[5]-b[2]]]],'');
  metrics($('#properties-summary'),[['Объём, мм³',summary.volume_mm3],['Площадь, мм²',summary.area_mm2],['Граней',summary.face_count],['Отклонение сетки, мм',data.deflection_mm]]);
  $('#footer-info').textContent=`${summary.solid_count} тело · ${data.faces.length} граней`;
  hovered=null;select('');await view('iso');container.setAttribute('aria-busy','false');
}
async function focus(id){const face=data.faces.find(f=>f.id===Number(id));if(!face)throw new Error('Face ID is absent in this mesh.');setFit(face.bounds_mm);const direction=face.surface==='cylinder'?face.axis:face.surface==='plane'?face.normal:null;const index=direction?.findIndex(v=>Math.abs(v)>.999999);await view(index>=0?['x','y','z'][index]:'iso');select(id);await readyFrame();}
window.cadPreview={ready:false,load,view,focus,select,setDimensionsAll,cameraState(){return{mesh:currentFile,view:currentView,position:camera.position.toArray(),up:camera.up.toArray(),target:controls.target.toArray(),zoom:camera.zoom,frustum:[camera.left,camera.right,camera.top,camera.bottom,camera.near,camera.far],fit_bounds_mm:fitBounds};},get selectedFace(){return selected?.userData.id||null;},get dimensionsAll(){return allDimensions;},get dimensionCount(){return graph?.dimensions.length||0;}};
try{
  [inspection,config]=await Promise.all([fetch('inspection.json').then(r=>r.json()),fetch('preview-config.json').then(r=>r.json())]);graph=config.annotations||geometryDimensions(inspection);
  if(!graph.features.some(feature=>feature.id==='body'))graph={...graph,features:[{id:'body',title:'Вся деталь',faceIds:inspection.faces.map(face=>face.id)},...graph.features]};
  if(config.home_url){
    const old=$('.brand-mark'),home=document.createElement('a');home.className=old.className;home.textContent=old.textContent;home.href=config.home_url;home.setAttribute('aria-label','На стартовый экран CAD-Metall');home.title='Создать 3D';home.style.textDecoration='none';old.replaceWith(home);
    for(const [hash,label,name] of [['journal','Журнал работ','history'],['settings','Настройки агента','sliders']]){const link=document.createElement('a');link.className='rail-button';link.href=config.home_url+'#'+hash;link.setAttribute('aria-label',label);link.title=label;link.append(icon(name));$('.rail-tools').append(link);}
  }
  if(config.chat_model){
    const {openCADChat}=await import('/chat.mjs');
    const chat=document.createElement('button');chat.type='button';chat.className='button';chat.id='open-model-chat';chat.append(icon('chat'),document.createTextNode('Уточнить модель'));chat.addEventListener('click',()=>void openCADChat({modelId:config.chat_model}));$('.topbar-actions').prepend(chat);
  }
  document.title=`${config.title} · CAD Metall`;$('#model-title').textContent=config.title;$('#model-subtitle').textContent=config.subtitle;
  if(config.model_notes?.length)$('#model-note').textContent=config.model_notes.join(' ');
  const link=$('#download-step');if(config.download.available){link.href=config.download.url;link.download=config.download.name;link.removeAttribute('aria-disabled');link.title=`${config.download.name} · ${Math.ceil(config.download.bytes/1024)} КБ`;}else{link.title='STEP отсутствует в каталоге просмотра';link.tabIndex=-1;}
  modelSelect.setOptions([{value:inspection.mesh_file,label:'Полная деталь',icon:'cube'},...(inspection.cutaways||[]).map((c,i)=>({value:c.mesh_file,label:`Разрез ${i+1}`,icon:'section'})),...(config.modelNavigation||[]).map(item=>({value:`@${item.url}`,label:item.label,icon:'cube'}))]);
  $('#rail-section').disabled=!inspection.cutaways?.length;
  featureSelect.setOptions(graph.features.map(f=>({value:f.id,label:f.title,icon:f.id==='body'?'cube':'ruler'})));$('#dimension-count').textContent=graph.dimensions.length;$('#tab-dimension-count').textContent=graph.dimensions.length;
  await load(inspection.mesh_file);window.cadPreview.ready=true;
}catch(e){error(e);throw e;}
