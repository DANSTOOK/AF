/*
 * Levantamiento de tienda.
 * Principal: elegir la tienda, ver todos sus activos del MAF y dar de alta (casar) la placa que se les pone,
 * con serie, marca y modelo. Sale en la pestaña "Alta de código" del Formato de Movimientos AF V.2,
 * listo para que el responsable de AF lo suba a List.
 * Secundario (plegado): escanear todo lo que hay en la tienda y compararlo contra el MAF:
 *  - placa del MAF en otra tienda      -> TRANSFERENCIA a esta tienda
 *  - placa que no está en el MAF       -> ALTA (casar con un activo pendiente de placa)
 *  - activo del MAF que no se encontró -> BAJA (el usuario elige cuáles y el tipo de baja)
 */
(function () {
  'use strict';
  var App = window.AFApp, esc = App.esc;
  var MODULO = 'levantamiento';
  var LS_LEV = 'af_levantamiento';
  var MAX_OTRAS = 300;
  var ORDEN = { pendiente: 0, casado: 1, otro: 2, noPlaqueable: 3, conPlaca: 4 };

  window.AFLevantamiento = function () {
    var cont = document.getElementById('mod-' + MODULO);
    var lote = null;
    var lev = App.leerLS(LS_LEV, null) || { cr: '', fecha: App.hoyLocal(), placas: [] };
    var marcados = new Set();   // bajas seleccionadas (No. Activo)
    var borrador = {};          // selección de activo/serie por placa no registrada (sobrevive al repintar)
    var elegido = '';           // No. Activo al que se le pone la placa
    var editorDe = '';          // activo cuyos datos están cargados en los campos
    var cuenta = { porDar: 0, altas: 0 };

    cont.classList.add('dos-col');
    cont.innerHTML =
      '<div class="col-izq"><fieldset><legend>1. Tienda</legend>' +
      '<label>CR <input data-c="cr" size="8" list="listaCr"></label> ' +
      '<label>Tienda <input data-c="tienda" size="30" list="listaTiendas"></label> ' +
      '<span data-c="plaza" class="muted"></span> ' +
      '<label>Fecha de alta <input data-c="fecha" type="date"></label></fieldset>' +

      '<fieldset><legend>2. Poner placa y dar de alta</legend>' +
      '<div data-c="paso" class="paso"></div>' +
      '<div data-c="editor" class="siguiente"></div>' +
      '<div><label>Placa <input data-c="placa" size="14"></label> ' +
      '<label>Serie <input data-c="serie" size="18"></label> ' +
      '<label>Marca <input data-c="marca" size="12"></label> ' +
      '<label>Modelo <input data-c="modelo" size="14"></label> ' +
      '<button class="palomita" data-accion="alta">✓ Dar de alta</button> <button data-accion="saltar">Saltar</button></div>' +
      '<div class="muted">Serie, marca y modelo vienen del MAF; corríjalos si en el equipo dicen otra cosa.</div>' +
      '<div data-c="msgAlta"></div>' +
      '<h3 data-c="tituloAct">Activos de la tienda</h3><div data-c="statsAct"></div>' +
      '<label>Mostrar <select data-c="verAct"><option value="todos">Todos</option><option value="pend">Solo los que faltan de alta</option></select></label> ' +
      '<label>Buscar <input data-c="filtroAct" size="24" placeholder="Activo, equipo, serie o placa"></label>' +
      '<div class="scroll"><table data-c="activos"></table></div></fieldset>' +

      '<details data-c="detRev"><summary data-c="tituloRev"></summary><fieldset>' +
      '<div class="muted">Escanee todo lo que hay en la tienda: la app dice qué está en otra tienda según el MAF (transferencia), qué no está en el MAF y qué no se encontró (baja). Con este recuadro abierto, el escáner llena esta lista.</div>' +
      '<label>Placa <input data-c="placaRev" size="14"></label> <button data-accion="nuevo">Nuevo levantamiento</button>' +
      '<details><summary>¿Tiene una lista? Pegar varias placas</summary>' +
      '<textarea data-c="lista" rows="6" cols="40" placeholder="Una placa por renglón (se puede pegar una columna de Excel)"></textarea><br>' +
      '<button data-accion="agregarLista">Agregar lista</button></details>' +
      '<div data-c="ultimo"></div>' +
      '<div data-c="resumen"></div>' +
      '<div data-c="msg"></div>' +
      '<div data-c="otra"></div>' +
      '<div data-c="noreg"></div>' +
      '<div data-c="dup"></div>' +
      '<div data-c="faltan"></div>' +
      '<details><summary data-c="tituloEncontrados">Correctos</summary><div class="scroll" data-c="encontrados"></div></details>' +
      '<details><summary data-c="tituloEscaneadas">Placas escaneadas</summary><div class="scroll" data-c="escaneadas"></div></details>' +
      '<div class="botones"><button data-accion="exportar">Exportar revisión a Excel</button></div></fieldset></details>' +

      '</div><fieldset data-c="pie" class="col-der"><legend>3. Formato de alta V.2 para AF (<span data-c="nLote">0</span>)</legend>' +
      '<div class="scroll"><table data-c="tablaLote"></table></div></fieldset>';

    var q = function (n) { return cont.querySelector('[data-c="' + n + '"]'); };
    var val = function (n) { var e = q(n); return e ? e.value : ''; };
    q('fecha').value = lev.fecha || App.hoyLocal();
    q('cr').value = lev.cr || App.pref('lev_cr', '');

    var desdeCr = App.enlazarTienda(q('cr'), q('tienda'), q('plaza'), function () { elegido = ''; q('msgAlta').innerHTML = ''; if (App.maf) App.guardarPref('lev_cr', crValido()); pintar(); });

    function guardarLev() { App.guardarLS(LS_LEV, lev); }
    function crearLote() {
      lote = new AF.Lote(App.maf, App.historialPara(MODULO));
      var guardado = App.leerLote(MODULO);
      lote.filas = guardado;
      lote._sec = guardado.reduce(function (a, f) { return Math.max(a, f.id); }, 0);
    }
    function guardarLote() { App.guardarLote(MODULO, lote.filas); }
    function crValido() { var t = App.maf && AF.tiendaDeCr(App.maf, val('cr')); return t ? t.cr : ''; }
    function fecha() { return App.fechaTexto(val('fecha')); }
    function hora() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function revisionAbierta() { return q('detRev').open; }
    function tabla(enc, filas) {
      return '<table><tr>' + enc.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>' + filas.join('') + '</table>';
    }
    function td(vals) { return vals.map(function (v) { return '<td>' + esc(v === undefined || v === null ? '' : v) + '</td>'; }).join(''); }

    App.registrarContexto(MODULO, function () {
      var cr = crValido();
      return ['Levantamiento', cr ? cr + ' ' + val('tienda') : 'sin tienda', App.cuenta(cuenta.porDar, 'falta de alta', 'faltan de alta'),
        App.cuenta(lote ? lote.filas.length : 0, 'renglón en el formato', 'renglones en el formato')].join(' · ');
    });

    // =====================================================================
    // Principal: activos de la tienda -> placa, serie, marca, modelo -> alta
    // =====================================================================
    function estadoDe(r) {
      var f = lote.filas.filter(function (x) { return x.tipo === 'ALTA' && x.noActivo === r.noActivo; })[0];
      if (f) return { k: 'casado', txt: 'Alta en esta captura', placa: f.placa, fila: f };
      if (r.placa) return { k: 'conPlaca', txt: 'Ya tiene placa', placa: r.placa };
      var u = lote.usadoEn('ALTA', r.noActivo);
      if (u) return { k: 'otro', txt: 'Alta en ' + u, placa: '' };
      return r.plaqueable === 'S' ? { k: 'pendiente', txt: 'Falta de alta', placa: '' } : { k: 'noPlaqueable', txt: 'No plaqueable', placa: '' };
    }
    function elegible(e) { return e.k === 'pendiente' || e.k === 'noPlaqueable'; }
    function activosTienda(cr) {
      return (App.maf.idx.porCr.get(cr) || []).map(function (r) { return { r: r, e: estadoDe(r) }; })
        .sort(function (a, b) { return ORDEN[a.e.k] - ORDEN[b.e.k] || String(a.r.descripcion).localeCompare(String(b.r.descripcion), 'es') || String(a.r.noActivo).localeCompare(String(b.r.noActivo)); });
    }
    function regElegido() { return elegido ? App.maf.idx.porActivo.get(elegido) : null; }

    // Los campos se llenan con lo del MAF solo al cambiar de activo (lo que se corrigió a mano se respeta)
    function cargarEditor() {
      if (elegido === editorDe) return;
      var r = regElegido();
      q('placa').value = '';
      q('serie').value = r ? r.serie || '' : '';
      q('marca').value = r ? r.marca || '' : '';
      q('modelo').value = r ? r.modelo || '' : '';
      editorDe = elegido;
    }

    function pasoAlta() {
      var t;
      if (!crValido()) t = 'elija la tienda (CR o nombre).';
      else if (!elegido) t = cuenta.porDar ? 'elija en la lista el activo al que le pondrá la placa.' : 'esta tienda ya no tiene activos que falten de alta. Descargue el formato a la derecha.';
      else if (!AF.util.limpiaPlaca(val('placa'))) t = 'escanee la placa que le pondrá a este activo.';
      else t = 'revise serie, marca y modelo y presione ✓ Dar de alta.';
      q('paso').textContent = 'Ahora: ' + t;
    }

    var filtroAct = '';
    function pintarAltas() {
      var cr = crValido();
      if (!cr) {
        elegido = ''; cargarEditor(); cuenta = { porDar: 0, altas: 0 };
        q('editor').innerHTML = ''; q('tituloAct').textContent = 'Activos de la tienda'; q('statsAct').innerHTML = ''; q('activos').innerHTML = '';
        pasoAlta();
        return;
      }
      var lista = activosTienda(cr);
      if (elegido && !lista.some(function (x) { return x.r.noActivo === elegido && elegible(x.e); })) elegido = '';
      if (!elegido) { var s = lista.filter(function (x) { return x.e.k === 'pendiente'; })[0]; elegido = s ? s.r.noActivo : ''; }
      cargarEditor();
      cuenta = { porDar: lista.filter(function (x) { return x.e.k === 'pendiente'; }).length, altas: lista.filter(function (x) { return x.e.k === 'casado'; }).length };

      var r = regElegido();
      q('editor').innerHTML = r
        ? '<b>Activo ' + esc(r.noActivo) + '</b> — ' + esc(r.descripcion) + (r.descAdic ? ' <span class="muted">(' + esc(r.descAdic) + ')</span>' : '') +
          (r.plaqueable === 'S' ? '' : ' — <span class="warn">el MAF lo marca como no plaqueable</span>')
        : '<span class="muted">Sin activo elegido.</span>';

      q('tituloAct').textContent = 'Activos de la tienda en el MAF';
      var conPlaca = lista.filter(function (x) { return x.e.k === 'conPlaca'; }).length;
      q('statsAct').innerHTML = App.indicadores([
        { n: lista.length, txt: 'activos en el MAF' },
        { n: cuenta.porDar, txt: 'faltan de alta', cls: cuenta.porDar ? 'warn' : '' },
        { n: cuenta.altas, txt: 'con alta en esta captura', cls: 'ok' },
        { n: conPlaca, txt: 'ya tienen placa' }
      ]);
      var k = AF.util.llaveTexto(filtroAct);
      var ver = lista.filter(function (x) {
        if (val('verAct') === 'pend' && x.e.k !== 'pendiente') return false;
        return !k || AF.util.llaveTexto([x.r.noActivo, x.r.descripcion, x.r.serie, x.r.placa, x.e.placa, x.r.marca, x.r.modelo].join(' ')).indexOf(k) >= 0;
      });
      q('activos').innerHTML = tabla(['', 'No Activo', 'Descripción', 'Marca', 'Modelo', 'Serie (MAF)', 'Placa', 'Estado', 'Adq.'], ver.map(function (x) {
        var es = x.r.noActivo === elegido;
        var accion = es ? '➜' : elegible(x.e) ? '<button data-elegir="' + esc(x.r.noActivo) + '">Elegir</button>'
          : x.e.k === 'casado' ? '<button data-quitar="' + x.e.fila.id + '">Quitar</button>' : '';
        var cls = x.e.k === 'casado' ? 'ok' : x.e.k === 'pendiente' ? 'warn' : 'muted';
        return '<tr' + (es ? ' class="actual"' : '') + '><td>' + accion + '</td>' +
          td([x.r.noActivo, x.r.descripcion, x.r.marca, x.r.modelo, x.r.serie, x.e.placa]) +
          '<td class="' + cls + '">' + esc(x.e.txt) + '</td>' + td([x.r.mesAdq + '/' + x.r.anioAdq]) + '</tr>';
      }));
      pasoAlta();
    }

    function movAlta() {
      return { tipo: 'ALTA', cr: crValido(), placa: val('placa'), noActivo: elegido, serie: val('serie').trim(),
        marca: val('marca').trim().toUpperCase(), modelo: val('modelo').trim().toUpperCase(), fecha: fecha() };
    }
    // Primer problema que impide el alta (o '' si se puede)
    function errorAlta(v) {
      if (v.estado !== 'OK') return (v.errores[0] || v.advertencias[0] || 'No se puede dar de alta.');
      if (v.fila.noActivo !== elegido) return 'La placa ' + v.fila.placa + ' ya es del activo ' + v.fila.noActivo + ' (' + v.fila.descripcion + ') en el MAF.';
      if (v.filaTraspaso) return 'El activo no es de esta tienda.';
      return '';
    }
    function msgAlta(cls, textos) {
      q('msgAlta').innerHTML = textos.map(function (t) { return '<div class="' + cls + '">' + (cls === 'err' ? '✗ ' : cls === 'warn' ? '⚠ ' : '✓ ') + esc(t) + '</div>'; }).join('');
    }

    // Placa leída (escáner o Enter): se revisa y se pasa a la serie
    function leerPlacaAlta() {
      if (!lote) { App.lectura('error', 'Primero cargue el MAF.'); return; }
      var p = AF.util.limpiaPlaca(val('placa'));
      if (!p) return;
      if (!crValido()) { App.lectura('error', 'Elija primero la tienda.'); q('cr').focus(); return; }
      if (!elegido) { App.lectura('error', 'Elija primero en la lista el activo al que le pondrá la placa.'); return; }
      var err = errorAlta(lote.validar(movAlta()));
      if (err) { msgAlta('err', [err]); App.lectura('error', '✗ ' + p + ': ' + err); q('placa').select(); pasoAlta(); return; }
      q('msgAlta').innerHTML = '';
      App.lectura('ok', 'Placa ' + p + ' para el activo ' + elegido + '. Ahora la serie, o presione ✓ Dar de alta.');
      q('serie').focus(); q('serie').select();
      pasoAlta();
    }
    function serieLeida() {
      var r = regElegido();
      if (r && r.serie && AF.util.llaveSerie(r.serie) !== AF.util.llaveSerie(val('serie'))) {
        var txt = 'La serie ' + val('serie') + ' no coincide con la del MAF (' + r.serie + ') para el activo ' + r.noActivo + '. Verifique que sea el mismo equipo; si sí, presione ✓ Dar de alta.';
        msgAlta('warn', [txt]);
        App.lectura('aviso', '⚠ ' + txt);
      } else App.lectura('ok', 'Serie ' + val('serie') + '. Revise marca y modelo y presione ✓ Dar de alta (o Enter).');
      cont.querySelector('[data-accion="alta"]').focus();
      pasoAlta();
    }

    function darAlta() {
      if (!lote) return;
      if (!crValido()) { msgAlta('err', ['Elija la tienda.']); return; }
      if (!elegido) { msgAlta('err', ['Elija en la lista el activo al que le pondrá la placa.']); return; }
      if (!AF.util.limpiaPlaca(val('placa'))) { msgAlta('err', ['Escanee o escriba la placa.']); q('placa').focus(); return; }
      var m = movAlta(), err = errorAlta(lote.validar(m));
      if (err) { msgAlta('err', [err]); App.lectura('error', '✗ ' + err); return; }
      var r = lote.agregar(m), f = r.fila;
      guardarLote();
      var avisos = r.advertencias.filter(function (a) { return !/^Asignado al único/.test(a); });
      msgAlta('ok', ['Alta: placa ' + f.placa + ' → activo ' + f.noActivo + ' (' + f.descripcion + ')']);
      if (avisos.length) q('msgAlta').innerHTML += avisos.map(function (a) { return '<div class="warn">⚠ ' + esc(a) + '</div>'; }).join('');
      App.lectura(r.serieDistinta ? 'aviso' : 'ok', (r.serieDistinta ? '⚠ Alta con serie distinta a la del MAF: ' : '✓ Alta: ') + 'placa ' + f.placa + ' → activo ' + f.noActivo + ' (' + f.descripcion + ')', function () {
        lote.eliminar(f.id); guardarLote();
        elegido = f.noActivo; editorDe = '';
        q('msgAlta').innerHTML = '';
        pintar();
        App.lectura('rebote', 'Deshecho: el activo ' + f.noActivo + ' ya no tiene la placa ' + f.placa + '.');
      });
      elegido = '';
      pintar();
      q('placa').focus();
    }

    q('placa').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); leerPlacaAlta(); } });
    ['serie', 'marca', 'modelo'].forEach(function (c) {
      q(c).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); darAlta(); } });
    });
    ['placa', 'serie', 'marca', 'modelo'].forEach(function (c) { q(c).addEventListener('input', pasoAlta); });
    q('filtroAct').addEventListener('input', function () { filtroAct = val('filtroAct'); pintarAltas(); });
    q('verAct').addEventListener('change', pintarAltas);
    q('fecha').addEventListener('change', function () { lev.fecha = val('fecha'); guardarLev(); });

    // El escáner va a la placa del alta; con la revisión abierta, a la lista de la revisión
    App.registrarEscaner(MODULO, {
      get placa() { return revisionAbierta() ? q('placaRev') : q('placa'); },
      get alLeer() { return revisionAbierta() ? leerPlacaRev : leerPlacaAlta; },
      get secundarios() { return revisionAbierta() ? [] : [{ campo: q('serie'), alLeer: serieLeida }]; }
    });

    // =====================================================================
    // Secundario: revisar todo lo de la tienda contra el MAF
    // =====================================================================
    function clasifica(placa, cr) {
      var regs = lote.buscarPlaca(placa);
      if (!regs.length) return ['aviso', '⚠ ' + placa + ': no está en el MAF (procede alta).'];
      if (regs.length > 1) return ['aviso', '⚠ ' + placa + ': duplicada en el MAF (' + regs.length + ' activos).'];
      var r = regs[0];
      if (r.cr === cr) return ['ok', '✓ ' + placa + ': ' + r.descripcion + ' — activo ' + r.noActivo];
      return ['aviso', '⚠ ' + placa + ': ' + r.descripcion + ' — en el MAF está en ' + r.cr + ' ' + r.crDesc + ' (procede transferencia).'];
    }
    function avisar(tipo, texto, deshacer) {
      q('ultimo').innerHTML = '<span class="' + (tipo === 'ok' ? 'ok' : tipo === 'error' ? 'err' : tipo === 'rebote' ? 'muted' : 'warn') + '">' + esc(texto) + '</span>';
      App.lectura(tipo, texto, deshacer);
    }
    function quitarUltimaLeida(p) {
      lev.placas = lev.placas.filter(function (x) { return AF.util.llavePlaca(x.placa) !== AF.util.llavePlaca(p); });
      guardarLev();
      q('ultimo').innerHTML = '';
      pintar();
      App.lectura('rebote', 'Deshecho: la placa ' + p + ' ya no cuenta como escaneada.');
    }
    // Las placas escaneadas son de una sola tienda; otra tienda pide "Nuevo levantamiento"
    function otraTiendaEnCurso(cr) { return lev.placas.length && lev.cr && lev.cr !== cr; }

    function agregarPlacas(lista) {
      if (!lote) { avisar('error', 'Primero cargue el MAF.'); return; }
      var cr = crValido();
      if (!cr) { avisar('error', 'Capture primero el CR o la tienda.'); return; }
      if (otraTiendaEnCurso(cr)) { avisar('error', 'Hay ' + lev.placas.length + ' placas escaneadas de la tienda ' + lev.cr + '. Para revisar esta tienda presione "Nuevo levantamiento".'); return; }
      lev.cr = cr;
      var nuevas = [], repetidas = [];
      var ya = new Set(lev.placas.map(function (x) { return AF.util.llavePlaca(x.placa); }));
      lista.forEach(function (p) {
        p = AF.util.limpiaPlaca(p);
        if (!p) return;
        var k = AF.util.llavePlaca(p);
        if (ya.has(k)) { repetidas.push(p); return; }
        ya.add(k);
        lev.placas.push({ placa: p, hora: hora() });
        nuevas.push(p);
      });
      guardarLev();
      if (lista.length === 1) {
        if (repetidas.length) avisar('rebote', repetidas[0] + ' ya estaba escaneada.');
        else { var c = clasifica(nuevas[0], cr); avisar(c[0], c[1] + ' (' + lev.placas.length + ' escaneadas)', quitarUltimaLeida.bind(null, nuevas[0])); }
      } else {
        q('ultimo').innerHTML = '<span class="ok">' + nuevas.length + ' placas agregadas.</span>' + (repetidas.length ? ' <span class="muted">' + repetidas.length + ' ya estaban.</span>' : '');
      }
      pintar();
    }
    function leerPlacaRev() {
      var p = val('placaRev');
      q('placaRev').value = '';
      if (AF.util.limpiaPlaca(p)) agregarPlacas([p]);
      q('placaRev').focus();
    }
    q('placaRev').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); leerPlacaRev(); } });
    q('detRev').addEventListener('toggle', function () { (revisionAbierta() ? q('placaRev') : q('placa')).focus({ preventScroll: true }); });

    function recordarBorrador() {
      cont.querySelectorAll('[data-alta-sel]').forEach(function (s) {
        var p = s.getAttribute('data-alta-sel');
        borrador[p] = { noActivo: s.value, serie: (cont.querySelector('[data-alta-serie="' + p + '"]') || {}).value || '' };
      });
    }

    var ultimo = null;
    var AREAS = ['otra', 'noreg', 'dup', 'faltan', 'encontrados', 'escaneadas'];
    function pintarRevision() {
      q('tituloRev').textContent = 'Revisar todo lo de la tienda contra el MAF (transferencias y bajas)' +
        (lev.placas.length ? ' — ' + App.cuenta(lev.placas.length, 'placa escaneada', 'placas escaneadas') + ' de ' + lev.cr : '');
      recordarBorrador();
      var cr = crValido();
      ultimo = null;
      if (!cr || otraTiendaEnCurso(cr)) {
        q('resumen').innerHTML = !cr ? '' : '<div class="warn">Hay ' + lev.placas.length + ' placas escaneadas de la tienda ' + esc(lev.cr) + '. Para revisar esta tienda presione "Nuevo levantamiento".</div>';
        AREAS.forEach(function (n) { q(n).innerHTML = ''; });
        return;
      }
      var c = AF.levantamiento(App.maf, cr, lev.placas.map(function (x) { return x.placa; }));
      c.faltantes = c.faltantes.filter(function (r) { return !lote.usadoEn('ALTA', r.noActivo); }); // ya casados en un alta
      ultimo = c;
      if (!lev.placas.length) {
        q('resumen').innerHTML = '<div class="muted">Aún no hay placas escaneadas.</div>';
        AREAS.forEach(function (n) { q(n).innerHTML = ''; });
        return;
      }
      var totalCr = (App.maf.idx.porCr.get(cr) || []).length;
      var faltanConPlaca = c.faltantes.filter(function (r) { return r.placa; }).length;
      q('resumen').innerHTML = '<div class="encab"><b>' + App.cuenta(lev.placas.length, 'placa escaneada', 'placas escaneadas') + '</b><span class="muted">MAF de la tienda: ' + totalCr + ' activos</span></div>' +
        App.indicadores([
          { n: c.encontrados.length, txt: 'correctas', cls: 'ok' },
          { n: c.otraTienda.length, txt: 'en otra tienda según el MAF', cls: c.otraTienda.length ? 'warn' : '' },
          { n: c.noRegistradas.length, txt: 'no están en el MAF', cls: c.noRegistradas.length ? 'warn' : '' },
          { n: faltanConPlaca, txt: 'con placa no encontrados', cls: faltanConPlaca ? 'err' : '' },
          { n: c.faltantes.length - faltanConPlaca, txt: 'sin placa / no plaqueables sin verificar' }
        ].concat(c.duplicadas.length ? [{ n: c.duplicadas.length, txt: 'duplicadas en el MAF', cls: 'err' }] : []));

      // Otra tienda -> transferencia
      var filasOtra = c.otraTienda.map(function (e) {
        var usado = lote.usadoEn('TRASPASO', e.reg.noActivo);
        return '<tr>' + td([e.placa, e.reg.noActivo, e.reg.descripcion, e.reg.marca + ' ' + e.reg.modelo, e.reg.cr + ' ' + e.reg.crDesc]) +
          '<td>' + (usado ? '<span class="ok">Transferencia en ' + esc(usado) + '</span>' : '<button class="palomita" data-tras="' + esc(e.placa) + '">✓ Transferir a esta tienda</button>') + '</td></tr>';
      });
      var pendTras = c.otraTienda.filter(function (e) { return !lote.usadoEn('TRASPASO', e.reg.noActivo); }).length;
      q('otra').innerHTML = c.otraTienda.length ? '<h3>Están aquí pero el MAF los tiene en otra tienda (' + c.otraTienda.length + ')</h3>' +
        '<div class="scroll">' + tabla(['Placa', 'No Activo', 'Descripción', 'Marca / modelo', 'En el MAF está en', ''], filasOtra) + '</div>' +
        (pendTras > 1 ? '<button data-accion="trasTodas">✓ Transferir las ' + pendTras + ' a esta tienda</button>' : '') : '';

      // No registradas -> alta
      var pend = lote.pendientes(cr);
      var otras = lote.pendientesOtrasTiendas(cr, '').slice(0, MAX_OTRAS);
      function opcion(r, otraT) {
        return '<option value="' + esc(r.noActivo) + '">' + esc(r.descripcion + ' — ' + r.noActivo + (r.marca || r.modelo ? ' — ' + (r.marca + ' ' + r.modelo).trim() : '') +
          (r.serie ? ' — S/ ' + r.serie : '') + (otraT ? ' — CR ' + r.cr + ' ' + r.crDesc : '')) + '</option>';
      }
      var opciones = '<option value="">— elija el activo —</option>' +
        '<optgroup label="Pendientes de placa en esta tienda (' + pend.length + ')">' + pend.map(function (r) { return opcion(r, false); }).join('') + '</optgroup>' +
        (otras.length ? '<optgroup label="Pendientes en otras tiendas (genera alta + transferencia)">' + otras.map(function (r) { return opcion(r, true); }).join('') + '</optgroup>' : '');
      var filasNoreg = c.noRegistradas.map(function (e) {
        var k = AF.util.llavePlaca(e.placa);
        var f = lote.filas.filter(function (x) { return x.tipo === 'ALTA' && AF.util.llavePlaca(x.placa) === k; })[0];
        var usado = f ? '' : lote.usadoEn('ALTA', '', e.placa);
        var accion = f ? '<span class="ok">Alta en captura: activo ' + esc(f.noActivo + ' (' + f.descripcion + ')') + '</span>'
          : usado ? '<span class="ok">Alta en ' + esc(usado) + '</span>'
          : '<select data-alta-sel="' + esc(e.placa) + '">' + opciones + '</select> ' +
            '<input data-alta-serie="' + esc(e.placa) + '" size="14" placeholder="Serie (opcional)"> ' +
            '<button class="palomita" data-alta="' + esc(e.placa) + '">✓ Dar de alta</button>';
        return '<tr><td>' + esc(e.placa) + '</td><td>' + accion + '</td></tr>';
      });
      q('noreg').innerHTML = c.noRegistradas.length ? '<h3>Placas que no están en el MAF (' + c.noRegistradas.length + ')</h3>' +
        '<div class="muted">Equipo plaqueado que falta casar: elija a qué activo pendiente corresponde.' + (pend.length ? '' : ' Esta tienda no tiene activos pendientes de placa.') + '</div>' +
        '<div class="scroll">' + tabla(['Placa', 'Casar con'], filasNoreg) + '</div>' : '';
      Object.keys(borrador).forEach(function (p) {
        var s = cont.querySelector('[data-alta-sel="' + p + '"]'), i = cont.querySelector('[data-alta-serie="' + p + '"]');
        if (s) s.value = borrador[p].noActivo; if (i) i.value = borrador[p].serie;
      });

      // Duplicadas
      q('dup').innerHTML = c.duplicadas.length ? '<h3>Placas duplicadas en el MAF (' + c.duplicadas.length + ')</h3><div class="muted">Resuélvalas en "Altas, bajas y transferencias".</div>' +
        tabla(['Placa', 'Activos en el MAF'], c.duplicadas.map(function (d) {
          return '<tr>' + td([d.placa, d.regs.map(function (r) { return r.noActivo + ' ' + r.descripcion + ' (CR ' + r.cr + ')'; }).join(' / ')]) + '</tr>';
        })) : '';

      pintarFaltantes();

      // Correctos y escaneadas
      q('tituloEncontrados').textContent = 'Correctos (' + c.encontrados.length + ')';
      q('encontrados').innerHTML = tabla(['Placa', 'No Activo', 'Descripción', 'Marca', 'Modelo', 'Serie'], c.encontrados.map(function (e) {
        return '<tr>' + td([e.placa, e.reg.noActivo, e.reg.descripcion, e.reg.marca, e.reg.modelo, e.reg.serie]) + '</tr>';
      }));
      q('tituloEscaneadas').textContent = 'Placas escaneadas (' + lev.placas.length + ')';
      q('escaneadas').innerHTML = tabla(['', '#', 'Placa', 'Hora'], lev.placas.map(function (x, i) {
        return '<tr><td><button data-quitar-placa="' + esc(x.placa) + '">Quitar</button></td>' + td([i + 1, x.placa, x.hora]) + '</tr>';
      }).reverse());
    }

    // No encontrados -> baja (selección manual)
    var filtroFaltan = '', motivoFaltan = 'NO LOCALIZADO (ND)';
    function faltantesFiltrados() {
      var k = AF.util.llaveTexto(filtroFaltan);
      return ultimo.faltantes.filter(function (r) { return !k || AF.util.llaveTexto(r.descripcion + ' ' + r.noActivo + ' ' + r.placa).indexOf(k) >= 0; });
    }
    function pintarFaltantes() {
      var c = ultimo;
      if (!c.faltantes.length) { q('faltan').innerHTML = '<h3>No encontrados</h3><div class="ok">Todo lo del MAF de esta tienda se encontró.</div>'; return; }
      var lista = faltantesFiltrados();
      var filas = lista.map(function (r) {
        var usado = lote.usadoEn('BAJA', r.noActivo);
        return '<tr><td>' + (usado ? '' : '<input type="checkbox" data-marca="' + esc(r.noActivo) + '"' + (marcados.has(r.noActivo) ? ' checked' : '') + '>') + '</td>' +
          td([r.noActivo, r.placa, r.descripcion, r.marca, r.modelo, r.serie, AF.estadoActivo(r), r.mesAdq + '/' + r.anioAdq, r.valorNeto]) +
          '<td>' + (usado ? '<span class="ok">Baja en ' + esc(usado) + '</span>' : '') + '</td></tr>';
      });
      var n = Array.from(marcados).filter(function (a) { return !lote.usadoEn('BAJA', a); }).length;
      q('faltan').innerHTML = '<h3>En el MAF pero no se escanearon (' + c.faltantes.length + ')</h3>' +
        '<div class="muted">Antes de dar de baja, verifique: puede estar en bodega, sin placa o la placa ilegible. Los "pendientes de placa" pueden ser equipo nuevo aún sin plaquear.</div>' +
        '<label>Filtrar <input data-c="filtroFaltan" size="20" value="' + esc(filtroFaltan) + '"></label> ' +
        '<button data-accion="marcarConPlaca">Marcar los que tienen placa</button> <button data-accion="marcarTodos">Marcar todos (filtrados)</button> <button data-accion="desmarcar">Desmarcar</button><br>' +
        '<label>Tipo de baja <select data-c="motivoFaltan">' + AF.MOTIVOS_BAJA.map(function (m) { return '<option' + (m === motivoFaltan ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select></label> ' +
        '<button class="palomita" data-accion="bajas">✓ Agregar ' + n + ' baja(s) seleccionada(s)</button>' +
        '<div class="scroll">' + tabla(['', 'No Activo', 'Placa', 'Descripción', 'Marca', 'Modelo', 'Serie', 'Estado', 'Adq.', 'Valor neto', ''], filas) + '</div>';
      var inp = q('filtroFaltan');
      inp.addEventListener('input', function () {
        filtroFaltan = inp.value;
        var pos = inp.selectionStart;
        pintarFaltantes();
        var nuevo = q('filtroFaltan'); nuevo.focus(); nuevo.setSelectionRange(pos, pos);
      });
      q('motivoFaltan').addEventListener('change', function () { motivoFaltan = val('motivoFaltan'); });
    }

    // =====================================================================
    // Pintar todo y acciones
    // =====================================================================
    function pintar() {
      if (!lote) return;
      pintarAltas();
      pintarRevision();
      pintarLote();
      App.pintarContexto();
    }

    function mostrar(resultados) {
      var ok = resultados.filter(function (r) { return r.estado === 'OK'; }).length;
      var html = ok ? '<div class="ok">✓ ' + ok + ' movimiento(s) agregado(s).</div>' : '';
      resultados.forEach(function (r) {
        if (r.estado === 'OK') r.advertencias.forEach(function (m) { html += '<div class="warn">⚠ ' + esc(m) + '</div>'; });
        else r.errores.concat(r.estado === 'ELEGIR' ? r.advertencias : []).forEach(function (m) { html += '<div class="err">✗ ' + esc(m) + '</div>'; });
      });
      q('msg').innerHTML = html;
      guardarLote();
      pintar();
    }
    function transferir(placa) {
      var e = ultimo.otraTienda.filter(function (x) { return x.placa === placa; })[0];
      if (!e) return null;
      return lote.agregar({ tipo: 'TRASPASO', placa: e.placa, noActivo: e.reg.noActivo, crDestino: ultimo.cr, fecha: fecha() });
    }
    function saltar() {
      var pend = activosTienda(crValido()).filter(function (x) { return x.e.k === 'pendiente'; });
      if (!pend.length) return;
      var i = pend.map(function (x) { return x.r.noActivo; }).indexOf(elegido);
      elegido = pend[(i + 1) % pend.length].r.noActivo;
      q('msgAlta').innerHTML = '';
      pintar();
      q('placa').focus();
    }

    cont.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t.getAttribute || !lote) return;
      var accion = t.getAttribute('data-accion');
      if (accion === 'alta') darAlta();
      else if (accion === 'saltar') saltar();
      else if (t.getAttribute('data-elegir')) {
        elegido = t.getAttribute('data-elegir');
        q('msgAlta').innerHTML = '';
        pintar();
        q('placa').focus();
      } else if (accion === 'nuevo') {
        var n = lev.placas.length;
        var empezar = function () {
          lev = { cr: '', fecha: val('fecha'), placas: [] };
          marcados.clear(); borrador = {}; filtroFaltan = '';
          guardarLev();
          q('ultimo').innerHTML = ''; q('msg').innerHTML = '';
          pintar();
          q('placaRev').focus();
        };
        if (!n) empezar();
        else App.confirmar({ titulo: '¿Empezar un levantamiento nuevo?', texto: 'Se borran las ' + n + ' placas escaneadas. Los movimientos ya generados se quedan.', aceptar: 'Empezar de nuevo', peligro: true })
          .then(function (ok) { if (ok) empezar(); });
      } else if (accion === 'agregarLista') {
        var placas = AF.parsearLista(App.maf, val('lista')).map(function (e) { return e.placa || e.noActivo; });
        if (!placas.length) { q('ultimo').innerHTML = '<span class="err">No se encontraron placas en el texto.</span>'; return; }
        agregarPlacas(placas);
        q('lista').value = '';
      } else if (accion === 'trasTodas') {
        mostrar(ultimo.otraTienda.filter(function (e) { return !lote.usadoEn('TRASPASO', e.reg.noActivo); }).map(function (e) { return transferir(e.placa); }));
      } else if (accion === 'marcarConPlaca') {
        ultimo.faltantes.forEach(function (r) { if (r.placa) marcados.add(r.noActivo); }); pintarFaltantes();
      } else if (accion === 'marcarTodos') {
        faltantesFiltrados().forEach(function (r) { marcados.add(r.noActivo); }); pintarFaltantes();
      } else if (accion === 'desmarcar') {
        marcados.clear(); pintarFaltantes();
      } else if (accion === 'bajas') {
        var lista = Array.from(marcados).filter(function (a) { return !lote.usadoEn('BAJA', a); });
        if (!lista.length) { q('msg').innerHTML = '<div class="err">Marque los activos a dar de baja.</div>'; return; }
        App.confirmar({ titulo: '¿Agregar ' + App.cuenta(lista.length, 'baja', 'bajas') + '?', texto: 'Tipo de baja: ' + motivoFaltan + '.', aceptar: 'Agregar bajas' })
          .then(function (ok) {
            if (!ok) return;
            var res = lista.map(function (a) { return lote.agregar({ tipo: 'BAJA', noActivo: a, cr: ultimo.cr, motivo: motivoFaltan, fecha: fecha() }); });
            marcados.clear();
            mostrar(res);
          });
      } else if (accion === 'exportar') {
        exportar();
      } else if (t.getAttribute('data-tras')) {
        mostrar([transferir(t.getAttribute('data-tras'))].filter(Boolean));
      } else if (t.getAttribute('data-alta')) {
        var placa = t.getAttribute('data-alta');
        var sel = cont.querySelector('[data-alta-sel="' + placa + '"]').value;
        if (!sel) { q('msg').innerHTML = '<div class="err">Elija el activo con el que se casa la placa ' + esc(placa) + '.</div>'; return; }
        var serie = cont.querySelector('[data-alta-serie="' + placa + '"]').value;
        delete borrador[placa];
        mostrar([lote.agregar({ tipo: 'ALTA', cr: ultimo.cr, placa: placa, noActivo: sel, serie: serie, fecha: fecha() })]);
      } else if (t.getAttribute('data-quitar-placa')) {
        var qp = t.getAttribute('data-quitar-placa');
        lev.placas = lev.placas.filter(function (x) { return x.placa !== qp; });
        guardarLev(); pintar();
      } else if (t.getAttribute('data-quitar')) {
        lote.eliminar(Number(t.getAttribute('data-quitar'))); guardarLote(); pintar();
      }
    });
    cont.addEventListener('change', function (ev) {
      var a = ev.target.getAttribute && ev.target.getAttribute('data-marca');
      if (!a) return;
      if (ev.target.checked) marcados.add(a); else marcados.delete(a);
      var b = cont.querySelector('[data-accion="bajas"]');
      if (b) b.textContent = '✓ Agregar ' + Array.from(marcados).filter(function (x) { return !lote.usadoEn('BAJA', x); }).length + ' baja(s) seleccionada(s)';
    });

    // ---------- Formato (columna derecha) ----------
    var NOMBRE_TIPO = { ALTA: 'Alta', BAJA: 'Baja', TRASPASO: 'Transferencia' };
    function pintarLote() {
      var filas = lote ? lote.filas : [];
      q('nLote').textContent = filas.length;
      q('tablaLote').innerHTML = '<tr><th></th><th>#</th><th>Tipo</th><th>Placa</th><th>No Activo</th><th>Descripción</th><th>Serie</th><th>Marca</th><th>Modelo</th><th>CR</th><th>Tienda</th><th>Tipo de baja</th><th>CR destino</th></tr>' +
        filas.slice().reverse().map(function (f) {
          return '<tr><td><button data-quitar="' + f.id + '">Quitar</button></td>' + td([f.id, NOMBRE_TIPO[f.tipo] + (f.ligadaA ? ' (ligado a #' + f.ligadaA + ')' : ''), f.placa, f.noActivo, f.descripcion,
            f.serie, f.marca, f.modelo, f.cr, f.tienda, f.motivo, f.crDestino]) + '</tr>';
        }).join('');
      App.resumenLote(MODULO);
    }

    function exportar() {
      if (!ultimo || !lev.placas.length) { q('msg').innerHTML = '<div class="err">Primero escanee las placas de la tienda.</div>'; return; }
      var t = AF.tiendaDeCr(App.maf, ultimo.cr) || {};
      function fila(placa, r, resultado) {
        return { Resultado: resultado, Placa: placa || (r && r.placa) || '', 'No Activo': r ? r.noActivo : '', 'Descripción': r ? r.descripcion : '', Marca: r ? r.marca : '', Modelo: r ? r.modelo : '',
          Serie: r ? r.serie : '', 'CR en MAF': r ? r.cr : '', 'Tienda en MAF': r ? r.crDesc : '', 'Valor neto': r ? r.valorNeto : '' };
      }
      var detalle = [].concat(
        ultimo.encontrados.map(function (e) { return fila(e.placa, e.reg, 'Correcto'); }),
        ultimo.otraTienda.map(function (e) { return fila(e.placa, e.reg, 'En otra tienda según el MAF'); }),
        ultimo.noRegistradas.map(function (e) { return fila(e.placa, null, 'No está en el MAF'); }),
        ultimo.duplicadas.map(function (d) { return fila(d.placa, d.regs[0], 'Duplicada en el MAF'); }),
        ultimo.faltantes.map(function (r) { return fila('', r, 'No encontrado (' + AF.estadoActivo(r) + ')'); })
      );
      var resumen = [
        { Dato: 'CR', Valor: ultimo.cr }, { Dato: 'Tienda', Valor: t.tienda || '' }, { Dato: 'Fecha', Valor: fecha() },
        { Dato: 'MAF (corte)', Valor: App.maf.fecha || '' }, { Dato: 'Placas escaneadas', Valor: lev.placas.length },
        { Dato: 'Correctas', Valor: ultimo.encontrados.length }, { Dato: 'En otra tienda según el MAF', Valor: ultimo.otraTienda.length },
        { Dato: 'No están en el MAF', Valor: ultimo.noRegistradas.length }, { Dato: 'Duplicadas en el MAF', Valor: ultimo.duplicadas.length },
        { Dato: 'Del MAF no encontrados', Valor: ultimo.faltantes.length }
      ];
      App.exportarExcel('Levantamiento ' + ultimo.cr + ' ' + (t.tienda || '') + ' ' + val('fecha') + '.xlsx', {
        Resumen: resumen, Detalle: detalle,
        Escaneadas: lev.placas.map(function (x, i) { return { '#': i + 1, Placa: x.placa, Hora: x.hora }; })
      });
    }

    App.botonesFormato({
      cont: q('pie'),
      modulo: MODULO,
      formato: 'V2',
      nombre: function () {
        var t = App.maf && AF.tiendaDeCr(App.maf, val('cr'));
        return 'Formato de Movimientos AF V.2 ' + (t ? t.cr + ' ' + t.tienda + ' ' : '') + val('fecha') + '.xlsx';
      },
      filas: function () { return lote ? lote.filas : []; },
      alVaciar: function () {
        if (!lote) return;
        lote = new AF.Lote(App.maf, App.historialPara(MODULO));
        guardarLote();
        q('msg').innerHTML = ''; q('msgAlta').innerHTML = '';
        elegido = ''; editorDe = '';
        pintar();
      }
    });

    App.alMaf(function () { crearLote(); desdeCr(); pintar(); });
    App.alCambioExterno(MODULO, function () {
      if (!lote) return;
      lote.historial = App.historialPara(MODULO);
      lev = App.leerLS(LS_LEV, lev);
      pintar();
    });
  };
})();
