/*
 * Plaqueo por factura: el equipo de renovación ya viene cargado en el MAF (sin placa).
 * Se captura la factura (y opcionalmente la tienda), aparecen sus equipos, y cada placa
 * escaneada se casa con el siguiente equipo pendiente (tienda + No. Activo).
 * Genera la pestaña "Alta de código" del Formato de Movimientos AF V.2.
 */
(function () {
  'use strict';
  var App = window.AFApp, esc = App.esc;
  var MODULO = 'plaqueo';

  window.AFPlaqueo = function () {
    var cont = document.getElementById('mod-' + MODULO);
    var lote = null;
    var elegido = null; // No. Activo elegido a mano como siguiente

    cont.classList.add('dos-col');
    cont.innerHTML =
      '<div class="col-izq"><fieldset><legend>1. Factura</legend>' +
      '<label>Factura <input data-c="factura" size="14" list="facturas-plaqueo"></label>' +
      '<datalist id="facturas-plaqueo"></datalist> ' +
      '<label>CR <input data-c="cr" size="8" list="listaCr"></label> ' +
      '<label>Tienda <input data-c="tienda" size="28" list="listaTiendas"></label> ' +
      '<span data-c="plaza" class="muted"></span> ' +
      '<label>Fecha de alta <input data-c="fecha" type="date"></label>' +
      '<div class="muted">La tienda es opcional: sin tienda se muestran todos los equipos de la factura (por ejemplo, para plaquear en almacén).</div>' +
      '<div data-c="resumen"></div></fieldset>' +

      '<fieldset><legend>2. Escanear placas</legend>' +
      '<div data-c="siguiente" class="siguiente"></div>' +
      '<label>Serie <input data-c="serie" size="18"></label> ' +
      '<label>Marca <input data-c="marca" size="12"></label> ' +
      '<label>Modelo <input data-c="modelo" size="14"></label> ' +
      '<label>Placa <input data-c="placa" size="14"></label> ' +
      '<label><input type="checkbox" data-c="pedirSerie"> Leer la serie antes de cada placa</label> ' +
      '<div class="muted">Serie, marca y modelo son opcionales: si se dejan vacíos se usa lo del MAF. Marca y modelo se conservan mientras el siguiente equipo sea del mismo tipo. Después de casar se pueden corregir en la tabla, en el renglón de cada activo.</div>' +
      '<div data-c="resultado"></div>' +
      '<div class="scroll"><table data-c="equipos"></table></div></fieldset>' +

      '</div><fieldset data-c="pie" class="col-der"><legend>3. Placas casadas (<span data-c="nLote">0</span>)</legend>' +
      '<div class="scroll"><table data-c="tablaLote"></table></div></fieldset>';

    var q = function (n) { return cont.querySelector('[data-c="' + n + '"]'); };
    var val = function (n) { return q(n).value; };
    q('fecha').value = App.hoyLocal();

    App.enlazarTienda(q('cr'), q('tienda'), q('plaza'), function () { elegido = null; pintar(); });

    function crearLote() {
      lote = new AF.Lote(App.maf, App.historialPara(MODULO));
      var guardado = App.leerLote(MODULO);
      lote.filas = guardado;
      lote._sec = guardado.reduce(function (a, f) { return Math.max(a, f.id); }, 0);
    }
    function guardar() { App.guardarLote(MODULO, lote.filas); }

    // Facturas con equipos pendientes de placa (para sugerir al escribir)
    function llenarFacturas() {
      var cuenta = {};
      App.maf.registros.forEach(function (r) {
        if (r.factura && r.plaqueable === 'S' && !r.placa) cuenta[r.factura] = (cuenta[r.factura] || 0) + 1;
      });
      var dl = document.getElementById('facturas-plaqueo'); dl.innerHTML = '';
      Object.keys(cuenta).sort().forEach(function (f) {
        var o = document.createElement('option'); o.value = f; o.label = cuenta[f] + ' pendientes'; dl.appendChild(o);
      });
    }

    function equipos() { return lote && val('factura') ? lote.porFactura(val('factura'), val('cr')) : []; }

    function siguiente(lista) {
      if (elegido) {
        var e = lista.filter(function (x) { return x.reg.noActivo === elegido && x.estado === 'pendiente'; })[0];
        if (e) return e;
        elegido = null;
      }
      return lista.filter(function (x) { return x.estado === 'pendiente'; })[0] || null;
    }

    var ESTADO = { pendiente: 'Pendiente de placa', conPlaca: 'Ya tiene placa en el MAF', noPlaqueable: 'No plaqueable' };

    App.registrarContexto(MODULO, function () {
      var cr = AF.util.texto(val('cr')).toUpperCase();
      return ['Plaqueo', val('factura') ? 'Factura ' + val('factura') : 'sin factura', cr ? cr + ' ' + val('tienda') : 'todas las tiendas', App.cuenta(lote ? lote.filas.length : 0, 'casada', 'casadas')].join(' · ');
    });

    function pintar() {
      if (!lote) return;
      App.pintarContexto();
      var lista = equipos();
      var sig = siguiente(lista);
      var casadosAqui = {};
      lote.filas.forEach(function (f) { casadosAqui[f.noActivo] = f; });

      if (!val('factura')) {
        q('resumen').innerHTML = '<span class="muted">Capture el número de factura.</span>';
      } else if (!lista.length) {
        q('resumen').innerHTML = '<span class="err">No hay equipos con la factura ' + esc(val('factura')) + (val('cr') ? ' en el CR ' + esc(val('cr')) : '') + ' en el MAF.</span>';
      } else {
        var n = { pendiente: 0, conPlaca: 0, casado: 0, noPlaqueable: 0 }, crs = {};
        lista.forEach(function (x) { n[x.estado]++; crs[x.reg.cr] = 1; });
        q('resumen').innerHTML = '<div class="encab"><b>Factura ' + esc(val('factura')) + '</b><span class="muted">' + lista.length + ' equipos en ' + App.cuenta(Object.keys(crs).length, 'tienda', 'tiendas') + '</span></div>' +
          App.indicadores([
            { n: n.pendiente, txt: 'pendientes de placa', cls: 'warn' },
            { n: n.casado, txt: 'casados en esta captura', cls: 'ok' },
            { n: n.conPlaca, txt: 'ya con placa' }
          ].concat(n.noPlaqueable ? [{ n: n.noPlaqueable, txt: 'no plaqueables' }] : []));
      }

      q('siguiente').innerHTML = sig
        ? '<b>Siguiente equipo:</b> ' + esc(sig.reg.descripcion) + ' — Activo <b>' + esc(sig.reg.noActivo) + '</b> — CR ' + esc(sig.reg.cr + ' ' + sig.reg.crDesc) +
          (sig.reg.marca || sig.reg.modelo ? ' — ' + esc([sig.reg.marca, sig.reg.modelo].join(' ').trim()) : '') + (sig.reg.serie ? ' — Serie MAF ' + esc(sig.reg.serie) : '')
        : (lista.length ? '<span class="ok">Todos los equipos de la factura ya tienen placa. Descargue el Excel abajo.</span>' : '<b>Ahora:</b> capture el número de factura.');
      if (sig) q('siguiente').innerHTML = '<b>Ahora:</b> escanee la placa de este equipo.<br>' + q('siguiente').innerHTML;
      // Lo del MAF del siguiente equipo se muestra de guía en los campos vacíos
      [['serie', 'serie'], ['marca', 'marca'], ['modelo', 'modelo']].forEach(function (c) {
        q(c[0]).placeholder = sig && sig.reg[c[1]] ? 'MAF: ' + sig.reg[c[1]] : '';
      });

      // En los casados de esta captura, serie, marca y modelo se corrigen en el mismo renglón
      function editable(f, campo, valor, ancho) {
        return f ? '<input data-ed="' + campo + '" data-id="' + f.id + '" size="' + ancho + '" value="' + esc(f[campo] || '') + '">' : esc(valor);
      }
      var t = '<tr><th></th><th>CR</th><th>Tienda</th><th>No Activo</th><th>Descripción</th><th>Serie</th><th>Marca</th><th>Modelo</th><th>Estado</th><th>Placa</th><th></th></tr>';
      lista.forEach(function (x) {
        var f = casadosAqui[x.reg.noActivo];
        var esSig = sig && sig.reg.noActivo === x.reg.noActivo;
        var estado = f ? 'Casado (esta captura)' : x.estado === 'casado' ? 'Casado en ' + x.casadoEn : ESTADO[x.estado];
        t += '<tr' + (esSig ? ' class="actual"' : '') + '><td>' + (esSig ? '➜' : '') + '</td><td>' +
          [x.reg.cr, x.reg.crDesc, x.reg.noActivo, x.reg.descripcion].map(esc).join('</td><td>') + '</td>' +
          '<td>' + editable(f, 'serie', x.reg.serie, 16) + '</td><td>' + editable(f, 'marca', x.reg.marca, 10) + '</td><td>' + editable(f, 'modelo', x.reg.modelo, 12) + '</td>' +
          '<td>' + esc(estado) + '</td>' +
          '<td>' + esc(f ? f.placa : x.reg.placa) + '</td>' +
          '<td>' + (f ? '<button data-quitar="' + f.id + '">Quitar</button>' : x.estado === 'pendiente' && !esSig ? '<button data-elegir="' + esc(x.reg.noActivo) + '">Siguiente</button>' : '') + '</td></tr>';
      });
      q('equipos').innerHTML = lista.length ? t : '';
      pintarLote();
    }

    function casar() {
      var placa = AF.util.limpiaPlaca(val('placa'));
      if (!placa) return;
      if (!lote) { App.lectura('error', 'Primero cargue el MAF.'); return; }
      var sig = siguiente(equipos());
      if (!sig) {
        q('resultado').innerHTML = '<div class="err">✗ No hay equipo pendiente al cual asignar la placa ' + esc(placa) + '.</div>';
        App.lectura('error', '✗ ' + placa + ': no hay equipo pendiente' + (val('factura') ? ' en esta factura.' : ' (capture la factura).'));
        return;
      }
      var r = lote.agregar({
        tipo: 'ALTA', cr: sig.reg.cr, placa: placa, noActivo: sig.reg.noActivo,
        serie: val('serie'), marca: val('marca').trim().toUpperCase(), modelo: val('modelo').trim().toUpperCase(),
        fecha: App.fechaTexto(val('fecha'))
      });
      if (r.estado !== 'OK') {
        q('resultado').innerHTML = r.errores.map(function (m) { return '<div class="err">✗ ' + esc(m) + '</div>'; }).join('');
        App.lectura('error', '✗ ' + placa + ': ' + r.errores[0]);
        q('placa').select();
        return;
      }
      r.fila.factura = sig.reg.factura;
      guardar();
      var texto = 'Placa ' + placa + ' → activo ' + r.fila.noActivo + ' (' + r.fila.descripcion + ', CR ' + r.fila.cr + ' ' + r.fila.tienda + ')';
      q('resultado').innerHTML = '<div class="ok">✓ ' + esc(texto) + '</div>';
      var id = r.fila.id;
      if (r.serieDistinta) q('resultado').innerHTML += '<div class="warn">⚠ ' + esc(r.advertencias.filter(function (a) { return /no coincide con la del MAF/.test(a); })[0]) + '</div>';
      App.lectura(r.serieDistinta ? 'aviso' : 'ok', (r.serieDistinta ? '⚠ Serie distinta a la del MAF — ' : '✓ ') + texto, function () {
        lote.eliminar(id); guardar();
        q('resultado').innerHTML = ''; elegido = null;
        pintar();
        App.lectura('rebote', 'Deshecho: la placa ' + placa + ' ya no está casada.');
      });
      q('placa').value = ''; q('serie').value = '';
      elegido = null;
      pintar();
      // Marca y modelo se conservan si el siguiente equipo es del mismo tipo (lotes de equipos iguales)
      var sig2 = siguiente(equipos());
      if (!sig2 || sig2.reg.descripcion !== r.fila.descripcion) { q('marca').value = ''; q('modelo').value = ''; }
      (q('pedirSerie').checked ? q('serie') : q('placa')).focus();
    }

    // Aquí el escáner SÍ casa al leer (Enter): es el propósito del módulo. Se deshace con "Quitar".
    q('placa').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); casar(); } });
    function serieLeida() {
      var sig = lote ? siguiente(equipos()) : null;
      if (sig && sig.reg.serie && AF.util.llaveSerie(sig.reg.serie) !== AF.util.llaveSerie(val('serie'))) {
        App.lectura('aviso', '⚠ La serie ' + val('serie') + ' no coincide con la del MAF (' + sig.reg.serie + ') para el activo ' + sig.reg.noActivo + '. Verifique el equipo; si es correcto, escanee la placa.');
      } else App.lectura('ok', 'Serie ' + val('serie') + ' — ahora escanee la placa.');
      q('placa').focus();
    }
    q('serie').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); serieLeida(); } });
    ['marca', 'modelo'].forEach(function (c) {
      q(c).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); q('placa').focus(); } });
    });
    App.registrarEscaner(MODULO, { placa: q('placa'), alLeer: casar, secundarios: [{ campo: q('serie'), alLeer: serieLeida }] });
    q('pedirSerie').checked = App.pref('serie_plaqueo', false);
    q('pedirSerie').addEventListener('change', function () { App.guardarPref('serie_plaqueo', q('pedirSerie').checked); (q('pedirSerie').checked ? q('serie') : q('placa')).focus(); });
    var tFactura = null;
    q('factura').addEventListener('input', function () { clearTimeout(tFactura); tFactura = setTimeout(function () { elegido = null; pintar(); }, 250); });

    cont.addEventListener('click', function (e) {
      var t = e.target; if (!t.getAttribute) return;
      if (t.getAttribute('data-elegir')) { elegido = t.getAttribute('data-elegir'); pintar(); q('placa').focus(); }
      else if (t.getAttribute('data-quitar')) { lote.eliminar(Number(t.getAttribute('data-quitar'))); guardar(); pintar(); }
    });
    // Corrección de serie / marca / modelo de un activo ya casado; vacío = lo del MAF
    cont.addEventListener('change', function (e) {
      var campo = e.target.getAttribute && e.target.getAttribute('data-ed');
      if (!campo) return;
      var f = lote.filas.filter(function (x) { return x.id === Number(e.target.getAttribute('data-id')); })[0];
      if (!f) return;
      var reg = App.maf.idx.porActivo.get(f.noActivo) || {};
      f[campo] = e.target.value.trim().toUpperCase() || reg[campo] || '';
      e.target.value = f[campo];
      guardar(); pintarLote();
    });

    function pintarLote() {
      var filas = lote ? lote.filas : [];
      q('nLote').textContent = filas.length;
      var t = '<tr><th></th><th>#</th><th>Placa</th><th>No Activo</th><th>Descripción</th><th>Serie</th><th>Factura</th><th>CR</th><th>Tienda</th><th>Marca</th><th>Modelo</th><th>Fecha</th></tr>';
      filas.slice().reverse().forEach(function (f) {
        t += '<tr><td><button data-quitar="' + f.id + '">Quitar</button></td><td>' + [f.id, f.placa, f.noActivo, f.descripcion, f.serie, f.factura, f.cr, f.tienda, f.marca, f.modelo, f.fecha].map(esc).join('</td><td>') +
          '</td></tr>';
      });
      q('tablaLote').innerHTML = t;
      App.resumenLote(MODULO);
    }

    App.botonesFormato({
      cont: q('pie'),
      modulo: MODULO,
      formato: 'V2',
      nombre: function () { return 'Plaqueo ' + (val('factura') ? 'factura ' + val('factura') + ' ' : '') + val('fecha') + '.xlsx'; },
      filas: function () { return lote ? lote.filas : []; },
      alVaciar: function () {
        if (!lote) return;
        lote = new AF.Lote(App.maf, App.historialPara(MODULO));
        guardar();
        q('resultado').innerHTML = '';
        pintar();
      }
    });

    App.alMaf(function () { crearLote(); llenarFacturas(); pintar(); });
    App.alCambioExterno(MODULO, function () { if (lote) { lote.historial = App.historialPara(MODULO); pintar(); } });
  };
})();
