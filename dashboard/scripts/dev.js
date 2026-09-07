// Read-only local preview: use the real calendar handler and existing production
// records. Writes stay disabled until running on the configured deployment.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const calendar = require('../api/calendar');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET') { res.writeHead(405); res.end('Local preview is read-only.'); return; }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/calendar') { await calendar(req, res); return; }
    if (['/api/events', '/api/todos', '/api/calendar-settings'].includes(url.pathname)) {
      const upstream = await fetch(`https://thomas-family-calendar-two.vercel.app${url.pathname}`, { signal: AbortSignal.timeout(15000) });
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' }); res.end(await upstream.text()); return;
    }
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!target.startsWith(root + path.sep) || url.pathname.includes('/lib/') || url.pathname.includes('/api/') || path.basename(target).startsWith('.')) { res.writeHead(404); res.end(); return; }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }); fs.createReadStream(target).pipe(res);
  } catch { res.writeHead(502); res.end('Preview could not reach the data source.'); }
}).listen(8765, '127.0.0.1', () => console.log('Local: http://127.0.0.1:8765'));
