/*
 * Motor de movimientos de activo fijo.
 * - Carga cualquier versión del MAF (detecta encabezados por nombre).
 * - Cruza placa <-> No. Activo y arma los renglones de Alta / Baja / Traspaso / Garantía.
 * Funciona igual en navegador (window.AF) y en Node (require).
 */
(function (root) {
  'use strict';

  var TIPOS = ['ALTA', 'BAJA', 'TRASPASO'];

  // Tipos de baja del formato oficial V.2 / Anexo 3 (con su escenario de uso)
  var MOTIVOS_BAJA = [
    'ROBO',
    'SINIESTRO',
    'VENTA (de bienes o inmuebles)',
    'CIERRE TIENDA',
    'DESUSO',
    'OBSOLETO',
    'REMODELACION (baja por no utilización)',
    'NO LOCALIZADO (ND)',
    'SIN BENEF FUTURO (ND)',
    'DISPOSICION (ND)'
  ];
  var ESCENARIOS_BAJA = [
    'Sustraído de forma ilícita; requiere acta o denuncia formal.',
    'Dañado total o parcialmente por un evento (incendio, inundación, etc.); inutilizable.',
    'Vendido legalmente con factura o contrato.',
    'Cierre definitivo de la unidad; no se reutiliza ni se reubica.',
    'Funcional, pero dejó de usarse por obsolescencia o reemplazo.',
    'Sin utilidad futura y depreciado completamente.',
    'Retirado por remodelación o rediseño; no se reincorpora.',
    'No localizado en auditoría física, sin evidencia de robo (cuenta no deducible).',
    'Su permanencia no aporta valor (cuenta no deducible).',
    'Se descarta o va a reciclaje/destrucción (cuenta no deducible).'
  ];
  // Listas del Anexo 3
  var ANEXO3 = {
    motivoSalida: ['Vida Útil / Depreciación', 'Funcionalidad', 'Tecnología', 'Costos de Operación', 'Siniestros', 'Necesidades Comerciales', 'Requerimientos Normativos'],
    tipoEquipo: ['Refrigeración/AC', 'Mobiliario', 'Eléctrico/Electrónico', 'Otros'],
    disposicion: ['Refacción / Respaldo', 'Traspaso', 'Donación', 'Venta para Reutilización', 'Venta para Reciclaje']
  };

  // Columnas del MAF: clave interna -> nombre de encabezado normalizado
  var COLUMNAS = {
    plazaDesc: 'plaza desc',
    plaza: 'plaza',
    distrito: 'distrito',
    cr: 'cr',
    crDesc: 'cr desc',
    placa: 'codigo barras',
    plaqueable: 'plaqueable',
    noActivo: 'no activo',
    mesAdq: 'mes adq',
    anioAdq: 'anio adq',
    descAdic: 'desc adicional',
    origen: 'origen',
    descripcion: 'descripcion',
    marca: 'marca',
    modelo: 'modelo',
    serie: 'serie',
    factura: 'factura',
    valorNeto: 'valor neto',
    // Solo para consulta (pestaña "Consultar el MAF"); opcionales
    noLegacy: 'no legacy',
    cuenta: 'cuenta',
    subcuenta: 'subcuenta',
    familia: 'familia',
    cveActivo: 'cve activo',
    costo: 'costo',
    deprnAcum: 'deprn acum',
    deprnAnual: 'deprn anual',
    vidaUtil: 'vida util',
    remanente: 'remantente',   // así viene escrito en el MAF; también se acepta "remanente"
    departamento: 'departamento e',
    descPuesto: 'desc puesto'
  };
  // Encabezados alternos de una misma columna
  var ALTERNAS = { remanente: ['remanente'], departamento: ['departamento'] };
  var OBLIGATORIAS = ['cr', 'crDesc', 'placa', 'plaqueable', 'noActivo', 'descripcion', 'marca', 'modelo', 'serie'];

  // ---------- Normalización ----------

  // Quita caracteres invisibles (marcas de dirección U+200B-U+200F, U+202A-U+202E, U+2060-U+2069, BOM)
  var INVISIBLES = /[​-‏‪-‮⁠-⁩﻿]/g;

  function texto(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(INVISIBLES, '').replace(/\s+/g, ' ').trim();
  }

  function normEncabezado(v) {
    return texto(v).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Placa tal como se muestra (sin invisibles ni espacios)
  function limpiaPlaca(v) {
    return texto(v).replace(/\s/g, '').toUpperCase();
  }

  // Llave de comparación de placa: sin ceros a la izquierda si es numérica
  function llavePlaca(v) {
    var p = limpiaPlaca(v);
    if (/^\d+$/.test(p)) p = p.replace(/^0+/, '') || '0';
    return p;
  }

  // Serie para comparar: solo letras y números en mayúsculas ("KC7A-M3XC GAR6" -> "KC7AM3XCGAR6")
  function llaveSerie(v) {
    return texto(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function llaveCr(v) {
    return texto(v).toUpperCase();
  }

  function llaveFactura(v) {
    return texto(v).toUpperCase().replace(/\s+/g, '');
  }

  function llaveTexto(v) {
    return normEncabezado(v);
  }

  // ---------- Carga del MAF ----------

  /**
   * hojas: { nombreHoja: arrayDeFilas } (cada fila = array de celdas, como sheet_to_json header:1)
   * Devuelve el objeto MAF con índices, o lanza Error con mensaje claro.
   */
  function cargarMAF(hojas) {
    var mejor = null;
    Object.keys(hojas).forEach(function (nombre) {
      var filas = hojas[nombre] || [];
      var lim = Math.min(filas.length, 40);
      for (var i = 0; i < lim; i++) {
        var norm = (filas[i] || []).map(normEncabezado);
        if (norm.indexOf('no activo') >= 0 && norm.indexOf('codigo barras') >= 0) {
          var datos = filas.length - i - 1;
          if (!mejor || datos > mejor.datos) mejor = { nombre: nombre, filaEnc: i, norm: norm, datos: datos };
          break;
        }
      }
    });
    if (!mejor) throw new Error('No se encontró una hoja con encabezados del MAF ("No Activo" y "Codigo Barras").');

    var pos = {};
    Object.keys(COLUMNAS).forEach(function (k) {
      pos[k] = mejor.norm.indexOf(COLUMNAS[k]);
      (ALTERNAS[k] || []).forEach(function (a) { if (pos[k] < 0) pos[k] = mejor.norm.indexOf(a); });
    });
    var faltan = OBLIGATORIAS.filter(function (k) { return pos[k] < 0; });
    if (faltan.length) {
      throw new Error('Al MAF le faltan columnas obligatorias: ' + faltan.map(function (k) { return COLUMNAS[k]; }).join(', '));
    }

    var filas = hojas[mejor.nombre];
    // Fecha del reporte (arriba del encabezado)
    var fecha = '';
    for (var f = 0; f < mejor.filaEnc; f++) {
      (filas[f] || []).forEach(function (c) {
        var m = /fecha del reporte:?\s*(.+)/i.exec(texto(c));
        if (m) fecha = m[1].trim();
      });
    }

    var registros = [];
    for (var r = mejor.filaEnc + 1; r < filas.length; r++) {
      var fila = filas[r];
      if (!fila) continue;
      var reg = {};
      Object.keys(pos).forEach(function (k) {
        reg[k] = pos[k] >= 0 ? texto(fila[pos[k]]) : '';
      });
      if (!reg.noActivo) continue;
      reg.placa = limpiaPlaca(reg.placa);
      reg.cr = llaveCr(reg.cr);
      reg.plaqueable = reg.plaqueable.toUpperCase();
      registros.push(reg);
    }
    return indexarMAF({ fecha: fecha, hoja: mejor.nombre, registros: registros });
  }

  // Construye índices (también se usa al restaurar un MAF guardado)
  function indexarMAF(maf) {
    var porPlaca = new Map(), porActivo = new Map(), porSerie = new Map(), porCr = new Map();
    function push(map, k, v) {
      if (!k) return;
      var a = map.get(k);
      if (a) a.push(v); else map.set(k, [v]);
    }
    maf.registros.forEach(function (reg) {
      push(porPlaca, llavePlaca(reg.placa), reg);
      porActivo.set(reg.noActivo, reg);
      push(porSerie, llaveSerie(reg.serie), reg);
      push(porCr, reg.cr, reg);
    });
    var placasDuplicadas = [];
    porPlaca.forEach(function (lista, k) { if (lista.length > 1) placasDuplicadas.push(lista[0].placa); });
    maf.idx = { porPlaca: porPlaca, porActivo: porActivo, porSerie: porSerie, porCr: porCr };
    maf.total = maf.registros.length;
    maf.placasDuplicadas = placasDuplicadas;
    maf.sinPlaca = maf.registros.filter(esPendienteDePlaca).length;
    maf.perfilPlacas = perfilPlacas(maf);
    return maf;
  }

  /** Cómo son las placas del MAF (para reconocer lecturas del escáner que no son placa) */
  function perfilPlacas(maf) {
    var cuenta = {}, total = 0, numericas = 0;
    maf.registros.forEach(function (r) {
      if (!r.placa) return;
      total++;
      if (/^\d+$/.test(r.placa)) numericas++;
      cuenta[r.placa.length] = (cuenta[r.placa.length] || 0) + 1;
    });
    var minimo = Math.max(3, total * 0.001); // largos usados en al menos 0.1% de las placas
    return {
      total: total,
      numerico: total > 0 && numericas / total >= 0.99,
      longitudes: Object.keys(cuenta).filter(function (l) { return cuenta[l] >= minimo; }).map(Number).sort(function (a, b) { return a - b; })
    };
  }

  /**
   * ¿La lectura parece una placa? Devuelve '' si sí, o el motivo si no
   * (p. ej. se leyó la serie, un código de producto o el escáner manda caracteres de más).
   */
  function revisarLectura(perfil, codigo) {
    var p = limpiaPlaca(codigo);
    if (!p) return 'Lectura vacía.';
    if (!perfil || !perfil.total) return '';
    if (perfil.numerico && !/^\d+$/.test(p)) {
      if (/^\d{6,}[^A-Z0-9]+$/.test(p) || /^[^A-Z0-9]+\d{6,}$/.test(p)) {
        return 'La lectura trae caracteres de más ("' + p.replace(/\d/g, '') + '"): revise el idioma de teclado o el prefijo/sufijo del escáner.';
      }
      return 'Las placas son solo números y se leyó "' + p + '" (¿la serie u otro código?).';
    }
    if (perfil.longitudes.indexOf(p.length) < 0) {
      return 'Las placas tienen ' + perfil.longitudes.join(', ') + ' dígitos y se leyeron ' + p.length + ' ("' + p + '"): ¿lectura incompleta u otro código?';
    }
    return '';
  }

  function esPendienteDePlaca(reg) {
    return reg.plaqueable === 'S' && !reg.placa;
  }

  function plazaTexto(reg) {
    return ['Plaza', reg.plazaDesc, reg.plaza].filter(Boolean).join(' ');
  }

  /** Lista de tiendas del MAF: [{cr, tienda, plaza}] ordenada por nombre */
  function tiendas(maf) {
    var out = [];
    maf.idx.porCr.forEach(function (lista, cr) {
      out.push({ cr: cr, tienda: lista[0].crDesc, plaza: plazaTexto(lista[0]) });
    });
    return out.sort(function (a, b) { return a.tienda.localeCompare(b.tienda); });
  }

  /** Busca un CR por nombre de tienda (exacto sin importar mayúsculas/acentos) */
  function crDeTienda(maf, nombre) {
    var k = llaveTexto(nombre);
    if (!k) return null;
    var hallado = null;
    maf.idx.porCr.forEach(function (lista, cr) {
      if (!hallado && llaveTexto(lista[0].crDesc) === k) hallado = { cr: cr, tienda: lista[0].crDesc, plaza: plazaTexto(lista[0]) };
    });
    return hallado;
  }

  function tiendaDeCr(maf, cr) {
    var lista = maf.idx.porCr.get(llaveCr(cr));
    return lista && lista.length ? { cr: lista[0].cr, tienda: lista[0].crDesc, plaza: plazaTexto(lista[0]) } : null;
  }

  // ---------- Lote de captura ----------

  /**
   * historial: array de { tipo, placa, noActivo, fecha, cr } de lotes ya generados.
   */
  function Lote(maf, historial) {
    this.maf = maf;
    this.historial = historial || [];
    this.filas = [];
    this._sec = 0;
  }

  Lote.prototype._usos = function (excluirId) {
    var placasAlta = new Map(), activosAlta = new Map(), activosMov = new Map();
    function marca(map, k, origen) { if (k && !map.has(k)) map.set(k, origen); }
    this.historial.forEach(function (h) {
      var o = 'un Excel generado antes' + (h.fecha ? ' (' + h.fecha + ')' : '');
      if (h.tipo === 'ALTA') { marca(placasAlta, llavePlaca(h.placa), o); marca(activosAlta, h.noActivo, o); }
      else marca(activosMov, h.tipo + '|' + h.noActivo, o);
    });
    this.filas.forEach(function (f) {
      if (f.id === excluirId) return;
      var o = 'este lote (renglón ' + f.id + ')';
      if (f.tipo === 'ALTA') { marca(placasAlta, llavePlaca(f.placa), o); marca(activosAlta, f.noActivo, o); }
      else marca(activosMov, f.tipo + '|' + f.noActivo, o);
    });
    return { placasAlta: placasAlta, activosAlta: activosAlta, activosMov: activosMov };
  };

  /** Tipos de equipo pendientes de placa en un CR: [{descripcion, cantidad}] */
  Lote.prototype.equiposPendientes = function (cr) {
    var usos = this._usos();
    var cuenta = new Map();
    (this.maf.idx.porCr.get(llaveCr(cr)) || []).forEach(function (reg) {
      if (!esPendienteDePlaca(reg) || usos.activosAlta.has(reg.noActivo)) return;
      cuenta.set(reg.descripcion, (cuenta.get(reg.descripcion) || 0) + 1);
    });
    return Array.from(cuenta, function (e) { return { descripcion: e[0], cantidad: e[1] }; })
      .sort(function (a, b) { return a.descripcion.localeCompare(b.descripcion); });
  };

  /** Activos pendientes de placa en un CR, opcionalmente filtrados por descripción */
  Lote.prototype.pendientes = function (cr, descripcion) {
    var usos = this._usos();
    var filtro = llaveTexto(descripcion);
    return (this.maf.idx.porCr.get(llaveCr(cr)) || []).filter(function (reg) {
      if (!esPendienteDePlaca(reg) || usos.activosAlta.has(reg.noActivo)) return false;
      return !filtro || llaveTexto(reg.descripcion).indexOf(filtro) >= 0;
    });
  };

  /**
   * Activos pendientes de placa en OTRAS tiendas (equipo de renovación cargado en el MAF a un CR
   * distinto al que realmente lo recibió). Se busca primero en la misma plaza; si no hay, en todo el MAF.
   * Orden: mismo distrito primero, luego por CR.
   */
  Lote.prototype.pendientesOtrasTiendas = function (cr, descripcion) {
    var usos = this._usos();
    var crK = llaveCr(cr);
    var filtro = llaveTexto(descripcion);
    var ref = (this.maf.idx.porCr.get(crK) || [])[0] || {};
    var todos = this.maf.registros.filter(function (reg) {
      if (reg.cr === crK || !esPendienteDePlaca(reg) || usos.activosAlta.has(reg.noActivo)) return false;
      return !filtro || llaveTexto(reg.descripcion).indexOf(filtro) >= 0;
    });
    var mismaPlaza = todos.filter(function (r) { return r.plazaDesc === ref.plazaDesc && r.plaza === ref.plaza; });
    var lista = mismaPlaza.length ? mismaPlaza : todos;
    return lista.sort(function (a, b) {
      var da = a.distrito === ref.distrito ? 0 : 1, db = b.distrito === ref.distrito ? 0 : 1;
      return da - db || a.cr.localeCompare(b.cr) || a.noActivo.localeCompare(b.noActivo);
    });
  };

  /** Tipos de equipo pendientes de placa en otras tiendas de la misma plaza */
  Lote.prototype.equiposPendientesOtras = function (cr) {
    var cuenta = new Map();
    this.pendientesOtrasTiendas(cr, '').forEach(function (reg) {
      cuenta.set(reg.descripcion, (cuenta.get(reg.descripcion) || 0) + 1);
    });
    return Array.from(cuenta, function (e) { return { descripcion: e[0], cantidad: e[1] }; })
      .sort(function (a, b) { return a.descripcion.localeCompare(b.descripcion); });
  };

  /**
   * Cotejo: todo lo que el MAF dice que tiene una tienda de cierto tipo de equipo
   * (con placa y pendientes), para verificarlo físicamente en sitio antes de casar o transferir.
   * Devuelve { cr, tienda, equipos: [registro + estado] }
   */
  Lote.prototype.cotejo = function (cr, descripcion) {
    var usos = this._usos();
    var crK = llaveCr(cr);
    var k = llaveTexto(descripcion);
    var lista = (this.maf.idx.porCr.get(crK) || []).filter(function (r) {
      return !k || llaveTexto(r.descripcion) === k;
    }).map(function (r) {
      var estado = r.placa ? 'Con placa ' + r.placa
        : usos.activosAlta.has(r.noActivo) ? 'Casado en ' + usos.activosAlta.get(r.noActivo)
        : r.plaqueable === 'S' ? 'Pendiente de placa' : 'No plaqueable';
      var copia = {};
      Object.keys(r).forEach(function (x) { copia[x] = r[x]; });
      copia.estado = estado;
      return copia;
    }).sort(function (a, b) { return a.estado.localeCompare(b.estado) || a.noActivo.localeCompare(b.noActivo); });
    var t = tiendaDeCr(this.maf, crK);
    return { cr: crK, tienda: t ? t.tienda : '', equipos: lista };
  };

  /**
   * Plaqueo: equipos de una factura (renovación ya cargada en el MAF), opcionalmente de un CR.
   * Cada equipo trae estado: 'pendiente' (plaqueable sin placa), 'conPlaca', 'casado' (en captura/historial)
   * o 'noPlaqueable'. Orden: CR, descripción, No Activo.
   */
  Lote.prototype.porFactura = function (factura, cr) {
    var usos = this._usos();
    var k = llaveFactura(factura), crK = llaveCr(cr);
    if (!k) return [];
    return this.maf.registros.filter(function (r) {
      return llaveFactura(r.factura) === k && (!crK || r.cr === crK);
    }).map(function (r) {
      var estado = r.placa ? 'conPlaca' : usos.activosAlta.has(r.noActivo) ? 'casado' : r.plaqueable === 'S' ? 'pendiente' : 'noPlaqueable';
      return { reg: r, estado: estado, casadoEn: usos.activosAlta.get(r.noActivo) || '' };
    }).sort(function (a, b) {
      return a.reg.cr.localeCompare(b.reg.cr) || a.reg.descripcion.localeCompare(b.reg.descripcion) || a.reg.noActivo.localeCompare(b.reg.noActivo);
    });
  };

  /** Busca una placa en el MAF */
  Lote.prototype.buscarPlaca = function (placa) {
    return this.maf.idx.porPlaca.get(llavePlaca(placa)) || [];
  };

  /**
   * Agrega un movimiento. mov = {
   *   tipo: 'ALTA'|'BAJA'|'TRASPASO', fecha, cr,
   *   placa, serie, descripcion (tipo de equipo, alta), noActivo (elección explícita),
   *   marca, modelo, motivo (baja), crDestino, tiendaDestino (traspaso), observaciones
   * }
   * Devuelve { estado: 'OK'|'ELEGIR'|'ERROR', errores[], advertencias[], fila?, candidatos? }
   */
  Lote.prototype.agregar = function (mov) {
    var res = this.validar(mov);
    if (res.estado === 'OK') {
      res.fila.id = ++this._sec;
      this.filas.push(res.fila);
      if (res.filaTraspaso) {
        // Alta de un activo cargado en otra tienda: va ligada a su traspaso
        res.filaTraspaso.id = ++this._sec;
        res.filaTraspaso.ligadaA = res.fila.id;
        res.fila.ligadaA = res.filaTraspaso.id;
        this.filas.push(res.filaTraspaso);
      }
    }
    return res;
  };

  /** Igual que agregar pero sin guardar (para previsualizar) */
  Lote.prototype.validar = function (mov) {
    mov = mov || {};
    var tipo = texto(mov.tipo).toUpperCase();
    var res = { estado: 'ERROR', errores: [], advertencias: [] };
    if (TIPOS.indexOf(tipo) < 0) { res.errores.push('Tipo de movimiento inválido: "' + mov.tipo + '". Use ' + TIPOS.join(', ') + '.'); return res; }
    if (tipo === 'ALTA') return this._alta(mov, res);
    return this._porPlaca(tipo, mov, res);
  };

  /** Quita un renglón (y su renglón ligado: alta <-> traspaso generados juntos) */
  Lote.prototype.eliminar = function (id) {
    var n = this.filas.length;
    var f0 = this.filas.filter(function (f) { return f.id === id; })[0];
    var ligada = f0 && f0.ligadaA;
    this.filas = this.filas.filter(function (f) { return f.id !== id && f.id !== ligada; });
    return this.filas.length < n;
  };

  Lote.prototype._base = function (tipo, reg, mov) {
    return {
      tipo: tipo,
      fecha: texto(mov.fecha),
      plaza: plazaTexto(reg),
      cr: reg.cr,
      tienda: reg.crDesc,
      noActivo: reg.noActivo,
      descripcion: reg.descripcion,
      descAdic: reg.descAdic,
      placa: reg.placa,
      plaqueable: reg.plaqueable,
      marca: texto(mov.marca) || reg.marca,
      modelo: texto(mov.modelo) || reg.modelo,
      serie: texto(mov.serie) || reg.serie,
      valorNeto: reg.valorNeto,
      anioAdq: reg.anioAdq,
      factura: reg.factura
    };
  };

  Lote.prototype._alta = function (mov, res) {
    var maf = this.maf, usos = this._usos();
    var cr = llaveCr(mov.cr);
    var placa = limpiaPlaca(mov.placa);
    if (!cr) res.errores.push('Falta el CR de la tienda.');
    else if (!maf.idx.porCr.has(cr)) res.errores.push('El CR ' + cr + ' no existe en el MAF.');
    if (!placa) res.errores.push('Falta la placa (código de barras) nueva.');
    if (res.errores.length) return res;

    // La placa ya casada en el MAF con un activo de ESTA misma tienda: es el mismo equipo,
    // se permite darlo de alta con ese activo (solo se avisa).
    var enMaf = maf.idx.porPlaca.get(llavePlaca(placa)) || [];
    var mismoEquipo = null;
    if (enMaf.length === 1 && enMaf[0].cr === cr && !texto(mov.noActivo)) {
      mismoEquipo = enMaf[0];
      if (usos.placasAlta.has(llavePlaca(placa))) { res.errores.push('La placa ' + placa + ' ya se usó en ' + usos.placasAlta.get(llavePlaca(placa)) + '.'); return res; }
      if (usos.activosAlta.has(mismoEquipo.noActivo)) { res.errores.push('El activo ' + mismoEquipo.noActivo + ' ya se casó en ' + usos.activosAlta.get(mismoEquipo.noActivo) + '.'); return res; }
      if (texto(mov.descripcion) && llaveTexto(mismoEquipo.descripcion).indexOf(llaveTexto(mov.descripcion)) < 0) {
        res.advertencias.push('Ojo: el activo del MAF es "' + mismoEquipo.descripcion + '" y capturó "' + texto(mov.descripcion) + '".');
      }
      res.advertencias.push('La placa ' + placa + ' ya está casada en el MAF con el activo ' + mismoEquipo.noActivo + ' de esta misma tienda; se da de alta con ese activo.');
      enMaf = [];
    }
    enMaf.forEach(function (r) {
      res.errores.push('La placa ' + placa + ' ya está asignada en el MAF al activo ' + r.noActivo + ' (' + r.descripcion + ', CR ' + r.cr + ' ' + r.crDesc + ').');
    });
    if (enMaf.length === 1 && enMaf[0].cr !== cr) {
      // El equipo ya existe con placa en otra tienda: lo que procede es un traspaso
      res.sugerencia = { tipo: 'TRASPASO', placa: enMaf[0].placa, crDestino: cr, crOrigen: enMaf[0].cr, descripcion: enMaf[0].descripcion,
        texto: 'Si el equipo está físicamente en ' + cr + ', lo que procede es un traspaso de ' + enMaf[0].cr + ' a ' + cr + '.' };
    }
    if (usos.placasAlta.has(llavePlaca(placa))) res.errores.push('La placa ' + placa + ' ya se usó en ' + usos.placasAlta.get(llavePlaca(placa)) + '.');
    if (res.errores.length) return res;

    var reg = mismoEquipo;
    var serie = llaveSerie(mov.serie);
    function validaElegido(r) {
      if (!r) { res.errores.push('El activo ' + mov.noActivo + ' no existe en el MAF.'); return false; }
      if (r.placa) { res.errores.push('El activo ' + r.noActivo + ' ya tiene la placa ' + r.placa + ' en el MAF.'); return false; }
      if (usos.activosAlta.has(r.noActivo)) { res.errores.push('El activo ' + r.noActivo + ' ya se casó en ' + usos.activosAlta.get(r.noActivo) + '.'); return false; }
      if (r.plaqueable !== 'S') res.advertencias.push('El activo ' + r.noActivo + ' está marcado como NO plaqueable en el MAF.');
      return true;
    }
    var self = this;
    function buscarFuera(motivo) {
      var fuera = self.pendientesOtrasTiendas(cr, mov.descripcion);
      if (!fuera.length) {
        res.errores.push(motivo + ' Tampoco hay activos pendientes de placa' + (texto(mov.descripcion) ? ' con descripción "' + texto(mov.descripcion) + '"' : '') + ' en otras tiendas.');
        return res;
      }
      res.estado = 'ELEGIR';
      res.otrasTiendas = true;
      res.candidatos = fuera;
      res.advertencias.push(motivo + ' Hay ' + fuera.length + ' activos pendientes de placa cargados en otras tiendas' +
        (texto(mov.descripcion) ? '' : ' (capture el equipo para filtrar)') + '. Al elegir uno se genera la ALTA en su CR del MAF y el TRASPASO a ' + cr + '.');
      return res;
    }

    if (reg) {
      res.mismoEquipo = true; // 0) La placa ya está casada con un activo de esta tienda
    } else if (texto(mov.noActivo)) {
      // 1) Elección explícita
      reg = maf.idx.porActivo.get(texto(mov.noActivo));
      if (!validaElegido(reg)) return res;
    } else if (serie) {
      // 2) Por serie
      var porSerie = maf.idx.porSerie.get(serie) || [];
      var libres = porSerie.filter(function (r) { return !r.placa && !usos.activosAlta.has(r.noActivo); });
      if (libres.length === 1) {
        reg = libres[0];
        if (!validaElegido(reg)) return res;
        res.advertencias.push('Casado por serie con el activo ' + reg.noActivo + '.');
      } else if (libres.length > 1) {
        res.estado = 'ELEGIR';
        res.candidatos = libres;
        res.advertencias.push('La serie coincide con ' + libres.length + ' activos sin placa; elija uno.');
        return res;
      } else if (porSerie.length) {
        porSerie.forEach(function (r) {
          res.errores.push('La serie ' + mov.serie + ' ya está en el activo ' + r.noActivo + (r.placa ? ' con placa ' + r.placa : '') + ' (CR ' + r.cr + ').');
        });
        return res;
      }
    }

    if (!reg && mov.buscarOtras) {
      // 3a) El usuario pidió buscar fuera de la tienda (el de su CR ya se renovó / no corresponde)
      return buscarFuera('Búsqueda en otras tiendas.');
    }

    if (!reg) {
      // 3b) Por candidatos pendientes de placa en el CR
      var cand = this.pendientes(cr, mov.descripcion);
      if (!cand.length) {
        return buscarFuera('No hay activos pendientes de placa en el CR ' + cr + (texto(mov.descripcion) ? ' con descripción "' + texto(mov.descripcion) + '"' : '') + '.');
      }
      if (cand.length === 1) {
        reg = cand[0];
        res.advertencias.push('Asignado al único activo pendiente: ' + reg.noActivo + ' (' + reg.descripcion + ').');
      } else {
        res.estado = 'ELEGIR';
        res.candidatos = cand;
        res.advertencias.push('Hay ' + cand.length + ' activos pendientes de placa; elija a cuál corresponde la placa ' + placa + '.');
        return res;
      }
    }

    var fila = this._base('ALTA', reg, mov);
    if (reg.serie && llaveSerie(reg.serie) === serie) fila.serie = reg.serie; // casado por serie: se respeta la del MAF
    else if (texto(mov.serie)) fila.serie = texto(mov.serie).toUpperCase();
    fila.placa = placa;
    fila.plaqueable = reg.plaqueable || 'S';
    fila.observaciones = texto(mov.observaciones);
    if (!fila.serie) res.advertencias.push('El equipo queda sin serie; captúrela si la tiene.');
    // Serie capturada distinta a la que el MAF tiene para ese activo: puede ser otro equipo (se avisa, no se bloquea)
    if (serie && reg.serie && llaveSerie(reg.serie) !== serie) {
      res.serieDistinta = { capturada: texto(mov.serie).toUpperCase(), maf: reg.serie };
      res.advertencias.push('La serie capturada (' + res.serieDistinta.capturada + ') no coincide con la del MAF (' + reg.serie + ') para el activo ' + reg.noActivo + '. Verifique que sea el mismo equipo.');
    }

    if (reg.cr !== cr) {
      // Activo cargado en el MAF a otra tienda: ALTA en su CR del MAF + TRASPASO a la tienda real
      var dest = tiendaDeCr(maf, cr);
      var tr = this._base('TRASPASO', reg, mov);
      tr.placa = placa;
      tr.serie = fila.serie;
      tr.marca = fila.marca;
      tr.modelo = fila.modelo;
      tr.crDestino = cr;
      tr.tiendaDestino = dest ? dest.tienda : '';
      res.filaTraspaso = tr;
      res.advertencias.push('El activo ' + reg.noActivo + ' está cargado en el MAF al CR ' + reg.cr + ' (' + reg.crDesc + '): se genera ALTA en ' + reg.cr + ' y TRASPASO de ' + reg.cr + ' a ' + cr + '.');
    }
    res.estado = 'OK';
    res.fila = fila;
    return res;
  };

  Lote.prototype._porPlaca = function (tipo, mov, res) {
    var maf = this.maf, usos = this._usos();
    var reg = null;
    var placa = limpiaPlaca(mov.placa);

    if (texto(mov.noActivo)) {
      reg = maf.idx.porActivo.get(texto(mov.noActivo));
      if (!reg) { res.errores.push('El activo ' + mov.noActivo + ' no existe en el MAF.'); return res; }
      if (placa && llavePlaca(reg.placa) !== llavePlaca(placa)) res.advertencias.push('La placa capturada (' + placa + ') no coincide con la del MAF (' + (reg.placa || 'sin placa') + ').');
    } else {
      if (!placa) { res.errores.push('Falta la placa (código de barras).'); return res; }
      var lista = maf.idx.porPlaca.get(llavePlaca(placa)) || [];
      if (!lista.length) { res.errores.push('La placa ' + placa + ' no existe en el MAF.'); return res; }
      if (lista.length > 1) {
        res.estado = 'ELEGIR';
        res.candidatos = lista;
        res.advertencias.push('La placa ' + placa + ' está duplicada en el MAF (' + lista.length + ' activos); elija el correcto.');
        return res;
      }
      reg = lista[0];
    }

    var cr = llaveCr(mov.cr);
    if (cr && reg.cr !== cr) res.advertencias.push('La placa ' + reg.placa + ' pertenece al CR ' + reg.cr + ' (' + reg.crDesc + '), no a ' + cr + '.');
    var k = tipo + '|' + reg.noActivo;
    if (usos.activosMov.has(k)) { res.errores.push('El activo ' + reg.noActivo + ' ya tiene ' + tipo.toLowerCase() + ' en ' + usos.activosMov.get(k) + '.'); return res; }
    if (tipo === 'BAJA' && usos.activosMov.has('BAJA_OTRO|' + reg.noActivo)) res.advertencias.push('El activo ' + reg.noActivo + ' también tiene baja en el otro formato (' + usos.activosMov.get('BAJA_OTRO|' + reg.noActivo) + ').');
    if (tipo !== 'BAJA' && usos.activosMov.has('BAJA|' + reg.noActivo)) res.advertencias.push('El activo ' + reg.noActivo + ' ya tiene una baja registrada (' + usos.activosMov.get('BAJA|' + reg.noActivo) + ').');

    var fila = this._base(tipo, reg, mov);

    if (tipo === 'BAJA') {
      var motivo = resolverMotivo(mov.motivo);
      if (!motivo) { res.errores.push('Falta un motivo de baja válido: ' + MOTIVOS_BAJA.join(' / ') + '.'); return res; }
      fila.motivo = motivo;
      // Datos adicionales del Anexo 3 (desincorporación); en el formato V.2 no se usan
      fila.motivoSalida = texto(mov.motivoSalida);
      fila.tipoEquipo = texto(mov.tipoEquipo);
      fila.disposicion = texto(mov.disposicion);
      fila.proveedor = texto(mov.proveedor);
      fila.observaciones = texto(mov.observaciones);
    } else if (tipo === 'TRASPASO') {
      var crDest = llaveCr(mov.crDestino);
      if (!crDest) { res.errores.push('Falta el CR destino.'); return res; }
      if (crDest === reg.cr) { res.errores.push('El CR destino es el mismo que el de origen (' + crDest + ').'); return res; }
      var dest = tiendaDeCr(maf, crDest);
      if (!dest && !texto(mov.tiendaDestino)) { res.errores.push('El CR destino ' + crDest + ' no existe en el MAF; capture el nombre de la tienda destino.'); return res; }
      if (!dest) res.advertencias.push('El CR destino ' + crDest + ' no está en el MAF; se usa el nombre capturado.');
      fila.crDestino = crDest;
      fila.tiendaDestino = texto(mov.tiendaDestino) || dest.tienda;
    }

    res.estado = 'OK';
    res.fila = fila;
    return res;
  };

  function resolverMotivo(m) {
    if (m === null || m === undefined || m === '') return null;
    if (typeof m === 'number' || /^\d+$/.test(String(m))) return MOTIVOS_BAJA[Number(m)] || null;
    var k = llaveTexto(m);
    for (var i = 0; i < MOTIVOS_BAJA.length; i++) {
      if (llaveTexto(MOTIVOS_BAJA[i]) === k || llaveTexto(MOTIVOS_BAJA[i]).indexOf(k) === 0) return MOTIVOS_BAJA[i];
    }
    return null;
  }

  /** Copia del lote para simular (p. ej. revisar una lista pegada sin tocar la captura) */
  Lote.prototype.copia = function () {
    var l = new Lote(this.maf, this.historial);
    l.filas = this.filas.slice();
    l._sec = this._sec;
    return l;
  };

  /** ¿Ya hay movimiento (en captura o en un Excel generado) para este activo/placa? Devuelve el origen o '' */
  Lote.prototype.usadoEn = function (tipo, noActivo, placa) {
    var u = this._usos();
    if (tipo === 'ALTA') return u.activosAlta.get(noActivo) || (placa ? u.placasAlta.get(llavePlaca(placa)) : '') || '';
    return u.activosMov.get(tipo + '|' + noActivo) || '';
  };

  /** Todos los activos pendientes de placa del MAF que aún no se casan (captura / Excel generados) */
  Lote.prototype.todosPendientes = function () {
    var usos = this._usos();
    return this.maf.registros.filter(function (r) { return esPendienteDePlaca(r) && !usos.activosAlta.has(r.noActivo); });
  };

  /**
   * Levantamiento físico de una tienda: compara las placas escaneadas contra lo que el MAF dice del CR.
   * Devuelve {
   *   encontrados:   [{placa, reg}]   en el MAF en esta tienda
   *   otraTienda:    [{placa, reg}]   en el MAF en otro CR (procede transferencia)
   *   noRegistradas: [{placa}]        no están en el MAF (procede alta: casar con un pendiente)
   *   duplicadas:    [{placa, regs}]  la placa está en varios activos del MAF
   *   faltantes:     [reg]            del CR, no escaneados (con placa, sin placa o no plaqueables)
   * }
   */
  function levantamiento(maf, cr, placas) {
    var crK = llaveCr(cr);
    var out = { cr: crK, encontrados: [], otraTienda: [], noRegistradas: [], duplicadas: [], faltantes: [] };
    var vistos = new Set();
    (placas || []).forEach(function (p) {
      var placa = limpiaPlaca(p), k = llavePlaca(placa);
      if (!placa || vistos.has(k)) return;
      vistos.add(k);
      var regs = maf.idx.porPlaca.get(k) || [];
      if (!regs.length) out.noRegistradas.push({ placa: placa });
      else if (regs.length > 1) out.duplicadas.push({ placa: placa, regs: regs });
      else if (regs[0].cr === crK) out.encontrados.push({ placa: placa, reg: regs[0] });
      else out.otraTienda.push({ placa: placa, reg: regs[0] });
    });
    var hallados = new Set();
    out.encontrados.forEach(function (e) { hallados.add(e.reg.noActivo); });
    out.duplicadas.forEach(function (d) { d.regs.forEach(function (r) { if (r.cr === crK) hallados.add(r.noActivo); }); });
    out.faltantes = (maf.idx.porCr.get(crK) || []).filter(function (r) { return !hallados.has(r.noActivo); })
      .sort(function (a, b) { return (a.placa ? 0 : 1) - (b.placa ? 0 : 1) || a.descripcion.localeCompare(b.descripcion) || a.noActivo.localeCompare(b.noActivo); });
    return out;
  }

  /**
   * Lista pegada (de Excel o texto): un renglón por equipo; columnas separadas por tabulador, ; , o espacios.
   * 1a columna: placa (o No. Activo si no existe como placa pero sí como activo).
   * Altas: 2a columna = No. Activo si existe en el MAF, si no se toma como serie; 3a = serie.
   * Se ignoran renglones vacíos y encabezados (sin dígitos).
   */
  function parsearLista(maf, txt) {
    var out = [];
    String(txt || '').split(/\r?\n/).forEach(function (linea, i) {
      var cols = linea.split(/\t|;|,|\s{2,}/).map(texto).filter(Boolean);
      if (cols.length === 1) cols = cols[0].split(' ').filter(Boolean);
      if (!cols.length || !/\d/.test(cols[0])) return;
      var e = { linea: i + 1, texto: texto(linea), placa: limpiaPlaca(cols[0]), noActivo: '', serie: '' };
      if (!maf.idx.porPlaca.has(llavePlaca(e.placa)) && maf.idx.porActivo.has(texto(cols[0]))) { e.noActivo = texto(cols[0]); e.placa = ''; }
      if (cols[1]) {
        if (!e.noActivo && maf.idx.porActivo.has(cols[1])) e.noActivo = cols[1];
        else e.serie = cols[1];
      }
      if (cols[2] && !e.serie) e.serie = cols[2];
      out.push(e);
    });
    return out;
  }

  /** Estado de un activo del MAF para consultas */
  function estadoActivo(reg) {
    return reg.placa ? 'Con placa' : reg.plaqueable === 'S' ? 'Pendiente de placa' : 'No plaqueable';
  }

  /**
   * Seguimiento: revisa en el MAF actual si los movimientos ya enviados se aplicaron.
   * enviados: [{tipo, noActivo, placa, cr, crDestino, ...}]
   * Devuelve copias con { estado: 'aplicado'|'pendiente'|'distinto', detalle }
   */
  function seguimiento(maf, enviados) {
    return (enviados || []).map(function (e) {
      var s = {};
      Object.keys(e).forEach(function (k) { s[k] = e[k]; });
      var reg = maf.idx.porActivo.get(e.noActivo);
      if (e.tipo === 'BAJA') {
        s.estado = reg ? 'pendiente' : 'aplicado';
        s.detalle = reg ? 'Sigue en el MAF (CR ' + reg.cr + ' ' + reg.crDesc + ').' : 'Ya no aparece en el MAF.';
      } else if (!reg) {
        s.estado = 'distinto';
        s.detalle = 'El activo ya no aparece en el MAF (¿se dio de baja?).';
      } else if (e.tipo === 'ALTA') {
        if (reg.placa && llavePlaca(reg.placa) === llavePlaca(e.placa)) { s.estado = 'aplicado'; s.detalle = 'El MAF ya tiene la placa ' + reg.placa + '.'; }
        else if (reg.placa) { s.estado = 'distinto'; s.detalle = 'El MAF le puso otra placa: ' + reg.placa + '.'; }
        else {
          var otro = (maf.idx.porPlaca.get(llavePlaca(e.placa)) || [])[0];
          if (otro) { s.estado = 'distinto'; s.detalle = 'La placa quedó en otro activo: ' + otro.noActivo + ' (' + otro.descripcion + ', CR ' + otro.cr + ').'; }
          else { s.estado = 'pendiente'; s.detalle = 'El activo sigue sin placa en el MAF.'; }
        }
      } else if (e.tipo === 'TRASPASO') {
        if (reg.cr === llaveCr(e.crDestino)) { s.estado = 'aplicado'; s.detalle = 'Ya está en el CR ' + reg.cr + ' ' + reg.crDesc + '.'; }
        else if (reg.cr === llaveCr(e.cr)) { s.estado = 'pendiente'; s.detalle = 'Sigue en el CR de origen ' + reg.cr + '.'; }
        else { s.estado = 'distinto'; s.detalle = 'El MAF lo tiene en otro CR: ' + reg.cr + ' ' + reg.crDesc + '.'; }
      } else { s.estado = 'pendiente'; s.detalle = ''; }
      return s;
    });
  }

  /** Entradas de historial a guardar después de generar el Excel */
  Lote.prototype.entradasHistorial = function () {
    return this.filas.map(function (f) {
      return { tipo: f.tipo, placa: f.placa, noActivo: f.noActivo, fecha: f.fecha, cr: f.cr, crDestino: f.crDestino || '' };
    });
  };

  /**
   * Quita del historial las altas que ya aparecen casadas en el MAF actual
   * (el MAF ya se actualizó, ya no hace falta recordarlas).
   */
  function depurarHistorial(maf, historial) {
    return (historial || []).filter(function (h) {
      if (h.tipo !== 'ALTA') return true;
      var reg = maf.idx.porActivo.get(h.noActivo);
      return !(reg && reg.placa && llavePlaca(reg.placa) === llavePlaca(h.placa));
    });
  }

  var AF = {
    TIPOS: TIPOS,
    MOTIVOS_BAJA: MOTIVOS_BAJA,
    ESCENARIOS_BAJA: ESCENARIOS_BAJA,
    ANEXO3: ANEXO3,
    cargarMAF: cargarMAF,
    indexarMAF: indexarMAF,
    tiendaDeCr: tiendaDeCr,
    tiendas: tiendas,
    crDeTienda: crDeTienda,
    depurarHistorial: depurarHistorial,
    levantamiento: levantamiento,
    seguimiento: seguimiento,
    estadoActivo: estadoActivo,
    parsearLista: parsearLista,
    revisarLectura: revisarLectura,
    Lote: Lote,
    util: { texto: texto, limpiaPlaca: limpiaPlaca, llavePlaca: llavePlaca, llaveSerie: llaveSerie, llaveTexto: llaveTexto }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AF;
  else root.AF = AF;
})(typeof window !== 'undefined' ? window : this);
