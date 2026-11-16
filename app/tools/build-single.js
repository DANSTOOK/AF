// Genera una versión de un solo archivo (todo el JS incrustado) para abrir o compartir fácilmente.
// Uso: node tools/build-single.js  ->  ../Movimientos AF.html
const fs = require('fs');
const path = require('path');

const app = path.join(__dirname, '..');
const destino = path.join(app, '..', 'Movimientos AF.html');
let html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const js = fs.readFileSync(path.join(app, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  // data-src permite reutilizar el código incrustado (p. ej. para leer el MAF en segundo plano)
  return '<script data-src="' + src + '">\n' + js + '\n</script>';
});
fs.writeFileSync(destino, html);
console.log('Generado:', destino, (fs.statSync(destino).size / 1024).toFixed(0) + ' KB');
