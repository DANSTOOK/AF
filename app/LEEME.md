# Activo Fijo — Movimientos, Plaqueo y Anexo 3

Abrir **`Movimientos AF.html`** (carpeta AF, un solo archivo, fácil de compartir) en **Chrome o Edge** — no en la vista previa del panel de Claude, ahí no se ejecuta. No necesita instalar nada ni internet.

Arriba hay cinco pestañas en la misma página; al hacer clic el módulo entra deslizándose, sin abrir otra ventana, y lo capturado en cada uno se conserva. Comparten el MAF y la memoria:

| Módulo | Para qué | Formato que llena |
|---|---|---|
| Altas, bajas y transferencias | Captura por placa con vista previa y ✓; lista pegada; baja masiva | Formato de Movimientos AF V.2 (Alta de código, Transferencia, Bajas) |
| Plaqueo por factura | Equipo de renovación ya cargado en el MAF: factura → escanear placas | V.2, pestaña Alta de código |
| Bajas Anexo 3 | Desincorporación oficial; lista pegada; baja masiva | Formato de Movimientos AF (Anexo 3), 50 por archivo (se parte solo) |
| Levantamiento de tienda | Elegir la tienda y poner placa a sus activos (alta con serie, marca y modelo); opcional: revisar todo contra el MAF | V.2, pestaña Alta de código (para subir a List) + Excel de la revisión |
| Consultas y seguimiento | Activos de una tienda, pendientes de plaqueo, seguimiento de lo enviado | Excel de consulta |
| Consultar el MAF | Buscar cualquier activo y ver todas las columnas del MAF: año, costo, depreciación y si tiene valor (solo consulta) | Excel de resultados |

## Uso
1. **MAF**: arrastrar el Excel del MAF a la zona "Arrastre aquí el MAF" o a cualquier parte de la ventana (o hacer clic en la zona para elegirlo); cualquier versión (.xlsx). Tarda 10-20 s en segundo plano; luego se recupera solo. Hasta tener MAF no se muestran los apartados. Cada apartado dice en una línea para qué sirve y, al capturar, en "Ahora:" qué sigue. El número junto a una pestaña son los movimientos capturados sin terminar.
2. **Altas, bajas y transferencias**: elegir Alta, Baja o Transferencia; capturar CR o tienda (o dejarlo vacío y se llena con la placa); llenar lo que pida (tipo de baja o tienda destino) y escribir/escanear la placa. Muestra lo que se escribirá; se agrega con **✓**. Enter/escáner solo busca.
   - Alta: casa con el activo pendiente de placa de la tienda (por serie o eligiendo). Si el equipo está cargado en otra tienda, genera alta + transferencia. **Cotejar** muestra lo que dice el MAF de cada tienda.
   - Baja: elegir el **tipo de baja** (los 10 del formato oficial). La tienda se toma de cada placa (se pueden mezclar tiendas en un formato); el CR capturado solo sirve para la baja masiva.
   - Serie, marca y modelo: en altas se capturan los tres y en bajas serie y modelo (el formato de bajas no tiene marca). Vacíos = lo del MAF, que se ve de guía dentro del campo. La transferencia no los lleva porque su formato no tiene esas columnas. En la lista pegada y la baja masiva va siempre lo del MAF de cada activo.
3. **Plaqueo por factura**: capturar la factura (y opcionalmente la tienda). Se marca el **siguiente equipo**; al escanear la placa se casa con él (aquí el escáner sí agrega directo; se deshace con *Quitar*). "Siguiente" en un renglón cambia el orden. Serie, marca y modelo se capturan antes de escanear (vacíos = lo del MAF; marca y modelo se conservan mientras el siguiente equipo sea del mismo tipo) o después en la tabla, en el renglón de cada activo. Salen en el V.2 (columnas Serie, Modelo y Marca).
4. **Anexo 3**: igual que las bajas, pero la tienda se toma de cada placa (se pueden mezclar tiendas en un mismo formato; el CR solo hace falta para la baja masiva). El Excel trae además la pestaña **Concentrado reciclaje**: cuántos equipos de cada tipo se mandan a reciclaje y el total, más motivo de salida, tipo de equipo, disposición final, proveedor y observaciones (se conservan entre bajas). Con más de 50 equipos, el Excel sale en varios archivos ("parte 1 de 3"…).
5. **Pegar lista de placas** (movimientos y Anexo 3): pegar una columna de Excel → *Revisar lista* muestra qué pasa con cada renglón → *Agregar los correctos*. Usa el tipo y los datos capturados arriba. Acepta placas o No. Activo; en altas, columnas placa / No. Activo / serie.
6. **Baja masiva** (tipo Baja): lista todos los activos del CR; filtrar, marcar y *Agregar seleccionados* con el tipo de baja elegido (cierre de tienda, remodelación).
7. **Levantamiento de tienda**: elegir la tienda (CR o nombre) y salen todos sus activos del MAF, primero los que faltan de alta.
   - La app elige el primer activo que falta; *Elegir* en la lista escoge otro y *Saltar* pasa al siguiente.
   - Escanear la placa: se revisa y el cursor pasa a Serie. Serie, marca y modelo vienen del MAF; se corrigen o se escanea la serie encima.
   - *✓ Dar de alta* (o Enter en serie, marca o modelo) lo agrega al formato de la derecha y pasa al siguiente activo. *Deshacer* en el aviso de abajo lo quita.
   - El formato sale en la pestaña Alta de código del V.2 (activo, placa, serie, modelo, marca, fecha), listo para que AF lo suba a List.
   - *Imprimir hoja para firma*: hoja tamaño carta con los datos de la tienda, un resumen, los movimientos capturados de esa tienda, todos sus activos del MAF con una casilla "Visto" (palomeada si se escaneó en la revisión) y tres firmas: encargado(a) de tienda, quien levantó y responsable de AF. En el cuadro de impresión se puede elegir "Guardar como PDF".
   - Opcional, plegado: *Revisar todo lo de la tienda contra el MAF* (escanear todo → transferencias, altas de placas que no están en el MAF y bajas de lo no encontrado). Con ese recuadro abierto el escáner llena esa lista.
