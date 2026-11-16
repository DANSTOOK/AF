# CLAUDE.md — Reglas de Arquitectura y Sistema de Diseño Apple / iOS

Este archivo define las directrices permanentes de este repositorio. Toda modificación, nueva vista, componente o refactorización ejecutada por Claude Code debe cumplir estrictamente con estas normas.

---

## 1. Reglas de Protección de Lógica y Arquitectura
- **Separación estricta de capas:** Nunca alteres la lógica de negocio, estados (`useState`, `useReducer`, stores globales), efectos (`useEffect`), llamadas a APIs/bases de datos, validaciones ni rutas al realizar mejoras visuales.
- **Preservación de contratos:** Todo componente interactivo debe conservar intactos sus `props`, `refs` y manejadores de eventos (`onClick`, `onChange`, `onSubmit`, `disabled`, etc.).
- **Reutilización:** Antes de crear componentes nuevos, verifica los primitivos existentes en la carpeta de componentes UI del proyecto para mantener la homologación.

---

## 2. Sistema de Diseño iOS / Apple (Human Interface Guidelines)

### Paleta de Superficies y Elevación
Usa exclusivamente el sistema de elevación por capas de iOS en lugar de sombras pesadas o bordes gruesos:
- **Light Mode:**
  - Fondo base agrupado (`systemGroupedBackground`): `#F2F2F7`
  - Superficies elevadas / tarjetas (`secondarySystemGroupedBackground`): `#FFFFFF`
  - Superficies terciarias / inputs (`tertiarySystemGroupedBackground`): `#E5E5EA` / `#F2F2F7`
- **Dark Mode (OLED):**
  - Fondo base (`systemBackground`): `#000000`
  - Superficies elevadas / tarjetas (`secondarySystemBackground`): `#1C1C1E`
  - Superficies terciarias / modales / inputs (`tertiarySystemBackground`): `#2C2C2E`
- **Separadores (Hairlines):** Líneas de `1px` en `rgba(60, 60, 67, 0.12)` (Light) o `rgba(84, 84, 88, 0.36)` (Dark). En listas, los separadores internos deben alinearse con el inicio del texto, sin llegar al borde izquierdo.

### Materiales Translúcidos (Glassmorphism Nativo)
- **Barras de navegación, Headers y Tab Bars:** Deben utilizar efecto de vidrio esmerilado (`backdrop-blur-xl` / `backdrop-filter: blur(20px) saturate(180%)`) con fondo semitransparente (`bg-white/75` en claro, `bg-[#1C1C1E]/75` en oscuro) y un borde sutil inferior o superior de `1px`.

### Geometría y Radios (Squircle Aesthetic)
- **Tarjetas principales y contenedores agrupados:** `rounded-[22px]` o `rounded-3xl` (`24px`).
- **Modales / Bottom Sheets:** `rounded-t-[28px]` en móviles o `rounded-[26px]` centrados.
- **Botones primarios e Inputs:** `rounded-[14px]` (`14px`) con altura mínima táctil de `44px` a `50px`.
- **Badges, Pills, Toggles y Segmented Controls:** `rounded-full`.

### Tipografía (San Francisco System Stack)
- **Familia tipográfica:** `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif`.
- **Large Titles:** Títulos principales de pantalla en `32px`–`34px`, `font-bold`, `tracking-tight` (`-0.02em`).
- **Cuerpo y Etiquetas:** Cuerpo base en `16px`–`17px` (`leading-snug`), texto secundario en `#8E8E93` (`secondaryLabel`), metadatos y captions en `12px`–`13px`.
- **Números Tabulares:** Aplica siempre `tabular-nums` (`font-variant-numeric: tabular-nums`) a cualquier cifra dinámica, reloj, precio, contador o porcentaje.

---

## 3. Estándares de Componentes Nativos
- **Listas Agrupadas (`Inset Grouped Lists`):** Las colecciones de datos, configuraciones o registros deben presentarse en bloques redondeados con filas limpias, iconografía en contenedores cuadrados redondeados (*squircle badges*) y chevrones (`›`) a la derecha si son navegables.
- **Sheets y Modales:** Los diálogos modales deben diseñarse como *iOS Sheets* con desenfoque de fondo (*backdrop*), animación de entrada vertical desde abajo y una píldora superior de arrastre (*grabber handle* de `36px x 5px` con opacidad al 30%).
- **Controles de Selección:**
  - Usa *Segmented Controls* (cápsulas con indicador activo deslizante) para filtros o cambios de vista de 2 a 4 opciones.
  - Usa *Switches* estilo iOS (`51px x 31px`, `rounded-full`) en lugar de checkboxes tradicionales para estados booleanos de configuración.
- **Iconografía:** Mantén un grosor de trazo uniforme (`strokeWidth={1.75}` o `2` en `lucide-react`) en todo el aplicativo.

---

## 4. Física de Movimiento, Animaciones y Micro-interacciones
El movimiento debe sentirse orgánico, inmediato e interrumpible, basado en la física de resortes de iOS:

- **Feedback Táctil (Active State):** Todo elemento interactivo (botones, tarjetas clicables, ítems de lista) debe incluir retroalimentación inmediata al presionar: `active:scale-[0.97]` con transición rápida (`duration-150 ease-out`).
- **Parámetros de Resorte (Framer Motion):**
  - Transiciones generales / sheets: `type: "spring", stiffness: 380, damping: 32, mass: 0.8`
  - Micro-interacciones / toggles / pills: `type: "spring", stiffness: 500, damping: 35`
- **Curva CSS (Fallback sin Framer Motion):**
  - Utiliza exclusivamente la curva de desaceleración Apple: `cubic-bezier(0.32, 0.72, 0, 1)` con duraciones entre `280ms` y `400ms`.
- **Coreografía de Entrada:**
  - Las listas y grids deben aparecer con un escalonamiento (*stagger*) sutil de `25ms`–`35ms` por ítem, desplazándose suavemente (`y: 10px -> 0`, `opacity: 0 -> 1`).
  - Los indicadores activos en *Tab Bars* y *Segmented Controls* deben deslizarse de forma continua (`layoutId`) sin parpadeos.

---

## 5. Flujo de Trabajo Obligatorio al Editar UI
1. **Homologación:** Verifica que cualquier archivo nuevo o editado utilice las clases utilitarias, variables CSS y componentes base definidos en el proyecto; nunca introduzcas estilos ad-hoc que rompan la consistencia visual.
2. **Validación:** Tras realizar cambios en la interfaz, ejecuta el chequeo de tipos o compilación (`npm run build` / `tsc --noEmit`) para confirmar cero errores de sintaxis o referencias rotas.

---

## 6. Cómo aplican estas reglas en este proyecto
- El aplicativo es HTML + JavaScript sin frameworks (no hay React, Tailwind ni Framer Motion). Las equivalencias son CSS puro.
- Todo el diseño vive en el bloque `<style>` de `app/index.html`; los tokens (colores claro/oscuro, curva Apple, sombras) están en `:root` al inicio. Reutilízalos en vez de poner estilos sueltos.
- La lógica está en `app/js/` (`engine.js`, `writer.js`, `comun.js`, `mod-*.js`). En cambios visuales no se tocan validaciones, almacenamiento, formatos de Excel ni el escáner.
- Validación tras cualquier cambio (equivale a `npm run build` / `tsc`): en `app/`, `npm test -- "ruta\MAF.xlsx"` y luego `node tools/build-single.js` para regenerar `Movimientos AF.html`.
