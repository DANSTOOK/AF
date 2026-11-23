/*
 * Consultar el MAF (solo lectura).
 * Buscar por placa, No. Activo, serie, CR, tienda o artículo y ver todas las columnas del MAF,
 * con el año de adquisición y si el activo ya está depreciado o todavía tiene valor.
 * Filtros como en Excel (varios valores por columna), vista Resumen (tabla dinámica), gráfica por año,
 * búsquedas guardadas, exportar e imprimir. Aquí no se captura ni se modifica nada.
 */
(function () {
  'use strict';
  var App = window.AFApp, esc = App.esc;
  var MODULO = 'maf';
  var PASO_FILAS = 200;
  var MAX_IMPRIMIR = 3000;
  var POR_DEPRECIARSE = 6;   // meses de vida útil restantes o menos

  // Columnas en el orden del MAF (encabezado tal como viene en el archivo)
  var COLS = [
    ['plazaDesc', 'Plaza Desc'], ['plaza', 'Plaza'], ['distrito', 'Distrito'], ['cr', 'Cr'], ['crDesc', 'Cr Desc'],
    ['placa', 'Codigo Barras'], ['plaqueable', 'Plaqueable'], ['noActivo', 'No Activo'], ['noLegacy', 'No Legacy'],
    ['cuenta', 'Cuenta'], ['subcuenta', 'Subcuenta'], ['familia', 'Familia'], ['cveActivo', 'Cve Activo'],
    ['mesAdq', 'Mes Adq'], ['anioAdq', 'Anio Adq'], ['descAdic', 'Desc Adicional'], ['factura', 'Factura'],
    ['costo', 'Costo', 'dinero'], ['deprnAcum', 'Deprn Acum', 'dinero'], ['deprnAnual', 'Deprn Anual', 'dinero'], ['valorNeto', 'Valor Neto', 'dinero'],
    ['vidaUtil', 'Vida Util', 'num'], ['remanente', 'Remantente', 'num'], ['origen', 'Origen'], ['descripcion', 'Descripcion'],
    ['departamento', 'Departamento E'], ['marca', 'Marca'], ['modelo', 'Modelo'], ['serie', 'Serie'], ['descPuesto', 'Desc Puesto']
  ];
  var ETIQ = {}, TIPO = {};
  COLS.forEach(function (c) { ETIQ[c[0]] = c[1]; TIPO[c[0]] = c[2] || ''; });
  // Vista corta: lo que más se consulta (la placa siempre va fija a la izquierda, después de "Valor")
  var CORTA = [['noActivo', 'No Activo'], ['descripcion', 'Descripción'], ['marca', 'Marca'], ['modelo', 'Modelo'], ['serie', 'Serie'],
    ['anioAdq', 'Año'], ['valorNeto', 'Valor neto', 'dinero'], ['remanente', 'Meses restantes', 'num'], ['cr', 'CR'], ['crDesc', 'Tienda']];
  var GRUPOS = [
    ['Ubicación', ['plazaDesc', 'plaza', 'distrito', 'cr', 'crDesc']],
    ['Equipo', ['descripcion', 'descAdic', 'marca', 'modelo', 'serie', 'departamento', 'descPuesto']],
    ['Identificación', ['placa', 'plaqueable', 'noActivo', 'noLegacy', 'cveActivo', 'cuenta', 'subcuenta', 'familia', 'origen']],
    ['Adquisición y valor', ['mesAdq', 'anioAdq', 'factura', 'costo', 'deprnAcum', 'deprnAnual', 'valorNeto', 'vidaUtil', 'remanente']]
  ];
  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var VALORES = { '': 'Todos', con: 'Con valor', pordep: 'Por depreciarse', dep: 'Depreciados' };

  var fmtDinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var fmtEntero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  var cotejo = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = parseFloat(String(v).replace(/[$,\s]/g, ''));
    return isFinite(n) ? n : null;
  }
  function dinero(v) { var n = num(v); return n === null ? '' : fmtDinero.format(n); }

  // ¿Depreciado o con valor? Manda "Remantente" (meses de vida útil que le quedan); sin ese dato, el valor neto
  function infoValor(r) {
    var costo = num(r.costo), neto = num(r.valorNeto), acum = num(r.deprnAcum), rem = num(r.remanente), vida = num(r.vidaUtil);
    var dep = null;
    if (rem !== null) dep = rem <= 0;
    else if (neto !== null) dep = neto <= 0 || (costo > 0 && neto <= costo * 0.05 + 0.01);
    var pct = null;
    if (costo > 0 && acum !== null) pct = acum * 100 / costo;
    else if (costo > 0 && neto !== null) pct = (1 - neto / costo) * 100;
    if (pct !== null) pct = Math.max(0, Math.min(100, pct));
    return { dep: dep, costo: costo, neto: neto, acum: acum, rem: rem, vida: vida, pct: pct,
      porDep: dep === false && rem !== null && rem <= POR_DEPRECIARSE };
  }
  // Mes en que termina (o terminó) la vida útil: adquisición + vida útil en meses
  function finVida(r) {
    var m = num(r.mesAdq), a = num(r.anioAdq), v = num(r.vidaUtil);
    if (!m || !a || v === null) return null;
    var d = new Date(a, m - 1 + v, 1);
    return { txt: String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(), pasado: d <= new Date() };
  }
  // Búsqueda de texto como en Excel: sin acentos ni mayúsculas, signos como espacio.
  // Una palabra de 5 letras o más también encuentra el dato escrito separado ("laptop" -> "LAP TOP").
  function normal(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9|]+/g, ' ').trim();
  }
  function palabras(s) { return normal(String(s).replace(/\|/g, ' ')).split(' ').filter(Boolean); }
  function coincide(clave, tokens) {
    var junto = null;
    for (var j = 0; j < tokens.length; j++) {
      var t = tokens[j];
      if (clave.indexOf(t) >= 0) continue;
      if (t.length < 5) return false;
      if (junto === null) junto = clave.replace(/ /g, '');
      if (junto.indexOf(t) < 0) return false;
    }
    return true;
  }
  function pastilla(v) {
    return v.dep === null ? '<span class="valor-p sin">Sin dato</span>'
      : v.dep ? '<span class="valor-p dep">Depreciado</span>'
      : v.porDep ? '<span class="valor-p pordep">Por depreciarse</span>' : '<span class="valor-p con">Con valor</span>';
  }
  function textoValor(v) { return v.dep === null ? 'Sin dato' : v.dep ? 'Depreciado' : v.porDep ? 'Por depreciarse' : 'Con valor'; }
  function copiar(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texto);
    return new Promise(function (ok) {
      var t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (e) { /* sin portapapeles */ }
      t.remove(); ok();
    });
  }
  var ICO_BUSCAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
  var ICO_FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  window.AFMaf = function () {
    var cont = document.getElementById('mod-' + MODULO);
    var claves = null;          // texto de búsqueda por registro (se arma en segundo plano)
    var resultados = [];        // registros que cumplen búsqueda y filtros (ya ordenados)
    var info = new Map();       // registro -> infoValor (cache)
    var filtroValor = '';       // '' | 'con' | 'pordep' | 'dep'
    var rango = { min: null, max: null };   // valor neto
    var sel = null;             // registro con la ficha abierta
    var vista = 'tabla';        // 'tabla' | 'resumen'
    var columnas = App.pref('maf_columnas', 'corta');
    var agrupar = App.pref('maf_agrupar', 'plaza');
    var orden = { k: '', dir: 1 };
    var ordenRes = { k: 'n', dir: -1 };
    var limite = PASO_FILAS;
    var masAbierto = false;
    var duplicadas = new Set();
    var guardando = false;

    // Filtros de columna como en Excel: cada uno con varios valores marcados (vacío = sin filtro)
    var FACETAS = [
      { k: 'plaza', t: 'Plaza', val: function (r) { return [r.plazaDesc, r.plaza].filter(Boolean).join(' '); } },
      { k: 'area', t: 'Tienda / área', val: function (r) { return r.cr; },
        etiqueta: function (v) { var l = App.maf.idx.porCr.get(v); return (l && l[0].crDesc ? l[0].crDesc + ' — ' : '') + v; } },
      { k: 'articulo', t: 'Artículo', val: function (r) { return r.descripcion; } },
      { k: 'marca', t: 'Marca', val: function (r) { return r.marca; } },
      { k: 'anio', t: 'Año de adquisición', corto: 'Año', val: function (r) { return String(r.anioAdq || ''); }, desc: true },
      { k: 'placa', t: 'Estado de placa', val: estadoPlaca },
      { k: 'mes', t: 'Mes de adquisición', corto: 'Mes', extra: true, val: function (r) { return String(r.mesAdq || ''); }, numerico: true,
        etiqueta: function (v) { return MESES[Number(v) - 1] ? String(v).padStart(2, '0') + ' · ' + MESES[Number(v) - 1] : v; } },
      { k: 'factura', t: 'Factura', extra: true, val: function (r) { return r.factura; } },
      { k: 'origen', t: 'Origen', extra: true, val: function (r) { return r.origen || ''; } },
      { k: 'cuenta', t: 'Cuenta', extra: true, val: function (r) { return r.cuenta || ''; } },
      { k: 'familia', t: 'Familia', extra: true, val: function (r) { return r.familia || ''; }, numerico: true }
    ];
    var FAC = {}, filtros = {};
    FACETAS.forEach(function (f) { FAC[f.k] = f; filtros[f.k] = new Set(); });
    function estadoPlaca(r) {
      if (r.placa) return duplicadas.has(AF.util.llavePlaca(r.placa)) ? 'Con placa duplicada' : 'Con placa';
      return r.plaqueable === 'S' ? 'Pendiente de placa' : 'No plaqueable';
    }
    function etiquetaDe(f, v) { return v === '' ? '(vacías)' : f.etiqueta ? f.etiqueta(v) : v; }
    function hayRango() { return rango.min !== null || rango.max !== null; }
    function hayFiltros() { return hayRango() || FACETAS.some(function (f) { return filtros[f.k].size; }); }
    function nExtras() { return FACETAS.filter(function (f) { return f.extra && filtros[f.k].size; }).length + (hayRango() ? 1 : 0); }

    cont.innerHTML =
      '<fieldset><legend>1. Buscar en el MAF</legend>' +
      '<div class="buscador">' + ICO_BUSCAR +
      '<input data-c="q" type="search" autocomplete="off" spellcheck="false" placeholder="Placa, No. Activo, serie, CR, tienda o artículo (ej. laptop tijuana este)"></div>' +
      '<div class="filtros-maf"><div class="opciones" data-c="valor">' +
        Object.keys(VALORES).map(function (k) { return '<button data-valor="' + k + '"' + (k ? '' : ' class="activo"') + '>' + VALORES[k] + '</button>'; }).join('') +
      '</div></div>' +
      '<div class="chips-filtro" data-c="chips"></div>' +
      '<div class="extras-maf oculto" data-c="extras"><div class="chips-filtro" data-c="chipsExtra"></div>' +
        '<div class="rango-maf"><span>Valor neto</span><label>de <input data-c="min" type="number" min="0" step="any" inputmode="decimal" placeholder="$ 0"></label>' +
        '<label>a <input data-c="max" type="number" min="0" step="any" inputmode="decimal" placeholder="sin tope"></label></div></div>' +
      '<div class="guardadas-maf" data-c="guardadas"></div>' +
      '<div data-c="aviso"></div>' +
      '<div data-c="stats"></div>' +
      '<div class="anios-maf" data-c="anios"></div></fieldset>' +
      '<fieldset data-c="fichaBox" class="oculto"><legend>Ficha del activo</legend><div data-c="ficha"></div></fieldset>' +
      '<fieldset data-c="resBox"><legend>2. Resultados (<span data-c="n">0</span>)</legend>' +
      '<div class="barra-res">' +
        '<div class="opciones" data-c="vista"><button data-vista="tabla" class="activo">Tabla</button><button data-vista="resumen">Resumen</button></div>' +
        '<div class="opciones" data-c="cols"><button data-cols="corta">Vista corta</button><button data-cols="todas">Todas las columnas</button></div>' +
        '<label data-c="agruparBox" class="oculto">Agrupar por <select data-c="agrupar">' +
          FACETAS.map(function (f) { return '<option value="' + f.k + '">' + esc(f.t) + '</option>'; }).join('') + '</select></label>' +
        '<span class="botones-res"><button data-accion="exportar">Exportar a Excel</button><button data-accion="imprimir">Imprimir</button></span>' +
      '</div>' +
      '<div class="activos-maf" data-c="activos"></div>' +
      '<div data-c="nota" class="muted"></div>' +
      '<div class="scroll maf-tabla" data-c="scroll"><table data-c="tabla"></table></div>' +
      '<div data-c="mas"></div></fieldset>';

    var q = function (n) { return cont.querySelector('[data-c="' + n + '"]'); };
    var val = function (n) { var e = q(n); return e ? e.value : ''; };
    q('agrupar').value = agrupar;

    App.registrarContexto(MODULO, function () {
      var t = val('q').trim();
      var nf = FACETAS.filter(function (f) { return filtros[f.k].size; }).length + (filtroValor ? 1 : 0) + (hayRango() ? 1 : 0);
      return ['Consulta del MAF', t ? '“' + t + '”' : 'sin búsqueda', nf ? App.cuenta(nf, 'filtro', 'filtros') : '',
        resultados.length.toLocaleString() + (resultados.length === 1 ? ' resultado' : ' resultados')].filter(Boolean).join(' · ');
    });

    function valorDe(r) { var v = info.get(r); if (!v) { v = infoValor(r); info.set(r, v); } return v; }
    function claveDe(r) {
      return [r.placa, r.noActivo, r.serie, r.cr, r.crDesc, r.plazaDesc, r.plaza, r.distrito, r.descripcion, r.descAdic,
        r.marca, r.modelo, r.factura, r.cveActivo, r.noLegacy, r.departamento, r.descPuesto].map(normal).join('|');
    }
    var armadas = 0, trozo = 0;
    function armarClaves(hasta) {
      var regs = App.maf.registros, fin = Math.min(regs.length, hasta || regs.length);
      if (!claves) claves = new Array(regs.length);
      for (; armadas < fin; armadas++) claves[armadas] = claveDe(regs[armadas]);
    }
    // Se arma en segundo plano, de a poco, para que la primera búsqueda sea inmediata sin congelar la página
    function armarEnFondo() {
      clearTimeout(trozo);
      if (!App.maf || armadas >= App.maf.registros.length) return;
      armarClaves(armadas + 8000);
      trozo = setTimeout(armarEnFondo, 30);
    }

    // Una sola palabra que es placa, No. Activo, serie o CR exactos: esos activos. Si no, todas las palabras deben aparecer.
    function buscar(texto) {
      var regs = App.maf.registros, t = AF.util.texto(texto);
      if (!t) return regs;
      if (!/\s/.test(t)) {
        var idx = App.maf.idx, vistos = new Set(), exactos = [];
        [idx.porPlaca.get(AF.util.llavePlaca(t)), idx.porActivo.get(t) ? [idx.porActivo.get(t)] : null,
          idx.porSerie.get(AF.util.llaveSerie(t)), idx.porCr.get(t.toUpperCase())].forEach(function (l) {
          (l || []).forEach(function (r) { if (!vistos.has(r)) { vistos.add(r); exactos.push(r); } });
        });
        if (exactos.length) return exactos;
      }
      armarClaves();
      var tokens = palabras(t);
      if (!tokens.length) return [];
      var out = [];
      for (var i = 0; i < regs.length; i++) if (coincide(claves[i], tokens)) out.push(regs[i]);
      return out;
    }

    function hayBusqueda() { return !!(val('q').trim() || filtroValor || hayFiltros()); }

    // ¿El registro pasa todos los filtros (menos el de la columna "excepto", para contar sus opciones)?
    function pasa(r, excepto) {
      for (var j = 0; j < FACETAS.length; j++) {
        var f = FACETAS[j], s = filtros[f.k];
        if (s.size && f.k !== excepto && !s.has(f.val(r))) return false;
      }
      if (filtroValor || hayRango()) {
        var v = valorDe(r);
        if (filtroValor === 'dep' && v.dep !== true) return false;
        if (filtroValor === 'con' && v.dep !== false) return false;
        if (filtroValor === 'pordep' && !v.porDep) return false;
        if (hayRango()) {
          if (v.neto === null) return false;
          if (rango.min !== null && v.neto < rango.min) return false;
          if (rango.max !== null && v.neto > rango.max) return false;
        }
      }
      return true;
    }
    var baseCache = { t: null, regs: null };
    function base() {
      var t = val('q').trim();
      if (baseCache.t !== t || !baseCache.regs) baseCache = { t: t, regs: buscar(t) };
      return baseCache.regs;
    }

    // ---------- Orden de la tabla (tocar el encabezado) ----------
    function valorOrden(r, k) {
      if (k === '_valor') { var v = valorDe(r); return v.dep === null ? 3 : v.dep ? 2 : v.porDep ? 1 : 0; }
      return TIPO[k] || k === 'anioAdq' || k === 'mesAdq' ? num(r[k]) : r[k];
    }
    function ordenar() {
      if (!orden.k) return;
      var k = orden.k, d = orden.dir;
      var numerico = k === '_valor' || TIPO[k] || k === 'anioAdq' || k === 'mesAdq';
      resultados.sort(function (a, b) {
        var x = valorOrden(a, k), y = valorOrden(b, k);
        if (numerico) {
          if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;   // vacíos al final
          return (x - y) * d;
        }
        return cotejo.compare(x || '', y || '') * d;
      });
    }

    function actualizar(desdeEscaner) {
      if (!App.maf) return;
      var b = hayBusqueda() ? base() : [];
      resultados = b.filter(function (r) { return pasa(r, null); });
      ordenar();
      limite = PASO_FILAS;
      if (sel && resultados.indexOf(sel) < 0) sel = null;
      if (!sel && resultados.length === 1) sel = resultados[0];
      pintar();
      if (desdeEscaner) {
        var p = val('q').trim();
        if (resultados.length === 1) {
          var r = resultados[0], v = valorDe(r);
          App.lectura('ok', p + ': ' + r.descripcion + ' — ' + r.cr + ' ' + r.crDesc + ' — ' + (v.dep === null ? 'sin dato de valor' : v.dep ? 'depreciado' : 'con valor ' + dinero(r.valorNeto)));
        } else if (!resultados.length) App.lectura(b.length ? 'aviso' : 'error', p + (b.length ? ': está en el MAF, pero no entra en los filtros puestos. Quite filtros para verlo.' : ': no está en el MAF.'));
        else App.lectura('aviso', p + ': ' + resultados.length + ' activos en el MAF con ese dato. Elija uno en la lista.');
      }
    }

    // ---------- Pastillas de filtro y lista desplegable (como el filtro de Excel) ----------
    function chipHtml(f) {
      var s = filtros[f.k], n = s.size, det = '';
      if (n === 1) det = etiquetaDe(f, s.values().next().value);
      else if (n > 1) det = n + ' seleccionados';
      return '<button class="chip-f' + (n ? ' on' : '') + (pop.k === f.k ? ' abierto' : '') + '" data-facet="' + f.k + '" aria-haspopup="listbox">' +
        '<span>' + esc(n && f.corto ? f.corto : f.t) + '</span>' + (det ? '<b>' + esc(det) + '</b>' : '') + ICO_FLECHA + '</button>';
    }
    function pintarChips() {
      var ne = nExtras();
      q('chips').innerHTML = FACETAS.filter(function (f) { return !f.extra; }).map(chipHtml).join('') +
        '<button class="chip-f chip-mas' + (masAbierto ? ' abierto' : '') + (ne ? ' on' : '') + '" data-accion="mas">' +
          '<span>Más filtros</span>' + (ne ? '<b>' + ne + '</b>' : '') + ICO_FLECHA + '</button>' +
        (hayFiltros() || filtroValor ? '<button class="chip-quitar" data-accion="quitarFiltros">Quitar filtros</button>' : '');
      q('chipsExtra').innerHTML = FACETAS.filter(function (f) { return f.extra; }).map(chipHtml).join('');
      q('extras').classList.toggle('oculto', !masAbierto);
    }

    // Barra de lo que está filtrado: una pastilla por valor, con ✕ para quitarlo
    function pintarActivos() {
      var p = [];
      if (val('q').trim()) p.push({ t: 'Búsqueda: “' + val('q').trim() + '”', a: 'q' });
      if (filtroValor) p.push({ t: VALORES[filtroValor], a: 'valor' });
      FACETAS.forEach(function (f) {
        Array.from(filtros[f.k]).forEach(function (v, i) { p.push({ t: (f.corto || f.t) + ': ' + etiquetaDe(f, v), a: 'f', k: f.k, i: i }); });
      });
      if (hayRango()) p.push({ t: 'Valor neto ' + (rango.min !== null ? 'desde ' + fmtEntero.format(rango.min) : '') + (rango.max !== null ? ' hasta ' + fmtEntero.format(rango.max) : ''), a: 'rango' });
      q('activos').innerHTML = p.length ? p.map(function (x) {
        return '<button class="activo-p" data-quitar="' + x.a + '"' + (x.k ? ' data-k="' + x.k + '" data-i="' + x.i + '"' : '') + ' title="Quitar">' +
          '<span>' + esc(x.t) + '</span><i aria-hidden="true">✕</i></button>';
      }).join('') : '';
    }

    var MAX_OPC = 400;
    var pop = { k: '', opciones: [], visibles: [] };
    var popEl = document.createElement('div');
    popEl.className = 'filtro-pop oculto';
    popEl.setAttribute('role', 'dialog');
    popEl.innerHTML = '<span class="hoja-asa" aria-hidden="true"></span>' +
      '<div class="pop-cab"><b data-p="titulo"></b><button class="palomita" data-p="listo">Listo</button></div>' +
      '<div class="buscador chico">' + ICO_BUSCAR + '<input data-p="q" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar en la lista"></div>' +
      '<div class="pop-acc"><button data-p="marcar">Marcar los de la lista</button><button data-p="limpiar">Sin filtro</button></div>' +
      '<div class="pop-estado muted" data-p="estado"></div>' +
      '<div class="pop-lista" data-p="lista" role="listbox" aria-multiselectable="true"></div>';
    document.body.appendChild(popEl);
    var pp = function (n) { return popEl.querySelector('[data-p="' + n + '"]'); };

    function abrirFiltro(k) {
      if (!App.maf) return;
      if (pop.k === k) { cerrarFiltro(); return; }
      var f = FAC[k], cuenta = new Map();
      // Opciones = lo que existe con la búsqueda y los demás filtros (igual que Excel)
      base().forEach(function (r) { if (pasa(r, k)) { var v = f.val(r); cuenta.set(v, (cuenta.get(v) || 0) + 1); } });
      filtros[k].forEach(function (v) { if (!cuenta.has(v)) cuenta.set(v, 0); });
      pop.k = k;
      pop.opciones = Array.from(cuenta, function (e) { return { v: e[0], n: e[1], t: etiquetaDe(f, e[0]) }; }).sort(function (a, b) {
        if (a.v === '' || b.v === '') return a.v === '' ? 1 : -1;
        if (f.numerico) return Number(a.v) - Number(b.v);
        return f.desc ? cotejo.compare(String(b.v), String(a.v)) : cotejo.compare(a.t, b.t);
      });
      pop.opciones.forEach(function (o) { o.llave = normal(o.t); });
      pp('titulo').textContent = f.t;
      pp('q').value = '';
      popEl.classList.remove('oculto');
      pintarChips();
      colocarPop();
      pintarPop();
      if (window.innerWidth >= 600) pp('q').focus({ preventScroll: true });
    }
    // Debajo de su pastilla (en teléfono el CSS la vuelve hoja de abajo y no usa estas medidas)
    function colocarPop() {
      var chip = cont.querySelector('[data-facet="' + pop.k + '"]');
      if (!chip || !chip.offsetParent) { cerrarFiltro(); return; }
      var rc = chip.getBoundingClientRect(), w = Math.min(360, window.innerWidth - 24);
      popEl.style.width = w + 'px';
      popEl.style.left = (Math.max(12, Math.min(rc.left, window.innerWidth - w - 12)) + window.scrollX) + 'px';
      popEl.style.top = (rc.bottom + 8 + window.scrollY) + 'px';
    }
    function cerrarFiltro() {
      if (!pop.k) return;
      pop.k = '';
      popEl.classList.add('oculto');
      pintarChips();
    }
    function pintarPop() {
      var s = filtros[pop.k], k = palabras(pp('q').value);
      pop.visibles = pop.opciones.filter(function (o) { return coincide(o.llave, k); });
      var ver = pop.visibles.slice(0, MAX_OPC);
      pp('estado').textContent = (s.size ? App.cuenta(s.size, 'marcado', 'marcados') : 'Sin filtro: se muestran todos') + ' · ' +
        App.cuenta(pop.opciones.length, 'opción', 'opciones') + (pop.visibles.length > MAX_OPC ? ' · escriba para ver más' : '');
      pp('lista').innerHTML = ver.length ? ver.map(function (o, i) {
        var on = s.has(o.v);
        return '<button class="pop-op' + (on ? ' on' : '') + '" data-o="' + i + '" role="option" aria-selected="' + on + '">' +
          '<span class="chk" aria-hidden="true"></span><span class="t">' + esc(o.t) + '</span><span class="n">' + o.n.toLocaleString() + '</span></button>';
      }).join('') : '<div class="muted pop-vacio">Nada coincide.</div>';
      pp('marcar').disabled = !pop.visibles.length;
    }
    function filtrosCambiaron() {
      sel = null;
      actualizar(false);
      if (pop.k) { pintarPop(); colocarPop(); }   // las pastillas pueden cambiar de renglón al mostrar lo marcado
    }
    popEl.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !pop.k) return;
      var s = filtros[pop.k], p = b.getAttribute('data-p');
      if (b.hasAttribute('data-o')) {
        var o = pop.visibles[Number(b.getAttribute('data-o'))];
        if (s.has(o.v)) s.delete(o.v); else s.add(o.v);
        filtrosCambiaron();
      } else if (p === 'marcar') { pop.visibles.forEach(function (o) { s.add(o.v); }); filtrosCambiaron(); }
      else if (p === 'limpiar') { s.clear(); filtrosCambiaron(); }
      else if (p === 'listo') cerrarFiltro();
    });
    pp('q').addEventListener('input', pintarPop);
    pp('q').addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarFiltro(); });
    document.addEventListener('mousedown', function (e) {
      if (pop.k && !popEl.contains(e.target) && !(e.target.closest && e.target.closest('[data-facet]'))) cerrarFiltro();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop.k) cerrarFiltro(); });
    window.addEventListener('hashchange', cerrarFiltro);
    window.addEventListener('resize', function () { if (pop.k) colocarPop(); });

    // ---------- Búsquedas guardadas ----------
    function guardadas() { return App.pref('maf_guardadas', []) || []; }
    function estadoActual() {
      var f = {};
      FACETAS.forEach(function (x) { if (filtros[x.k].size) f[x.k] = Array.from(filtros[x.k]); });
      return { q: val('q').trim(), valor: filtroValor, rango: { min: rango.min, max: rango.max }, f: f, vista: vista, agrupar: agrupar };
    }
    function aplicarEstado(e) {
      cerrarFiltro();
      q('q').value = e.q || '';
      ponerValor(e.valor || '');
      rango = { min: e.rango && e.rango.min != null ? e.rango.min : null, max: e.rango && e.rango.max != null ? e.rango.max : null };
      q('min').value = rango.min === null ? '' : rango.min; q('max').value = rango.max === null ? '' : rango.max;
      FACETAS.forEach(function (x) { filtros[x.k] = new Set((e.f && e.f[x.k]) || []); });
      masAbierto = nExtras() > 0;
      if (e.agrupar && FAC[e.agrupar]) { agrupar = e.agrupar; q('agrupar').value = agrupar; }
      ponerVista(e.vista || 'tabla');
      filtrosCambiaron();
    }
    function pintarGuardadas() {
      var g = guardadas();
      var html = g.map(function (x, i) {
        return '<span class="guardada"><button data-g="' + i + '" title="Aplicar esta búsqueda">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>' +
          esc(x.n) + '</button><button class="g-borrar" data-g-borrar="' + i + '" title="Borrar esta búsqueda guardada" aria-label="Borrar">✕</button></span>';
      }).join('');
      if (guardando) {
        html += '<span class="g-form"><input data-c="gNombre" maxlength="40" placeholder="Nombre, ej. Laptops Este depreciadas">' +
          '<button class="palomita" data-accion="gGuardar">Guardar</button><button data-accion="gCancelar">Cancelar</button></span>';
      } else if (hayBusqueda()) {
        html += '<button class="g-nueva" data-accion="gNueva">+ Guardar esta búsqueda</button>';
      }
      q('guardadas').innerHTML = html ? '<span class="muted g-tit">Guardadas</span>' + html : '';
      if (guardando) q('gNombre').focus();
    }
    function guardarBusqueda() {
      var n = val('gNombre').trim();
      if (!n) { q('gNombre').focus(); return; }
      var g = guardadas().filter(function (x) { return x.n.toLowerCase() !== n.toLowerCase(); });
      var e = estadoActual(); e.n = n;
      g.push(e);
      App.guardarPref('maf_guardadas', g);
      guardando = false;
      pintarGuardadas();
      App.lectura('ok', 'Búsqueda guardada: ' + n);
    }

    // ---------- Pintar ----------
    function pintar() {
      var todos = !hayBusqueda();
      var lista = todos ? App.maf.registros : resultados;
      // Indicadores: de los resultados, o de todo el MAF si aún no se busca nada. Tocar uno filtra por ese estado.
      var nCon = 0, nDep = 0, nPor = 0, neto = 0, costo = 0;
      lista.forEach(function (r) {
        var v = valorDe(r);
        if (v.dep === true) nDep++; else if (v.dep === false) { nCon++; if (v.porDep) nPor++; }
        if (v.neto !== null) neto += v.neto;
        if (v.costo !== null) costo += v.costo;
      });
      q('stats').innerHTML = App.indicadores([
        { n: lista.length, txt: todos ? 'activos en todo el MAF' : 'resultados' },
        { n: nCon, txt: 'con valor', cls: 'ok', filtro: 'con', titulo: 'Tocar para ver solo los que tienen valor' },
        { n: nPor, txt: 'por depreciarse (≤ ' + POR_DEPRECIARSE + ' meses)', cls: nPor ? 'warn' : '', filtro: 'pordep', titulo: 'Con valor, pero les quedan ' + POR_DEPRECIARSE + ' meses o menos de vida útil' },
        { n: nDep, txt: 'depreciados', filtro: 'dep', titulo: 'Tocar para ver solo los depreciados' },
        { n: fmtEntero.format(neto), txt: 'valor neto' + (todos ? ' total' : '') },
        { n: fmtEntero.format(costo), txt: 'costo' + (todos ? ' total' : '') }
      ], filtroValor);
      q('n').textContent = (vista === 'resumen' && todos ? App.maf.registros.length : resultados.length).toLocaleString();
      pintarChips();
      pintarActivos();
      pintarGuardadas();
      pintarAnios();
      q('cols').classList.toggle('oculto', vista !== 'tabla');
      q('agruparBox').classList.toggle('oculto', vista !== 'resumen');
      q('cols').querySelectorAll('button').forEach(function (b) { b.classList.toggle('activo', b.getAttribute('data-cols') === columnas); });
      if (vista === 'resumen') pintarResumen(); else pintarTabla();
      pintarFicha();
      App.pintarContexto();
    }

    // Gráfica por año: barras apiladas con valor / depreciados; tocar un año lo filtra (cuenta con todos los demás filtros)
    function pintarAnios() {
      var porAnio = new Map();
      base().forEach(function (r) {
        if (!pasa(r, 'anio')) return;
        var a = String(r.anioAdq || ''); if (!a) return;
        var x = porAnio.get(a); if (!x) { x = { con: 0, dep: 0, sin: 0 }; porAnio.set(a, x); }
        var d = valorDe(r).dep; if (d === true) x.dep++; else if (d === false) x.con++; else x.sin++;
      });
      if (porAnio.size < 2) { q('anios').innerHTML = ''; return; }
      var anios = Array.from(porAnio.keys()).sort(function (a, b) { return a - b; });
      var max = anios.reduce(function (m, a) { var x = porAnio.get(a); return Math.max(m, x.con + x.dep + x.sin); }, 1);
      var marcados = filtros.anio;
      q('anios').innerHTML = '<div class="anios-tit"><b>Activos por año de adquisición</b><span class="muted">Toque un año para filtrarlo · ' +
          '<i class="ley con"></i>con valor <i class="ley dep"></i>depreciados</span></div>' +
        '<div class="anios-barras" style="--n:' + anios.length + '">' + anios.map(function (a) {
          var x = porAnio.get(a), tot = x.con + x.dep + x.sin, on = marcados.has(a);
          return '<button class="anio-b' + (on ? ' on' : '') + (marcados.size && !on ? ' atenuado' : '') + '" data-anio="' + esc(a) + '" title="' +
            esc(a + ': ' + tot.toLocaleString() + ' activos · ' + x.con.toLocaleString() + ' con valor · ' + x.dep.toLocaleString() + ' depreciados') + '">' +
            '<span class="anio-col" style="height:' + Math.max(3, tot * 100 / max).toFixed(1) + '%">' +
              '<i class="con" style="flex:' + x.con + '"></i><i class="dep" style="flex:' + (x.dep + x.sin) + '"></i></span>' +
            '<span class="anio-t">' + esc(anios.length > 14 ? '’' + a.slice(-2) : a) + '</span></button>';
        }).join('') + '</div>';
    }

    function columnasTabla() {
      var resto = columnas === 'todas' ? COLS.filter(function (c) { return c[0] !== 'placa'; }) : CORTA;
      return [['_valor', 'Valor'], ['placa', columnas === 'todas' ? 'Codigo Barras' : 'Placa']].concat(resto);
    }
    function celda(r, c) {
      if (c[0] === '_valor') return pastilla(valorDe(r));
      var t = c[2] || TIPO[c[0]], v = t === 'dinero' ? dinero(r[c[0]]) : r[c[0]];
      return esc(v == null ? '' : v);
    }
    function pintarTabla() {
      var todos = !hayBusqueda();
      q('mas').innerHTML = '';
      if (todos) {
        q('nota').textContent = '';
        q('tabla').innerHTML = '<tr><td class="vacio-maf">Escriba o escanee qué buscar (placa, No. Activo, serie, CR, tienda o artículo), o use los filtros.' +
          '<div class="ejemplos"><span>Pruebe:</span>' +
          '<button data-ejemplo="pordep">Por depreciarse</button><button data-ejemplo="sinPlaca">Pendientes de placa</button>' +
          '<button data-ejemplo="laptopsDep">Laptops depreciadas</button><button data-ejemplo="resumen">Resumen por plaza</button></div></td></tr>';
        return;
      }
      if (!resultados.length) {
        q('nota').textContent = '';
        q('tabla').innerHTML = '<tr><td class="vacio-maf">No hay activos en el MAF con esa búsqueda y esos filtros.</td></tr>';
        return;
      }
      var cols = columnasTabla(), ver = resultados.slice(0, limite);
      q('nota').textContent = 'Toque un renglón para ver su ficha · toque un encabezado para ordenar.';
      q('tabla').innerHTML = '<thead><tr>' + cols.map(function (c, i) {
        var t = c[2] || TIPO[c[0]], on = orden.k === c[0];
        return '<th class="' + (t ? 'num ' : '') + (i < 2 ? 'fija f' + i + ' ' : '') + 'ord' + (on ? ' on' : '') + '" data-orden="' + c[0] + '"' +
          (on ? ' aria-sort="' + (orden.dir > 0 ? 'ascending' : 'descending') + '"' : '') + '>' + esc(c[1]) +
          '<span class="flecha" aria-hidden="true">' + (on ? (orden.dir > 0 ? '▲' : '▼') : '') + '</span></th>';
      }).join('') + '</tr></thead><tbody>' +
        ver.map(function (r, i) {
          return '<tr class="clic' + (r === sel ? ' actual' : '') + '" data-i="' + i + '">' + cols.map(function (c, j) {
            var t = c[2] || TIPO[c[0]];
            return '<td class="' + (t ? 'num ' : '') + (j < 2 ? 'fija f' + j : '') + (c[0] === 'placa' ? ' placa-c' : '') + '">' + celda(r, c) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody>';
      fijarColumnas();
      var faltan = resultados.length - ver.length;
      q('mas').innerHTML = faltan > 0 ? '<div class="mas-maf"><span class="muted">Se ven ' + ver.length.toLocaleString() + ' de ' + resultados.length.toLocaleString() + '.</span>' +
        '<button data-accion="verMas">Ver ' + Math.min(PASO_FILAS, faltan) + ' más</button>' +
        (faltan > PASO_FILAS ? '<span class="muted">o exporte a Excel para verlos todos.</span>' : '') + '</div>' : '';
    }
    // La segunda columna fija (placa) empieza donde termina la primera (valor)
    function fijarColumnas() {
      var th = q('tabla').querySelector('th.f0');
      if (th) q('tabla').style.setProperty('--f1', th.offsetWidth + 'px');
    }

    // Resumen (tabla dinámica): activos agrupados por la columna elegida
    function filasResumen() {
      var f = FAC[agrupar], g = new Map();
      var lista = hayBusqueda() ? resultados : App.maf.registros;
      lista.forEach(function (r) {
        var k = f.val(r), x = g.get(k), v = valorDe(r);
        if (!x) { x = { v: k, n: 0, con: 0, dep: 0, neto: 0, costo: 0 }; g.set(k, x); }
        x.n++;
        if (v.dep === true) x.dep++; else if (v.dep === false) x.con++;
        if (v.neto !== null) x.neto += v.neto;
        if (v.costo !== null) x.costo += v.costo;
      });
      var filas = Array.from(g.values());
      filas.forEach(function (x) { x.t = etiquetaDe(f, x.v); });
      var k = ordenRes.k, d = ordenRes.dir;
      filas.sort(function (a, b) { return k === 't' ? cotejo.compare(a.t, b.t) * d : (a[k] - b[k]) * d || cotejo.compare(a.t, b.t); });
      return filas;
    }
    var filasRes = [];
    function pintarResumen() {
      var f = FAC[agrupar];
      filasRes = filasResumen();
      q('mas').innerHTML = '';
      if (!filasRes.length) { q('nota').textContent = ''; q('tabla').innerHTML = '<tr><td class="vacio-maf">No hay activos con esa búsqueda y esos filtros.</td></tr>'; return; }
      var ver = filasRes.slice(0, 500), max = ver.reduce(function (m, x) { return Math.max(m, x.n); }, 1);
      q('nota').textContent = App.cuenta(filasRes.length, 'grupo', 'grupos') + ' por ' + f.t.toLowerCase() + (filasRes.length > 500 ? ' (se ven los primeros 500)' : '') +
        ' · toque un renglón para ver sus activos.';
      var enc = [['t', f.t], ['n', 'Activos'], ['con', 'Con valor'], ['dep', 'Depreciados'], ['neto', 'Valor neto'], ['costo', 'Costo']];
      q('tabla').innerHTML = '<thead><tr>' + enc.map(function (c, i) {
        var on = ordenRes.k === c[0];
        return '<th class="ord' + (i ? ' num' : '') + (on ? ' on' : '') + '" data-orden-res="' + c[0] + '">' + esc(c[1]) +
          '<span class="flecha" aria-hidden="true">' + (on ? (ordenRes.dir > 0 ? '▲' : '▼') : '') + '</span></th>';
      }).join('') + '<th class="res-barra-th">Proporción</th></tr></thead><tbody>' +
        ver.map(function (x, i) {
          return '<tr class="clic" data-res="' + i + '"><td class="res-t">' + esc(x.t) + '</td><td class="num"><b>' + x.n.toLocaleString() + '</b></td>' +
            '<td class="num ok-t">' + x.con.toLocaleString() + '</td><td class="num">' + x.dep.toLocaleString() + '</td>' +
            '<td class="num">' + fmtEntero.format(x.neto) + '</td><td class="num">' + fmtEntero.format(x.costo) + '</td>' +
            '<td class="res-barra"><span style="width:' + Math.max(2, x.n * 100 / max).toFixed(1) + '%"><i class="con" style="flex:' + x.con + '"></i><i class="dep" style="flex:' + (x.n - x.con) + '"></i></span></td></tr>';
        }).join('') + '</tbody>';
    }

    function pintarFicha() {
      var box = q('fichaBox');
      if (!sel) { box.classList.add('oculto'); q('ficha').innerHTML = ''; return; }
      box.classList.remove('oculto');
      var r = sel, v = valorDe(r), fin = finVida(r);
      var adq = r.mesAdq && r.anioAdq ? String(r.mesAdq).padStart(2, '0') + '/' + r.anioAdq : r.anioAdq || '';
      var anios = num(r.anioAdq) ? new Date().getFullYear() - num(r.anioAdq) : null;
      var resumen;
      if (v.dep === null) resumen = 'El MAF no trae datos de valor para este activo.';
      else if (v.dep) resumen = 'Ya cumplió su vida útil' + (v.neto ? '; le queda el valor de rescate de ' + dinero(v.neto) : '') + '.';
      else resumen = 'Valor neto ' + dinero(v.neto) + (v.rem !== null ? '; le quedan ' + App.cuenta(v.rem, 'mes', 'meses') + ' de vida útil' : '') + '.';
      function botonCopiar(t, dato) { return dato ? '<button class="copiar" data-copiar="' + esc(dato) + '">' + esc(t) + '</button>' : ''; }
      var otros = (App.maf.idx.porCr.get(r.cr) || []).length - 1;
      q('ficha').innerHTML =
        '<div class="ficha-maf-cab"><div><div class="ficha-maf-t">' + esc(r.descripcion) + (r.descAdic ? ' <span class="muted">' + esc(r.descAdic) + '</span>' : '') + '</div>' +
          '<div class="muted">Activo <b>' + esc(r.noActivo) + '</b>' + (r.placa ? ' · Placa <b>' + esc(r.placa) + '</b>' : ' · Sin placa') +
          ' · ' + esc(r.cr + ' ' + r.crDesc) + '</div></div>' + pastilla(v) + '</div>' +
        '<div class="ficha-acc">' + botonCopiar('Copiar placa', r.placa) + botonCopiar('Copiar activo', r.noActivo) + botonCopiar('Copiar serie', r.serie) +
          (otros > 0 ? '<button data-otros="' + esc(r.cr) + '">Ver los demás activos de esta tienda (' + otros.toLocaleString() + ')</button>' : '') + '</div>' +
        '<div class="ficha-maf-valor">' +
          '<div><span>Adquirido</span><b>' + esc(adq || '—') + '</b>' + (anios !== null ? '<small>' + (anios <= 0 ? 'este año' : 'hace ' + App.cuenta(anios, 'año', 'años')) + '</small>' : '') + '</div>' +
          '<div><span>Costo</span><b>' + esc(dinero(r.costo) || '—') + '</b></div>' +
          '<div><span>Depreciación acumulada</span><b>' + esc(dinero(r.deprnAcum) || '—') + '</b>' + (v.pct !== null ? '<small>' + Math.round(v.pct) + '% del costo</small>' : '') + '</div>' +
          '<div><span>Valor neto</span><b>' + esc(dinero(r.valorNeto) || '—') + '</b></div>' +
          (fin ? '<div><span>' + (fin.pasado ? 'Terminó de depreciarse' : 'Termina de depreciarse') + '</span><b>' + esc(fin.txt) + '</b>' +
            (!fin.pasado && v.rem !== null ? '<small>en ' + App.cuenta(v.rem, 'mes', 'meses') + '</small>' : '') + '</div>' : '') +
        '</div>' +
        (v.pct !== null ? '<div class="dep-barra" title="' + Math.round(v.pct) + '% depreciado"><i style="width:' + v.pct.toFixed(1) + '%"></i></div>' : '') +
        '<div class="muted dep-txt">' + esc(resumen) + (v.vida !== null ? ' Vida útil: ' + App.cuenta(v.vida, 'mes', 'meses') + '.' : '') + '</div>' +
        GRUPOS.map(function (g) {
          return '<div class="ficha"><div class="ficha-t">' + esc(g[0]) + '</div><dl class="kv">' + g[1].map(function (k) {
            var vv = TIPO[k] === 'dinero' ? dinero(r[k]) : r[k];
            return '<div><dt>' + esc(ETIQ[k]) + '</dt><dd>' + esc(vv == null ? '' : vv) + '</dd></div>';
          }).join('') + '</dl></div>';
        }).join('');
    }

    // ---------- Acciones ----------
    function ponerValor(v) {
      filtroValor = v;
      q('valor').querySelectorAll('button').forEach(function (x) { x.classList.toggle('activo', x.getAttribute('data-valor') === v); });
    }
    function ponerVista(v) {
      vista = v;
      q('vista').querySelectorAll('button').forEach(function (x) { x.classList.toggle('activo', x.getAttribute('data-vista') === v); });
    }
    function limpiarTodo() {
      cerrarFiltro();
      q('q').value = '';
      FACETAS.forEach(function (f) { filtros[f.k].clear(); });
      rango = { min: null, max: null }; q('min').value = ''; q('max').value = '';
      ponerValor('');
    }
    function irAResultados() { q('resBox').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    function ejemplo(k) {
      limpiarTodo();
      if (k === 'pordep') ponerValor('pordep');
      else if (k === 'sinPlaca') filtros.placa.add('Pendiente de placa');
      else if (k === 'laptopsDep') { filtros.articulo.add('LAP TOP'); ponerValor('dep'); }
      else if (k === 'resumen') { agrupar = 'plaza'; q('agrupar').value = agrupar; ponerVista('resumen'); }
      filtrosCambiaron();
    }
    // Desde la tarjeta del MAF: abrir esta pestaña ya filtrada
    App.abrirConsultaMaf = function (que) {
      if (!App.maf) return;
      limpiarTodo();
      ponerVista('tabla');
      if (que === 'sinPlaca') filtros.placa.add('Pendiente de placa');
      else if (que === 'duplicadas') filtros.placa.add('Con placa duplicada');
      orden = que === 'duplicadas' ? { k: 'placa', dir: 1 } : orden;
      filtrosCambiaron();
      if (location.hash !== '#' + MODULO) location.hash = MODULO;
    };

    var espera = 0;
    q('q').addEventListener('input', function () { clearTimeout(espera); espera = setTimeout(function () { sel = null; actualizar(false); }, 180); });
    q('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(espera); sel = null; actualizar(false); } });
    var esperaRango = 0;
    ['min', 'max'].forEach(function (c) {
      q(c).addEventListener('input', function () {
        clearTimeout(esperaRango);
        esperaRango = setTimeout(function () { rango[c] = num(val(c)); filtrosCambiaron(); }, 300);
      });
    });
    q('agrupar').addEventListener('change', function () { agrupar = val('agrupar'); App.guardarPref('maf_agrupar', agrupar); pintar(); });

    cont.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.getAttribute('data-c') === 'gNombre') { e.preventDefault(); guardarBusqueda(); }
      if (e.key === 'Escape' && e.target.getAttribute('data-c') === 'gNombre') { guardando = false; pintarGuardadas(); }
    });
    cont.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;
      var b;
      if ((b = t.closest('[data-valor]'))) { ponerValor(b.getAttribute('data-valor')); filtrosCambiaron(); return; }
      if ((b = t.closest('[data-filtro]'))) { var fv = b.getAttribute('data-filtro'); ponerValor(filtroValor === fv ? '' : fv); filtrosCambiaron(); return; }
      if ((b = t.closest('[data-facet]'))) { abrirFiltro(b.getAttribute('data-facet')); return; }
      if ((b = t.closest('[data-anio]'))) {
        var a = b.getAttribute('data-anio');
        if (filtros.anio.has(a)) filtros.anio.delete(a); else filtros.anio.add(a);
        filtrosCambiaron(); return;
      }
      if ((b = t.closest('[data-quitar]'))) {
        var que = b.getAttribute('data-quitar');
        if (que === 'q') { q('q').value = ''; }
        else if (que === 'valor') ponerValor('');
        else if (que === 'rango') { rango = { min: null, max: null }; q('min').value = ''; q('max').value = ''; }
        else if (que === 'f') { var s = filtros[b.getAttribute('data-k')]; s.delete(Array.from(s)[Number(b.getAttribute('data-i'))]); }
        filtrosCambiaron(); return;
      }
      if ((b = t.closest('[data-vista]'))) { ponerVista(b.getAttribute('data-vista')); pintar(); return; }
      if ((b = t.closest('[data-cols]'))) { columnas = b.getAttribute('data-cols'); App.guardarPref('maf_columnas', columnas); pintar(); return; }
      if ((b = t.closest('[data-orden]'))) {
        var k = b.getAttribute('data-orden');
        orden = orden.k === k ? { k: k, dir: -orden.dir } : { k: k, dir: TIPO[k] === 'dinero' ? -1 : 1 };
        ordenar(); limite = PASO_FILAS; pintarTabla(); return;
      }
      if ((b = t.closest('[data-orden-res]'))) {
        var kr = b.getAttribute('data-orden-res');
        ordenRes = ordenRes.k === kr ? { k: kr, dir: -ordenRes.dir } : { k: kr, dir: kr === 't' ? 1 : -1 };
        pintarResumen(); return;
      }
      if ((b = t.closest('tr[data-res]'))) {
        var x = filasRes[Number(b.getAttribute('data-res'))];
        if (!x) return;
        filtros[agrupar] = new Set([x.v]);
        if (FAC[agrupar].extra) masAbierto = true;
        ponerVista('tabla');
        filtrosCambiaron(); irAResultados(); return;
      }
      if ((b = t.closest('tr[data-i]'))) {
        sel = resultados[Number(b.getAttribute('data-i'))] || null;
        cont.querySelectorAll('tr.actual').forEach(function (z) { z.classList.remove('actual'); });
        b.classList.add('actual');
        pintarFicha();
        q('fichaBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if ((b = t.closest('[data-copiar]'))) {
        var dato = b.getAttribute('data-copiar'), txt = b.textContent;
        copiar(dato).then(function () { b.textContent = 'Copiado ✓'; b.classList.add('hecho'); setTimeout(function () { b.textContent = txt; b.classList.remove('hecho'); }, 1300); });
        return;
      }
      if ((b = t.closest('[data-otros]'))) {
        var cr = b.getAttribute('data-otros');
        limpiarTodo(); filtros.area.add(cr); ponerVista('tabla'); filtrosCambiaron(); irAResultados(); return;
      }
      if ((b = t.closest('[data-ejemplo]'))) { ejemplo(b.getAttribute('data-ejemplo')); return; }
      if ((b = t.closest('[data-g]'))) { var gx = guardadas()[Number(b.getAttribute('data-g'))]; if (gx) aplicarEstado(gx); return; }
      if ((b = t.closest('[data-g-borrar]'))) {
        var i = Number(b.getAttribute('data-g-borrar')), gb = guardadas()[i];
        if (!gb) return;
        App.confirmar({ titulo: '¿Borrar la búsqueda guardada?', texto: '"' + gb.n + '". Los activos del MAF no se tocan.', aceptar: 'Borrar', peligro: true })
          .then(function (ok) { if (!ok) return; var g = guardadas(); g.splice(i, 1); App.guardarPref('maf_guardadas', g); pintarGuardadas(); });
        return;
      }
      var acc = (b = t.closest('[data-accion]')) ? b.getAttribute('data-accion') : '';
      if (acc === 'mas') { masAbierto = !masAbierto; cerrarFiltro(); pintarChips(); }
      else if (acc === 'quitarFiltros') { var tx = val('q'); limpiarTodo(); q('q').value = tx; filtrosCambiaron(); }
      else if (acc === 'verMas') { limite += PASO_FILAS; pintarTabla(); }
      else if (acc === 'exportar') exportar();
      else if (acc === 'imprimir') imprimir();
      else if (acc === 'gNueva') { guardando = true; pintarGuardadas(); }
      else if (acc === 'gCancelar') { guardando = false; pintarGuardadas(); }
      else if (acc === 'gGuardar') guardarBusqueda();
    });
    window.addEventListener('resize', fijarColumnas);

    function criterios() {
      return [{ Criterio: 'Búsqueda', Valor: val('q').trim() || '(ninguna)' }, { Criterio: 'Valor', Valor: VALORES[filtroValor] }]
        .concat(FACETAS.map(function (f) {
          return { Criterio: f.t, Valor: filtros[f.k].size ? Array.from(filtros[f.k], function (v) { return etiquetaDe(f, v); }).join(', ') : '(todos)' };
        }))
        .concat([{ Criterio: 'Valor neto', Valor: hayRango() ? (rango.min !== null ? 'desde ' + rango.min : '') + (rango.max !== null ? ' hasta ' + rango.max : '') : '(cualquiera)' },
          { Criterio: 'MAF (corte)', Valor: App.maf.fecha || '' }, { Criterio: 'Resultados', Valor: resultados.length }]);
    }
    function nombreArchivo(ext) {
      var t = val('q').trim().replace(/[\\/:*?"<>|]/g, ' ').slice(0, 40);
      return 'Consulta MAF ' + (t || (vista === 'resumen' ? 'resumen por ' + FAC[agrupar].t.toLowerCase() : 'filtros')) + ' ' + App.hoyLocal() + (ext || '');
    }
    function exportar() {
      if (vista === 'resumen') {
        var f = FAC[agrupar];
        var hojaRes = filasResumen().map(function (x) {
          var o = {}; o[f.t] = x.t; o.Activos = x.n; o['Con valor'] = x.con; o.Depreciados = x.dep; o['Valor neto'] = Math.round(x.neto * 100) / 100; o.Costo = Math.round(x.costo * 100) / 100; return o;
        });
        App.exportarExcel(nombreArchivo('.xlsx'), { Resumen: hojaRes, Criterios: criterios() });
        return;
      }
      if (!resultados.length) { q('nota').innerHTML = '<span class="err">Primero busque algo: no hay resultados que exportar.</span>'; return; }
      var filas = resultados.map(function (r) {
        var o = { Valor: textoValor(valorDe(r)) };
        COLS.forEach(function (c) { var x = r[c[0]]; o[c[1]] = c[2] ? (num(x) === null ? x : num(x)) : x; });
        return o;
      });
      App.exportarExcel(nombreArchivo('.xlsx'), { Resultados: filas, Criterios: criterios() });
    }

    // Hoja impresa (carta): criterios, indicadores y la tabla corta o el resumen
    function imprimir() {
      var esRes = vista === 'resumen';
      if (!esRes && !resultados.length) { q('nota').innerHTML = '<span class="err">Primero busque algo: no hay resultados que imprimir.</span>'; return; }
      var crit = criterios().filter(function (c) { return !/^\(/.test(String(c.Valor)) && c.Criterio !== 'Resultados' && c.Criterio !== 'MAF (corte)' && !(c.Criterio === 'Valor' && c.Valor === 'Todos'); });
      var cuerpo;
      if (esRes) {
        var f = FAC[agrupar], filas = filasResumen();
        cuerpo = '<h2>Resumen por ' + esc(f.t.toLowerCase()) + ' <small>(' + filas.length + ' grupos)</small></h2><table><thead><tr><th>' + esc(f.t) +
          '</th><th class="num">Activos</th><th class="num">Con valor</th><th class="num">Depreciados</th><th class="num">Valor neto</th><th class="num">Costo</th></tr></thead><tbody>' +
          filas.map(function (x) {
            return '<tr><td>' + esc(x.t) + '</td><td class="num">' + x.n.toLocaleString() + '</td><td class="num">' + x.con.toLocaleString() + '</td><td class="num">' + x.dep.toLocaleString() +
              '</td><td class="num">' + fmtEntero.format(x.neto) + '</td><td class="num">' + fmtEntero.format(x.costo) + '</td></tr>';
          }).join('') + '</tbody></table>';
      } else {
        var ver = resultados.slice(0, MAX_IMPRIMIR);
        cuerpo = '<h2>Activos <small>(' + resultados.length.toLocaleString() + (resultados.length > MAX_IMPRIMIR ? '; se imprimen los primeros ' + MAX_IMPRIMIR.toLocaleString() + ', el resto en Excel' : '') + ')</small></h2>' +
          '<table><thead><tr><th class="imp-n">#</th><th>Placa</th><th>No. Activo</th><th>Descripción</th><th>Marca</th><th>Modelo</th><th>Serie</th><th>Año</th><th class="num">Valor neto</th><th>Tienda</th><th>Valor</th></tr></thead><tbody>' +
          ver.map(function (r, i) {
            return '<tr><td class="imp-n">' + (i + 1) + '</td><td class="imp-placa">' + esc(r.placa) + '</td><td>' + esc(r.noActivo) + '</td><td>' + esc(r.descripcion) + '</td><td>' + esc(r.marca) +
              '</td><td>' + esc(r.modelo) + '</td><td>' + esc(r.serie) + '</td><td>' + esc(r.anioAdq) + '</td><td class="num">' + esc(dinero(r.valorNeto)) +
              '</td><td>' + esc(r.cr + ' ' + r.crDesc) + '</td><td>' + esc(textoValor(valorDe(r))) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      var lista = hayBusqueda() ? resultados : App.maf.registros, nCon = 0, nDep = 0, neto = 0;
      lista.forEach(function (r) { var v = valorDe(r); if (v.dep === true) nDep++; else if (v.dep === false) nCon++; if (v.neto !== null) neto += v.neto; });
      var html = '<div class="imp-cab"><div><h1>Consulta del MAF</h1><p>' + (crit.length ? crit.map(function (c) { return esc(c.Criterio + ': ' + c.Valor); }).join(' · ') : 'Todo el MAF') + '</p></div>' +
        '<div class="imp-fecha">' + esc(App.fechaTexto(App.hoyLocal())) + '<br><small>MAF: corte ' + esc(App.maf.fecha || '—') + '</small></div></div>' +
        '<div class="imp-res"><div><b>' + lista.length.toLocaleString() + '</b>activos</div><div><b>' + nCon.toLocaleString() + '</b>con valor</div>' +
        '<div><b>' + nDep.toLocaleString() + '</b>depreciados</div><div><b>' + fmtEntero.format(neto) + '</b>valor neto</div></div>' + cuerpo +
        '<div class="imp-pie">Generado con el aplicativo de Activo Fijo. Solo consulta del MAF.</div>';
      App.imprimir(html, nombreArchivo(''));
    }

    App.registrarEscaner(MODULO, { placa: q('q'), alLeer: function () { clearTimeout(espera); sel = null; actualizar(true); } });

    App.alMaf(function (maf) {
      clearTimeout(trozo);
      claves = null; armadas = 0; info = new Map(); sel = null; baseCache = { t: null, regs: null };
      duplicadas = new Set((maf.placasDuplicadas || []).map(function (p) { return AF.util.llavePlaca(p); }));
      cerrarFiltro();
      trozo = setTimeout(armarEnFondo, 1500);
      var completo = maf.registros.some(function (r) { return r.costo !== undefined; });
      q('aviso').innerHTML = completo ? '' : '<div class="warn">El MAF guardado en este navegador se cargó con una versión anterior y no trae todas las columnas (costo, depreciación, vida útil). Vuelva a cargar el archivo del MAF para verlas.</div>';
      actualizar(false);
    });
  };
})();
