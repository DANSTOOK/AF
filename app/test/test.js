// Prueba del motor con un MAF real y la hoja de salida de Balsas (CR 50038, 19/10/2026).
// Uso: node test/test.js "C:\ruta\MAF.xlsx"
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const AF = require('../js/engine');
const Writer = require('../js/writer');

const rutaMaf = process.argv[2] || 'C:/Users/5481292/Downloads/MAF NOV 2026 4.xlsx';
const rutaPlantilla = path.join(__dirname, '..', '..', 'plantilla', 'Formato de Movimientos AF V.2 2026.xlsx');
const rutaAnexo = path.join(__dirname, '..', '..', 'plantilla', 'Formato de Movimientos AF (Anexo 3).xlsx');
const salida = path.join(__dirname, 'salida-prueba.xlsx');

let fallas = 0;
function check(nombre, cond, extra) {
  console.log((cond ? '  OK   ' : '  FALLA') + ' ' + nombre + (extra ? '  -> ' + extra : ''));
  if (!cond) fallas++;
}
function msg(r) { return [r.estado].concat(r.errores, r.advertencias).join(' | '); }

(async () => {
  let t = Date.now();
  const wb = XLSX.readFile(rutaMaf, { dense: true, cellStyles: false, cellNF: false, cellHTML: false });
  const hojas = {};
  wb.SheetNames.forEach(n => { hojas[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); });
  const maf = AF.cargarMAF(hojas);
  console.log(`MAF: hoja "${maf.hoja}", corte ${maf.fecha}, ${maf.total} activos, ${maf.sinPlaca} plaqueables sin placa, placas duplicadas: ${maf.placasDuplicadas.join(', ')} (${Date.now() - t} ms)`);

  // Validación de estructura: MAF sin columna obligatoria
  try { AF.cargarMAF({ X: [['Plaza Desc', 'Cr', 'Codigo Barras', 'No Activo']] }); check('Rechaza MAF incompleto', false); }
  catch (e) { check('Rechaza MAF incompleto', /faltan columnas/.test(e.message), e.message); }

  const lote = new AF.Lote(maf, []);
  const F = { fecha: '19/10/2026', cr: '50038' };

  console.log('\nBAJAS (hoja de salida de Balsas)');
  for (const p of ['03543933', '03543932', '03543931', '3543934']) {
    const r = lote.agregar({ ...F, tipo: 'BAJA', placa: p, motivo: 'OBSOLETO' });
    check('Baja ' + p, r.estado === 'OK', r.fila ? r.fila.noActivo + ' ' + r.fila.descripcion + ' ' + r.fila.motivo : msg(r));
  }
  let r = lote.agregar({ ...F, tipo: 'BAJA', placa: '03543933', motivo: 'OBSOLETO' });
  check('Bloquea baja duplicada', r.estado === 'ERROR', msg(r));
  r = lote.agregar({ ...F, tipo: 'BAJA', placa: '99999999', motivo: 'OBSOLETO' });
  check('Placa inexistente', r.estado === 'ERROR', msg(r));
  r = lote.validar({ ...F, tipo: 'BAJA', placa: '05625237' });
  check('Baja sin motivo', r.estado === 'ERROR' && /motivo/.test(r.errores[0]), msg(r));

  console.log('\nALTAS con placas que ya están en el MAF (debe bloquear)');
  r = lote.validar({ ...F, tipo: 'ALTA', placa: '05625241', descripcion: 'CAMARA CCTV' });
  check('05625241 casada en la misma tienda: se permite con su activo', r.estado === 'OK' && r.fila.noActivo === '9047708' && r.fila.placa === '05625241' && !r.filaTraspaso, msg(r));
  r = lote.validar({ ...F, cr: '5091Y', tipo: 'ALTA', placa: '05625239' });
  check('05625239 casada en otra tienda: bloquea', r.estado === 'ERROR' && r.sugerencia, msg(r));
  r = lote.validar({ ...F, tipo: 'ALTA', placa: '05625245', serie: 'D7X9-DRW7-QNNC' });
  check('05625245 está en Belmonte', r.estado === 'ERROR', msg(r));

  console.log('\nALTAS de renovación (simuladas con activos pendientes reales del MAF)');
  console.log('  Pendientes en 50038:', JSON.stringify(lote.equiposPendientes('50038')));
  r = lote.agregar({ ...F, tipo: 'ALTA', placa: '09900001', descripcion: 'HORNO' });
  check('Único candidato (HORNO)', r.estado === 'OK', r.fila ? r.fila.noActivo + ' ' + r.fila.descripcion + ' | ' + r.advertencias.join(' | ') : msg(r));
  r = lote.validar({ ...F, tipo: 'ALTA', placa: '09900002', descripcion: 'HORNO' });
  check('Ese activo ya no se ofrece (busca en otras tiendas)', r.estado === 'ELEGIR' && r.otrasTiendas && !r.candidatos.some(c => c.noActivo === '8810924'), msg(r));
  r = lote.validar({ ...F, tipo: 'ALTA', placa: '09900001', descripcion: 'PORTA' });
  check('Placa repetida en el lote', r.estado === 'ERROR', msg(r));

  // CR con varios pendientes de la misma descripción
  let crMulti = null, descMulti = null;
  for (const [cr, regs] of maf.idx.porCr) {
    const c = {};
    regs.filter(x => x.plaqueable === 'S' && !x.placa).forEach(x => { c[x.descripcion] = (c[x.descripcion] || 0) + 1; });
    const d = Object.keys(c).find(k => c[k] >= 3);
    if (d) { crMulti = cr; descMulti = d; break; }
  }
  r = lote.validar({ ...F, cr: crMulti, tipo: 'ALTA', placa: '09900010', descripcion: descMulti });
  check(`Varios candidatos (${crMulti} ${descMulti})`, r.estado === 'ELEGIR' && r.candidatos.length >= 3, r.candidatos && r.candidatos.map(c => c.noActivo).join(','));
  const elegido = r.candidatos[1].noActivo;
  r = lote.agregar({ ...F, cr: crMulti, tipo: 'ALTA', placa: '09900010', descripcion: descMulti, noActivo: elegido, serie: 'ABC-123' });
  check('Alta eligiendo activo', r.estado === 'OK' && r.fila.noActivo === elegido && r.fila.serie === 'ABC-123', msg(r));

  // Casamiento por serie: activo sin placa que sí trae serie
  const conSerie = maf.registros.find(x => x.plaqueable === 'S' && !x.placa && x.serie && (maf.idx.porSerie.get(AF.util.llaveSerie(x.serie)) || []).length === 1);
  r = lote.agregar({ ...F, cr: conSerie.cr, tipo: 'ALTA', placa: '09900020', serie: conSerie.serie.toLowerCase().replace(/ /g, '-') });
  check('Casado por serie', r.estado === 'OK' && r.fila.noActivo === conSerie.noActivo, msg(r));

  console.log('\nALTA de equipo cargado en el MAF a OTRA tienda (renovación que llegó a otro CR)');
  r = lote.validar({ ...F, tipo: 'ALTA', placa: '09900030', descripcion: 'LAP TOP' });
  check('Sin pendientes en 50038 -> busca en otras tiendas', r.estado === 'ELEGIR' && r.otrasTiendas && r.candidatos.every(c => c.cr !== '50038'),
    r.candidatos && (r.candidatos.length + ' candidatos, primero ' + r.candidatos[0].noActivo + ' en ' + r.candidatos[0].cr));
  const otro = r.candidatos[0];
  const nAntes = lote.filas.length;
  r = lote.agregar({ ...F, tipo: 'ALTA', placa: '09900030', descripcion: 'LAP TOP', noActivo: otro.noActivo });
  check('Genera ALTA en su CR del MAF + TRASPASO a 50038', r.estado === 'OK' && r.fila.cr === otro.cr && r.filaTraspaso &&
    r.filaTraspaso.cr === otro.cr && r.filaTraspaso.crDestino === '50038' && r.filaTraspaso.placa === '09900030' && lote.filas.length === nAntes + 2, msg(r));
  r = lote.validar({ ...F, tipo: 'ALTA', placa: '09900031', descripcion: 'HORNO', buscarOtras: true });
  check('Forzar búsqueda en otras tiendas', r.estado === 'ELEGIR' && r.otrasTiendas, r.candidatos && r.candidatos.length + ' candidatos');
  r = lote.validar({ ...F, tipo: 'ALTA', placa: '05625245' });
  check('Placa ya casada en otra tienda sugiere traspaso', r.estado === 'ERROR' && r.sugerencia && r.sugerencia.tipo === 'TRASPASO' && r.sugerencia.crDestino === '50038', r.sugerencia && r.sugerencia.texto);
  const idAlta = lote.filas[lote.filas.length - 2].id;
  lote.eliminar(idAlta);
  check('Quitar la alta quita también su traspaso', lote.filas.length === nAntes, lote.filas.length + ' renglones');
  r = lote.agregar({ ...F, tipo: 'ALTA', placa: '09900030', descripcion: 'LAP TOP', noActivo: otro.noActivo });
  check('Se puede volver a agregar', r.estado === 'OK', msg(r));

  console.log('\nCOTEJO');
  const cj = lote.cotejo('50038', 'CAMARA CCTV');
  check('Cotejo lista las cámaras de Balsas con su estado', cj.tienda === 'Balsas TIJ' && cj.equipos.length >= 9 && cj.equipos.some(e => /Con placa/.test(e.estado)),
    cj.equipos.length + ' cámaras: ' + [...new Set(cj.equipos.map(e => e.estado.split(' ').slice(0, 2).join(' ')))].join(', '));

  console.log('\nTRANSFERENCIAS');
  r = lote.agregar({ ...F, tipo: 'TRASPASO', placa: '05625238', crDestino: '5091Y' });
  check('Transferencia Balsas -> Belmonte', r.estado === 'OK', r.fila ? r.fila.cr + ' -> ' + r.fila.crDestino + ' ' + r.fila.tiendaDestino : msg(r));
  r = lote.validar({ ...F, tipo: 'TRASPASO', placa: '05625237', crDestino: '50038' });
  check('Transferencia a la misma tienda', r.estado === 'ERROR' && /mismo/.test(r.errores[0]), msg(r));
  r = lote.validar({ ...F, tipo: 'BAJA', placa: '04850537', motivo: 'DESUSO' });
  check('Placa duplicada en MAF pide elegir', r.estado === 'ELEGIR', msg(r));
  r = lote.validar({ ...F, tipo: 'GARANTIA', placa: '05625241' });
  check('Garantía ya no existe en el formato V.2', r.estado === 'ERROR', msg(r));

  console.log('\nEXCEL — Formato de Movimientos AF V.2');
  const serial = Writer.serialFecha(F.fecha);
  const res = await Writer.generarExcel(fs.readFileSync(rutaPlantilla), lote.filas, 'V2');
  fs.writeFileSync(salida, res.datos);
  console.log('  Resumen:', JSON.stringify(res.resumen));
  let wbOut = XLSX.read(res.datos, { type: 'buffer' });
  const celda = (hoja, ref) => { const c = wbOut.Sheets[hoja][ref]; return c ? String(c.v) : ''; };
  const fila = (hoja, refs) => refs.map(x => celda(hoja, x)).join(' | ');
  const altas = lote.filas.filter(f => f.tipo === 'ALTA');
  check('Alta de código: sobrescribe el ejemplo del renglón 2 y sigue en el 3', celda('Alta de código', 'A2') === altas[0].noActivo && celda('Alta de código', 'B2') === altas[0].placa && celda('Alta de código', 'L2') === '' && celda('Alta de código', 'C2') !== '00000000' && celda('Alta de código', 'A3') === altas[1].noActivo,
    fila('Alta de código', ['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'K2', 'L2']));
  check('Alta de código: fecha como fecha de Excel y TAB intactos', celda('Alta de código', 'G2') === String(serial) && celda('Alta de código', 'F2') === 'TAB' && celda('Alta de código', 'K2') === '*DN');
  check('Alta de código: serie capturada', celda('Alta de código', 'C' + (2 + altas.findIndex(a => a.serie === 'ABC-123'))) === 'ABC-123');
  const tr = lote.filas.filter(f => f.tipo === 'TRASPASO');
  check('Transferencia: activo, placa, CR origen y destino, fecha', celda('Transferencia ', 'A2') === tr[0].noActivo && celda('Transferencia ', 'C2') === tr[0].cr &&
    celda('Transferencia ', 'D2') === tr[0].crDestino && celda('Transferencia ', 'F2') === String(serial) && celda('Transferencia ', 'E2') === 'TAB',
    fila('Transferencia ', ['A2', 'B2', 'C2', 'D2', 'E2', 'F2']));
  check('Transferencia: sin marca de ejemplo', celda('Transferencia ', 'K2') === '' && celda('Transferencia ', 'A3') === tr[1].noActivo);
  check('Bajas: renglón 17 con saldo, año y tipo de baja', celda('Bajas', 'A17') === '7070948' && celda('Bajas', 'G17') === 'OBSOLETO' && celda('Bajas', 'K17') === '50038' && celda('Bajas', 'C17') !== '' && celda('Bajas', 'E17') === '2022',
    fila('Bajas', ['A17', 'B17', 'C17', 'D17', 'E17', 'F17', 'G17', 'K17']));
  check('Bajas: fecha del encabezado (B8)', celda('Bajas', 'B8') === String(serial), celda('Bajas', 'B8'));
  check('Pestaña oculta DATALOAD intacta', wbOut.SheetNames.includes('DATALOAD CAPT OTROS ALTAS') && String(wbOut.Sheets['DATALOAD CAPT OTROS ALTAS'].A5.v) === '7972705');

  // Segunda pasada: agregar sobre el archivo ya llenado
  const lote2 = new AF.Lote(maf, lote.entradasHistorial());
  r = lote2.validar({ ...F, tipo: 'BAJA', placa: '03543933', motivo: 'OBSOLETO' });
  check('Historial bloquea baja ya generada', r.estado === 'ERROR', msg(r));
  lote2.agregar({ ...F, tipo: 'BAJA', placa: '04850537', noActivo: '8593045', motivo: 'desuso' });
  r = lote2.agregar({ ...F, tipo: 'ALTA', placa: '09900099', descripcion: 'PORTA' });
  check('Alta extra para la segunda pasada', r.estado === 'OK', msg(r));
  const res2 = await Writer.generarExcel(fs.readFileSync(salida), lote2.filas, 'V2');
  check('Agrega después del último renglón (el renglón 2 ya no es ejemplo)', res2.resumen.BAJA.desde === 21 && res2.resumen.ALTA.desde === 6, JSON.stringify(res2.resumen));
  fs.writeFileSync(salida, res2.datos);
  console.log('  Archivo:', salida);

  console.log('\nPLAQUEO POR FACTURA');
  const lote3 = new AF.Lote(maf, []);
  const fac = lote3.porFactura('236603');
  check('Factura 236603: equipos pendientes en muchas tiendas', fac.length >= 222 && fac.filter(x => x.estado === 'pendiente').length >= 222 && new Set(fac.map(x => x.reg.cr)).size > 100,
    fac.length + ' equipos, ' + new Set(fac.map(x => x.reg.cr)).size + ' tiendas, ' + fac[0].reg.descripcion);
  const crFac = fac[0].reg.cr;
  const facCr = lote3.porFactura(' 236603 ', crFac);
  check('Filtro por tienda', facCr.length >= 1 && facCr.every(x => x.reg.cr === crFac), facCr.length + ' en ' + crFac);
  const pend = fac.filter(x => x.estado === 'pendiente');
  r = lote3.agregar({ tipo: 'ALTA', cr: pend[0].reg.cr, placa: '09911001', noActivo: pend[0].reg.noActivo, fecha: F.fecha });
  check('Escanear placa casa el siguiente equipo', r.estado === 'OK' && r.fila.noActivo === pend[0].reg.noActivo && !r.filaTraspaso, msg(r));
  check('Ese equipo pasa a casado', lote3.porFactura('236603').find(x => x.reg.noActivo === pend[0].reg.noActivo).estado === 'casado');
  r = lote3.agregar({ tipo: 'ALTA', cr: pend[1].reg.cr, placa: '09911001', noActivo: pend[1].reg.noActivo, fecha: F.fecha });
  check('Placa repetida no se casa dos veces', r.estado === 'ERROR', msg(r));
  r = lote3.agregar({ tipo: 'ALTA', cr: pend[1].reg.cr, placa: '05625241', noActivo: pend[1].reg.noActivo, fecha: F.fecha });
  check('Placa que ya existe en el MAF no se casa', r.estado === 'ERROR', msg(r));
  check('Factura inexistente', lote3.porFactura('NO-EXISTE').length === 0);

  console.log('\nEXCEL — Anexo 3 (desincorporación)');
  const lote4 = new AF.Lote(maf, []);
  r = lote4.agregar({ ...F, tipo: 'BAJA', placa: '03543933', motivo: 'DISPOSICION (ND)', motivoSalida: 'Tecnología', tipoEquipo: 'Eléctrico/Electrónico', disposicion: 'Venta para Reciclaje', proveedor: 'Recicladora X', observaciones: 'Cambio dinámico' });
  check('Baja Anexo 3 con datos de desincorporación', r.estado === 'OK' && r.fila.disposicion === 'Venta para Reciclaje', msg(r));
  const res4 = await Writer.generarExcel(fs.readFileSync(rutaAnexo), lote4.filas, 'ANEXO3');
  wbOut = XLSX.read(res4.datos, { type: 'buffer' });
  const hojaA = 'Bajas_Desincorporación';
  check('Anexo 3: renglón 14 completo', celda(hojaA, 'B14') === '7070948' && celda(hojaA, 'H14') === 'DISPOSICION (ND)' && celda(hojaA, 'L14') === '50038' && celda(hojaA, 'M14') === '03543933' &&
    celda(hojaA, 'N14') === 'Tecnología' && celda(hojaA, 'O14') === 'Eléctrico/Electrónico' && celda(hojaA, 'P14') === 'Venta para Reciclaje' && celda(hojaA, 'Q14') === 'Recicladora X',
    fila(hojaA, ['B14', 'C14', 'D14', 'E14', 'F14', 'G14', 'H14', 'L14', 'M14', 'N14', 'O14', 'P14', 'Q14', 'R14']));
  check('Anexo 3: fecha (C8) y plaza (N8)', celda(hojaA, 'C8') === String(serial) && celda(hojaA, 'N8') === 'Plaza Tijuana Este', fila(hojaA, ['C8', 'N8', 'C10']));
  check('Anexo 3: pie de firmas intacto', /Bajas Masivas/.test(celda(hojaA, 'A78')));
  check('Anexo 3: trae pestaña Concentrado reciclaje', wbOut.SheetNames.includes('Concentrado reciclaje') && wbOut.SheetNames.includes(hojaA), wbOut.SheetNames.join(', '));
  {
    const f0 = lote4.filas[0];
    const tres = [{ ...f0 }, { ...f0, noActivo: '9000001' }, { ...f0, noActivo: '9000002', descripcion: 'ESCANER DE MESA' }];
    const resC = await Writer.generarExcel(fs.readFileSync(rutaAnexo), tres, 'ANEXO3');
    const wbC = XLSX.read(resC.datos, { type: 'buffer' });
    const hc = wbC.Sheets['Concentrado reciclaje'];
    const v = ref => hc && hc[ref] ? String(hc[ref].v) : '';
    check('Concentrado: equipos agrupados y total', v('A1') === 'Equipo' && v('B1') === 'Número de equipos' && v('A2') === String(f0.descripcion) && v('B2') === '2' &&
      v('A3') === 'ESCANER DE MESA' && v('B3') === '1' && v('A4') === 'Total' && v('B4') === '3', ['A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'A4', 'B4'].map(r => r + '=' + v(r)).join(' '));
    check('Concentrado: la pestaña de bajas sigue igual', String(wbC.Sheets[hojaA]['B14'].v) === String(f0.noActivo) && /Bajas Masivas/.test(String(wbC.Sheets[hojaA]['A78'].v)));
    check('Concentrado: resumen lo reporta', resC.resumen.BAJA.concentrado && resC.resumen.BAJA.concentrado.equipos === 2, JSON.stringify(resC.resumen));
    const resV2 = await Writer.generarExcel(fs.readFileSync(rutaPlantilla), [{ ...f0 }], 'V2');
    check('Formato V.2 no lleva concentrado', !XLSX.read(resV2.datos, { type: 'buffer' }).SheetNames.includes('Concentrado reciclaje'));
  }
  fs.writeFileSync(path.join(__dirname, 'salida-anexo3.xlsx'), res4.datos);
  const muchas = Array.from({ length: 51 }, (x, i) => ({ ...lote4.filas[0], noActivo: String(9000000 + i) }));
  let errLimite = '';
  try { await Writer.generarExcel(fs.readFileSync(rutaAnexo), muchas, 'ANEXO3'); } catch (e) { errLimite = e.message; }
  check('Anexo 3: más de 50 equipos se rechaza con aviso', /admite 50/.test(errLimite), errLimite);

  console.log('\nLEVANTAMIENTO DE TIENDA (Balsas 50038)');
  const lev = AF.levantamiento(maf, '50038', ['03543933', '3543933', '05625245', '09999999', '05625241', '']);
  check('Clasifica: correcta, otra tienda, no registrada; la repetida (sin cero) cuenta una vez',
    lev.encontrados.length === 2 && lev.otraTienda.length === 1 && lev.otraTienda[0].reg.cr === '5091Y' && lev.noRegistradas.length === 1 && lev.noRegistradas[0].placa === '09999999',
    `${lev.encontrados.length} correctas, ${lev.otraTienda.length} otra tienda, ${lev.noRegistradas.length} no registradas, ${lev.faltantes.length} no encontrados`);
  const totalBalsas = maf.idx.porCr.get('50038').length;
  check('No encontrados = resto del MAF de la tienda', lev.faltantes.length === totalBalsas - 2 && !lev.faltantes.some(x => x.noActivo === '7070948'), totalBalsas + ' activos en el MAF');
  check('No encontrados: primero los que tienen placa', lev.faltantes[0].placa && !lev.faltantes[lev.faltantes.length - 1].placa === !lev.faltantes.every(x => x.placa));
  const lote5 = new AF.Lote(maf, []);
  r = lote5.agregar({ tipo: 'TRASPASO', placa: lev.otraTienda[0].placa, noActivo: lev.otraTienda[0].reg.noActivo, crDestino: '50038', fecha: F.fecha });
  check('Transferencia desde el levantamiento', r.estado === 'OK' && r.fila.cr === '5091Y' && r.fila.crDestino === '50038', msg(r));
  check('usadoEn marca la transferencia', /este lote/.test(lote5.usadoEn('TRASPASO', lev.otraTienda[0].reg.noActivo)));
  const pendBalsas = lote5.pendientes('50038');
  r = lote5.agregar({ tipo: 'ALTA', cr: '50038', placa: '09999999', noActivo: pendBalsas[0].noActivo, fecha: F.fecha });
  check('Alta de placa no registrada casada con pendiente de la tienda', r.estado === 'OK' && lote5.usadoEn('ALTA', '', '9999999') !== '', msg(r));
  r = lote5.agregar({ tipo: 'BAJA', noActivo: lev.faltantes[0].noActivo, cr: '50038', motivo: 'NO LOCALIZADO (ND)', fecha: F.fecha });
  check('Baja de no encontrado (por No. Activo)', r.estado === 'OK' && r.fila.motivo === 'NO LOCALIZADO (ND)', msg(r));

  console.log('\nLISTA PEGADA');
  const items = AF.parsearLista(maf, 'Placa\n03543933\n 3543932 \n\n7070948\n09900500\t' + pendBalsas[1].noActivo + '\tSER 123\n09900501;ABC-9');
  check('Lee placas, activos, encabezado y columnas', items.length === 5 && items[0].placa === '03543933' && items[1].placa === '3543932' && items[2].noActivo === '7070948' && !items[2].placa &&
    items[3].noActivo === pendBalsas[1].noActivo && items[3].serie === 'SER 123' && items[4].serie === 'ABC-9', JSON.stringify(items.map(x => [x.placa, x.noActivo, x.serie])));
  const sim = lote5.copia();
  const nReal = lote5.filas.length;
  r = sim.agregar({ tipo: 'BAJA', placa: '03543932', motivo: 'CIERRE TIENDA', fecha: F.fecha });
  check('Simular en una copia no toca la captura', r.estado === 'OK' && lote5.filas.length === nReal && sim.filas.length === nReal + 1);

  console.log('\nBAJA MASIVA (cierre de tienda)');
  const lote6 = new AF.Lote(maf, [{ tipo: 'BAJA', noActivo: '7070948', placa: '03543933' }]);
  const res6 = maf.idx.porCr.get('50038').map(x => lote6.agregar({ tipo: 'BAJA', noActivo: x.noActivo, cr: '50038', motivo: 'CIERRE TIENDA', fecha: F.fecha }));
  check('Da de baja todo el CR menos lo ya generado', res6.filter(x => x.estado === 'OK').length === totalBalsas - 1 && res6.filter(x => x.estado === 'ERROR').length === 1,
    res6.filter(x => x.estado === 'OK').length + ' bajas');
  const anexoMas = lote6.filas.slice(0, 120);
  let partes = [];
  for (let i = 0; i < anexoMas.length; i += 50) partes.push(await Writer.generarExcel(fs.readFileSync(rutaAnexo), anexoMas.slice(i, i + 50), 'ANEXO3'));
  check('Anexo 3 de 120 bajas en 3 archivos de 50/50/20', partes.length === 3 && partes[2].resumen.BAJA.n === 20 && partes[0].resumen.BAJA.hasta === 63, partes.map(p => p.resumen.BAJA.n).join('/'));

  console.log('\nPENDIENTES DE PLAQUEO');
  const lote7 = new AF.Lote(maf, [{ tipo: 'ALTA', noActivo: pendBalsas[0].noActivo, placa: '01' }]);
  const tp = lote7.todosPendientes();
  check('Todos los pendientes menos los ya casados', tp.length === maf.sinPlaca - 1 && !tp.some(x => x.noActivo === pendBalsas[0].noActivo), tp.length + ' pendientes');

  console.log('\nSEGUIMIENTO contra un MAF posterior (simulado)');
  const enviados = lote5.filas.map(f => ({ tipo: f.tipo, noActivo: f.noActivo, placa: f.placa, cr: f.cr, crDestino: f.crDestino || '' }))
    .concat([{ tipo: 'BAJA', noActivo: '7070948', placa: '03543933', cr: '50038' }]);
  check('Con el mismo MAF todo sale pendiente', AF.seguimiento(maf, enviados).every(s => s.estado === 'pendiente'), AF.seguimiento(maf, enviados).map(s => s.tipo + ':' + s.estado).join(', '));
  const tras = enviados.find(e => e.tipo === 'TRASPASO'), alta = enviados.find(e => e.tipo === 'ALTA'), baja = enviados.find(e => e.tipo === 'BAJA');
  const regs2 = maf.registros.filter(x => x.noActivo !== baja.noActivo).map(x => {
    if (x.noActivo === tras.noActivo) return { ...x, cr: '50038' };
    if (x.noActivo === alta.noActivo) return { ...x, placa: alta.placa };
    return x;
  });
  const maf2 = AF.indexarMAF({ fecha: 'posterior', registros: regs2 });
  const seg = AF.seguimiento(maf2, enviados);
  check('Alta, transferencia y baja aplicadas', seg.filter(s => s.estado === 'aplicado').length === 3, seg.map(s => s.tipo + ':' + s.estado + ' (' + s.detalle + ')').join(' | '));
  const regs3 = maf.registros.map(x => x.noActivo === alta.noActivo ? { ...x, placa: '07777777' } : x.noActivo === tras.noActivo ? { ...x, cr: '50001' } : x);
  const seg3 = AF.seguimiento(AF.indexarMAF({ registros: regs3 }), enviados);
  check('Aplicados distinto (otra placa / otro CR)', seg3.filter(s => s.estado === 'distinto').length === 2, seg3.map(s => s.tipo + ':' + s.estado + ' (' + s.detalle + ')').join(' | '));

  console.log('\nESCÁNER: ¿la lectura parece placa?');
  check('Perfil del MAF: placas numéricas de 8 a 12 dígitos', maf.perfilPlacas.numerico && maf.perfilPlacas.longitudes.join(',') === '8,9,10,11,12', JSON.stringify(maf.perfilPlacas));
  check('Placa normal pasa', AF.revisarLectura(maf.perfilPlacas, '05625245') === '');
  check('Carácter de más por idioma de teclado', /caracteres de más/.test(AF.revisarLectura(maf.perfilPlacas, '05625477Ñ')));
  check('Serie leída por error', /solo números/.test(AF.revisarLectura(maf.perfilPlacas, 'D7X9-DRW7-QNNC')));
  check('Código de producto (13 dígitos) o lectura cortada', /13/.test(AF.revisarLectura(maf.perfilPlacas, '7501055300075')) && /7 \(/.test(AF.revisarLectura(maf.perfilPlacas, '0562524')));

  console.log(fallas ? `\n${fallas} FALLAS` : '\nTodas las pruebas pasaron');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
