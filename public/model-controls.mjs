// Keep the camera's up direction and the controls' cached orbit frame in sync.
export function modelCameraUp(view = 'iso', preview = false) {
  return preview ? [1, 0, 0] : view === 'z' ? [0, 1, 0] : [0, 0, 1];
}

export function createModelControls(Controls, camera, canvas, { view = 'iso', preview = false, onChange } = {}) {
  camera.up.set(...modelCameraUp(view, preview)).normalize();
  const controls = new Controls(camera, canvas);
  controls.enableDamping = false;
  controls.enabled = !preview;
  if (onChange) controls.addEventListener('change', onChange);
  return controls;
}