8. **Consultas y seguimiento**:
   - *Consulta de tienda*: todos los activos del CR con su estado, filtro, exportar o imprimir.
   - *Pendientes de plaqueo*: por tienda o por factura, con detalle y exportación.
   - *Seguimiento*: todo Excel generado queda registrado; al cargar un MAF más nuevo dice si cada movimiento ya se aplicó, sigue pendiente o se aplicó distinto. *Quitar los aplicados* limpia la lista.
9. **Consultar el MAF** (solo consulta, no modifica nada):
   - Un buscador para placa, No. Activo, serie, CR, tienda o artículo. Se pueden combinar palabras ("impresora 36UCC", "laptop tijuana este"); no importan acentos ni espacios ("laptop" encuentra "LAP TOP").
   - Filtros: *Todos / Con valor / Depreciados* y año de adquisición. Los indicadores suman resultados, con valor, depreciados, valor neto y costo.
   - La tabla muestra todas las columnas del MAF, en su orden, más la columna *Valor*. Se ven 200 renglones; *Exportar resultados a Excel* saca todos.
   - Al tocar un renglón (o si sale un solo resultado) aparece la ficha del activo: fecha de adquisición y antigüedad, costo, depreciación acumulada (% del costo), valor neto, una barra de depreciación y todas las columnas agrupadas.
   - Con el escáner se lee la placa y sale su ficha, con el aviso grande de abajo.
   - **Depreciado** = la columna "Remantente" (meses de vida útil que le quedan) está en 0. Puede conservar un valor neto pequeño, que es el valor de rescate. Si el MAF no trae esa columna, se usa el valor neto.
   - Si el MAF guardado en el navegador se cargó antes de esta versión, sale un aviso para volver a cargarlo y ver todas las columnas.

## Escáner (pistola USB, p. ej. Zebra)
- **Serie distinta:** en altas (Altas, Plaqueo y Levantamiento), si la serie escaneada o escrita no coincide con la que el MAF tiene para ese activo, sale un aviso naranja con las dos series. No bloquea: verifique que sea el mismo equipo.
- Configuración del escáner: modo teclado (USB HID), sufijo **Enter**, sin prefijo, idioma de teclado igual al de Windows. Se configura escaneando los códigos de la guía rápida del modelo o con 123Scan de Zebra.
- **Probar escáner** (arriba): con el recuadro abierto, cada lectura muestra qué mandó el escáner (caracteres, si terminó en Enter, si parece placa, si existe en el MAF) y no captura nada.
- La lectura llega al campo Placa aunque el cursor esté en otro lado (se reconoce por la velocidad; lo tecleado a mano no se toca). Excepción: la Serie, si está enfocada y vacía, recibe la lectura.
- Cada lectura se ve de lejos: el aviso trae un ícono que se dibuja (✓ verde si se encontró, ✕ roja que se sacude si no, ! naranja si hay que revisar) y los bordes de la pantalla destellan del mismo color.
- Sonido + aviso grande abajo: bip agudo = bien, doble = revisar (otra tienda, no está en el MAF, hay que elegir), grave = error. Se apaga en Probar escáner.
- Se rechazan lecturas que no parecen placa (las placas del MAF son de 8 a 12 dígitos): serie, código de producto, lectura cortada o caracteres de más como "Ñ". Si sí es placa, escribirla a mano.
- La misma placa leída dos veces en menos de 2 s se ignora.
- Altas: al leer la placa el cursor pasa a Serie para leer la del fabricante. Bajas/transferencias: casilla "Agregar sin ✓ al escanear si todo está bien" (si hay cualquier advertencia se detiene). Plaqueo: casilla "Leer la serie antes de cada placa".

