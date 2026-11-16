/*
 * Escribe renglones en un formato Excel oficial editando directamente el XML de cada hoja
 * (conserva estilos, listas desplegables, formato condicional, imágenes, pestañas ocultas).
 * Requiere JSZip (window.JSZip en navegador, require('jszip') en Node).
 */
(function (root) {
  'use strict';

  var JSZipLib = (typeof module !== 'undefined' && module.exports) ? require('jszip') : root.JSZip;

  // ---------- Utilidades de valores ----------

  /** 'dd/mm/aaaa' -> número de serie de Excel (fecha) */
  function serialFecha(f) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(f || '').trim());
    if (!m) return '';
    return Math.round((Date.UTC(+m[3], +m[2] - 1, +m[1]) - Date.UTC(1899, 11, 30)) / 86400000);
  }
  function num(v) { return { valor: v, numerico: true }; }
  function txt(v) { return { valor: v, numerico: false }; }
  // Número si es puramente numérico (sin cero inicial que perder); si no, texto
  function numOTexto(v) {
    var s = String(v === undefined || v === null ? '' : v);
    return /^[1-9]\d*$/.test(s) ? num(s) : txt(s);
  }
  function primeraFecha(filas) { return filas.length ? serialFecha(filas[0].fecha) : ''; }

  // ---------- Formatos ----------
  // cols: columna -> función(fila) que devuelve {valor, numerico}
  var FORMATOS = {
    // Formato de Movimientos AF V.2 2026 (dataload)
    V2: {
      ALTA: {
        // El renglón 2 trae un ejemplo (marcado "Ejemplo" en L): se sobrescribe; el renglón 3 es el modelo
        hoja: 'Alta de código', inicio: 2, modelo: 3, clave: 'A', ejemplo: { col: 'L', texto: 'Ejemplo' },
        cols: {
          A: function (f) { return num(f.noActivo); },
          B: function (f) { return txt(f.placa); },
          C: function (f) { return txt(f.serie); },
          D: function (f) { return txt(f.modelo); },
          E: function (f) { return txt(f.marca); },
          G: function (f) { return num(serialFecha(f.fecha)); },
          L: function () { return txt(''); } // quita la marca "Ejemplo"
        }
      },
      TRASPASO: {
        hoja: 'Transferencia ', inicio: 2, modelo: 3, clave: 'A', ejemplo: { col: 'K', texto: 'Ejemplo' },
        cols: {
          A: function (f) { return num(f.noActivo); },
          B: function (f) { return txt(f.placa); },
          C: function (f) { return numOTexto(f.cr); },
          D: function (f) { return numOTexto(f.crDestino); },
          F: function (f) { return num(serialFecha(f.fecha)); },
          K: function () { return txt(''); } // quita la marca "Ejemplo"
        }
      },
      BAJA: {
        hoja: 'Bajas', inicio: 17, clave: 'A',
        cols: {
          A: function (f) { return num(f.noActivo); },
          B: function (f) { return txt(f.descripcion); },
          C: function (f) { return num(f.valorNeto); },
          D: function (f) { return txt(f.modelo); },
          E: function (f) { return num(f.anioAdq); },
          F: function (f) { return txt(f.serie); },
          G: function (f) { return txt(f.motivo); },
          K: function (f) { return numOTexto(f.cr); }
        },
        encabezado: function (filas) { return { B8: num(primeraFecha(filas)) }; }
      }
    },
    // Formato de Movimientos AF (Anexo 3) — desincorporación, 50 renglones por formato
    ANEXO3: {
      BAJA: {
        hoja: 'Bajas_Desincorporación', inicio: 14, fin: 63, clave: 'B',
        cols: {
          B: function (f) { return num(f.noActivo); },
          C: function (f) { return txt(f.descripcion); },
          D: function (f) { return num(f.valorNeto); },
          E: function (f) { return txt(f.modelo); },
          F: function (f) { return num(f.anioAdq); },
          G: function (f) { return txt(f.serie); },
          H: function (f) { return txt(f.motivo); },
          L: function (f) { return numOTexto(f.cr); },
          M: function (f) { return txt(f.placa); },
          N: function (f) { return txt(f.motivoSalida); },
          O: function (f) { return txt(f.tipoEquipo); },
          P: function (f) { return txt(f.disposicion); },
          Q: function (f) { return txt(f.proveedor); },
          R: function (f) { return txt(f.observaciones); }
        },
        encabezado: function (filas) {
          return { C8: num(primeraFecha(filas)), N8: txt(filas.length ? filas[0].plaza : '') };
        },
        // Pestaña extra: cuántos equipos de cada tipo se mandan a reciclaje (estilos tomados del encabezado y renglón de la tabla)
        concentrado: { hoja: 'Concentrado reciclaje', estiloEncabezado: 'C13', estiloDato: 'C14' }
      }
    }
  };

  function colANum(c) {
    var n = 0;
    for (var i = 0; i < c.length; i++) n = n * 26 + (c.charCodeAt(i) - 64);
    return n;
  }
  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function desXml(s) {
    return String(s).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  // ---------- Modelo mínimo de la hoja ----------

  var RE_ROW = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  var RE_CELL = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

  function attr(attrs, nombre) {
    var m = new RegExp('\\b' + nombre + '="([^"]*)"').exec(attrs);
    return m ? m[1] : null;
  }

  function leerHoja(xml) {
    var m = /<sheetData\s*\/>|<sheetData>([\s\S]*?)<\/sheetData>/.exec(xml);
    if (!m) throw new Error('Hoja sin sheetData');
    var filas = new Map();
    var cuerpo = m[1] || '';
    var r;
    RE_ROW.lastIndex = 0;
    while ((r = RE_ROW.exec(cuerpo))) {
      var numFila = Number(attr(r[1], 'r'));
      var celdas = new Map();
      var c;
      var interior = r[2] || '';
      RE_CELL.lastIndex = 0;
      while ((c = RE_CELL.exec(interior))) {
        var col = attr(c[1], 'r').replace(/\d+/g, '');
        celdas.set(col, { attrs: c[1], inner: c[2] || '', xml: c[0] });
      }
      filas.set(numFila, { attrs: r[1], celdas: celdas });
    }
    return { xml: xml, inicio: m.index, fin: m.index + m[0].length, filas: filas };
  }

  function celdaConValor(celda) { return !!celda && /<v>|<is>/.test(celda.inner); }

  // Renglón de ejemplo del formato (cuenta como libre: se sobrescribe)
  function esEjemplo(fila, cfg) {
    if (!cfg.ejemplo) return false;
    var c = fila.celdas.get(cfg.ejemplo.col);
    if (!c) return false;
    var t = /<t[^>]*>([^<]*)<\/t>/.exec(c.inner);
    if (t) return t[1].trim() === cfg.ejemplo.texto;
    // texto compartido: no lo resolvemos aquí; basta con que tenga valor en la columna de marca
    return /t="s"/.test(c.attrs) && /<v>/.test(c.inner);
  }

  function siguienteFilaLibre(hoja, cfg) {
    var ultima = cfg.inicio - 1;
    hoja.filas.forEach(function (fila, n) {
      if (n >= cfg.inicio && (!cfg.fin || n <= cfg.fin) && celdaConValor(fila.celdas.get(cfg.clave)) && !esEjemplo(fila, cfg) && n > ultima) ultima = n;
    });
    return ultima + 1;
  }

  function xmlCelda(ref, estilo, v) {
    var s = estilo !== null && estilo !== undefined ? ' s="' + estilo + '"' : '';
    if (!v || v.valor === null || v.valor === undefined || v.valor === '') return '<c r="' + ref + '"' + s + '/>';
    if (v.numerico && /^-?\d+(\.\d+)?$/.test(String(v.valor))) return '<c r="' + ref + '"' + s + '><v>' + v.valor + '</v></c>';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + escXml(v.valor) + '</t></is></c>';
  }

  // Copia del renglón modelo (antes de escribir) para crear renglones nuevos con el mismo
  // estilo y los mismos valores fijos (p. ej. TAB / *DN del dataload).
  function modeloDeFila(hoja, n) {
    var f = hoja.filas.get(n);
    if (!f) return null;
    var celdas = new Map();
    f.celdas.forEach(function (c, col) { celdas.set(col, { attrs: c.attrs, inner: c.inner, xml: c.xml }); });
    return { attrs: f.attrs, celdas: celdas, num: n };
  }

  function filaNueva(modelo, n) {
    var attrs = modelo ? ' r="' + n + '"' + modelo.attrs.replace(/\s*\br="\d+"/, '').replace(/\s*\bspans="[^"]*"/, '') : ' r="' + n + '"';
    var celdas = new Map();
    if (modelo) {
      modelo.celdas.forEach(function (c, col) {
        var ref = col + n;
        var xml = c.xml.replace(/\br="[A-Z]+\d+"/, 'r="' + ref + '"');
        celdas.set(col, { attrs: c.attrs.replace(/\br="[A-Z]+\d+"/, 'r="' + ref + '"'), inner: c.inner, xml: xml });
      });
    }
    return { attrs: attrs, celdas: celdas };
  }

  function escribirCelda(hoja, n, col, v, modelo) {
    var fila = hoja.filas.get(n);
    if (!fila) { fila = filaNueva(modelo, n); hoja.filas.set(n, fila); }
    var actual = fila.celdas.get(col);
    var estilo = actual ? attr(actual.attrs, 's') : null;
    if (estilo === null && modelo && modelo.celdas.get(col)) estilo = attr(modelo.celdas.get(col).attrs, 's');
    var xml = xmlCelda(col + n, estilo, v);
    fila.celdas.set(col, { attrs: ' r="' + col + n + '"' + (estilo !== null ? ' s="' + estilo + '"' : ''), inner: v && v.valor !== '' ? '<v>' : '', xml: xml });
  }

  function serializarHoja(hoja) {
    var nums = Array.from(hoja.filas.keys()).sort(function (a, b) { return a - b; });
    var cuerpo = nums.map(function (n) {
      var f = hoja.filas.get(n);
      var cols = Array.from(f.celdas.keys()).sort(function (a, b) { return colANum(a) - colANum(b); });
      if (!cols.length) return '<row' + f.attrs + '/>';
      return '<row' + f.attrs + '>' + cols.map(function (c) { return f.celdas.get(c).xml; }).join('') + '</row>';
    }).join('');
    var xml = hoja.xml.slice(0, hoja.inicio) + '<sheetData>' + cuerpo + '</sheetData>' + hoja.xml.slice(hoja.fin);
    var maxFila = nums.length ? nums[nums.length - 1] : 1;
    return xml.replace(/<dimension ref="([A-Z]+\d+):([A-Z]+)(\d+)"\/>/, function (m, a, b, n) {
      return '<dimension ref="' + a + ':' + b + Math.max(Number(n), maxFila) + '"/>';
    });
  }

  // ---------- Pestaña de concentrado ----------

  /** [{equipo, n}] ordenado de más a menos */
  function concentrarPorEquipo(filas) {
    var cuenta = {};
    filas.forEach(function (f) { var k = String(f.descripcion || 'Sin descripción').trim(); cuenta[k] = (cuenta[k] || 0) + 1; });
    return Object.keys(cuenta).map(function (k) { return { equipo: k, n: cuenta[k] }; })
      .sort(function (a, b) { return b.n - a.n || a.equipo.localeCompare(b.equipo, 'es'); });
  }

  function estiloDe(hoja, ref) {
    var col = ref.replace(/\d+/g, ''), n = Number(ref.replace(/[A-Z]+/g, ''));
    var fila = hoja.filas.get(n), celda = fila && fila.celdas.get(col);
    return celda ? attr(celda.attrs, 's') : null;
  }

  /** Agrega al libro una hoja nueva con una tabla sencilla (renglones de celdas {valor, numerico}) */
  function agregarHoja(zip, nombre, renglones, estilos, anchos) {
    return Promise.all([
      zip.file('xl/workbook.xml').async('string'),
      zip.file('xl/_rels/workbook.xml.rels').async('string'),
      zip.file('[Content_Types].xml').async('string')
    ]).then(function (r) {
      var wb = r[0], rels = r[1], tipos = r[2];
      function maximo(lista) { return lista.reduce(function (a, b) { return Math.max(a, b); }, 0); }
      var n = maximo(Object.keys(zip.files).map(function (p) { var m = /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(p); return m ? Number(m[1]) : 0; })) + 1;
      var rid = 'rId' + (maximo((rels.match(/\bId="rId(\d+)"/g) || []).map(function (x) { return Number(x.replace(/\D/g, '')); })) + 1);
      var sid = maximo((wb.match(/\bsheetId="(\d+)"/g) || []).map(function (x) { return Number(x.replace(/\D/g, '')); })) + 1;
      var usados = (wb.match(/<sheet\b[^>]*>/g) || []).map(function (s) { return desXml(attr(s, 'name') || ''); });
      var final = nombre, i = 2;
      while (usados.indexOf(final) >= 0) final = nombre + ' ' + i++;
      var cols = ['A', 'B', 'C', 'D', 'E', 'F'];
      var cuerpo = renglones.map(function (ren, k) {
        return '<row r="' + (k + 1) + '">' + ren.celdas.map(function (v, j) { return xmlCelda(cols[j] + (k + 1), estilos[ren.estilo], v); }).join('') + '</row>';
      }).join('');
      var ancho = renglones.reduce(function (a, ren) { return Math.max(a, ren.celdas.length); }, 1);
      var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<dimension ref="A1:' + cols[ancho - 1] + Math.max(1, renglones.length) + '"/><sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
        '<sheetFormatPr defaultRowHeight="15"/><cols>' + anchos.map(function (w, j) { return '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' +
        '<sheetData>' + cuerpo + '</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
      zip.file('xl/worksheets/sheet' + n + '.xml', xml);
      zip.file('xl/workbook.xml', wb.replace('</sheets>', '<sheet name="' + escXml(final) + '" sheetId="' + sid + '" r:id="' + rid + '"/></sheets>'));
      zip.file('xl/_rels/workbook.xml.rels', rels.replace('</Relationships>',
        '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/></Relationships>'));
      zip.file('[Content_Types].xml', tipos.replace('</Types>',
        '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'));
      return final;
    });
  }

  // ---------- Libro ----------

  function rutasDeHojas(zip) {
    return Promise.all([
      zip.file('xl/workbook.xml').async('string'),
      zip.file('xl/_rels/workbook.xml.rels').async('string')
    ]).then(function (r) {
      var rels = {};
      var m, re = /<Relationship\b[^>]*>/g;
      while ((m = re.exec(r[1]))) {
        var id = attr(m[0], 'Id'), target = attr(m[0], 'Target');
        if (id && target) rels[id] = target.replace(/^\//, '').replace(/^xl\//, '');
      }
      var rutas = {};
      re = /<sheet\b[^>]*>/g;
      while ((m = re.exec(r[0]))) {
        var nombre = desXml(attr(m[0], 'name'));
        var rid = attr(m[0], 'r:id');
        if (rels[rid]) rutas[nombre] = 'xl/' + rels[rid];
      }
      return rutas;
    });
  }

  /**
   * base: bytes del formato oficial vacío; filas: renglones (con .tipo); formato: 'V2' | 'ANEXO3'
   * Devuelve Promise<{ datos: Uint8Array, resumen: {TIPO: {hoja, desde, hasta, n}} }>
   */
  function generarExcel(base, filas, formato) {
    var defs = FORMATOS[formato || 'V2'];
    if (!defs) return Promise.reject(new Error('Formato desconocido: ' + formato));
    var zip;
    return JSZipLib.loadAsync(base).then(function (z) {
      zip = z;
      return rutasDeHojas(zip);
    }).then(function (rutas) {
      var resumen = {};
      var extras = [];   // pestañas de concentrado por agregar al final
      var tipos = {};
      filas.forEach(function (f) { tipos[f.tipo] = 1; });
      Object.keys(tipos).forEach(function (t) { if (!defs[t]) throw new Error('Este formato no tiene pestaña para ' + t + '.'); });
      var tareas = Object.keys(defs).map(function (tipo) {
        var cfg = defs[tipo];
        var propias = filas.filter(function (f) { return f.tipo === tipo; });
        if (!propias.length) return null;
        var ruta = rutas[cfg.hoja];
        if (!ruta || !zip.file(ruta)) throw new Error('El formato no tiene la pestaña "' + cfg.hoja + '".');
        return zip.file(ruta).async('string').then(function (xml) {
          var hoja = leerHoja(xml);
          var modelo = modeloDeFila(hoja, cfg.modelo || cfg.inicio);
          var desde = siguienteFilaLibre(hoja, cfg);
          if (cfg.fin && desde + propias.length - 1 > cfg.fin) {
            throw new Error('"' + cfg.hoja + '" admite ' + (cfg.fin - cfg.inicio + 1) + ' renglones por formato y hay ' + propias.length + '. Guarde este formato y capture el resto en otro.');
          }
          propias.forEach(function (f, i) {
            Object.keys(cfg.cols).forEach(function (col) { escribirCelda(hoja, desde + i, col, cfg.cols[col](f), modelo); });
          });
          if (cfg.encabezado) {
            var enc = cfg.encabezado(propias);
            Object.keys(enc).forEach(function (ref) {
              var col = ref.replace(/\d+/g, ''), n = Number(ref.replace(/[A-Z]+/g, ''));
              if (enc[ref].valor !== '' && enc[ref].valor !== undefined) escribirCelda(hoja, n, col, enc[ref], null);
            });
          }
          resumen[tipo] = { hoja: cfg.hoja, desde: desde, hasta: desde + propias.length - 1, n: propias.length };
          if (cfg.concentrado) {
            var conc = concentrarPorEquipo(propias);
            extras.push({ tipo: tipo, hoja: cfg.concentrado.hoja, estilos: { enc: estiloDe(hoja, cfg.concentrado.estiloEncabezado), dato: estiloDe(hoja, cfg.concentrado.estiloDato) },
              renglones: [{ estilo: 'enc', celdas: [txt('Equipo'), txt('Número de equipos')] }]
                .concat(conc.map(function (x) { return { estilo: 'dato', celdas: [txt(x.equipo), num(x.n)] }; }))
                .concat([{ estilo: 'enc', celdas: [txt('Total'), num(propias.length)] }]) });
          }
          zip.file(ruta, serializarHoja(hoja));
        });
      }).filter(Boolean);
      return Promise.all(tareas).then(function () {
        return extras.reduce(function (p, x) {
          return p.then(function () {
            return agregarHoja(zip, x.hoja, x.renglones, x.estilos, [60, 20]).then(function (nombre) { resumen[x.tipo].concentrado = { hoja: nombre, equipos: x.renglones.length - 2 }; });
          });
        }, Promise.resolve());
      }).then(function () { return resumen; });
    }).then(function (resumen) {
      return zip.file('xl/workbook.xml').async('string').then(function (wb) {
        if (/<calcPr\b/.test(wb) && !/fullCalcOnLoad/.test(wb)) wb = wb.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"');
        zip.file('xl/workbook.xml', wb);
        return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }).then(function (datos) {
          return { datos: datos, resumen: resumen };
        });
      });
    });
  }

  /** Hoja y columnas (con encabezado legible) de un tipo en un formato, para la vista previa */
  function hojaDe(formato, tipo) {
    var d = FORMATOS[formato] && FORMATOS[formato][tipo];
    return d ? d.hoja : '';
  }

  var Writer = { FORMATOS: FORMATOS, generarExcel: generarExcel, hojaDe: hojaDe, serialFecha: serialFecha, concentrarPorEquipo: concentrarPorEquipo };
  if (typeof module !== 'undefined' && module.exports) module.exports = Writer;
  else root.AFWriter = Writer;
})(typeof window !== 'undefined' ? window : this);
