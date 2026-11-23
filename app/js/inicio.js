/* Arranca todos los módulos en la misma página; comun.js muestra el del hash (#movimientos, #plaqueo, #anexo3, #levantamiento, #consultas o #maf). */
(function () {
  'use strict';
  var App = window.AFApp;
  window.AFCaptura({ modulo: 'movimientos', formato: 'V2', tipos: ['ALTA', 'BAJA', 'TRASPASO'], nombreArchivo: 'Formato de Movimientos AF V.2' });
  window.AFPlaqueo();
  window.AFCaptura({ modulo: 'anexo3', formato: 'ANEXO3', tipos: ['BAJA'], nombreArchivo: 'Formato de Movimientos AF (Anexo 3)' });
  window.AFLevantamiento();
  window.AFConsultas();
  window.AFMaf();
  App.iniciar();
})();
