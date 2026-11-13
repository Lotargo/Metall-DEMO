import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const entry of await readdir(path.join(root, 'public/models'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const target = path.join(root, 'public/models', entry.name);
  await mkdir(target, { recursive: true });
  for (const [source, destination] of Object.entries({
    'preview.html': 'viewer.html', 'preview.css': 'preview.css', 'preview-viewer.mjs': 'viewer.mjs',
    'preview-controls.mjs': 'preview-controls.mjs', 'preview-dimensions.mjs': 'preview-dimensions.mjs',
    'preview-overlay.mjs': 'preview-overlay.mjs', 'preview-icons.svg': 'icons.svg',
  })) await cp(path.join(root, 'viewer', source), path.join(target, destination));
  for (const [source, destination] of Object.entries({
    'build/three.module.js': 'three.module.js', 'build/three.core.js': 'three.core.js',
    'examples/jsm/controls/OrbitControls.js': 'OrbitControls.js',
  })) await cp(path.join(root, 'node_modules/three', source), path.join(target, destination));
  // The static viewer has a single return link; agent settings and live chat are absent.
  const file = path.join(target, 'viewer.mjs');
  const text = await readFile(file, 'utf8');
  const start = text.indexOf('    for(const [hash,label,name]');
  const end = text.indexOf('\n  }', start);
  if (start >= 0 && end >= 0) await writeFile(file, text.slice(0, start) + text.slice(end));
}
