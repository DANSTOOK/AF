/*
 * Módulo de captura por placa con vista previa y ✓ (búsqueda automática en el MAF).
 * Se usa para:
 *  - "movimientos": Altas, Bajas y Transferencias -> Formato de Movimientos AF V.2
 *  - "anexo3": solo Bajas con datos de desincorporación -> Formato Anexo 3
 */
(function () {
  'use strict';
  var App = window.AFApp, esc = App.esc;

  var ETIQUETAS = {
    plaza: 'Plaza', cr: 'CR', tienda: 'Tienda', noActivo: 'Num de Activo', descripcion: 'Descripción', placa: 'Placa',
    marca: 'Marca', modelo: 'Modelo', serie: 'Serie', crDestino: 'CR Destino', tiendaDestino: 'Tienda destino',
    motivo: 'Tipo de baja', valorNeto: 'Saldo por redimir', anioAdq: 'Año', fecha: 'Fecha',
    motivoSalida: 'Motivo de salida', tipoEquipo: 'Tipo de equipo', disposicion: 'Disposición final', proveedor: 'Proveedor reciclaje', observaciones: 'Observaciones'
  };
  // Lo que se muestra en la vista previa por tipo (en el orden del formato)
  var VISTA = {
    V2: {
      ALTA: ['noActivo', 'placa', 'serie', 'modelo', 'marca', 'fecha', 'cr', 'tienda', 'descripcion'],
      TRASPASO: ['noActivo', 'placa', 'cr', 'crDestino', 'fecha', 'tienda', 'tiendaDestino', 'descripcion'],
      BAJA: ['noActivo', 'descripcion', 'valorNeto', 'modelo', 'anioAdq', 'serie', 'motivo', 'cr', 'placa']
    },
    ANEXO3: {
      BAJA: ['noActivo', 'descripcion', 'valorNeto', 'modelo', 'anioAdq', 'serie', 'motivo', 'cr', 'placa', 'motivoSalida', 'tipoEquipo', 'disposicion', 'proveedor', 'observaciones']
    }
  };
  var PLACA_MIN = 7;     // largo mínimo para empezar a avisar errores de búsqueda
  var MAX_CANDIDATOS = 150;

  function opciones(lista, vacio) {
    return (vacio ? '<option value="">' + esc(vacio) + '</option>' : '') + lista.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
  }

  window.AFCaptura = function (cfg) {
    var cont = document.getElementById('mod-' + cfg.modulo);
    var anexo = cfg.formato === 'ANEXO3';
    var tipos = cfg.tipos;
    var lote = null;
    // Anexo 3: cada placa trae su tienda (se pueden mezclar tiendas en un mismo formato); el CR capturado no la limita
    var crPorPlaca = anexo;

    cont.classList.add('dos-col');
    cont.innerHTML =
      '<div class="col-izq"><fieldset><legend>1. ' + (tipos.length > 1 ? '¿Qué va a hacer y en qué tienda?' : 'Tienda') + '</legend>' +
      (tipos.length > 1 ? '<div class="opciones" data-c="tipoBotones">' + tipos.map(function (t) {
        return '<button data-tipo="' + t + '">' + { ALTA: 'Alta (poner placa)', BAJA: 'Baja', TRASPASO: 'Transferencia' }[t] + '</button>';
      }).join(' ') + '</div>' : '') +
      '<input type="hidden" data-c="tipo" value="' + tipos[0] + '">' +
      '<label>CR <input data-c="cr" size="8" list="listaCr"></label> ' +
      '<label>Tienda <input data-c="tienda" size="30" list="listaTiendas"></label> ' +
      '<span data-c="plaza" class="muted"></span> ' +
      '<label>Fecha <input data-c="fecha" type="date"></label>' +
      '<div class="muted">' + (crPorPlaca ? 'La tienda se toma de cada placa al escanearla. Solo hace falta elegirla para "Dar de baja varios equipos de la tienda".' : 'Si deja la tienda vacía, se llena sola con la de la placa.') + '</div></fieldset>' +

      '<fieldset><legend>2. ' + (anexo ? 'Datos de la baja y placa' : 'Datos y placa') + '</legend>' +
      '<div data-c="paso" class="paso"></div>' +
      '<label data-tipos="BAJA">Tipo de baja <select data-c="motivo">' + opciones(AF.MOTIVOS_BAJA, '— elija —') + '</select></label> ' +
      '<span data-tipos="BAJA" data-c="escenario" class="muted"></span> ' +
      '<label data-tipos="TRASPASO">CR destino <input data-c="crDestino" size="8" list="listaCr"></label> ' +
      '<label data-tipos="TRASPASO">Tienda destino <input data-c="tiendaDestino" size="25" list="listaTiendas"></label> ' +
      (anexo ?
        '<div><label>Motivo de salida <select data-c="motivoSalida">' + opciones(AF.ANEXO3.motivoSalida, '— elija —') + '</select></label> ' +
        '<label>Tipo de equipo <select data-c="tipoEquipo">' + opciones(AF.ANEXO3.tipoEquipo, '— elija —') + '</select></label> ' +
        '<label>Disposición final <select data-c="disposicion">' + opciones(AF.ANEXO3.disposicion, '— elija —') + '</select></label> ' +
        '<label>Proveedor reciclaje <input data-c="proveedor" size="20"></label> ' +
        '<label>Observaciones <input data-c="observaciones" size="30"></label>' +
        '<div class="muted">Estos datos se conservan entre bajas para capturar varios equipos iguales seguidos.</div></div>' : '') +
      '<div><label>Placa <input data-c="placa" size="14"></label> ' +
      '<label data-tipos="ALTA BAJA">Serie <input data-c="serie" size="18"></label> ' +
      '<label data-tipos="ALTA">Marca <input data-c="marca" size="12"></label> ' +
      '<label data-tipos="ALTA BAJA">Modelo <input data-c="modelo" size="14"></label> ' +
      '<label data-tipos="ALTA">Equipo (opcional, para filtrar) <input data-c="descripcion" list="equipos-' + cfg.modulo + '" size="26"></label>' +
      '<datalist id="equipos-' + cfg.modulo + '"></datalist> ' +
      '<label data-tipos="BAJA TRASPASO" title="Solo con el escáner; si hay cualquier advertencia, se detiene y pide la ✓"><input type="checkbox" data-c="auto"> Agregar sin ✓ al escanear si todo está bien</label></div>' +
      '<div class="muted" data-tipos="ALTA">Serie, marca y modelo son opcionales: vacíos = lo del MAF. La serie también sirve para encontrar el activo.</div>' +
      '<div class="muted" data-tipos="BAJA">Serie y modelo son opcionales: vacíos = lo del MAF. El formato de bajas no tiene columna de marca.</div>' +
      '<div class="muted" data-tipos="TRASPASO">El formato de transferencia solo lleva activo, placa, CR origen, CR destino y fecha: no tiene columnas de serie, marca ni modelo.</div>' +
      '<div data-c="pendientes" class="muted"></div>' +
      '<div data-c="vista" class="scroll"></div>' +
      '<div data-c="cotejo" class="scroll"></div>' +
      '<div data-c="resultado"></div>' +

      '<details><summary>¿Tiene una lista? Pegar varias placas</summary>' +
      '<div class="muted">Una placa (o No. Activo) por renglón; se puede pegar una columna de Excel. Se usan el tipo y los datos capturados arriba (tienda, tipo de baja, CR destino…).' +
      (tipos.indexOf('ALTA') >= 0 ? ' En altas se pueden pegar columnas: placa, No. Activo y serie (las dos últimas opcionales).' : '') + '</div>' +
      '<textarea data-c="lista" rows="6" cols="50"></textarea><br>' +
      '<button data-accion="revisarLista">Revisar lista</button>' +
      '<div data-c="resLista" class="scroll"></div></details>' +

      '<details data-tipos="BAJA" data-c="detMasiva"><summary>Dar de baja varios equipos de la tienda (cierre, remodelación)</summary>' +
      '<div class="muted">Lista todos los activos del CR capturado; marque los que se dan de baja. Usa el tipo de baja' + (anexo ? ' y los datos del Anexo 3' : '') + ' capturados arriba.' +
      (anexo ? ' Si pasan de 50, el Excel se parte en varios archivos.' : '') + '</div>' +
      '<label>Filtrar <input data-c="filtroMasiva" size="20"></label> ' +
      '<button data-accion="masMarcarTodos">Marcar todos (filtrados)</button> <button data-accion="masDesmarcar">Desmarcar</button> ' +
      '<button class="palomita" data-accion="masAgregar">✓ Agregar seleccionados</button> <span data-c="masCuenta"></span>' +
      '<div data-c="masiva" class="scroll"></div></details></fieldset>' +

      '</div><fieldset data-c="pie" class="col-der"><legend>3. Movimientos capturados (<span data-c="nLote">0</span>)' + (anexo ? ' — máximo 50 por formato' : '') + '</legend>' +
      '<div class="scroll"><table data-c="tablaLote"></table></div></fieldset>';

    var q = function (n) { return cont.querySelector('[data-c="' + n + '"]'); };
    var val = function (n) { var e = q(n); return e ? e.value : ''; };
    q('fecha').value = App.hoyLocal();

    var desdeCr = App.enlazarTienda(q('cr'), q('tienda'), q('plaza'), function () { actualizarPendientes(); previsualizar(); });
    App.enlazarTienda(q('crDestino'), q('tiendaDestino'), null, previsualizar);

    // ---------- Captura ----------
    function crearLote() {
      lote = new AF.Lote(App.maf, App.historialPara(cfg.modulo));
      var guardado = App.leerLote(cfg.modulo);
      lote.filas = guardado;
      lote._sec = guardado.reduce(function (a, f) { return Math.max(a, f.id); }, 0);
    }
    function guardar() { App.guardarLote(cfg.modulo, lote.filas); }

    function ajustarCampos() {
      var tipo = val('tipo');
      cont.querySelectorAll('[data-tipos]').forEach(function (el) {
        el.classList.toggle('oculto', el.getAttribute('data-tipos').split(' ').indexOf(tipo) < 0);
      });
      cont.querySelectorAll('[data-tipo]').forEach(function (b) { b.classList.toggle('activo', b.getAttribute('data-tipo') === tipo); });
      actualizarPendientes();
      pintarPaso();
    }
    if (tipos.length > 1) q('tipoBotones').addEventListener('click', function (e) {
      var t = e.target.getAttribute('data-tipo');
      if (!t) return;
      q('tipo').value = t;
      ajustarCampos(); previsualizar();
      var falta = faltaDato();
      q(falta ? falta.campo : 'placa').focus();
    });
    q('motivo').addEventListener('change', function () {
      var i = AF.MOTIVOS_BAJA.indexOf(val('motivo'));
      q('escenario').textContent = i >= 0 ? AF.ESCENARIOS_BAJA[i] : '';
      previsualizar();
    });

    function actualizarPendientes() {
      var dl = document.getElementById('equipos-' + cfg.modulo); dl.innerHTML = '';
      q('pendientes').textContent = '';
      if (!lote || val('tipo') !== 'ALTA' || !val('cr')) return;
      var lista = lote.equiposPendientes(val('cr'));
      var otras = lote.equiposPendientesOtras(val('cr'));
      var vistos = {};
      lista.concat(otras).forEach(function (e) {
        if (vistos[e.descripcion]) return; vistos[e.descripcion] = 1;
        var o = document.createElement('option'); o.value = e.descripcion; dl.appendChild(o);
      });
      var nOtras = otras.reduce(function (a, e) { return a + e.cantidad; }, 0);
      q('pendientes').textContent = (lista.length
        ? 'Pendientes de placa en este CR: ' + lista.map(function (e) { return e.descripcion + ' (' + e.cantidad + ')'; }).join(', ')
        : 'No hay activos pendientes de placa en este CR.') +
        (nOtras ? ' — En otras tiendas de la plaza hay ' + nOtras + ' pendientes.' : '');
    }

    var buscarOtras = false; // alta: buscar el activo en otras tiendas aunque haya pendientes en la propia
    var vistaActual = null;
    var tEspera = null;

    function movimiento(noActivo) {
      return {
        tipo: val('tipo'), fecha: App.fechaTexto(val('fecha')), cr: crPorPlaca ? '' : val('cr'),
        placa: val('placa'), descripcion: val('descripcion'), serie: val('serie').trim().toUpperCase(),
        marca: val('marca').trim().toUpperCase(), modelo: val('modelo').trim().toUpperCase(), motivo: val('motivo'),
        crDestino: val('crDestino'), tiendaDestino: val('tiendaDestino'),
        motivoSalida: val('motivoSalida'), tipoEquipo: val('tipoEquipo'), disposicion: val('disposicion'),
        proveedor: val('proveedor'), observaciones: val('observaciones'),
        noActivo: noActivo || '', buscarOtras: buscarOtras
      };
    }

    // Si el CR está vacío y la placa existe en el MAF, se llenan solos el CR y la tienda
    function crDesdePlaca() {
      if (!crPorPlaca && AF.util.texto(val('cr'))) return;
      var regs = lote.buscarPlaca(val('placa'));
      if (regs.length !== 1 || regs[0].cr === AF.util.texto(val('cr')).toUpperCase()) return;
      q('cr').value = regs[0].cr;
      desdeCr();
    }

    function previsualizar() {
      clearTimeout(tEspera);
      tEspera = setTimeout(function () {
        vistaActual = null;
        q('vista').innerHTML = '';
        guiaMaf(null);
        var placa = AF.util.limpiaPlaca(val('placa'));
        if (!placa) { buscarOtras = false; pintarPaso(); return; }
        if (!lote) { q('vista').innerHTML = '<div class="err">Primero cargue el MAF.</div>'; return; }
        crDesdePlaca();
        if (faltaDato()) { pintarPaso(); return; } // el paso indica qué falta; al llenarlo se valida solo
        var r = lote.validar(movimiento());
        if (r.estado === 'ERROR' && placa.length < PLACA_MIN) { pintarPaso(); return; } // aún escribiendo
        vistaActual = { res: r };
        pintarVista(r);
      }, 250);
    }

    // Lo que el tipo de movimiento necesita antes de poder validar la placa
    function faltaDato() {
      var tipo = val('tipo');
      if (tipo === 'BAJA' && !val('motivo')) return { campo: 'motivo', texto: 'elija el Tipo de baja.' };
      if (tipo === 'TRASPASO' && !AF.util.texto(val('crDestino'))) return { campo: 'crDestino', texto: 'capture la tienda destino.' };
      return null;
    }

    // Una sola indicación de qué hacer ahora
    function pintarPaso() {
      var t = '', falta = faltaDato(), r = vistaActual && vistaActual.res;
      if (!lote) t = '';
      else if (falta) t = falta.texto.charAt(0).toUpperCase() + falta.texto.slice(1);
      else if (!AF.util.limpiaPlaca(val('placa'))) t = lote.filas.length ? 'Escanee la siguiente placa o, si ya terminó, descargue el Excel abajo.' : 'Escanee o escriba la placa.';
      else if (r && r.estado === 'OK') t = 'Revise los datos y presione ✓ Validar y agregar.';
      else if (r && r.estado === 'ELEGIR') t = 'Elija con ✓ el activo que corresponde a esta placa.';
      else if (r && r.estado === 'ERROR') t = 'No se puede agregar: revise lo marcado en rojo.';
      q('paso').textContent = t ? 'Ahora: ' + t : '';
      App.pintarContexto();
    }

    App.registrarContexto(cfg.modulo, function () {
      var tipo = val('tipo'), cr = AF.util.texto(val('cr')).toUpperCase();
      var partes = [anexo ? 'Baja Anexo 3' : NOM[tipo], crPorPlaca ? 'Tienda: la de cada placa' + (cr ? ' (última: ' + cr + ' ' + val('tienda') + ')' : '') : cr ? cr + ' ' + val('tienda') : 'Tienda: la de la placa'];
      if (tipo === 'BAJA') partes.push(val('motivo') || 'sin tipo de baja');
      if (tipo === 'TRASPASO') partes.push(AF.util.texto(val('crDestino')) ? 'a ' + val('crDestino').toUpperCase() + ' ' + val('tiendaDestino') : 'destino sin capturar');
      if (val('fecha') !== App.hoyLocal()) partes.push('Fecha ' + App.fechaTexto(val('fecha')));
      partes.push(App.cuenta(lote ? lote.filas.length : 0, 'capturado', 'capturados'));
      return partes.join(' · ');
    });

    function tablaFila(fila) {
      var campos = VISTA[cfg.formato][fila.tipo];
      // Ficha: cada dato con su etiqueta (se lee de un vistazo, también de lejos)
      return '<div class="ficha"><div class="ficha-t">Se escribirá en "' + esc(AFWriter.hojaDe(cfg.formato, fila.tipo).trim()) + '"</div><dl class="kv">' +
        campos.map(function (k) { return '<div><dt>' + esc(ETIQUETAS[k] || k) + '</dt><dd>' + esc(fila[k] || '') + '</dd></div>'; }).join('') + '</dl></div>';
    }

    // Lo del MAF del activo encontrado se muestra de guía en serie / marca / modelo vacíos
    function guiaMaf(reg) {
      ['serie', 'marca', 'modelo'].forEach(function (c) { q(c).placeholder = reg && reg[c] ? 'MAF: ' + reg[c] : ''; });
    }

    function pintarVista(r) {
      var html = '';
      guiaMaf(r.fila ? App.maf.idx.porActivo.get(r.fila.noActivo) : null);
      if (r.estado === 'OK') {
        html += tablaFila(r.fila);
        if (r.filaTraspaso) html += tablaFila(r.filaTraspaso);
        html += '<button data-accion="validar" class="palomita">✓ Validar y agregar' + (r.filaTraspaso ? ' (alta + transferencia)' : '') + '</button>' +
          ' <button data-cotejar="' + esc([r.filaTraspaso ? r.fila.cr : '', r.fila.descripcion].join('|')) + '">Cotejar en el MAF</button>';
      }
      r.errores.forEach(function (m) { html += '<div class="err">✗ ' + esc(m) + '</div>'; });
      r.advertencias.forEach(function (m) { html += '<div class="warn">⚠ ' + esc(m) + '</div>'; });
      if (r.sugerencia && tipos.indexOf('TRASPASO') >= 0) {
        html += '<div class="warn">⚠ ' + esc(r.sugerencia.texto) + ' <button data-accion="sugerencia">Cambiar a transferencia</button> <button data-cotejar="' + esc(r.sugerencia.crOrigen + '|' + r.sugerencia.descripcion) + '">Cotejar en el MAF</button></div>';
      }
      if (val('tipo') === 'ALTA' && !buscarOtras && (r.estado === 'OK' || (r.estado === 'ELEGIR' && !r.otrasTiendas)) && !r.filaTraspaso && !r.mismoEquipo) {
        html += '<div><button data-accion="otras">No corresponde a esta tienda: buscar en otras tiendas</button></div>';
      }
      if (r.estado === 'ELEGIR') {
        var lista = r.candidatos.slice(0, MAX_CANDIDATOS);
        var crActual = AF.util.texto(val('cr')).toUpperCase();
        html += '<table><tr><th></th><th>No Activo</th><th>CR</th><th>Tienda</th><th>Placa</th><th>Descripción</th><th>Marca</th><th>Modelo</th><th>Serie</th><th>Adq.</th><th>Origen</th></tr>';
        lista.forEach(function (x) {
          html += '<tr><td><button class="palomita" data-activo="' + esc(x.noActivo) + '">✓</button> <button data-cotejar="' + esc((x.cr !== crActual ? x.cr : '') + '|' + x.descripcion) + '">Cotejar</button></td><td>' +
            [x.noActivo, x.cr, x.crDesc, x.placa, x.descripcion, x.marca, x.modelo, x.serie, x.mesAdq + '/' + x.anioAdq, x.origen].map(esc).join('</td><td>') + '</td></tr>';
        });
        html += '</table>';
        if (r.candidatos.length > lista.length) html += '<div class="muted">Mostrando ' + lista.length + ' de ' + r.candidatos.length + '. Capture el equipo o la serie para filtrar.</div>';
      }
      q('vista').innerHTML = html;
      q('cotejo').innerHTML = '';
      pintarPaso();
    }

    // Cotejo: lo que el MAF dice que tiene la tienda capturada (y la otra tienda) de ese equipo
    function pintarCotejo(dato) {
      var partes = dato.split('|');
      var crOtra = partes[0], desc = partes.slice(1).join('|');
      var crs = [AF.util.texto(val('cr')).toUpperCase()];
      if (crOtra && crs.indexOf(crOtra) < 0) crs.push(crOtra);
      var html = '<div><b>Cotejo en el MAF: ' + esc(desc) + '</b> <button data-accion="cerrarCotejo">Cerrar</button></div>' +
        '<div class="muted">Verifique en sitio que lo que dice el MAF exista físicamente. A veces equipos que ya no están siguen apareciendo porque no se dieron de baja.</div>';
      crs.forEach(function (cr, i) {
        var c = lote.cotejo(cr, desc);
        html += '<div style="margin-top:6px"><b>' + (i === 0 ? 'Tienda capturada' : 'Tienda donde está cargado en el MAF') + ': ' + esc(c.cr + ' ' + c.tienda) + '</b> — ' + c.equipos.length + ' en el MAF</div>';
        if (!c.equipos.length) { html += '<div class="muted">El MAF no tiene equipos de este tipo en esta tienda.</div>'; return; }
        html += '<table><tr><th>No Activo</th><th>Estado</th><th>Marca</th><th>Modelo</th><th>Serie</th><th>Desc. adicional</th><th>Adq.</th><th>Origen</th></tr>' +
          c.equipos.map(function (x) {
            return '<tr><td>' + [x.noActivo, x.estado, x.marca, x.modelo, x.serie, x.descAdic, x.mesAdq + '/' + x.anioAdq, x.origen].map(esc).join('</td><td>') + '</td></tr>';
          }).join('') + '</table>';
      });
      q('cotejo').innerHTML = html;
    }

    function confirmar(noActivo) {
      if (!lote) return;
      var r = lote.agregar(movimiento(noActivo));
      if (r.estado !== 'OK') { vistaActual = { res: r }; pintarVista(r); return; }
      guardar();
      q('resultado').innerHTML = '<div class="ok">✓ Agregado: ' + esc(r.fila.tipo + ' — placa ' + r.fila.placa + ' → activo ' + r.fila.noActivo + ' (' + r.fila.descripcion + ')') + '</div>' +
        (r.filaTraspaso ? '<div class="ok">✓ Agregado: TRANSFERENCIA — placa ' + esc(r.filaTraspaso.placa + ' de ' + r.filaTraspaso.cr + ' a ' + r.filaTraspaso.crDestino) + '</div>' : '');
      ['placa', 'serie', 'marca', 'modelo'].forEach(function (id) { q(id).value = ''; });
      q('vista').innerHTML = ''; q('cotejo').innerHTML = ''; vistaActual = null; buscarOtras = false;
      q('placa').focus();
      pintarLote(); actualizarPendientes(); pintarMasiva(); pintarPaso();
      var f = r.fila, nom = NOM[f.tipo] + ' ' + (f.placa || f.noActivo);
      App.lectura('ok', '✓ Agregado: ' + nom + ' → ' + f.descripcion + ' (activo ' + f.noActivo + ')', function () {
        lote.eliminar(f.id); guardar();
        q('resultado').innerHTML = '';
        pintarLote(); actualizarPendientes(); pintarMasiva(); pintarPaso();
        App.lectura('rebote', 'Deshecho: ' + nom + ' ya no está en la captura.');
      });
    }

    // ---------- Lista pegada ----------
    var revisados = [];
    function revisarLista() {
      if (!lote) { q('resLista').innerHTML = '<div class="err">Primero cargue el MAF.</div>'; return; }
      var items = AF.parsearLista(App.maf, val('lista'));
      if (!items.length) { q('resLista').innerHTML = '<div class="err">No se encontraron placas en el texto.</div>'; return; }
      var sim = lote.copia();
      revisados = items.map(function (it) {
        var mov = movimiento(it.noActivo);
        mov.placa = it.placa; mov.serie = it.serie; mov.buscarOtras = false;
        mov.marca = ''; mov.modelo = ''; // marca/modelo capturados son de un solo equipo: en la lista va lo del MAF
        return { it: it, mov: mov, r: sim.agregar(mov) };
      });
      var ok = revisados.filter(function (x) { return x.r.estado === 'OK'; }).length;
      var NOM = { OK: '✓', ELEGIR: 'Elegir', ERROR: '✗' };
      q('resLista').innerHTML = '<div><b>' + items.length + ' renglones:</b> <span class="ok">' + ok + ' correctos</span>' +
        (items.length - ok ? ', <span class="err">' + (items.length - ok) + ' con problema (no se agregan)</span>' : '') + '</div>' +
        '<table><tr><th>Renglón</th><th>Placa / activo</th><th></th><th>No Activo</th><th>Descripción</th><th>CR</th><th>Detalle</th></tr>' +
        revisados.map(function (x) {
          var f = x.r.fila || {};
          var det = x.r.errores.concat(x.r.advertencias);
          if (x.r.estado === 'ELEGIR') det.unshift('Tiene varias opciones: captúrela sola para elegir.');
          return '<tr><td>' + [x.it.linea, x.it.placa || x.it.noActivo].map(esc).join('</td><td>') + '</td>' +
            '<td class="' + (x.r.estado === 'OK' ? 'ok' : 'err') + '">' + NOM[x.r.estado] + '</td><td>' +
            [f.noActivo, f.descripcion, (f.cr || '') + (x.r.filaTraspaso ? ' → ' + x.r.filaTraspaso.crDestino : '')].map(esc).join('</td><td>') + '</td><td>' + esc(det.join(' ')) + '</td></tr>';
        }).join('') + '</table>' +
        (ok ? '<button class="palomita" data-accion="agregarLista">✓ Agregar los ' + ok + ' correctos</button>' : '');
    }
    function agregarLista() {
      var hechos = 0, fallas = [];
      revisados.filter(function (x) { return x.r.estado === 'OK'; }).forEach(function (x) {
        var r = lote.agregar(x.mov);
        if (r.estado === 'OK') hechos++; else fallas.push('Renglón ' + x.it.linea + ': ' + r.errores.join(' '));
      });
      revisados = [];
      guardar();
      q('lista').value = '';
      q('resLista').innerHTML = '<div class="ok">✓ ' + hechos + ' movimiento(s) agregado(s) de la lista.</div>' +
        fallas.map(function (m) { return '<div class="err">✗ ' + esc(m) + '</div>'; }).join('');
      pintarLote(); actualizarPendientes(); pintarMasiva();
    }

    // ---------- Baja masiva ----------
    var masMarcados = new Set();
    function masivaFiltrada() {
      var k = AF.util.llaveTexto(val('filtroMasiva'));
      return (App.maf.idx.porCr.get(AF.util.texto(val('cr')).toUpperCase()) || []).filter(function (r) {
        return !k || AF.util.llaveTexto(r.descripcion + ' ' + r.noActivo + ' ' + r.placa + ' ' + r.marca + ' ' + r.modelo).indexOf(k) >= 0;
      }).slice().sort(function (a, b) { return a.descripcion.localeCompare(b.descripcion) || a.noActivo.localeCompare(b.noActivo); });
    }
    function cuentaMasiva() {
      var n = Array.from(masMarcados).filter(function (a) { return !lote.usadoEn('BAJA', a); }).length;
      q('masCuenta').textContent = n + ' marcado(s)';
    }
    function pintarMasiva() {
      if (!q('detMasiva').open || !lote) return;
      if (!AF.tiendaDeCr(App.maf, val('cr'))) { q('masiva').innerHTML = '<div class="err">Capture el CR o la tienda.</div>'; q('masCuenta').textContent = ''; return; }
      var lista = masivaFiltrada();
      q('masiva').innerHTML = '<div class="muted">' + lista.length + ' activos' + (val('filtroMasiva') ? ' con el filtro' : ' en el CR') + '.</div>' +
        '<table><tr><th></th><th>No Activo</th><th>Placa</th><th>Descripción</th><th>Marca</th><th>Modelo</th><th>Serie</th><th>Estado</th><th>Adq.</th><th>Valor neto</th><th></th></tr>' +
        lista.map(function (r) {
          var usado = lote.usadoEn('BAJA', r.noActivo);
          return '<tr><td>' + (usado ? '' : '<input type="checkbox" data-mas="' + esc(r.noActivo) + '"' + (masMarcados.has(r.noActivo) ? ' checked' : '') + '>') + '</td><td>' +
            [r.noActivo, r.placa, r.descripcion, r.marca, r.modelo, r.serie, AF.estadoActivo(r), r.mesAdq + '/' + r.anioAdq, r.valorNeto].map(esc).join('</td><td>') + '</td>' +
            '<td>' + (usado ? '<span class="ok">Baja en ' + esc(usado) + '</span>' : '') + '</td></tr>';
        }).join('') + '</table>';
      cuentaMasiva();
    }
    function agregarMasiva() {
      var lista = Array.from(masMarcados).filter(function (a) { return !lote.usadoEn('BAJA', a); });
      if (!lista.length) { q('resultado').innerHTML = '<div class="err">Marque los activos a dar de baja.</div>'; return; }
      if (!val('motivo')) { q('resultado').innerHTML = '<div class="err">Elija el tipo de baja.</div>'; return; }
      if (!confirm('¿Agregar ' + lista.length + ' baja(s) como "' + val('motivo') + '"?')) return;
      var hechos = 0, fallas = [];
      lista.forEach(function (a) {
        var mov = movimiento(a); mov.tipo = 'BAJA'; mov.placa = '';
        mov.serie = ''; mov.marca = ''; mov.modelo = ''; // en la baja masiva va lo del MAF de cada activo
        var r = lote.agregar(mov);
        if (r.estado === 'OK') hechos++; else fallas.push(a + ': ' + r.errores.join(' '));
      });
      masMarcados.clear();
      guardar();
      q('resultado').innerHTML = '<div class="ok">✓ ' + hechos + ' baja(s) agregada(s).</div>' + fallas.map(function (m) { return '<div class="err">✗ ' + esc(m) + '</div>'; }).join('');
      pintarLote(); pintarMasiva();
    }
    q('detMasiva').addEventListener('toggle', pintarMasiva);
    q('filtroMasiva').addEventListener('input', pintarMasiva);
    q('cr').addEventListener('input', function () { masMarcados.clear(); pintarMasiva(); });
    q('tienda').addEventListener('input', function () { masMarcados.clear(); pintarMasiva(); });
    cont.addEventListener('change', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-mas');
      if (!a) return;
      if (e.target.checked) masMarcados.add(a); else masMarcados.delete(a);
      cuentaMasiva();
    });

    cont.addEventListener('click', function (e) {
      var t = e.target;
      if (!t.getAttribute) return;
      var accion = t.getAttribute('data-accion');
      if (accion === 'revisarLista') revisarLista();
      else if (accion === 'agregarLista') agregarLista();
      else if (accion === 'masMarcarTodos') { masivaFiltrada().forEach(function (r) { masMarcados.add(r.noActivo); }); pintarMasiva(); }
      else if (accion === 'masDesmarcar') { masMarcados.clear(); pintarMasiva(); }
      else if (accion === 'masAgregar') agregarMasiva();
      else if (accion === 'validar') confirmar();
      else if (accion === 'otras') { buscarOtras = true; previsualizar(); }
      else if (accion === 'cerrarCotejo') q('cotejo').innerHTML = '';
      else if (accion === 'sugerencia' && vistaActual && vistaActual.res.sugerencia) {
        var s = vistaActual.res.sugerencia;
        q('tipo').value = 'TRASPASO'; ajustarCampos();
        q('placa').value = s.placa; q('crDestino').value = s.crDestino;
        q('crDestino').dispatchEvent(new Event('input'));
        previsualizar();
      }
      else if (t.getAttribute('data-cotejar') !== null) pintarCotejo(t.getAttribute('data-cotejar'));
      else if (t.getAttribute('data-activo')) confirmar(t.getAttribute('data-activo'));
      else if (t.getAttribute('data-quitar')) {
        lote.eliminar(Number(t.getAttribute('data-quitar'))); guardar();
        pintarLote(); actualizarPendientes(); pintarMasiva();
      }
    });

    // Enter / escáner: busca y muestra la vista previa; agregar requiere la ✓, salvo el modo
    // "agregar solo" (bajas y transferencias leídas con escáner, sin errores ni advertencias).
    var NOM = { ALTA: 'Alta', BAJA: 'Baja', TRASPASO: 'Transferencia' };
    function leerPlaca(escaner) {
      clearTimeout(tEspera);
      if (!lote) { App.lectura('error', 'Primero cargue el MAF.'); return; }
      var p = AF.util.limpiaPlaca(val('placa'));
      if (!p) return;
      var alta = val('tipo') === 'ALTA';
      if (escaner && alta) q('serie').value = ''; // equipo nuevo: la serie del anterior no aplica
      crDesdePlaca();
      var falta = faltaDato();
      if (falta) {
        vistaActual = null; q('vista').innerHTML = ''; pintarPaso();
        App.lectura('aviso', 'Placa ' + p + ' leída. Falta: ' + falta.texto);
        q(falta.campo).focus();
        return;
      }
      var r = lote.validar(movimiento());
      vistaActual = { res: r };
      pintarVista(r);
      if (escaner && !alta && q('auto').checked && r.estado === 'OK' && !r.advertencias.length) {
        confirmar();
        return;
      }
      if (r.estado === 'ERROR') App.lectura('error', '✗ ' + p + ': ' + r.errores[0]);
      else if (r.estado === 'ELEGIR') App.lectura('aviso', '⚠ ' + p + ': ' + (r.advertencias[0] || 'elija el activo.'));
      else App.lectura(r.advertencias.length ? 'aviso' : 'ok', (r.advertencias.length ? '⚠ ' : '✓ ') + p + ' → ' + r.fila.descripcion + ' (activo ' + r.fila.noActivo + ')' +
        (r.advertencias.length ? ' — ' + r.advertencias[0] : '') + ' — valide con ✓');
      if (escaner && alta && r.estado !== 'ERROR') q('serie').focus(); // siguiente lectura: la serie del equipo
    }
    q('placa').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      leerPlaca(false);
    });
    q('serie').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      leerSerie();
    });
    function leerSerie() {
      if (!AF.util.limpiaPlaca(val('placa'))) { App.lectura('aviso', 'Serie leída: ' + val('serie') + '. Ahora escanee la placa.'); q('placa').focus(); return; }
      leerPlaca(false);
    }
    App.registrarEscaner(cfg.modulo, {
      placa: q('placa'),
      alLeer: function () { leerPlaca(true); },
      secundarios: [{ campo: q('serie'), alLeer: leerSerie }]
    });
    q('auto').checked = App.pref('auto_' + cfg.modulo, false);
    q('auto').addEventListener('change', function () { App.guardarPref('auto_' + cfg.modulo, q('auto').checked); });
    ['placa', 'serie', 'descripcion', 'marca', 'modelo', 'proveedor', 'observaciones'].forEach(function (id) {
      var el = q(id); if (el) el.addEventListener('input', previsualizar);
    });
    ['motivoSalida', 'tipoEquipo', 'disposicion', 'fecha'].forEach(function (id) {
      var el = q(id); if (el) el.addEventListener('change', previsualizar);
    });

    // ---------- Movimientos capturados ----------
    var NOMBRE_TIPO = { ALTA: 'Alta', BAJA: 'Baja', TRASPASO: 'Transferencia' };
    var COLS = anexo
      ? [['id', '#'], ['tipo', 'Tipo'], ['placa', 'Placa'], ['noActivo', 'No Activo'], ['descripcion', 'Descripción'], ['cr', 'CR'], ['tienda', 'Tienda'],
        ['motivo', 'Tipo de baja'], ['motivoSalida', 'Motivo salida'], ['tipoEquipo', 'Tipo equipo'], ['disposicion', 'Disposición'], ['proveedor', 'Proveedor'], ['observaciones', 'Obs.'], ['fecha', 'Fecha']]
      : [['id', '#'], ['tipo', 'Tipo'], ['placa', 'Placa'], ['noActivo', 'No Activo'], ['descripcion', 'Descripción'], ['cr', 'CR'], ['tienda', 'Tienda'],
        ['serie', 'Serie'], ['motivo', 'Tipo de baja'], ['crDestino', 'CR destino'], ['marca', 'Marca'], ['modelo', 'Modelo'], ['fecha', 'Fecha']];

    function pintarLote() {
      var filas = lote ? lote.filas : [];
      q('nLote').textContent = filas.length;
      var t = '<tr><th></th>' + COLS.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '</tr>';
      filas.slice().reverse().forEach(function (f) {
        t += '<tr><td><button data-quitar="' + f.id + '">Quitar</button></td>' + COLS.map(function (c) {
          var v = c[0] === 'tipo' ? NOMBRE_TIPO[f.tipo] + (f.ligadaA ? ' (ligado a #' + f.ligadaA + ')' : '') : f[c[0]];
          return '<td>' + esc(v || '') + '</td>';
        }).join('') + '</tr>';
      });
      q('tablaLote').innerHTML = t;
      App.resumenLote(cfg.modulo);
    }

    App.botonesFormato({
      cont: q('pie'),
      modulo: cfg.modulo,
      formato: cfg.formato,
      nombre: function () { return cfg.nombreArchivo + ' ' + val('fecha') + '.xlsx'; },
      filas: function () { return lote ? lote.filas : []; },
      alVaciar: function () {
        if (!lote) return;
        lote = new AF.Lote(App.maf, App.historialPara(cfg.modulo));
        guardar();
        q('vista').innerHTML = ''; q('cotejo').innerHTML = ''; q('resultado').innerHTML = '';
        ['placa', 'serie', 'marca', 'modelo', 'crDestino', 'tiendaDestino'].forEach(function (id) { q(id).value = ''; });
        pintarLote(); actualizarPendientes(); pintarMasiva(); pintarPaso();
      }
    });

    App.alMaf(function () { crearLote(); pintarLote(); desdeCr(); pintarPaso(); });
    App.alCambioExterno(cfg.modulo, function () {
      if (!lote) return;
      lote.historial = App.historialPara(cfg.modulo);
      actualizarPendientes(); previsualizar();
    });
    ajustarCampos();
  };
})();
