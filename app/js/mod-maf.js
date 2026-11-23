/*
 * Consultar el MAF (solo lectura).
 * Buscar por placa, No. Activo, serie, CR, tienda o artículo y ver todas las columnas del MAF,
 * con el año de adquisición y si el activo ya está depreciado o todavía tiene valor.
 * Aquí no se captura ni se modifica nada.
 */
(function () {
  'use strict';
  var App = window.AFApp, esc = App.esc;
  var MODULO = 'maf';
  var MAX_FILAS = 200;

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
  var ETIQ = {};
  COLS.forEach(function (c) { ETIQ[c[0]] = c[1]; });
  var GRUPOS = [
    ['Ubicación', ['plazaDesc', 'plaza', 'distrito', 'cr', 'crDesc']],
    ['Equipo', ['descripcion', 'descAdic', 'marca', 'modelo', 'serie', 'departamento', 'descPuesto']],
    ['Identificación', ['placa', 'plaqueable', 'noActivo', 'noLegacy', 'cveActivo', 'cuenta', 'subcuenta', 'familia', 'origen']],
    ['Adquisición y valor', ['mesAdq', 'anioAdq', 'factura', 'costo', 'deprnAcum', 'deprnAnual', 'valorNeto', 'vidaUtil', 'remanente']]
  ];

  var fmtDinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var fmtEntero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
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
    return { dep: dep, costo: costo, neto: neto, acum: acum, rem: rem, vida: vida, pct: pct };
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
      : v.dep ? '<span class="valor-p dep">Depreciado</span>' : '<span class="valor-p con">Con valor</span>';
  }

  window.AFMaf = function () {
    var cont = document.getElementById('mod-' + MODULO);
    var claves = null;          // texto de búsqueda por registro (se arma la primera vez que se busca)
    var resultados = [];        // registros que cumplen búsqueda y filtros
    var info = new Map();       // registro -> infoValor (cache)
    var filtroValor = '';       // '' | 'con' | 'dep'
    var sel = null;             // registro con la ficha abierta
    var completo = true;        // ¿el MAF guardado trae todas las columnas?

    // Filtros de columna como en Excel: cada uno con varios valores marcados (vacío = sin filtro)
    var FACETAS = [
      { k: 'plaza', t: 'Plaza', val: function (r) { return [r.plazaDesc, r.plaza].filter(Boolean).join(' '); } },
      { k: 'area', t: 'Tienda / área', val: function (r) { return r.cr; },
        etiqueta: function (v) { var l = App.maf.idx.porCr.get(v); return (l && l[0].crDesc ? l[0].crDesc + ' — ' : '') + v; } },
      { k: 'articulo', t: 'Artículo', val: function (r) { return r.descripcion; } },
      { k: 'marca', t: 'Marca', val: function (r) { return r.marca; } },
      { k: 'anio', t: 'Año de adquisición', val: function (r) { return String(r.anioAdq || ''); }, desc: true }
    ];
    var FAC = {};
    var filtros = {};
    FACETAS.forEach(function (f) { FAC[f.k] = f; filtros[f.k] = new Set(); });
    function etiquetaDe(f, v) { return v === '' ? '(vacías)' : f.etiqueta ? f.etiqueta(v) : v; }
    function hayFiltros() { return FACETAS.some(function (f) { return filtros[f.k].size; }); }

    cont.innerHTML =
      '<fieldset><legend>1. Buscar en el MAF</legend>' +
      '<div class="buscador"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>' +
      '<input data-c="q" type="search" autocomplete="off" spellcheck="false" placeholder="Placa, No. Activo, serie, CR, tienda o artículo (ej. laptop tijuana este)"></div>' +
      '<div class="filtros-maf"><div class="opciones" data-c="valor">' +
        '<button data-valor="" class="activo">Todos</button><button data-valor="con">Con valor</button><button data-valor="dep">Depreciados</button></div></div>' +
      '<div class="chips-filtro" data-c="chips"></div>' +
      '<div class="muted">Filtros como en Excel: en cada uno puede marcar varios (por ejemplo, varios artículos y varios años). Cada lista solo ofrece lo que existe con los demás filtros. Solo consulta: aquí no se cambia nada.</div>' +
      '<div data-c="aviso"></div>' +
      '<div data-c="stats"></div></fieldset>' +
      '<fieldset data-c="fichaBox" class="oculto"><legend>Ficha del activo</legend><div data-c="ficha"></div></fieldset>' +
      '<fieldset><legend>2. Resultados (<span data-c="n">0</span>)</legend>' +
      '<div class="botones"><button data-accion="exportar">Exportar resultados a Excel</button></div>' +
      '<div data-c="nota" class="muted"></div>' +
      '<div class="scroll maf-tabla"><table data-c="tabla"></table></div></fieldset>';

    var q = function (n) { return cont.querySelector('[data-c="' + n + '"]'); };
    var val = function (n) { var e = q(n); return e ? e.value : ''; };

    App.registrarContexto(MODULO, function () {
      var t = val('q').trim();
      var nf = FACETAS.filter(function (f) { return filtros[f.k].size; }).length + (filtroValor ? 1 : 0);
      return ['Consulta del MAF', t ? '“' + t + '”' : 'sin búsqueda', nf ? App.cuenta(nf, 'filtro', 'filtros') : '',
        App.cuenta(resultados.length, 'resultado', 'resultados')].filter(Boolean).join(' · ');
    });

    function valorDe(r) { var v = info.get(r); if (!v) { v = infoValor(r); info.set(r, v); } return v; }
    // Texto de búsqueda de un registro: minúsculas, sin acentos, signos como espacio ("P/CHECK" -> "p check"),
    // y cada dato separado por | para que una palabra no junte dos datos
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
        if (f.k !== excepto && s.size && !s.has(f.val(r))) return false;
      }
      if (filtroValor) { var d = valorDe(r).dep; if (filtroValor === 'dep' ? d !== true : d !== false) return false; }
      return true;
    }
    var baseCache = { t: null, regs: null };
    function base() {
      var t = val('q').trim();
      if (baseCache.t !== t || !baseCache.regs) baseCache = { t: t, regs: buscar(t) };
      return baseCache.regs;
    }

    function actualizar(desdeEscaner) {
      if (!App.maf) return;
      var b = hayBusqueda() ? base() : [];
      resultados = b.filter(function (r) { return pasa(r, null); });
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

    // ---------- Chips de filtro y lista desplegable (como el filtro de Excel) ----------
    function pintarChips() {
      var html = FACETAS.map(function (f) {
        var s = filtros[f.k], n = s.size, det = '';
        if (n === 1) det = etiquetaDe(f, s.values().next().value);
        else if (n > 1) det = n + ' seleccionados';
        return '<button class="chip-f' + (n ? ' on' : '') + (pop.k === f.k ? ' abierto' : '') + '" data-facet="' + f.k + '" aria-haspopup="listbox">' +
          '<span>' + esc(f.t) + '</span>' + (det ? '<b>' + esc(det) + '</b>' : '') +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>';
      }).join('');
      if (hayFiltros() || filtroValor) html += '<button class="chip-quitar" data-accion="quitarFiltros">Quitar filtros</button>';
      q('chips').innerHTML = html;
    }

    var MAX_OPC = 400;
    var pop = { k: '', opciones: [], visibles: [] };
    var popEl = document.createElement('div');
    popEl.className = 'filtro-pop oculto';
    popEl.setAttribute('role', 'dialog');
    popEl.innerHTML = '<span class="hoja-asa" aria-hidden="true"></span>' +
      '<div class="pop-cab"><b data-p="titulo"></b><button class="palomita" data-p="listo">Listo</button></div>' +
      '<div class="buscador chico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>' +
      '<input data-p="q" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar en la lista"></div>' +
      '<div class="pop-acc"><button data-p="marcar">Marcar los de la lista</button><button data-p="limpiar">Sin filtro</button></div>' +
      '<div class="pop-estado muted" data-p="estado"></div>' +
      '<div class="pop-lista" data-p="lista" role="listbox" aria-multiselectable="true"></div>';
    document.body.appendChild(popEl);
    var pp = function (n) { return popEl.querySelector('[data-p="' + n + '"]'); };

    function abrirFiltro(k, chip) {
      if (!App.maf) return;
      if (pop.k === k) { cerrarFiltro(); return; }
      var f = FAC[k], cuenta = new Map();
      // Opciones = lo que existe con la búsqueda y los demás filtros (igual que Excel)
      base().forEach(function (r) { if (pasa(r, k)) { var v = f.val(r); cuenta.set(v, (cuenta.get(v) || 0) + 1); } });
      filtros[k].forEach(function (v) { if (!cuenta.has(v)) cuenta.set(v, 0); });
      pop.k = k;
      pop.opciones = Array.from(cuenta, function (e) { return { v: e[0], n: e[1], t: etiquetaDe(f, e[0]) }; }).sort(function (a, b) {
        if (a.v === '' || b.v === '') return a.v === '' ? 1 : -1;
        return f.desc ? String(b.v).localeCompare(String(a.v), 'es', { numeric: true }) : a.t.localeCompare(b.t, 'es', { numeric: true });
      });
      pop.opciones.forEach(function (o) { o.llave = normal(o.t); });
      pp('titulo').textContent = f.t;
      pp('q').value = '';
      popEl.classList.remove('oculto');
      colocarPop();
      pintarPop();
      pintarChips();
      if (window.innerWidth >= 600) pp('q').focus({ preventScroll: true });
    }
    // Debajo de su pastilla (en teléfono el CSS la vuelve hoja de abajo y no usa estas medidas)
    function colocarPop() {
      var chip = q('chips').querySelector('[data-facet="' + pop.k + '"]');
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

    function pintar() {
      var todos = !hayBusqueda();
      var lista = todos ? App.maf.registros : resultados;
      // Indicadores: de los resultados, o de todo el MAF si aún no se busca nada
      var nCon = 0, nDep = 0, neto = 0, costo = 0;
      if (!todos || lista.length) {
        lista.forEach(function (r) {
          var v = valorDe(r);
          if (v.dep === true) nDep++; else if (v.dep === false) nCon++;
          if (v.neto !== null) neto += v.neto;
          if (v.costo !== null) costo += v.costo;
        });
      }
      q('stats').innerHTML = App.indicadores([
        { n: lista.length, txt: todos ? 'activos en todo el MAF' : 'resultados' },
        { n: nCon, txt: 'con valor', cls: 'ok' },
        { n: nDep, txt: 'depreciados', cls: nDep ? 'warn' : '' },
        { n: fmtEntero.format(neto), txt: 'valor neto' + (todos ? ' total' : '') },
        { n: fmtEntero.format(costo), txt: 'costo' + (todos ? ' total' : '') }
      ]);
      q('n').textContent = resultados.length.toLocaleString();
      pintarChips();

      if (todos) {
        q('nota').textContent = '';
        q('tabla').innerHTML = '<tr><td class="vacio-maf">Escriba o escanee qué buscar (placa, No. Activo, serie, CR, tienda o artículo), o use los filtros de Plaza, Tienda / área, Artículo, Marca y Año.</td></tr>';
      } else if (!resultados.length) {
        q('nota').textContent = '';
        q('tabla').innerHTML = '<tr><td class="vacio-maf">No hay activos en el MAF con esa búsqueda y esos filtros.</td></tr>';
      } else {
        var ver = resultados.slice(0, MAX_FILAS);
        q('nota').textContent = resultados.length > MAX_FILAS
          ? 'Se muestran los primeros ' + MAX_FILAS + ' de ' + resultados.length.toLocaleString() + '. Afine la búsqueda o exporte para verlos todos.' : 'Toque un renglón para ver su ficha.';
        q('tabla').innerHTML = '<thead><tr><th>Valor</th>' + COLS.map(function (c) { return '<th' + (c[2] ? ' class="num"' : '') + '>' + esc(c[1]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          ver.map(function (r, i) {
            return '<tr class="clic' + (r === sel ? ' actual' : '') + '" data-i="' + i + '"><td>' + pastilla(valorDe(r)) + '</td>' + COLS.map(function (c) {
              var v = c[2] === 'dinero' ? dinero(r[c[0]]) : r[c[0]];
              return '<td' + (c[2] ? ' class="num"' : '') + '>' + esc(v == null ? '' : v) + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody>';
      }
      pintarFicha();
      App.pintarContexto();
    }

    function pintarFicha() {
      var box = q('fichaBox');
      if (!sel) { box.classList.add('oculto'); q('ficha').innerHTML = ''; return; }
      box.classList.remove('oculto');
      var r = sel, v = valorDe(r);
      var adq = r.mesAdq && r.anioAdq ? String(r.mesAdq).padStart(2, '0') + '/' + r.anioAdq : r.anioAdq || '';
      var anios = num(r.anioAdq) ? new Date().getFullYear() - num(r.anioAdq) : null;
      var resumen;
      if (v.dep === null) resumen = 'El MAF no trae datos de valor para este activo.';
      else if (v.dep) resumen = 'Ya cumplió su vida útil' + (v.neto ? '; le queda el valor de rescate de ' + dinero(v.neto) : '') + '.';
      else resumen = 'Valor neto ' + dinero(v.neto) + (v.rem !== null ? '; le quedan ' + App.cuenta(v.rem, 'mes', 'meses') + ' de vida útil' : '') + '.';
      q('ficha').innerHTML =
        '<div class="ficha-maf-cab"><div><div class="ficha-maf-t">' + esc(r.descripcion) + (r.descAdic ? ' <span class="muted">' + esc(r.descAdic) + '</span>' : '') + '</div>' +
          '<div class="muted">Activo <b>' + esc(r.noActivo) + '</b>' + (r.placa ? ' · Placa <b>' + esc(r.placa) + '</b>' : ' · Sin placa') +
          ' · ' + esc(r.cr + ' ' + r.crDesc) + '</div></div>' + pastilla(v) + '</div>' +
        '<div class="ficha-maf-valor">' +
          '<div><span>Adquirido</span><b>' + esc(adq || '—') + '</b>' + (anios !== null ? '<small>' + (anios <= 0 ? 'este año' : 'hace ' + App.cuenta(anios, 'año', 'años')) + '</small>' : '') + '</div>' +
          '<div><span>Costo</span><b>' + esc(dinero(r.costo) || '—') + '</b></div>' +
          '<div><span>Depreciación acumulada</span><b>' + esc(dinero(r.deprnAcum) || '—') + '</b>' + (v.pct !== null ? '<small>' + Math.round(v.pct) + '% del costo</small>' : '') + '</div>' +
          '<div><span>Valor neto</span><b>' + esc(dinero(r.valorNeto) || '—') + '</b></div>' +
        '</div>' +
        (v.pct !== null ? '<div class="dep-barra" title="' + Math.round(v.pct) + '% depreciado"><i style="width:' + v.pct.toFixed(1) + '%"></i></div>' : '') +
        '<div class="muted dep-txt">' + esc(resumen) + (v.vida !== null ? ' Vida útil: ' + App.cuenta(v.vida, 'mes', 'meses') + '.' : '') + '</div>' +
        GRUPOS.map(function (g) {
          return '<div class="ficha"><div class="ficha-t">' + esc(g[0]) + '</div><dl class="kv">' + g[1].map(function (k) {
            var c = COLS.filter(function (x) { return x[0] === k; })[0];
            var vv = c && c[2] === 'dinero' ? dinero(r[k]) : r[k];
            return '<div><dt>' + esc(ETIQ[k]) + '</dt><dd>' + esc(vv == null ? '' : vv) + '</dd></div>';
          }).join('') + '</dl></div>';
        }).join('');
    }

    // ---------- Eventos ----------
    var espera = 0;
    q('q').addEventListener('input', function () { clearTimeout(espera); espera = setTimeout(function () { sel = null; actualizar(false); }, 180); });
    q('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(espera); sel = null; actualizar(false); } });
    function ponerValor(v) {
      filtroValor = v;
      q('valor').querySelectorAll('button').forEach(function (x) { x.classList.toggle('activo', x.getAttribute('data-valor') === v); });
    }
    cont.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-valor]');
      if (b) {
        ponerValor(b.getAttribute('data-valor'));
        filtrosCambiaron();
        return;
      }
      var chip = e.target.closest && e.target.closest('[data-facet]');
      if (chip) { abrirFiltro(chip.getAttribute('data-facet'), chip); return; }
      if (e.target.closest && e.target.closest('[data-accion="quitarFiltros"]')) {
        cerrarFiltro();
        FACETAS.forEach(function (f) { filtros[f.k].clear(); });
        ponerValor('');
        filtrosCambiaron();
        return;
      }
      if (e.target.closest && e.target.closest('[data-accion="exportar"]')) { exportar(); return; }
      var tr = e.target.closest && e.target.closest('tr[data-i]');
      if (tr) {
        sel = resultados[Number(tr.getAttribute('data-i'))] || null;
        cont.querySelectorAll('tr.actual').forEach(function (x) { x.classList.remove('actual'); });
        tr.classList.add('actual');
        pintarFicha();
        q('fichaBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    function exportar() {
      if (!resultados.length) { q('nota').innerHTML = '<span class="err">Primero busque algo: no hay resultados que exportar.</span>'; return; }
      var filas = resultados.map(function (r) {
        var v = valorDe(r), o = { Valor: v.dep === null ? 'Sin dato' : v.dep ? 'Depreciado' : 'Con valor' };
        COLS.forEach(function (c) { var x = r[c[0]]; o[c[1]] = c[2] ? (num(x) === null ? x : num(x)) : x; });
        return o;
      });
      var t = val('q').trim().replace(/[\\/:*?"<>|]/g, ' ').slice(0, 40);
      // Segunda hoja con lo que se buscó y los filtros puestos, para saber de dónde salió el listado
      var criterios = [{ Criterio: 'Búsqueda', Valor: val('q').trim() || '(ninguna)' }, { Criterio: 'Valor', Valor: { '': 'Todos', con: 'Con valor', dep: 'Depreciados' }[filtroValor] }]
        .concat(FACETAS.map(function (f) {
          return { Criterio: f.t, Valor: filtros[f.k].size ? Array.from(filtros[f.k], function (v) { return etiquetaDe(f, v); }).join(', ') : '(todos)' };
        }))
        .concat([{ Criterio: 'MAF (corte)', Valor: App.maf.fecha || '' }, { Criterio: 'Resultados', Valor: resultados.length }]);
      App.exportarExcel('Consulta MAF ' + (t || 'filtros') + ' ' + App.hoyLocal() + '.xlsx', { Resultados: filas, Criterios: criterios });
    }

    App.registrarEscaner(MODULO, { placa: q('q'), alLeer: function () { clearTimeout(espera); sel = null; actualizar(true); } });

    App.alMaf(function (maf) {
      clearTimeout(trozo);
      claves = null; armadas = 0; info = new Map(); sel = null; baseCache = { t: null, regs: null };
      cerrarFiltro();
      trozo = setTimeout(armarEnFondo, 1500);
      completo = maf.registros.some(function (r) { return r.costo !== undefined; });
      q('aviso').innerHTML = completo ? '' : '<div class="warn">El MAF guardado en este navegador se cargó con una versión anterior y no trae todas las columnas (costo, depreciación, vida útil). Vuelva a cargar el archivo del MAF para verlas.</div>';
      actualizar(false);
    });
  };
})();
