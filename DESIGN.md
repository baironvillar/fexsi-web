# Sistema de diseño — Fexsi SpA

Referencia del lenguaje visual del sitio. Los tokens viven en `src/styles/global.css`; este
documento explica **por qué** son así, para que no se diluyan con el tiempo.

## Origen

El logo (`public/images/logo-fexsi.webp`) es un engranaje naranja sobre azul petróleo. De ahí sale
todo: los neutros son **acero con tinte petróleo** y el acento es el **naranja de seguridad**.

La propuesta fue un **refinamiento**, no un reemplazo: se conserva la identidad industrial
(grafito + naranja) y todo el copy existente; suben la tipografía, la jerarquía y el acabado.
Refinar preserva; rediseñar reemplaza.

## Color

| Token                        | Uso                                                              |
| :--------------------------- | :--------------------------------------------------------------- |
| `steel-50` … `steel-950`     | Fondos y texto. Neutros fríos con matiz petróleo.                |
| `flame-200` … `flame-900`    | Acento de marca: CTA, categoría de proyecto, foco, "Excelencia". |
| `success-50` / `success-800` | Estado de formulario exitoso.                                    |
| `danger-50` / `danger-800`   | Estado de formulario con error.                                  |
| `white` / `black`            | Declados explícitamente.                                         |

La paleta por defecto de Tailwind está desactivada (`--color-*: initial`): si aparece un color
nuevo, primero se declara en `@theme`.

**Reglas de color**
- El acento aparece solo donde significa algo. Nunca por decoración, nunca en todas las cards.
- Nunca degradado en texto (el énfasis va por peso y tamaño).
- Nunca franja lateral de color en una card, nunca una card dentro de otra.
- Nunca un color distinto por cada elemento repetido: la repetición es una lista, no una paleta.

## Tipografía

- **Chivo** — display: `h1`–`h4`, cifras grandes. Grotesca de origen latinoamericano, encaja con
  metalmecánica y no está en la lista de sobreusadas del detector.
- **Barlow** — texto corrido. Inspirada en DIN, legible en pantalla a tamaños de UI.
- **JetBrains Mono** — solo etiquetas técnicas (`tech-label`) y datos reales (contadores, medidas).

`Inter`, `Roboto` y `Space Grotesk` están vetadas: son la tipografía por defecto de todo
framework y el detector las marca como sobreusada.

## Forma

- Radios cortos: `2px` … `16px`. Documento técnico, no "app" redondeada.
- Líneas hairline (1px) en vez de sombras para separar bloques.
- Sombras con desplazamiento y blur (`--shadow-hairline`, `--shadow-lift`, `--shadow-panel`),
  nunca halo plano.
- Una sola curva: `--ease-expo: cubic-bezier(0.16, 1, 0.3, 1)`. Sin `bounce` ni easing elástico.
- Textura de plano técnico (`.blueprint-grid`) generada en CSS, no una imagen raster enterrada.

## Layout

- Contenedor `.shell`: `max-width: 80rem`, margen lateral de 1.5rem → 3rem según viewport.
- Ritmo vertical con `.section-pad` (5rem/7rem), `.section-pad-sm` (4rem/6rem), `.hero-pad`.
- El padding se escribe **físico** (`padding-top`, `padding-left`…), no con propiedades lógicas:
  el motor CSS del detector no las resuelve y reportaría falsos positivos.
- La home alterna fondo claro y oscuro por secciones: hero (oscuro) → servicios (claro) → nosotros
  (oscuro) → proyectos (claro) → contacto (oscuro) → footer (más oscuro).

## Composición

- **Servicios** es un índice/ledger de dos columnas con líneas hairline, no cuatro cards iguales.
- **Proyectos** usa un grid asimétrico: un proyecto principal grande y fichas secundarias.
- **Misión/Visión** son texto con reglas superiores, sin cards.
- Cada sección empieza con su encabezado: nada de eyebrow o kicker encima.

## Movimiento

- El scroll-reveal solo se activa con `html.js`, así que sin JavaScript el contenido es visible.
- `prefers-reduced-motion: reduce` desactiva transiciones y animaciones.
- Sin `animate-bounce` y sin `animate-pulse` decorativo: el único pulso del sitio comunica estado.
- **Sin `scroll-behavior: smooth` global**: el salto a un ancla de otra página y la restauración
  del historial deben ser instantáneos. El scroll suave queda solo para los anclos internos de la
  misma página, aplicado explícitamente en JavaScript.
- La transición de vista de "Proyectos destacados" es un **morph**: la foto de la ficha viaja
  hasta la portada del proyecto en lugar de fundirse con la página.
  - El movimiento espacial usa su propia curva, `--ease-morph: cubic-bezier(0.32, 0.72, 0, 1)`:
    `--ease-expo` sale demasiado rápido para un recorrido de ese tamaño.
  - La foto y su capa de degradado viajan **por separado** (`proyecto-${id}` y
    `proyecto-${id}-capa`). La capa tiene que ser un elemento compartido: si se queda en la captura
    de la raíz, el oscurecimiento aparece de golpe cuando la foto aterriza.
  - El fundido de la raíz es plano (`fexsi-fade-out/in`, 160 ms/240 ms) y **sin**
    `mix-blend-mode: plus-lighter`, que es lo que usa Astro y lo que deja la foto lavada al
    superponerse.
  - La instantánea vieja de los grupos con nombre se oculta: la ficha y la portada recortan la
    misma foto de forma distinta y, de verse las dos, la imagen aparece duplicada.

## Imágenes y video

- Las fotos son contenido, no decoración: cada una lleva texto alternativo descriptivo y una
  ficha de proyecto las muestra en galería con lightbox.
- El pipeline sirve **webp con `srcset`**: el navegador baja la variante que corresponde al ancho
  real en pantalla en vez de un JPEG de 300 kB. Las miniaturas de galería y la imagen del lightbox
  son la misma foto en dos anchos, no dos archivos.
- La imagen nunca se recorta en el servidor: se conserva la proporción original y el encuadre lo
  decide `object-cover`. Así el server y el cliente ven el mismo recorte y la transición de vista
  entre la portada y la ficha no "salta".
- El favicon sale del logo real (PNG + ICO de 16/32/48 px), no de un SVG genérico: la pestaña es
  parte de la marca.
- Los videos de proceso llevan subtítulos (transcripción de la voz real) y una pista de descripción
  separada, porque el audio de un taller no se entiende solo.

## Accesibilidad

- Contraste WCAG AA como mínimo: 4.5:1 en texto normal, 3:1 en texto grande.
- Foco visible con `--focus-ring` (naranja de marca; `flame-400` sobre superficies oscuras).
- Navegación por teclado en todos los componentes interactivos.
- El menú móvil funciona sin JavaScript: el panel cae a `max-md:noscript:block` y el botón
  hamburguesa a `noscript:hidden`.
- El estado del formulario se anuncia con `role="status"` y `aria-live="polite"`.

## Comprobación

```bash
bun run check          # Biome (lint + formato) y astro check (tipos)
npx impeccable detect src/   # pre-chequeo rápido
npx impeccable detect dist/index.html  # auditoría completa sobre el HTML compilado
bun run verify         # comportamiento real en navegador (menú, formulario, lightbox)
```

`npx impeccable detect dist/` sobre la carpeta solo escanea CSS y JS: hay que apuntar al HTML
compilado, una página por vez, para que corran las reglas de elemento.

Biome no formatea los `.astro` (su formateador HTML es experimental y deforma el marcado de
Astro), pero sí los revisa con lint. El formato de los `.astro` es manual y sigue las reglas de
este documento.
