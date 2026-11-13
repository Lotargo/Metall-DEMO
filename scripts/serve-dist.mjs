import { createServer } from 'node:http';
import { readFile, stat, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'dist');
const mime = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.step': 'application/step' };
await mkdir(path.join(root, '.temp'), { recursive: true });
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname.startsWith('/api/')) {
    await appendFile(path.join(root, '.temp/api-network-leaks.jsonl'), JSON.stringify({ method: request.method, path: pathname }) + '\n');
    response.writeHead(501); response.end('This static server has no API.'); return;
  }
  if (pathname === '/') { response.writeHead(302, { Location: '/Metall-DEMO/' }); response.end(); return; }
  const file = path.resolve(directory, '.' + pathname.replace(/^\/Metall-DEMO/, ''));
  if (!pathname.startsWith('/Metall-DEMO/') || (file !== directory && !file.startsWith(directory + path.sep))) { response.writeHead(404); response.end(); return; }
  try {
    const filename = (await stat(file)).isDirectory() ? path.join(file, 'index.html') : file;
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(await readFile(filename));
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(Number(process.env.DEMO_PREVIEW_PORT ?? 4189), '127.0.0.1', () => console.log(`Static-only preview: http://127.0.0.1:${server.address().port}/Metall-DEMO/`));
