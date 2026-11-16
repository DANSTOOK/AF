// Servidor local solo para desarrollo/pruebas: sirve la carpeta app en http://localhost:8765
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = path.normalize(path.join(root, u === '/' ? 'index.html' : u));
  if (!f.startsWith(root)) { s.writeHead(403); return s.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { s.writeHead(404); return s.end('no encontrado'); }
    s.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); s.end(d);
  });
}).listen(8765, '127.0.0.1', () => console.log('http://localhost:8765'));