Al trabajar:
- En pantallas anchas la lista de lo capturado y los botones de Excel quedan siempre a la derecha, con lo más reciente arriba. En pantallas angostas van abajo.
- La franja bajo las pestañas muestra qué se está capturando (tipo, tienda, tipo de baja, cuántos llevan).
- Después de agregar, el aviso grande de abajo trae **Deshacer** para quitar lo último.
- Junto a los botones se ve cuánto se va a descargar (altas, bajas, transferencias y número de archivos).

Botones de cada módulo:
- **Descargar Excel y terminar**: descarga, recuerda lo capturado (para no repetir placas/activos) y deja la captura en limpio.
- **Descargar Excel y seguir capturando**: descarga el formato lleno; la captura se queda.
- **Borrar captura**: la descarta sin generar.

Una misma placa/activo no se puede usar dos veces en altas o transferencias, ni en la misma captura ni entre módulos/ventanas. La misma baja en el V.2 y en el Anexo 3 solo avisa (son documentos distintos del mismo movimiento).

En el V.2 se escribe desde el renglón 2: el ejemplo del formato se sobrescribe y se quita la marca "Ejemplo". Se respetan las columnas "No Modificar" (TAB / *DN).

## Respaldo
- En la barra lateral, **Respaldo de la captura**: *Descargar respaldo* guarda en un archivo .json todo lo capturado sin terminar, lo ya generado (para no repetir placas), el seguimiento, el levantamiento y las preferencias. *Restaurar respaldo* lo carga en otra computadora o navegador; antes muestra qué trae y qué reemplaza, y pide confirmación.
- El MAF no va en el respaldo: se vuelve a cargar.
- **Respaldo automático** (Chrome o Edge): *Activar respaldo automático* pide una sola vez dónde guardar el archivo (por ejemplo, una carpeta de OneDrive). Desde ahí, cada cambio se escribe solo en ese archivo unos segundos después. El punto verde indica que está activo y la hora del último guardado.
  - Al abrir la página no se escribe nada hasta que haya un cambio, para no pisar el respaldo con datos vacíos.
  - Si el navegador vuelve a pedir permiso (pasa al reabrirlo), el punto se pone naranja y, si hay cambios sin respaldar, arriba sale un aviso con *Reactivar*: un clic y sigue. Chrome puede ofrecer "Permitir en cada visita" para no volver a preguntar.
  - Ese archivo se restaura igual que uno descargado, con *Restaurar respaldo*. *Apagar* deja el archivo como está y solo deja de actualizarlo.

## Diseño
- Las confirmaciones (borrar captura, agregar bajas en bloque, nuevo levantamiento, quitar aplicados, restaurar respaldo) son hojas estilo iPhone: Cancelar o el botón de la acción (rojo si borra algo). Esc cancela y Enter acepta; una lectura del escáner nunca acepta una hoja.
- Estilo iOS / iPad: en pantallas anchas, barra lateral translúcida con la tarjeta del MAF (indicadores de activos, pendientes y placas duplicadas), los módulos con su ícono de color y un número rojo con lo capturado sin terminar, y Probar escáner. En pantallas angostas las pestañas son fichas fijas arriba.
- Guía en cada módulo: bajo el título están sus pasos numerados (por ejemplo: Elige la tienda › Escanea la placa › Revisa serie, marca y modelo › Descarga el formato). Las secciones usan el mismo círculo numerado.
- Movimiento: los números de los indicadores cuentan hasta su valor, el aviso de lectura entra con rebote (el de error además se sacude), los módulos cambian con un desvanecido corto, el título se compacta al bajar y las secciones plegables se abren con suavidad. Si Windows tiene las animaciones desactivadas, no se mueve nada.
- En teléfono (menos de 600 px) los módulos van en una barra de pestañas abajo, con ícono y nombre corto.
- Los resúmenes son indicadores grandes (Consultas, Plaqueo, Levantamiento); en Consultas, tocar un indicador filtra por ese estado. Los equipos por tipo se ven como barras.
- Cada módulo tiene título grande con su ícono, la franja de qué se captura, el paso "Ahora" resaltado y la vista previa como ficha (cada dato con su etiqueta). Tarjetas redondeadas, opciones como interruptores, tablas como listas agrupadas. Claro por defecto; el modo oscuro se activa con el interruptor "Modo oscuro" de la barra lateral y se recuerda.
- Todo el diseño está en el bloque <style> de index.html (variables al inicio). El cambio fue solo visual: la lógica, los formatos y el escáner no cambiaron.

## Desarrollo
- `js/engine.js` — MAF, cruce y validaciones. `js/writer.js` — escritura en los formatos (edita el XML, conserva todo).
- `js/comun.js` — MAF, almacenamiento, botones, registro de enviados, exportar Excel. `js/mod-captura.js` — movimientos y Anexo 3 (lista pegada, baja masiva). `js/mod-plaqueo.js` — plaqueo. `js/mod-levantamiento.js` — levantamiento. `js/mod-consultas.js` — consultas y seguimiento.
- Formatos en `../plantilla/`; incrustarlos con `node tools/build-plantilla.js`. Archivo único: `node tools/build-single.js`.
- Pruebas: `npm test -- "ruta\MAF.xlsx"`.
