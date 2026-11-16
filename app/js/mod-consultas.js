/*
 * Consultas (solo lectura del MAF y de lo enviado):
 *  - Tienda: todos los activos de un CR, exportable a Excel / imprimible.
 *  - Pendientes de plaqueo: activos plaqueables sin placa, por tienda o por factura.
 *  - Seguimiento: revisa en el MAF actual si los Excel enviados ya se aplicaron.
 */
(function () {
  'use strict';
  var App = window.AFApp, esc = App.esc;
  var MODULO = 'consultas';
  var MAX_FILAS = 2000;

  function td(vals) { return vals.map(function (v) { return '<td>' + esc(v === undefined || v === null ? '' : v) + '</td>'; }).join(''); }
  function th(vals) { return '<tr>' + vals.map(function (v) { return '<th>' + esc(v) + '</th>'; }).join('') + '</tr>'; }
  function numero(v) { var n = Number(String(v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
  function dinero(n) { return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function filaActivo(r) {
    return { CR: r.cr, Tienda: r.crDesc, 'No Activo': r.noActivo, Placa: r.placa, 'Descripción': r.descripcion, 'Desc. adicional': r.descAdic, Marca: r.marca, Modelo: r.modelo,
      Serie: r.serie, Plaqueable: r.plaqueable, Estado: AF.estadoActivo(r), Factura: r.factura, 'Mes adq.': r.mesAdq, 'Año adq.': r.anioAdq, Origen: r.origen, 'Valor neto': numero(r.valorNeto) };
  }

  window.AFConsultas = function () {
    var cont = document.getElementById('mod-' + MODULO);
    var vista = 'tienda';

    cont.innerHTML =
      '<div class="botones" data-c="vistas">' +
      '<button data-vista="tienda">Consulta de tienda</button> <button data-vista="pendientes">Pendientes de plaqueo</button> <button data-vista="seguimiento">Seguimiento de lo enviado</button></div>' +

      '<fieldset data-v="tienda"><legend>Consulta de tienda</legend>' +
      '<label>CR <input data-c="cr" size="8" list="listaCr"></label> ' +
      '<label>Tienda <input data-c="tienda" size="30" list="listaTiendas"></label> ' +
      '<span data-c="plaza" class="muted"></span> ' +
      '<label>Filtrar <input data-c="filtroT" size="20"></label> ' +
      '<label>Estado <select data-c="estadoT"><option value="">Todos</option><option>Con placa</option><option>Pendiente de placa</option><option>No plaqueable</option></select></label> ' +
      '<button data-accion="exportarT">Exportar a Excel</button> <button data-accion="imprimir">Imprimir</button>' +
      '<div data-c="resT"></div></fieldset>' +

      '<fieldset data-v="pendientes"><legend>Pendientes de plaqueo</legend>' +
      '<label>Agrupar <select data-c="grupoP"><option value="tienda">Por tienda</option><option value="factura">Por factura</option></select></label> ' +
      '<label>Filtrar <input data-c="filtroP" size="24" placeholder="CR, tienda, factura, distrito o equipo"></label> ' +
      '<button data-accion="exportarP">Exportar a Excel (resumen y detalle)</button>' +
      '<div class="muted">No incluye lo que ya se casó en una captura o en un Excel generado.</div>' +
      '<div data-c="resP"></div><div data-c="detP"></div></fieldset>' +

      '<fieldset data-v="seguimiento"><legend>Seguimiento de lo enviado</legend>' +
      '<div class="muted">Cada Excel generado queda registrado aquí. Al cargar un MAF más reciente se revisa si AF ya aplicó cada movimiento.</div>' +
      '<label>Estado <select data-c="estadoS"><option value="">Todos</option><option value="pendiente">Pendientes</option><option value="distinto">Aplicados distinto</option><option value="aplicado">Aplicados</option></select></label> ' +
      '<label>Filtrar <input data-c="filtroS" size="20"></label> ' +
      '<button data-accion="exportarS">Exportar a Excel</button> <button data-accion="quitarAplicados">Quitar los aplicados</button>' +
      '<div data-c="resS"></div></fieldset>';

    var q = function (n) { return cont.querySelector('[data-c="' + n + '"]'); };
    var val = function (n) { var e = q(n); return e ? e.value : ''; };

    function mostrarVista(v) {
      vista = v;
      cont.querySelectorAll('[data-v]').forEach(function (el) { el.classList.toggle('oculto', el.getAttribute('data-v') !== v); });
      cont.querySelectorAll('[data-vista]').forEach(function (b) { b.style.fontWeight = b.getAttribute('data-vista') === v ? 'bold' : ''; });
      pintar();
    }
    function pintar() {
      if (!App.maf) return;
      if (vista === 'tienda') pintarTienda();
      else if (vista === 'pendientes') pintarPendientes();
      else pintarSeguimiento();
    }

    // ---------- Tienda ----------
    App.enlazarTienda(q('cr'), q('tienda'), q('plaza'), function () { if (vista === 'tienda') pintarTienda(); });
    function activosTienda() {
      var t = AF.tiendaDeCr(App.maf, val('cr'));
      if (!t) return null;
      var k = AF.util.llaveTexto(val('filtroT')), est = val('estadoT');
      var lista = (App.maf.idx.porCr.get(t.cr) || []).filter(function (r) {
        return (!est || AF.estadoActivo(r) === est) &&
          (!k || AF.util.llaveTexto([r.noActivo, r.placa, r.descripcion, r.descAdic, r.marca, r.modelo, r.serie, r.factura].join(' ')).indexOf(k) >= 0);
      }).slice().sort(function (a, b) { return a.descripcion.localeCompare(b.descripcion) || a.noActivo.localeCompare(b.noActivo); });
      return { t: t, todos: App.maf.idx.porCr.get(t.cr) || [], lista: lista };
    }
    function pintarTienda() {
      var d = activosTienda();
      if (!d) { q('resT').innerHTML = '<div class="muted">Capture el CR o la tienda.</div>'; return; }
      var n = { 'Con placa': 0, 'Pendiente de placa': 0, 'No plaqueable': 0 }, valor = 0;
      d.todos.forEach(function (r) { n[AF.estadoActivo(r)]++; valor += numero(r.valorNeto); });
      var porDesc = {};
      d.lista.forEach(function (r) { porDesc[r.descripcion] = (porDesc[r.descripcion] || 0) + 1; });
      var est = val('estadoT');
      q('resT').innerHTML = '<div class="encab"><b>' + esc(d.t.cr + ' ' + d.t.tienda) + '</b><span class="muted">' + esc(d.t.plaza) + ' · MAF corte ' + esc(App.maf.fecha || 's/f') + '</span></div>' +
        App.indicadores([
          { n: d.todos.length, txt: 'activos', filtro: '' },
          { n: n['Con placa'], txt: 'con placa', cls: 'ok', filtro: 'Con placa' },
          { n: n['Pendiente de placa'], txt: 'pendientes de placa', cls: 'warn', filtro: 'Pendiente de placa' },
          { n: n['No plaqueable'], txt: 'no plaqueables', filtro: 'No plaqueable' },
          { n: '$' + dinero(valor), txt: 'valor neto' }
        ], est) +
        (d.lista.length !== d.todos.length ? '<div class="muted">Mostrando ' + d.lista.length + ' de ' + d.todos.length + ' (toque un indicador para filtrar por estado).</div>' : '<div class="muted">Toque un indicador para filtrar por estado.</div>') +
        '<details><summary>Por tipo de equipo (' + Object.keys(porDesc).length + ')</summary>' +
        App.barras(Object.keys(porDesc).map(function (k) { return { nombre: k, n: porDesc[k] }; }).sort(function (a, b) { return b.n - a.n || a.nombre.localeCompare(b.nombre); })) + '</details>' +
        '<div class="scroll"><table>' + th(['No Activo', 'Placa', 'Descripción', 'Desc. adicional', 'Marca', 'Modelo', 'Serie', 'Estado', 'Factura', 'Adq.', 'Valor neto']) +
        d.lista.map(function (r) {
          return '<tr>' + td([r.noActivo, r.placa, r.descripcion, r.descAdic, r.marca, r.modelo, r.serie, AF.estadoActivo(r), r.factura, r.mesAdq + '/' + r.anioAdq, r.valorNeto]) + '</tr>';
        }).join('') + '</table></div>';
    }
    q('filtroT').addEventListener('input', pintarTienda);
    q('estadoT').addEventListener('change', pintarTienda);

    // ---------- Pendientes de plaqueo ----------
    var pendCache = null;
    function pendientes() {
      if (!pendCache) pendCache = new AF.Lote(App.maf, App.historialPara(MODULO)).todosPendientes();
      return pendCache;
    }
    function pendFiltrados() {
      var k = AF.util.llaveTexto(val('filtroP'));
      return pendientes().filter(function (r) {
        return !k || AF.util.llaveTexto([r.cr, r.crDesc, r.factura, r.distrito, r.descripcion].join(' ')).indexOf(k) >= 0;
      });
    }
    function grupos(lista) {
      var porFactura = val('grupoP') === 'factura', g = new Map();
      lista.forEach(function (r) {
        var k = porFactura ? (r.factura || '(sin factura)') : r.cr;
        var e = g.get(k);
        if (!e) { e = { clave: k, tienda: r.crDesc, distrito: r.distrito, regs: [], otros: new Set(), equipos: {} }; g.set(k, e); }
        e.regs.push(r);
        e.otros.add(porFactura ? r.cr : (r.factura || '(sin factura)'));
        e.equipos[r.descripcion] = (e.equipos[r.descripcion] || 0) + 1;
      });
      return Array.from(g.values()).sort(function (a, b) { return b.regs.length - a.regs.length || String(a.clave).localeCompare(String(b.clave)); });
    }
    function resumenEquipos(e) {
      return Object.keys(e.equipos).sort(function (a, b) { return e.equipos[b] - e.equipos[a]; }).map(function (d) { return d + ' (' + e.equipos[d] + ')'; }).join(', ');
    }
    function pintarPendientes() {
      var lista = pendFiltrados(), gs = grupos(lista), porFactura = val('grupoP') === 'factura';
      var tiendas = {}; lista.forEach(function (r) { tiendas[r.cr] = 1; });
      var equipos = {}; lista.forEach(function (r) { equipos[r.descripcion] = (equipos[r.descripcion] || 0) + 1; });
      q('resP').innerHTML = App.indicadores([
          { n: lista.length, txt: 'activos pendientes de placa', cls: 'warn' },
          { n: Object.keys(tiendas).length, txt: 'tiendas' },
          { n: gs.length, txt: porFactura ? 'facturas' : 'tiendas en la lista' }
        ].filter(function (x, i) { return porFactura || i !== 2; })) +
        '<details><summary>Equipos que más faltan de plaquear</summary>' +
        App.barras(Object.keys(equipos).map(function (k) { return { nombre: k, n: equipos[k] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 12)) + '</details>' +
        '<div class="scroll"><table>' + th(porFactura ? ['Factura', 'Pendientes', 'Tiendas', 'Equipos', ''] : ['CR', 'Tienda', 'Distrito', 'Pendientes', 'Facturas', 'Equipos', '']) +
        gs.slice(0, MAX_FILAS).map(function (e) {
          var vals = porFactura ? [e.clave, e.regs.length, e.otros.size, resumenEquipos(e)] : [e.clave, e.tienda, e.distrito, e.regs.length, e.otros.size, resumenEquipos(e)];
          return '<tr>' + td(vals) + '<td><button data-ver="' + esc(e.clave) + '">Ver</button></td></tr>';
        }).join('') + '</table></div>';
      q('detP').innerHTML = '';
    }
    function verGrupo(clave) {
      var g = grupos(pendFiltrados()).filter(function (e) { return String(e.clave) === clave; })[0];
      if (!g) return;
      q('detP').innerHTML = '<h3>' + esc(clave) + ' — ' + g.regs.length + ' pendientes</h3><div class="scroll"><table>' +
        th(['CR', 'Tienda', 'No Activo', 'Descripción', 'Marca', 'Modelo', 'Serie', 'Factura', 'Adq.']) +
        g.regs.map(function (r) { return '<tr>' + td([r.cr, r.crDesc, r.noActivo, r.descripcion, r.marca, r.modelo, r.serie, r.factura, r.mesAdq + '/' + r.anioAdq]) + '</tr>'; }).join('') +
        '</table></div>';
      q('detP').scrollIntoView();
    }
    q('grupoP').addEventListener('change', pintarPendientes);
    var tP = null;
    q('filtroP').addEventListener('input', function () { clearTimeout(tP); tP = setTimeout(pintarPendientes, 250); });

    // ---------- Seguimiento ----------
    var NOM_EST = { aplicado: 'Aplicado', pendiente: 'Pendiente', distinto: 'Aplicado distinto' };
    var NOM_TIPO = { ALTA: 'Alta', BAJA: 'Baja', TRASPASO: 'Transferencia' };
    function seguimiento() {
      var k = AF.util.llaveTexto(val('filtroS')), est = val('estadoS');
      var todos = AF.seguimiento(App.maf, App.leerEnviados());
      return {
        todos: todos,
        lista: todos.filter(function (s) {
          return (!est || s.estado === est) && (!k || AF.util.llaveTexto([s.noActivo, s.placa, s.cr, s.tienda, s.crDestino, s.descripcion, s.archivo].join(' ')).indexOf(k) >= 0);
        })
      };
    }
    function pintarSeguimiento() {
      var d = seguimiento();
      var n = { aplicado: 0, pendiente: 0, distinto: 0 };
      d.todos.forEach(function (s) { n[s.estado]++; });
      if (!d.todos.length) { q('resS').innerHTML = '<div class="muted">Aún no hay Excel generados registrados.</div>'; return; }
      q('resS').innerHTML = '<div class="encab"><b>Revisado contra el MAF</b><span class="muted">' + esc(App.maf.archivo || '') + ' · corte ' + esc(App.maf.fecha || 's/f') + '</span></div>' +
        App.indicadores([
          { n: d.todos.length, txt: 'movimientos enviados', filtro: '' },
          { n: n.aplicado, txt: 'aplicados', cls: 'ok', filtro: 'aplicado' },
          { n: n.pendiente, txt: 'pendientes', cls: 'warn', filtro: 'pendiente' },
          { n: n.distinto, txt: 'aplicados distinto', cls: 'err', filtro: 'distinto' }
        ], val('estadoS')) +
        '<div class="muted">Toque un indicador para filtrar. Si el MAF cargado es anterior a la fecha en que se generó el Excel, es normal que salgan pendientes.</div>' +
        '<div class="scroll"><table>' + th(['Estado', 'Detalle', 'Tipo', 'No Activo', 'Placa', 'Descripción', 'CR', 'CR destino', 'Tipo de baja', 'Generado', 'Archivo', '']) +
        d.lista.map(function (s, i) {
          return '<tr><td class="' + (s.estado === 'aplicado' ? 'ok' : s.estado === 'distinto' ? 'err' : 'warn') + '">' + esc(NOM_EST[s.estado]) + '</td>' +
            td([s.detalle, NOM_TIPO[s.tipo] || s.tipo, s.noActivo, s.placa, s.descripcion, s.cr + ' ' + s.tienda, s.crDestino, s.motivo, s.generado, s.archivo]) +
            '<td><button data-quitar-env="' + esc([s.tipo, s.noActivo, s.placa, s.crDestino].join('|')) + '">Quitar</button></td></tr>';
        }).join('') + '</table></div>';
    }
    function quitarEnviados(fn) {
      var lista = App.leerEnviados(), segs = AF.seguimiento(App.maf, lista);
      App.guardarEnviados(lista.filter(function (e, i) { return !fn(e, segs[i]); }));
      pintarSeguimiento();
    }
    q('estadoS').addEventListener('change', pintarSeguimiento);
    q('filtroS').addEventListener('input', pintarSeguimiento);

    // ---------- Acciones ----------
    cont.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t.getAttribute) return;
      if (t.getAttribute('data-vista')) { mostrarVista(t.getAttribute('data-vista')); return; }
      if (!App.maf) return;
      // Clic en un indicador = usar su filtro de estado (otro clic lo quita)
      var ind = t.closest && t.closest('[data-filtro]');
      if (ind) {
        var sel = vista === 'tienda' ? q('estadoT') : vista === 'seguimiento' ? q('estadoS') : null;
        if (sel) { var f = ind.getAttribute('data-filtro'); sel.value = sel.value === f ? '' : f; pintar(); }
        return;
      }
      var accion = t.getAttribute('data-accion');
      if (accion === 'imprimir') window.print();
      else if (accion === 'exportarT') {
        var d = activosTienda();
        if (!d) return;
        App.exportarExcel('Activos ' + d.t.cr + ' ' + d.t.tienda + ' ' + App.hoyLocal() + '.xlsx', { Activos: d.lista.map(filaActivo) });
      } else if (accion === 'exportarP') {
        var lista = pendFiltrados(), porFactura = val('grupoP') === 'factura';
        App.exportarExcel('Pendientes de plaqueo ' + App.hoyLocal() + '.xlsx', {
          Resumen: grupos(lista).map(function (e) {
            return porFactura ? { Factura: e.clave, Pendientes: e.regs.length, Tiendas: e.otros.size, Equipos: resumenEquipos(e) }
              : { CR: e.clave, Tienda: e.tienda, Distrito: e.distrito, Pendientes: e.regs.length, Facturas: e.otros.size, Equipos: resumenEquipos(e) };
          }),
          Detalle: lista.slice().sort(function (a, b) { return a.cr.localeCompare(b.cr) || a.descripcion.localeCompare(b.descripcion); }).map(filaActivo)
        });
      } else if (accion === 'exportarS') {
        App.exportarExcel('Seguimiento movimientos AF ' + App.hoyLocal() + '.xlsx', {
          Seguimiento: seguimiento().lista.map(function (s) {
            return { Estado: NOM_EST[s.estado], Detalle: s.detalle, Tipo: NOM_TIPO[s.tipo] || s.tipo, 'No Activo': s.noActivo, Placa: s.placa, 'Descripción': s.descripcion,
              CR: s.cr, Tienda: s.tienda, 'CR destino': s.crDestino, 'Tienda destino': s.tiendaDestino, 'Tipo de baja': s.motivo, 'Fecha movimiento': s.fecha,
              Generado: s.generado, Archivo: s.archivo, 'MAF al generar': s.mafCorte, 'MAF revisado': App.maf.fecha || '' };
          })
        });
      } else if (accion === 'quitarAplicados') {
        var n = AF.seguimiento(App.maf, App.leerEnviados()).filter(function (s) { return s.estado === 'aplicado'; }).length;
        if (!n) return;
        App.confirmar({ titulo: '¿Quitar los aplicados?', texto: 'Se quitan del seguimiento los ' + n + ' movimientos que el MAF ya muestra aplicados.', aceptar: 'Quitar', peligro: true })
          .then(function (ok) { if (ok) quitarEnviados(function (e, s) { return s.estado === 'aplicado'; }); });
      } else if (t.getAttribute('data-quitar-env')) {
        var clave = t.getAttribute('data-quitar-env');
        quitarEnviados(function (e) { return [e.tipo, e.noActivo, e.placa, e.crDestino].join('|') === clave; });
      } else if (t.getAttribute('data-ver')) verGrupo(t.getAttribute('data-ver'));
    });

    App.registrarContexto(MODULO, function () { return 'Solo consulta · MAF corte ' + (App.maf.fecha || 's/f'); });
    App.alMaf(function () { pendCache = null; pintar(); });
    App.alCambioExterno(MODULO, function () { pendCache = null; pintar(); });
    mostrarVista('tienda');
  };
})();
