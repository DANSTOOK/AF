// Incrusta los formatos oficiales vacíos en js/plantilla.js para que la página funcione sin archivos externos.
// Uso: node tools/build-plantilla.js
const fs = require('fs');
const path = require('path');

const carpeta = path.join(__dirname, '..', '..', 'plantilla');
const FORMATOS = {
  V2: 'Formato de Movimientos AF V.2 2026.xlsx',
  ANEXO3: 'Formato de Movimientos AF (Anexo 3).xlsx'
};
const destino = path.join(__dirname, '..', 'js', 'plantilla.js');
const salida = {};
Object.keys(FORMATOS).forEach(k => {
  const archivo = path.join(carpeta, FORMATOS[k]);
  salida[k] = { nombre: FORMATOS[k], b64: fs.readFileSync(archivo).toString('base64') };
  console.log('Incrustado', k, archivo);
});
fs.writeFileSync(destino, '// Generado por tools/build-plantilla.js — no editar a mano\nwindow.PLANTILLAS = ' + JSON.stringify(salida) + ';\n');
console.log('->', destino);
