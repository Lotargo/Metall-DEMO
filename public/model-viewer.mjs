/* global document, devicePixelRatio, fetch, location, parent, requestAnimationFrame, ResizeObserver, URLSearchParams, window */
import * as THREE from 'three';
import { createModelControls, modelCameraUp } from './model-controls.mjs';

// Rendering, picking and the dimension overlay are borrowed from CAD-Metall.
// Navigation, passport data and operator actions belong to the Metall host.
export async function openModel(base) {
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const [{ OrbitControls }, { DimensionOverlay }, inspection, config] = await Promise.all([
    import(base + 'OrbitControls.js'), import(base + 'preview-overlay.mjs'),
    read('inspection.json'), read('preview-config.json'),
  ]);
  const container = document.querySelector('#viewport');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.tabIndex = preview ? -1 : 0;
  renderer.domElement.setAttribute('aria-label', 'Вращение модели мышью, масштаб колесом');
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene(), model = new THREE.Group();
  scene.add(model, new THREE.HemisphereLight(0xffffff, 0x7d94a8, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 3); scene.add(light);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 10000);
  let controls = createModelControls(OrbitControls, camera, renderer.domElement, { preview, onChange: draw });
  const overlay = new DimensionOverlay(container), meshes = [], center = new THREE.Vector3();
  const sha = config.annotations?.step_sha256;
  let radius = 1, bounds, selection = null, faceId = null, ready = false, frame = null, viewName = 'iso', loadId = 0;
  let dimensionRows = [], showAll = false;

  async function read(name) { const response = await fetch(base + name); if (!response.ok) throw new Error('Model data unavailable'); return response.json(); }
  function notify(type, extra = {}) { parent.postMessage({ type, step_sha256: sha, ...extra }, location.origin); }
  function draw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null; renderer.render(scene, camera);
      const dimensions = [];
      for (const row of showAll ? dimensionRows : selection ? [selection] : []) {
        if (!Number.isFinite(row.value)) continue;
        const ids = row.face_ids ?? [], face = inspection.faces.find(item => ids.includes(item.id));
        const b = face?.bounds_mm ?? bounds, anchor = [0, 1, 2].map(i => (b[i] + b[i + 3]) / 2);
        let points;
        if (Array.isArray(row.dimension_points) && row.dimension_points.length === 2) {
          points = row.dimension_points; for (let i=0;i<3;i++) anchor[i]=(points[0][i]+points[1][i])/2;
        }
        const overall = /^overall-([xyz])$/.exec(row.ref ?? '');
        if (overall) {
          const axis = 'xyz'.indexOf(overall[1]);
          points = [anchor.slice(), anchor.slice()]; points[0][axis] = bounds[axis]; points[1][axis] = bounds[axis + 3];
        }
        if (row.ref?.startsWith('span-')) {
          const datums = /^datums\.z-([\d.e+-]+) → datums\.z-([\d.e+-]+)$/.exec(row.source ?? '');
          if (datums) { anchor[2] = (Number(datums[1]) + Number(datums[2])) / 2; points = [anchor.slice(), anchor.slice()]; points[0][2] = Number(datums[1]); points[1][2] = Number(datums[2]); }
        }
        dimensions.push({ id: row.ref, name: row.name, actual: row.value, prefix: row.prefix, units: row.unit, kind: points ? 'linear' : 'leader', anchor, points });
      }
      overlay.draw(dimensions, camera, selection?.ref);
    });
  }
  function paint() {
    const ids = new Set(selection?.ref?.startsWith('overall-') || selection?.measurement_kind === 'bounds_length' ? meshes.map(mesh => mesh.userData.id) : selection?.face_ids ?? (faceId ? [faceId] : []));
    for (const mesh of meshes) mesh.material.emissive.set(ids.has(mesh.userData.id) ? 0x215879 : 0x000000);
    document.querySelector('#selection').textContent = selection ? `${selection.feature} · ${selection.name}` : faceId ? 'Поверхность выбрана на модели' : 'Выберите поверхность на модели или размер в таблице';
    draw();
  }
  function resize() {
    const width = container.clientWidth, height = container.clientHeight; if (!width || !height) return;
    renderer.setSize(width, height); const aspect = width / height;
    camera.left = -radius * aspect; camera.right = radius * aspect; camera.top = radius; camera.bottom = -radius;
    camera.updateProjectionMatrix(); draw();
  }
  function fit(name = viewName) {
    if (!bounds) return;
    viewName = name;
    const direction = { iso: [1, -1.6, 1.1], x: [1, 0, 0], y: [0, -1, 0], z: [0, 0, 1] }[name];
    const up = modelCameraUp(name, preview);
    if (!camera.up.toArray().every((value, index) => value === up[index])) {
      controls.dispose();
      controls = createModelControls(OrbitControls, camera, renderer.domElement, { view: name, preview, onChange: draw });
    }
    camera.position.copy(center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(radius * 4));
    camera.near = Math.max(.001, radius / 10000); camera.far = radius * 12; camera.zoom = 1;
    controls.target.copy(center); controls.update(); resize(); camera.updateMatrixWorld(true);
    let w = 0, h = 0;
    for (const x of [bounds[0], bounds[3]]) for (const y of [bounds[1], bounds[4]]) for (const z of [bounds[2], bounds[5]]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse); w = Math.max(w, Math.abs(p.x)); h = Math.max(h, Math.abs(p.y));
    }
    camera.zoom = .78 * Math.min(radius * container.clientWidth / container.clientHeight / Math.max(w, .001), radius / Math.max(h, .001));
    camera.updateProjectionMatrix();
    for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === name));
    draw();
  }
  async function load(file) {
    const id = ++loadId, data = await read(file); if (id !== loadId) return;
    for (const child of [...model.children]) { child.geometry?.dispose(); child.material?.dispose(); model.remove(child); } meshes.length = 0;
    for (const face of data.faces) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(face.vertices, 3)); geometry.setIndex(face.indices); geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ color: 0xa4b5c2, metalness: .3, roughness: .4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const mesh = new THREE.Mesh(geometry, material); mesh.userData = face; model.add(mesh); meshes.push(mesh);
    }
    const edges = new THREE.BufferGeometry(); edges.setAttribute('position', new THREE.Float32BufferAttribute(data.outline_segments, 3));
    model.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x365267, transparent: true, opacity: .5 })));
    bounds = data.bounds_mm; center.set(...[0, 1, 2].map(i => (bounds[i] + bounds[i + 3]) / 2));
    radius = Math.max(Math.hypot(...[0, 1, 2].map(i => bounds[i + 3] - bounds[i])) * .6, 1);
    light.position.copy(center).add(new THREE.Vector3(-2, -3, 5).multiplyScalar(radius)); light.target.position.copy(center); scene.add(light.target);
    // Cutaway faces have their own topology; don't claim original face links there.
    selection = null; faceId = null; fit(); paint();
    renderer.domElement.dataset.originalMesh = String(file === inspection.mesh_file);
  }
  const ray = new THREE.Raycaster(); let down;
  renderer.domElement.addEventListener('pointerdown', event => { down = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener('pointerup', event => {
    const start = down; down = null;
    if (preview || event.button || !start || Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 4) return;
    if (renderer.domElement.dataset.originalMesh !== 'true') return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1), camera);
    faceId = ray.intersectObjects(meshes)[0]?.object.userData.id ?? null; selection = null; paint(); notify('metall-face-selected', { face_id: faceId });
  });
  renderer.domElement.addEventListener('pointercancel', () => { down = null; });
  new ResizeObserver(resize).observe(container);
  for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => fit(button.dataset.view));
  document.querySelector('#fit').addEventListener('click', () => fit());
  const sections = inspection.cutaways ?? [];
  if (sections.length) for (const [i, file] of [inspection.mesh_file, ...sections.map(item => item.mesh_file)].entries()) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = i ? `Разрез ${i}` : 'Целиком';
    button.addEventListener('click', () => load(file).catch(fail)); document.querySelector('#sections').append(button);
  }
  function fail() { ready = false; document.querySelector('#error').hidden = false; document.querySelector('#error').textContent = 'Не удалось загрузить модель.'; notify('cad-preview-error'); }
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'cad-preview-status' && ready) notify('cad-preview-ready');
    if (event.data?.type === 'metall-dimensions-mode' && event.data.step_sha256 === sha) {
      dimensionRows = [...new Map((event.data.dimensions ?? []).map(row => [row.ref, row])).values()]; showAll = !!event.data.all; draw();
    }
    if (event.data?.type === 'metall-select-dimension' && event.data.step_sha256 === sha) {
      try {
        if (renderer.domElement.dataset.originalMesh !== 'true') await load(inspection.mesh_file);
        selection = event.data.selection; faceId = null; paint();
      } catch { fail(); }
    }
  });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') notify('metall-close-viewer'); });
  await load(inspection.mesh_file); ready = true; notify('cad-preview-ready');
}
