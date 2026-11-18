/*
 * Núcleo compartido por los módulos (Movimientos, Plaqueo, Anexo 3):
 * carga del MAF, almacenamiento local, listas de tiendas, enlace CR <-> tienda,
 * memoria de lo ya generado y botones para descargar el Excel o borrar la captura.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var LS_HIST = 'af_historial';
  var LS_ENV = 'af_enviados';
  // Módulos con captura propia (cuentan como memoria compartida) y módulos de navegación
  var MODULOS = ['movimientos', 'plaqueo', 'anexo3', 'levantamiento'];
  var NAV = ['movimientos', 'plaqueo', 'anexo3', 'levantamiento', 'consultas'];

  var App = {
    maf: null,
    historial: [],
    _alMaf: [],
    _alCambioExterno: []
  };

  // ---------- Utilidades ----------
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hoyLocal() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fechaTexto(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }
  App.esc = esc; App.hoyLocal = hoyLocal; App.fechaTexto = fechaTexto;
  App.cuenta = function (n, una, varias) { return n + ' ' + (n === 1 ? una : varias); };

  // ---------- Almacenamiento local ----------
  App.leerLS = function (k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
  App.guardarLS = function (k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { avisoAlmacen('No se pudo guardar la captura en este navegador. Si cierra o recarga la página se perderá: genere el Excel antes de salir.'); return false; }
  };
  function avisoAlmacen(msg) { $('avisoAlmacen').textContent = msg; $('avisoAlmacen').classList.remove('oculto'); }
  function revisarAlmacen() {
    try { localStorage.setItem('af_prueba', '1'); localStorage.removeItem('af_prueba'); }
    catch (e) { avisoAlmacen('Este navegador no permite guardar datos (¿ventana de incógnito o datos bloqueados?). La captura se pierde al cerrar o recargar: genere el Excel antes de salir.'); }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* opcional */ }
  }

  function idb(modo, fn) {
    return new Promise(function (ok, mal) {
      try {
        var req = indexedDB.open('af_movimientos', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('maf'); };
        req.onerror = function () { mal(req.error); };
        req.onsuccess = function () {
          try {
            var db = req.result;
            var tx = db.transaction('maf', modo);
            var r = fn(tx.objectStore('maf'));
            tx.oncomplete = function () { db.close(); ok(r && r.result); };
            tx.onerror = function () { db.close(); mal(tx.error); };
          } catch (e) { mal(e); }
        };
      } catch (e) { mal(e); }
    });
  }

  // ---------- Captura por módulo y memoria compartida ----------
  // Cada módulo guarda su captura en af_lote_<modulo>. Lo que otro módulo (u otra ventana) tenga
  // capturado cuenta como "ya usado", igual que lo de Excel ya guardados (af_historial).
  function llaveLote(modulo) { return 'af_lote_' + modulo; }
  App.leerLote = function (modulo) {
    var filas = App.leerLS(llaveLote(modulo), null);
    if (!filas && modulo === 'movimientos') filas = App.leerLS('af_lote', []); // captura de la versión anterior
    return filas || [];
  };
  App.guardarLote = function (modulo, filas) { var ok = App.guardarLS(llaveLote(modulo), filas); pintarNav(); return ok; };

  function entradas(filas, modulo) {
    return (filas || []).map(function (f) {
      return { tipo: f.tipo, placa: f.placa, noActivo: f.noActivo, fecha: f.fecha, cr: f.cr, crDestino: f.crDestino || '', modulo: modulo };
    });
  }
  /**
   * Memoria para validar en un módulo: Excel ya guardados + lo capturado en los otros módulos.
   * Una baja en el formato V.2 y la misma baja en el Anexo 3 son documentos distintos del mismo
   * movimiento: entre ellos solo se avisa (tipo BAJA_OTRO), no se bloquea.
   */
  App.historialPara = function (modulo) {
    var todo = App.historial.slice();
    MODULOS.forEach(function (m) { if (m !== modulo) todo = todo.concat(entradas(App.leerLote(m), m)); });
    return todo.map(function (e) {
      var origen = e.modulo || 'movimientos';
      if (e.tipo === 'BAJA' && origen !== modulo && (origen === 'anexo3' || modulo === 'anexo3')) {
        var c = {}; Object.keys(e).forEach(function (k) { c[k] = e[k]; }); c.tipo = 'BAJA_OTRO';
        return c;
      }
      return e;
    });
  };
  /** Pasa lo capturado de un módulo a la memoria de Excel ya guardados */
  App.memorizar = function (filas, modulo) {
    App.historial = App.historial.concat(entradas(filas, modulo));
    App.guardarLS(LS_HIST, App.historial);
  };

  /**
   * Movimientos enviados (Excel generados) para el seguimiento contra el MAF siguiente.
   * No se depura solo: el usuario quita lo aplicado desde Consultas > Seguimiento.
   */
  function llaveEnv(e) { return [e.tipo, e.noActivo, AF.util.llavePlaca(e.placa || ''), e.crDestino || ''].join('|'); }
  App.leerEnviados = function () { return App.leerLS(LS_ENV, []); };
  App.guardarEnviados = function (lista) { return App.guardarLS(LS_ENV, lista); };
  App.registrarEnviados = function (filas, modulo, archivo) {
    var lista = App.leerEnviados(), ya = {};
    lista.forEach(function (e) { ya[llaveEnv(e)] = 1; });
    var hoy = fechaTexto(hoyLocal());
    (filas || []).forEach(function (f) {
      var e = { tipo: f.tipo, noActivo: f.noActivo, placa: f.placa || '', cr: f.cr, tienda: f.tienda || '', crDestino: f.crDestino || '', tiendaDestino: f.tiendaDestino || '',
        descripcion: f.descripcion || '', motivo: f.motivo || '', fecha: f.fecha || '', generado: hoy, archivo: archivo, modulo: modulo,
        mafCorte: App.maf ? App.maf.fecha || '' : '' };
      if (ya[llaveEnv(e)]) return;
      ya[llaveEnv(e)] = 1;
      lista.push(e);
    });
    App.guardarEnviados(lista);
  };

  App.alMaf = function (fn) { App._alMaf.push(fn); if (App.maf) fn(App.maf); };
  /** fn repinta el módulo con lo que otros módulos capturaron; corre al entrar al módulo y si otra pestaña cambia algo */
  App.alCambioExterno = function (modulo, fn) { App._alCambioExterno.push({ modulo: modulo, fn: fn }); };
  // Otra pestaña del navegador con el aplicativo cambió su captura o la memoria
  window.addEventListener('storage', function (e) {
    if (!e.key || !/^af_(lote|historial|enviados|levantamiento)/.test(e.key)) return;
    if (e.key === LS_HIST) App.historial = App.leerLS(LS_HIST, []);
    pintarNav();
    App._alCambioExterno.forEach(function (c) { c.fn(); });
  });

  // ---------- MAF ----------
  function mostrarEstadoMaf() {
    var m = App.maf;
    $('modulos').classList.toggle('oculto', !m);       // sin MAF no hay nada que capturar
    // Con MAF cargado la zona para arrastrar se hace compacta ("Arrastre otro MAF"); sin MAF es grande
    $('zonaMaf').classList.toggle('compacta', !!m);
    $('zonaMaf').querySelector('.zona-t1').textContent = m ? 'Arrastre aquí otro MAF' : 'Arrastre aquí el MAF';
    $('sinMaf').classList.toggle('oculto', !!m);
    if (!m) { $('estadoMaf').innerHTML = ''; return; }
    // Tarjeta mínima: solo la zona para arrastrar y una línea con lo esencial del MAF
    $('estadoMaf').innerHTML = '<div class="maf-linea"><span class="maf-ok" title="' + esc(m.archivo || '') + '">MAF listo</span>' +
      '<span class="maf-dato"><b>' + m.total.toLocaleString() + '</b> activos</span>' +
      '<span class="maf-dato warn"><b>' + m.sinPlaca.toLocaleString() + '</b> sin placa</span>' +
      (m.placasDuplicadas.length ? '<span class="maf-dato err" title="Placas duplicadas en el MAF: ' + esc(m.placasDuplicadas.join(', ')) + '"><b>' + m.placasDuplicadas.length + '</b> duplicadas</span>' : '') +
      '</div><div class="muted maf-corte" title="' + esc(m.archivo || '') + '">' + esc(m.archivo || '') + ' · corte ' + esc(m.fecha || 's/f') + '</div>';
  }

  // Dato chico del MAF (cuánto tardó, si se recuperó) junto a la fecha de corte, no suelto debajo de los indicadores
  function notaMaf(texto) {
    var c = $('estadoMaf').querySelector('.maf-corte');
    if (c) c.insertAdjacentHTML('beforeend', ' · ' + esc(texto));
    else $('estadoMaf').insertAdjacentHTML('beforeend', ' <span class="muted">(' + esc(texto) + ')</span>');
  }

  function usarMaf(m) {
    App.maf = m;
    App.historial = AF.depurarHistorial(m, App.leerLS(LS_HIST, []));
    App.guardarLS(LS_HIST, App.historial);
    llenarListasTiendas();
    mostrarEstadoMaf();
    App._alMaf.forEach(function (fn) { fn(m); });
    App.pintarContexto();
    if (registro) registro.placa.focus({ preventScroll: true });
  }

  function llenarListasTiendas() {
    var lt = $('listaTiendas'), lc = $('listaCr');
    lt.innerHTML = ''; lc.innerHTML = '';
    AF.tiendas(App.maf).forEach(function (t) {
      var o = document.createElement('option'); o.value = t.tienda; o.label = t.cr; lt.appendChild(o);
      var p = document.createElement('option'); p.value = t.cr; p.label = t.tienda; lc.appendChild(p);
    });
  }

  // Lectura en segundo plano (Web Worker) para que la página no se congele
  var LECTURA = { type: 'array', dense: true, cellStyles: false, cellNF: false, cellHTML: false };

  function leerMafDirecto(buf) {
    var wb = XLSX.read(buf, LECTURA);
    var hojas = {};
    wb.SheetNames.forEach(function (n) { hojas[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); });
    var m = AF.cargarMAF(hojas);
    return { fecha: m.fecha, hoja: m.hoja, registros: m.registros };
  }

  function crearWorker() {
    var cod = function (sel) { var s = document.querySelector('script[data-src="' + sel + '"]'); return s ? s.textContent : null; };
    var xlsx = cod('lib/xlsx.full.min.js'), engine = cod('js/engine.js');
    var cabeza;
    if (xlsx && engine) cabeza = xlsx + '\n;\n' + engine + '\n;\n';
    else if (/^https?:/.test(location.protocol)) cabeza = 'importScripts(' + JSON.stringify(new URL('lib/xlsx.full.min.js', location.href).href) + ',' + JSON.stringify(new URL('js/engine.js', location.href).href) + ');\n';
    else return null;
    var cuerpo = 'var LECTURA=' + JSON.stringify(LECTURA) + ';\n' +
      'self.onmessage=function(e){try{' +
      'var wb=XLSX.read(e.data,LECTURA);postMessage({etapa:"Interpretando columnas"});' +
      'var hojas={};wb.SheetNames.forEach(function(n){hojas[n]=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:""});});' +
      'wb=null;var m=self.AF.cargarMAF(hojas);' +
      'postMessage({ok:true,maf:{fecha:m.fecha,hoja:m.hoja,registros:m.registros}});' +
      '}catch(err){postMessage({ok:false,error:err.message});}};';
    try {
      var url = URL.createObjectURL(new Blob([cabeza + cuerpo], { type: 'text/javascript' }));
      var w = new Worker(url);
      URL.revokeObjectURL(url);
      return w;
    } catch (e) { return null; }
  }

  function leerMaf(buf, alAvance) {
    return new Promise(function (ok, mal) {
      var w = crearWorker();
      var directo = function (b) {
        alAvance('Leyendo (la página puede no responder unos segundos)');
        setTimeout(function () { try { ok(leerMafDirecto(b)); } catch (e) { mal(e); } }, 30);
      };
      if (!w) { directo(buf); return; }
      var copia = buf.slice(0);
      w.onmessage = function (e) {
        if (e.data.etapa) { alAvance(e.data.etapa); return; }
        w.terminate();
        if (e.data.ok) ok(e.data.maf); else mal(new Error(e.data.error));
      };
      w.onerror = function (ev) { ev.preventDefault(); w.terminate(); directo(copia); };
      w.postMessage(buf, [buf]);
    });
  }

  $('otroMaf').addEventListener('click', function () { $('archivoMaf').click(); });

  // Arrastrar y soltar el MAF: en la zona o en cualquier parte de la ventana (usa la misma carga que el botón)
  var arrastres = 0;
  function conArchivos(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
  function marcarArrastre(si) { document.body.classList.toggle('arrastrando', si); }
  document.addEventListener('dragenter', function (e) { if (!conArchivos(e)) return; e.preventDefault(); arrastres++; marcarArrastre(true); });
  document.addEventListener('dragover', function (e) { if (!conArchivos(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  document.addEventListener('dragleave', function (e) { if (!conArchivos(e)) return; arrastres = Math.max(0, arrastres - 1); if (!arrastres) marcarArrastre(false); });
  document.addEventListener('drop', function (e) {
    if (!conArchivos(e)) return;
    e.preventDefault(); arrastres = 0; marcarArrastre(false);
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || $('archivoMaf').disabled) return;
    if (!/\.(xlsx|xls|xlsb|csv)$/i.test(f.name)) { $('estadoMaf').innerHTML = '<span class="err">"' + esc(f.name) + '" no es un Excel. Arrastre el archivo del MAF (.xlsx).</span>'; return; }
    var dt = new DataTransfer(); dt.items.add(f);
    $('archivoMaf').files = dt.files;
    $('archivoMaf').dispatchEvent(new Event('change', { bubbles: true }));
  });
  $('archivoMaf').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var t0 = Date.now(), etapa = 'Leyendo el archivo';
    function pintar() {
      $('estadoMaf').textContent = etapa + ' ' + f.name + '… ' + Math.round((Date.now() - t0) / 1000) + ' s (el MAF completo tarda unos 10-20 s)';
    }
    pintar();
    var reloj = setInterval(pintar, 500);
    $('archivoMaf').disabled = true;
    f.arrayBuffer().then(function (buf) {
      return leerMaf(buf, function (txt) { etapa = txt; pintar(); });
    }).then(function (datos) {
      etapa = 'Preparando índices'; pintar();
      clearInterval(reloj);
      var m = AF.indexarMAF(datos);
      m.archivo = f.name;
      usarMaf(m);
      notaMaf('cargado en ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
      return idb('readwrite', function (s) { return s.put({ fecha: m.fecha, hoja: m.hoja, archivo: m.archivo, registros: m.registros }, 'actual'); })
        .catch(function () { $('estadoMaf').innerHTML += ' <span class="warn">— no se pudo guardar el MAF en el navegador; habrá que cargarlo de nuevo al abrir la página.</span>'; });
    }).catch(function (err) {
      $('estadoMaf').innerHTML = '<span class="err">' + esc(err.message) + '</span>';
    }).then(function () {
      clearInterval(reloj);
      $('archivoMaf').disabled = false;
      $('archivoMaf').value = '';
    });
  });

  // ---------- CR <-> tienda ----------
  /** Enlaza un campo de CR con uno de nombre de tienda; alCambiar(cr) se llama cuando cambia la tienda */
  App.enlazarTienda = function (inCr, inTienda, spanPlaza, alCambiar) {
    function desdeCr() {
      if (!App.maf) return;
      var t = AF.tiendaDeCr(App.maf, inCr.value);
      if (t) inTienda.value = t.tienda;
      if (spanPlaza) spanPlaza.textContent = inCr.value ? (t ? t.plaza : 'CR no encontrado en el MAF') : '';
      if (alCambiar) alCambiar();
    }
    function desdeTienda() {
      if (!App.maf) return;
      var t = AF.crDeTienda(App.maf, inTienda.value);
      if (t) {
        inCr.value = t.cr;
        if (spanPlaza) spanPlaza.textContent = t.plaza;
        if (alCambiar) alCambiar();
      } else if (!inTienda.value) { inCr.value = ''; if (spanPlaza) spanPlaza.textContent = ''; if (alCambiar) alCambiar(); }
    }
    inCr.addEventListener('input', desdeCr);
    inTienda.addEventListener('input', desdeTienda);
    return desdeCr;
  };

  // ---------- Excel ----------
  App.plantillaBytes = function (formato) {
    var bin = atob(window.PLANTILLAS[formato].b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  };

  /** Exporta tablas a un Excel simple. hojas: { 'Nombre hoja': [ {Columna: valor, ...}, ... ] } */
  App.exportarExcel = function (nombre, hojas) {
    var wb = XLSX.utils.book_new();
    Object.keys(hojas).forEach(function (n) {
      var filas = hojas[n].length ? hojas[n] : [{ '(sin datos)': '' }];
      var ws = XLSX.utils.json_to_sheet(filas);
      ws['!cols'] = Object.keys(filas[0]).map(function (k) {
        var max = k.length;
        filas.forEach(function (f) { var l = String(f[k] === undefined ? '' : f[k]).length; if (l > max) max = l; });
        return { wch: Math.min(max + 2, 50) };
      });
      XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31));
    });
    App.descargar(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), nombre);
  };

  /**
   * Indicadores grandes (número + etiqueta). items: [{ n, txt, cls?: 'ok'|'warn'|'err', titulo?, filtro? }]
   * Con "filtro", el indicador es clicable (data-filtro) y "on" lo marca como elegido. Solo presentación.
   */
  App.indicadores = function (items, on) {
    return '<div class="stats">' + items.map(function (x) {
      var n = typeof x.n === 'number' ? x.n.toLocaleString() : x.n;
      var clic = x.filtro !== undefined;
      return '<div class="stat' + (x.cls ? ' ' + x.cls : '') + (clic ? ' clic' : '') + (clic && on === x.filtro ? ' on' : '') + '"' +
        (clic ? ' data-filtro="' + esc(x.filtro) + '" role="button" tabindex="0"' : '') + (x.titulo ? ' title="' + esc(x.titulo) + '"' : '') +
        '><b' + (typeof x.n === 'number' ? ' data-n="' + x.n + '"' : '') + '>' + esc(n) + '</b><span>' + esc(x.txt) + '</span></div>';
    }).join('') + '</div>';
  };
  /** Barras horizontales de conteo: [{ nombre, n }] (ordenadas de mayor a menor) */
  App.barras = function (items) {
    var max = items.reduce(function (a, x) { return Math.max(a, x.n); }, 1);
    return '<div class="barras">' + items.map(function (x) {
      return '<div class="barra-f"><span class="barra-n" title="' + esc(x.nombre) + '">' + esc(x.nombre) + '</span>' +
        '<span class="barra-b"><i style="width:' + Math.max(3, x.n * 100 / max) + '%"></i></span><b>' + x.n.toLocaleString() + '</b></div>';
    }).join('') + '</div>';
  };

  /**
   * Confirmación como hoja de iPhone (sube desde abajo; en pantalla ancha, tarjeta centrada).
   * opc: { titulo, texto, aceptar, cancelar, peligro }. Devuelve Promise<boolean>. Esc = cancelar, Enter = aceptar.
   */
  App.confirmar = function (opc) {
    return new Promise(function (resolver) {
      var antes = document.activeElement;
      var fondo = document.createElement('div');
      fondo.className = 'hoja-fondo';
      fondo.innerHTML = '<div class="hoja" role="alertdialog" aria-modal="true" aria-labelledby="hojaTitulo"><span class="hoja-asa"></span>' +
        '<div class="hoja-titulo" id="hojaTitulo">' + esc(opc.titulo || '¿Continuar?') + '</div>' +
        (opc.texto ? '<div class="hoja-texto">' + esc(opc.texto) + '</div>' : '') +
        '<div class="hoja-botones"><button data-h="no">' + esc(opc.cancelar || 'Cancelar') + '</button>' +
        '<button data-h="si" class="' + (opc.peligro ? 'peligro' : 'palomita') + '">' + esc(opc.aceptar || 'Aceptar') + '</button></div></div>';
      document.body.appendChild(fondo);
      requestAnimationFrame(function () { fondo.classList.add('abierta'); });
      setTimeout(function () { fondo.classList.add('abierta'); }, 30);
      var hecho = false;
      function cerrar(ok) {
        if (hecho) return; hecho = true;
        document.removeEventListener('keydown', teclas, true);
        fondo.classList.remove('abierta'); fondo.classList.add('cerrando');
        setTimeout(function () { fondo.remove(); if (antes && antes.focus) antes.focus({ preventScroll: true }); }, 260);
        resolver(ok);
      }
      var ultimaTecla = 0;
      function teclas(e) {
        if (e.key && e.key.length === 1) { ultimaTecla = performance.now(); e.preventDefault(); e.stopPropagation(); return; } // un escaneo no escribe detrás de la hoja
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(false); }
        else if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation();
          // El Enter que cierra un escaneo (llega pegado a los dígitos) no acepta la hoja; solo el Enter presionado a mano
          if (performance.now() - ultimaTecla < 150) return;
          if (document.activeElement && document.activeElement.getAttribute('data-h') === 'no') cerrar(false); else cerrar(true);
        }
      }
      document.addEventListener('keydown', teclas, true);
      fondo.addEventListener('click', function (e) {
        if (e.target === fondo) cerrar(false);
        var h = e.target.getAttribute && e.target.getAttribute('data-h');
        if (h) cerrar(h === 'si');
      });
      fondo.querySelector('[data-h="si"]').focus({ preventScroll: true });
    });
  };

  App.descargar = function (datos, nombre, tipo) {
    var blob = new Blob([datos], { type: tipo || XLSX_MIME });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  };

  /**
   * Botones de cada módulo:
   *  - Descargar y terminar: descarga, memoriza lo capturado y deja la captura en limpio.
   *  - Descargar y seguir: descarga el formato lleno (la captura se queda).
   *  - Borrar captura: la descarta sin generar nada.
   * cfg: { cont, formato, nombre(): string, filas(): [], alVaciar(memorizar: bool) }
   */
  App._resumen = {};
  /** Actualiza el "Se va a descargar: ..." junto a los botones del módulo */
  App.resumenLote = function (modulo) { if (App._resumen[modulo]) App._resumen[modulo](); };

  App.botonesFormato = function (cfg) {
    var div = document.createElement('div');
    div.className = 'botones';
    div.innerHTML = '<div data-b="resumen"></div><button data-b="guardar" title="Descarga el Excel, recuerda lo capturado para no repetirlo y deja la captura en limpio">Descargar Excel y terminar</button> ' +
      '<button data-b="generar" title="Descarga el Excel y deja la captura como está">Descargar Excel y seguir capturando</button> ' +
      '<button data-b="limpiar" title="Descarta lo capturado sin generar nada">Borrar captura</button> <span data-b="estado"></span>';
    cfg.cont.insertBefore(div, cfg.cont.querySelector('.scroll')); // arriba de la lista, siempre a la vista
    var estado = div.querySelector('[data-b="estado"]');
    var PLURAL = { ALTA: ['alta', 'altas'], BAJA: ['baja', 'bajas'], TRASPASO: ['transferencia', 'transferencias'] };
    App._resumen[cfg.modulo] = function () {
      var filas = cfg.filas(), n = {};
      filas.forEach(function (f) { n[f.tipo] = (n[f.tipo] || 0) + 1; });
      var partes = Object.keys(PLURAL).filter(function (t) { return n[t]; }).map(function (t) { return n[t] + ' ' + PLURAL[t][n[t] === 1 ? 0 : 1]; });
      var cap = capacidad(), archivos = cap && filas.length > cap ? Math.ceil(filas.length / cap) : 1;
      div.querySelector('[data-b="resumen"]').textContent = filas.length
        ? 'Se va a descargar: ' + partes.join(', ') + (archivos > 1 ? ' en ' + archivos + ' archivos' : '') + '.'
        : 'Todavía no hay movimientos capturados.';
    };

    // Formatos con renglones limitados (Anexo 3: 50) se parten en varios archivos
    function capacidad() {
      var d = AFWriter.FORMATOS[cfg.formato], tipos = Object.keys(d);
      return tipos.length === 1 && d[tipos[0]].fin ? d[tipos[0]].fin - d[tipos[0]].inicio + 1 : 0;
    }
    function generar() {
      var filas = cfg.filas();
      if (!filas.length) { estado.innerHTML = '<span class="err">No hay movimientos capturados.</span>'; return Promise.resolve(false); }
      var cap = capacidad(), partes = [];
      if (cap && filas.length > cap) for (var i = 0; i < filas.length; i += cap) partes.push(filas.slice(i, i + cap));
      else partes.push(filas);
      var base = cfg.nombre(), hechos = [];
      var cadena = Promise.resolve();
      partes.forEach(function (p, i) {
        cadena = cadena.then(function () {
          return AFWriter.generarExcel(App.plantillaBytes(cfg.formato), p, cfg.formato).then(function (res) {
            var nombre = partes.length > 1 ? base.replace(/\.xlsx$/, '') + ' (parte ' + (i + 1) + ' de ' + partes.length + ').xlsx' : base;
            App.descargar(res.datos, nombre);
            App.registrarEnviados(p, cfg.modulo, nombre);
            hechos.push(esc(nombre) + ': ' + Object.keys(res.resumen).map(function (k) {
              var s = res.resumen[k]; return esc(s.hoja.trim()) + ' ' + s.n + (s.concentrado ? ' + pestaña ' + esc(s.concentrado.hoja) : '');
            }).join(', '));
          });
        });
      });
      return cadena.then(function () {
        estado.innerHTML = '<span class="ok">Descargado' + (partes.length > 1 ? 's ' + partes.length + ' archivos (máximo ' + cap + ' por formato)' : '') + ':</span> ' + hechos.join(' — ');
        return true;
      }).catch(function (err) {
        estado.innerHTML = '<span class="err">' + esc(err.message) + '</span>';
        return false;
      });
    }
    div.addEventListener('click', function (e) {
      var b = e.target.getAttribute && e.target.getAttribute('data-b');
      if (b === 'generar') generar();
      else if (b === 'guardar') {
        generar().then(function (ok) {
          if (!ok) return;
          App.memorizar(cfg.filas(), cfg.modulo);
          cfg.alVaciar();
          estado.innerHTML += ' <span class="muted">— guardado; captura lista para un nuevo formato.</span>';
        });
      } else if (b === 'limpiar') {
        var n = cfg.filas().length;
        var borrar = function () { cfg.alVaciar(); estado.innerHTML = '<span class="muted">Captura limpia.</span>'; };
        if (!n) borrar();
        else App.confirmar({ titulo: '¿Borrar la captura?', texto: 'Se descartan ' + App.cuenta(n, 'movimiento capturado', 'movimientos capturados') + ' sin generar el Excel. No se puede deshacer.', aceptar: 'Borrar', peligro: true })
          .then(function (ok) { if (ok) borrar(); });
      }
    });
  };

  // ---------- Escáner (pistola USB en modo teclado, p. ej. Zebra) ----------
  // El escáner "teclea" el código muy rápido y termina con Enter (o Tab). Se reconoce por la velocidad:
  // así la lectura llega al campo Placa aunque el cursor esté en otro lado, y lo tecleado a mano no se toca.
  var ESC = { maxIntervalo: 50, minLargo: 4, rebote: 2000, sinFin: 300 };
  var lect = { buf: '', tIni: 0, tUlt: 0, maxInt: 0, el: null, antes: null, timer: null };
  var registros = {};             // por módulo: { placa: input, alLeer(codigo), secundarios: [{ campo, alLeer(codigo) }] }
  var registro = null;            // el del módulo visible
  var ultimaLectura = { codigo: '', t: 0 };
  var audio = null;

  /** Cada módulo indica su campo de placa y qué hacer con cada lectura; se usa el del módulo visible */
  App.registrarEscaner = function (modulo, cfg) { registros[modulo] = cfg; };

  App.pref = function (k, def) { var v = App.leerLS('af_pref_' + k, null); return v === null ? def : v; };
  App.guardarPref = function (k, v) { App.guardarLS('af_pref_' + k, v); };

  var TONOS = {
    ok: [[1400, 0.09]],
    aviso: [[750, 0.11], [750, 0.11]],
    error: [[200, 0.45]],
    rebote: [[400, 0.05]]
  };
  App.sonido = function (tipo) {
    if (!App.pref('sonido', true)) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      (TONOS[tipo] || TONOS.ok).forEach(function (n) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = tipo === 'error' ? 'square' : 'sine';
        o.frequency.value = n[0];
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + n[1]);
        o.connect(g); g.connect(audio.destination);
        o.start(t); o.stop(t + n[1]);
        t += n[1] + 0.07;
      });
    } catch (e) { /* sin audio */ }
  };

  var deshacerLectura = null;
  /** Resultado de una lectura: sonido + aviso grande abajo. deshacer (opcional): qué hace el botón Deshacer del aviso */
  // Íconos animados del aviso (se dibujan con un trazo): encontrado, no encontrado, revisar, repetida
  var SVG_LECTURA = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">';
  var ICONOS_LECTURA = {
    ok: SVG_LECTURA + '<circle class="ic-c" cx="16" cy="16" r="14" pathLength="1"/><path class="ic-t" pathLength="1" d="M9.5 16.5l4.5 4.5 8.5-9"/></svg>',
    error: SVG_LECTURA + '<circle class="ic-c" cx="16" cy="16" r="14" pathLength="1"/><path class="ic-t" pathLength="1" d="M11 11l10 10"/><path class="ic-t ic-t2" pathLength="1" d="M21 11L11 21"/></svg>',
    aviso: SVG_LECTURA + '<circle class="ic-c" cx="16" cy="16" r="14" pathLength="1"/><path class="ic-t" pathLength="1" d="M16 8.5v9"/><circle class="ic-p" cx="16" cy="22.6" r="1.6"/></svg>',
    rebote: SVG_LECTURA + '<circle class="ic-c" cx="16" cy="16" r="14" pathLength="1"/><path class="ic-t" pathLength="1" d="M10.5 16a5.5 5.5 0 1 0 1.8-4M10.5 9v3.8h3.8"/></svg>'
  };
  App.lectura = function (tipo, texto, deshacer) {
    App.sonido(tipo);
    $('lectura').className = 'lectura-' + tipo;
    void $('lectura').offsetWidth; $('lectura').classList.add('pop'); // cada lectura vuelve a entrar con rebote (solo visual)
    $('lecturaIco').innerHTML = ICONOS_LECTURA[tipo] || '';
    // Destello en el borde de la pantalla (verde / naranja / rojo), visible de lejos
    var d = $('destello');
    d.className = ''; void d.offsetWidth;
    if (tipo !== 'rebote') d.className = 'destello-' + tipo;
    $('lecturaTexto').textContent = String(texto).replace(/^\s*[✓✗⚠]️?\s*/, ''); // el ícono ya dice si fue bien o mal
    deshacerLectura = deshacer || null;
    $('lecturaDeshacer').classList.toggle('oculto', !deshacerLectura);
  };
  function limpiarLectura() {
    $('lectura').className = ''; $('lecturaTexto').textContent = ''; $('lecturaIco').innerHTML = ''; $('destello').className = '';
    deshacerLectura = null;
    $('lecturaDeshacer').classList.add('oculto');
  }
  $('lecturaDeshacer').addEventListener('click', function () {
    var fn = deshacerLectura;
    if (!fn) return;
    fn();
    if (registro) registro.placa.focus({ preventScroll: true });
  });

  function esCampoTexto(el) {
    return !!el && el.tagName === 'INPUT' && /^(text|search|tel|)$/i.test(el.getAttribute('type') || '');
  }
  function pruebaAbierta() { var p = $('probarEscaner'); return !!(p && p.open); }

  function leerPlaca(codigo) {
    var ahora = Date.now();
    var p = AF.util.limpiaPlaca(codigo);
    if (p === ultimaLectura.codigo && ahora - ultimaLectura.t < ESC.rebote) {
      ultimaLectura.t = ahora;
      registro.placa.value = p;
      App.lectura('rebote', 'Lectura repetida ignorada: ' + p);
      return;
    }
    ultimaLectura = { codigo: p, t: ahora };
    var motivo = App.maf ? AF.revisarLectura(App.maf.perfilPlacas, p) : '';
    if (motivo) {
      registro.placa.value = '';
      registro.placa.focus();
      App.lectura('error', '✗ No parece placa. ' + motivo + ' Si sí es la placa, escríbala a mano y presione Enter.');
      return;
    }
    registro.placa.value = p;
    registro.placa.focus();
    registro.alLeer(p);
  }

  function reportarPrueba(info) {
    var p = AF.util.limpiaPlaca(info.codigo);
    var motivo = App.maf ? AF.revisarLectura(App.maf.perfilPlacas, p) : '(cargue el MAF para revisar el formato)';
    var regs = App.maf ? App.maf.idx.porPlaca.get(AF.util.llavePlaca(p)) || [] : [];
    var consejos = [];
    if (!info.fin) consejos.push('El escáner no mandó Enter al final: active el sufijo Enter (retorno de carro) en el escáner.');
    if (info.fin === 'Tab') consejos.push('Termina con Tab: funciona, pero se recomienda Enter.');
    if (motivo && /caracteres de más/.test(motivo)) consejos.push('Configure el escáner con el idioma de teclado de Windows (español) o quite el prefijo/sufijo extra.');
    if (!consejos.length && !motivo) consejos.push('Todo bien: el escáner está listo.');
    App.lectura(motivo || !info.fin ? 'aviso' : 'ok', 'Prueba: "' + info.codigo + '"');
    $('pruebaLectura').innerHTML = '<table>' +
      [['Código leído', '"' + info.codigo + '"'], ['Caracteres', info.codigo.length], ['Terminó con', info.fin || 'nada (sin Enter)'],
        ['Tiempo total', info.ms + ' ms (máx. ' + info.maxInt + ' ms entre caracteres)'],
        ['¿Parece placa?', motivo || 'Sí'],
        ['En el MAF', !App.maf ? '—' : regs.length ? regs.map(function (r) { return r.noActivo + ' ' + r.descripcion + ' (CR ' + r.cr + ' ' + r.crDesc + ')'; }).join(' / ') : 'No está']
      ].map(function (f) { return '<tr><th>' + esc(f[0]) + '</th><td>' + esc(f[1]) + '</td></tr>'; }).join('') + '</table>' +
      consejos.map(function (c) { return '<div class="' + (/Todo bien/.test(c) ? 'ok' : 'warn') + '">' + esc(c) + '</div>'; }).join('');
  }

  function lecturaSinFin() {
    var info = { codigo: lect.buf, ms: Math.round(lect.tUlt - lect.tIni), maxInt: Math.round(lect.maxInt), fin: '' };
    var esLectura = lect.buf.length >= ESC.minLargo;
    lect.buf = '';
    if (!esLectura) return;
    if (pruebaAbierta()) reportarPrueba(info);
    else if (registro) App.lectura('aviso', 'Se leyó "' + info.codigo + '" pero el escáner no mandó Enter. Presione Enter o configure el sufijo Enter (ver "Probar escáner").');
  }

  document.addEventListener('keydown', function (e) {
    if (document.querySelector('.hoja-fondo')) { lect.buf = ''; return; } // con una confirmación abierta no se captura nada
    var ahora = performance.now();
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (!lect.buf || ahora - lect.tUlt > ESC.maxIntervalo) {
        lect.buf = ''; lect.tIni = ahora; lect.maxInt = 0;
        lect.el = document.activeElement;
        lect.antes = lect.el && (esCampoTexto(lect.el) || lect.el.tagName === 'SELECT') ? lect.el.value : null;
        // campo con todo su texto seleccionado (p. ej. la serie que viene del MAF): la lectura lo reemplaza
        lect.todoSel = esCampoTexto(lect.el) && !!lect.el.value && lect.el.selectionStart === 0 && lect.el.selectionEnd === lect.el.value.length;
      } else lect.maxInt = Math.max(lect.maxInt, ahora - lect.tUlt);
      lect.buf += e.key;
      lect.tUlt = ahora;
      clearTimeout(lect.timer);
      lect.timer = setTimeout(lecturaSinFin, ESC.sinFin);
      if (pruebaAbierta() && document.activeElement && document.activeElement.tagName !== 'TEXTAREA') e.preventDefault();
      return;
    }
    if (e.key !== 'Enter' && e.key !== 'Tab') { lect.buf = ''; return; }
    clearTimeout(lect.timer);
    var esLectura = lect.buf.length >= ESC.minLargo && ahora - lect.tUlt < 100 && lect.maxInt < ESC.maxIntervalo;
    var info = { codigo: lect.buf, ms: Math.round(ahora - lect.tIni), maxInt: Math.round(lect.maxInt), fin: e.key };
    var el = document.activeElement, antes = el === lect.el ? lect.antes : null;
    lect.buf = '';
    if (!esLectura) return; // tecleo normal

    if (pruebaAbierta()) { e.preventDefault(); e.stopPropagation(); reportarPrueba(info); return; }
    if (!registro) return;
    if (el && el.tagName === 'TEXTAREA') return; // en una lista se deja escribir (permite escanear varias)

    // Campo secundario (p. ej. Serie) enfocado y vacío o con todo seleccionado: la lectura es para él
    var sec = (registro.secundarios || []).filter(function (s) { return s.campo === el; })[0];
    if (sec && (antes === '' || (el === lect.el && lect.todoSel))) {
      e.preventDefault(); e.stopPropagation();
      el.value = info.codigo.trim();
      sec.alLeer(el.value);
      return;
    }
    // Cualquier otro lugar: lo tecleado por el escáner se deshace y la lectura va a Placa
    e.preventDefault(); e.stopPropagation();
    if (el && el !== registro.placa) {
      var previo = antes;
      if (previo === null && esCampoTexto(el) && el.value.slice(-info.codigo.length) === info.codigo) previo = el.value.slice(0, -info.codigo.length);
      if (previo !== null && el.value !== previo) {
        el.value = previo;
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      }
    }
    leerPlaca(info.codigo);
  }, true);

  // ---------- Módulos (una sola página; al cambiar de pestaña el módulo entra deslizándose) ----------
  var NOMBRES = { movimientos: 'Altas, bajas y transferencias', plaqueo: 'Plaqueo por factura', anexo3: 'Bajas Anexo 3 (desincorporación)',
    levantamiento: 'Levantamiento de tienda', consultas: 'Consultas y seguimiento' };
  var AYUDA = {
    movimientos: 'Un equipo a la vez: poner placa (alta), dar de baja o transferir a otra tienda. Llena el Formato V.2.',
    plaqueo: 'Equipo nuevo de una factura que ya está en el MAF sin placa: escanee las placas una tras otra. Llena el alta del Formato V.2.',
    anexo3: 'Bajas con desincorporación oficial. Llena el Anexo 3 (50 equipos por archivo; si son más, se parte solo).',
    levantamiento: 'Escanee todo lo que hay en una tienda y compárelo con el MAF: qué falta, qué sobra y qué está en otra tienda.',
    consultas: 'Ver los activos de una tienda, los pendientes de plaqueo y si AF ya aplicó lo que se envió. Aquí no se captura nada.'
  };
  var CORTOS = { movimientos: 'Movimientos', plaqueo: 'Plaqueo', anexo3: 'Anexo 3', levantamiento: 'Levantamiento', consultas: 'Consultas' };
  // Guía de cada módulo (didáctica): los pasos en el orden en que se trabaja
  var PASOS = {
    movimientos: ['Elige Alta, Baja o Transferencia', 'Escanea la placa', 'Revisa la ficha y presiona ✓', 'Descarga el Excel'],
    plaqueo: ['Captura la factura', 'Escanea cada placa', 'Corrige serie, marca o modelo si hace falta', 'Descarga el Excel'],
    anexo3: ['Llena los datos de la baja', 'Escanea las placas', 'Revisa y presiona ✓', 'Descarga el Anexo 3'],
    levantamiento: ['Elige la tienda', 'Escanea la placa del activo', 'Revisa serie, marca y modelo', 'Descarga el formato de alta'],
    consultas: ['Elige qué consultar', 'Toca un indicador para filtrar', 'Exporta o imprime']
  };
  App.moduloActual = (location.hash || '').replace('#', '') || 'movimientos';
  if (NAV.indexOf(App.moduloActual) < 0) App.moduloActual = 'movimientos';

  // Íconos de cada módulo (trazo uniforme de 1.75, estilo SF Symbols / lucide)
  var ICONOS = {
    movimientos: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    plaqueo: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1"/>',
    anexo3: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    levantamiento: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10"/><path d="M12 7v10"/><path d="M16 7v10"/>',
    consultas: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'
  };
  function icono(m) {
    return '<span class="ico m-' + m + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONOS[m] + '</svg></span>';
  }

  function pintarNav() {
    $('nav').innerHTML = '<span class="nav-ind" aria-hidden="true"></span>' + NAV.map(function (m) {
      var n = MODULOS.indexOf(m) >= 0 ? App.leerLote(m).length : 0;
      return '<a href="#' + m + '"' + (m === App.moduloActual ? ' class="activa" aria-current="page"' : '') + (n ? ' title="' + n + ' movimientos capturados sin terminar"' : '') + '>' +
        icono(m) + '<span class="largo">' + esc(NOMBRES[m]) + '</span><span class="corto">' + esc(CORTOS[m]) + '</span>' + (n ? '<span class="badge">' + n + '</span>' : '') + '</a>';
    }).join('');
    moverIndicador(true);
    $('tituloModulo').innerHTML = icono(App.moduloActual) + '<span>' + esc(NOMBRES[App.moduloActual]) + '</span>';
    // Para qué sirve + los pasos del módulo, numerados igual que las secciones
    $('ayudaModulo').innerHTML = esc(AYUDA[App.moduloActual]) +
      '<ol class="pasos-guia">' + PASOS[App.moduloActual].map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol>';
    document.title = NOMBRES[App.moduloActual] + ' — Activo Fijo';
    App.pintarContexto();
  }

  // Indicador de la pestaña activa (pastilla que se desliza de la pestaña anterior a la nueva). Solo visual.
  // Funciona igual en fila (pantalla angosta) y en columna (barra lateral).
  var indicador = null;   // última posición {x, y, w, h}
  function moverIndicador(animar) {
    var nav = $('nav'), ind = nav.querySelector('.nav-ind'), on = nav.querySelector('a.activa');
    if (!ind || !on || !on.offsetWidth) return;
    var p = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    function poner(q) { ind.style.transform = 'translate(' + q.x + 'px,' + q.y + 'px)'; ind.style.width = q.w + 'px'; ind.style.height = q.h + 'px'; }
    if (indicador && animar) {
      ind.style.transition = 'none';
      poner(indicador);
      void ind.offsetWidth;
      ind.style.transition = '';
    } else ind.style.transition = 'none';
    poner(p);
    if (!animar || !indicador) { void ind.offsetWidth; ind.style.transition = ''; }
    indicador = p;
    if (nav.scrollWidth > nav.clientWidth) nav.scrollLeft = p.x - (nav.clientWidth - p.w) / 2;
  }
  window.addEventListener('resize', function () { indicador = null; moverIndicador(false); medirBarra(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moverIndicador(false); });

  // Franja fija: qué se está capturando y dónde (cada módulo da su texto)
  var contextos = {};
  App.registrarContexto = function (modulo, fn) { contextos[modulo] = fn; };
  // Alto de lo que queda fijo arriba: encabezado del módulo, más las pestañas cuando van arriba (pantalla angosta)
  function altoFijo() {
    var nav = $('nav'), navFija = getComputedStyle(nav).position === 'sticky';
    return { nav: navFija ? nav.offsetHeight : 0, total: (navFija ? nav.offsetHeight : 0) + $('barra').offsetHeight };
  }
  function medirBarra() {
    var a = altoFijo(), r = document.documentElement.style;
    r.setProperty('--nav-alto', a.nav + 'px');
    r.setProperty('--arriba', a.total + 'px');
  }
  App.pintarContexto = function () {
    var fn = contextos[App.moduloActual];
    $('franja').textContent = App.maf && fn ? fn() : '';
    medirBarra();
  };
  window.addEventListener('resize', medirBarra);

  function usarEscanerDelModulo() {
    registro = registros[App.moduloActual] || null;
  }

  // Cambio de módulo: el que sale se oculta al instante y el nuevo entra con un desvanecido corto y un leve desplazamiento.
  // Mover dos pantallas completas a la vez (con tablas grandes y barras translúcidas encima) se veía lento y a saltos.
  var DESLIZA_MS = 200;
  var CURVA_APPLE = 'cubic-bezier(0.32, 0.72, 0, 1)';
  var terminarDeslizado = null;
  function deslizar(sal, ent, dir) {
    if (terminarDeslizado) terminarDeslizado();
    sal.classList.add('oculto');
    ent.classList.remove('oculto');
    var anim = null;
    if (ent.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      anim = ent.animate([{ opacity: 0, transform: 'translateX(' + (dir * 16) + 'px)' }, { opacity: 1, transform: 'none' }],
        { duration: DESLIZA_MS, easing: CURVA_APPLE });
    }
    function fin() {
      if (terminarDeslizado !== fin) return;
      terminarDeslizado = null;
      if (anim) anim.cancel();
    }
    terminarDeslizado = fin;
    if (anim) { anim.onfinish = fin; setTimeout(fin, DESLIZA_MS + 100); } // el reloj cubre el caso de ventana en segundo plano
    else fin();
  }

  function irAModulo(m) {
    if (NAV.indexOf(m) < 0) m = 'movimientos';
    var antes = App.moduloActual;
    if (m === antes) return;
    App.moduloActual = m;
    pintarNav();
    usarEscanerDelModulo();
    limpiarLectura();
    // Trae lo que se capturó en los otros módulos (bloqueos y pendientes al día)
    App._alCambioExterno.forEach(function (c) { if (c.modulo === m) c.fn(); });
    var arriba = $('modulos').getBoundingClientRect().top + window.scrollY - altoFijo().total;
    if (window.scrollY > arriba) window.scrollTo(0, arriba);
    deslizar($('mod-' + antes), $('mod-' + m), NAV.indexOf(m) > NAV.indexOf(antes) ? 1 : -1);
    if (registro) registro.placa.focus({ preventScroll: true });
    else if (document.activeElement) document.activeElement.blur(); // sin esto una lectura caería en el módulo que sale
  }
  window.addEventListener('hashchange', function () { irAModulo((location.hash || '').replace('#', '')); });

  // ---------- Arranque ----------
  // ---------- Detalles visuales (no tocan datos ni lógica) ----------
  var sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
  // Números de sección "1. Tienda" -> círculo numerado, igual en todas las tarjetas
  function numerarSecciones(raiz) {
    if (!raiz || !raiz.querySelectorAll) return; // el nodo ya se quitó al redibujar
    raiz.querySelectorAll('legend').forEach(function (lg) {
      var t = lg.firstChild;
      if (!t || t.nodeType !== 3) return;
      var m = /^\s*(\d+)\.\s*/.exec(t.data);
      if (!m) return;
      t.data = t.data.slice(m[0].length);
      var s = document.createElement('span'); s.className = 'num'; s.textContent = m[1];
      lg.insertBefore(s, t);
    });
  }
  // Indicadores: la primera vez aparecen escalonados; si su número cambia, cuenta hasta el nuevo valor
  var cifras = {};
  function animarCifras(raiz) {
    if (!raiz || !raiz.querySelectorAll) return; // el nodo ya se quitó al redibujar
    raiz.querySelectorAll('.stat b[data-n]').forEach(function (b) {
      var st = b.parentNode, cont = st.closest('[data-c]') || st.closest('[id]');
      var clave = (cont ? cont.getAttribute('data-c') || cont.id : '') + '|' + (st.querySelector('span') || {}).textContent;
      var fin = Number(b.getAttribute('data-n')), ini = cifras[clave];
      cifras[clave] = fin;
      if (ini === undefined) return; // la primera vez se muestra tal cual (al cambiar de módulo no debe haber números corriendo)
      if (ini === fin || sinMovimiento.matches) return;
      var t0 = performance.now(), dur = 650, listo = false;
      (function paso(t) {
        if (listo) return;
        var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        b.textContent = Math.round(ini + (fin - ini) * e).toLocaleString();
        if (p < 1) requestAnimationFrame(paso);
      })(t0);
      // Garantía: aunque la ventana esté en segundo plano (sin cuadros de animación), el número final siempre queda
      setTimeout(function () { listo = true; b.textContent = fin.toLocaleString(); }, dur + 60);
    });
  }
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches('legend')) numerarSecciones(n.parentNode);
        else numerarSecciones(n);
        animarCifras(n.matches && n.matches('.stats') ? n.parentNode : n);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  // Título grande que se compacta al bajar (con margen para que no parpadee en el borde)
  var compacto = false;
  window.addEventListener('scroll', function () {
    var c = compacto ? window.scrollY > 10 : window.scrollY > 60;
    if (c === compacto) return;
    compacto = c;
    $('barra').classList.toggle('compacto', c);
    setTimeout(medirBarra, 320);
  }, { passive: true });

  // ---------- Respaldo de la memoria (todo lo af_* del navegador; el MAF no va: se vuelve a cargar) ----------
  function clavesAF() {
    var ks = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^af_/.test(k) && k !== 'af_prueba') ks.push(k); }
    return ks.sort();
  }
  function contenido(datos) {
    function largo(k) { try { var v = JSON.parse(datos[k] || 'null'); return Array.isArray(v) ? v.length : v && v.placas ? v.placas.length : 0; } catch (e) { return 0; } }
    var capt = Object.keys(datos).filter(function (k) { return /^af_lote_/.test(k); }).reduce(function (a, k) { return a + largo(k); }, 0);
    return { capturados: capt, generados: largo('af_historial'), enviados: largo('af_enviados'), escaneadas: largo('af_levantamiento') };
  }
  function textoContenido(c) {
    return c.capturados + ' movimientos capturados sin terminar, ' + c.generados + ' ya generados (para no repetir), ' +
      c.enviados + ' en seguimiento y ' + c.escaneadas + ' placas de levantamiento';
  }
  $('respaldoBajar').addEventListener('click', function () {
    var datos = {};
    try { clavesAF().forEach(function (k) { datos[k] = localStorage.getItem(k); }); }
    catch (e) { $('respaldoEstado').innerHTML = '<span class="err">Este navegador no deja leer lo guardado.</span>'; return; }
    var obj = { app: 'activo-fijo', version: 1, generado: new Date().toISOString(), datos: datos };
    App.descargar(JSON.stringify(obj), 'Respaldo Activo Fijo ' + hoyLocal() + '.json', 'application/json');
    $('respaldoEstado').innerHTML = '<span class="ok">Respaldo descargado:</span> ' + esc(textoContenido(contenido(datos))) + '.';
  });
  $('respaldoSubir').addEventListener('click', function () { $('respaldoArchivo').click(); });
  $('respaldoArchivo').addEventListener('change', function (e) {
    var f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    f.text().then(function (txt) {
      var obj;
      try { obj = JSON.parse(txt); } catch (err) { obj = null; }
      if (!obj || obj.app !== 'activo-fijo' || !obj.datos || typeof obj.datos !== 'object') {
        $('respaldoEstado').innerHTML = '<span class="err">Ese archivo no es un respaldo de este aplicativo.</span>'; return;
      }
      var claves = Object.keys(obj.datos).filter(function (k) { return /^af_/.test(k) && typeof obj.datos[k] === 'string'; });
      var fecha = obj.generado ? new Date(obj.generado).toLocaleString('es-MX') : 'fecha desconocida';
      return App.confirmar({ titulo: '¿Restaurar el respaldo del ' + fecha + '?', texto: 'Trae: ' + textoContenido(contenido(obj.datos)) +
        '.\n\nReemplaza lo que hay ahora en este navegador: ' + textoContenido(contenido(clavesAF().reduce(function (a, k) { a[k] = localStorage.getItem(k); return a; }, {}))) + '.',
        aceptar: 'Restaurar', peligro: true }).then(function (ok) {
        if (!ok) return;
        try {
          clavesAF().forEach(function (k) { localStorage.removeItem(k); });
          claves.forEach(function (k) { localStorage.setItem(k, obj.datos[k]); });
        } catch (err) {
          $('respaldoEstado').innerHTML = '<span class="err">No se pudo restaurar: ' + esc(err.message) + '</span>'; return;
        }
        location.reload();
      });
    });
  });

  App.iniciar = function () {
    $('avisoCarga').classList.add('oculto');
    var ps = $('prefSonido');
    ps.checked = App.pref('sonido', true);
    ps.addEventListener('change', function () { App.guardarPref('sonido', ps.checked); if (ps.checked) App.sonido('ok'); });
    // Modo oscuro opcional (por defecto claro); se recuerda en este navegador
    var po = $('prefOscuro');
    po.checked = !!App.pref('oscuro', false);
    po.addEventListener('change', function () {
      var raiz = document.documentElement;
      raiz.classList.add('cambiando-tema');
      raiz.setAttribute('data-theme', po.checked ? 'dark' : 'light');
      App.guardarPref('oscuro', po.checked);
      setTimeout(function () { raiz.classList.remove('cambiando-tema'); }, 400);
    });
    usarEscanerDelModulo();
    revisarAlmacen();
    pintarNav();
    $('mod-' + App.moduloActual).classList.remove('oculto');
    $('estadoMaf').textContent = 'Buscando el último MAF cargado…';
    idb('readonly', function (s) { return s.get('actual'); }).then(function (c) {
      if (c && c.registros && !App.maf) {
        $('estadoMaf').textContent = 'Recuperando el último MAF cargado (' + c.registros.length.toLocaleString() + ' activos)…';
        setTimeout(function () {
          usarMaf(AF.indexarMAF(c));
          notaMaf('recuperado de la última carga');
        }, 30);
      } else if (!App.maf) mostrarEstadoMaf();
    }).catch(function () { if (!App.maf) mostrarEstadoMaf(); });
  };

  window.AFApp = App;
})();
