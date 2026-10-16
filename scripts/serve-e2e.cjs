// 僅供端到端測試：固定提供 dist 成品與既有彈窗測試頁，不共用開發伺服器。
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist');
const harness = new Set(['/scripts/modal-browser.html', '/scripts/modal-browser.js']);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = harness.has(pathname) ? path.resolve(__dirname, '..' + pathname)
      : path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!harness.has(pathname) && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const content = await fs.readFile(file);
    response.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'application/octet-stream') +
      (['.html', '.js', '.css', '.json'].includes(path.extname(file)) ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400).end();
  }
}).listen(4192, '127.0.0.1', () => console.log('E2E: http://127.0.0.1:4192'));
