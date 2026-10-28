# AGENTS.md

Sitio corporativo de **Fexsi SpA** (Antofagasta, Chile): maestranza, calderería y obras civiles
para la gran minería. Static site generado con **Astro 6** + **Tailwind CSS 4**, en español.

## Comandos

El proyecto usa **Bun** como gestor de paquetes y runtime de scripts.
- Instalar dependencias: `bun install`
- Servidor de desarrollo: `bun dev` → http://localhost:4321
- Build de producción: `bun run build` → `./dist/`
- Vista previa del build: `bun run preview`
- Lint y formato: `bun run lint` (solo informa) / `bun run lint:fix` (aplica)
- Chequeo de tipos de los `.astro`: `bun run typecheck`
- Todo junto: `bun run check`
- Verificación funcional en navegador: `bun run verify` (con el sitio servido)
- Auditoría de diseño: `npx impeccable detect dist/index.html` (HTML compilado, reglas completas)

> El lockfile es `bun.lock`. No reintroducir `pnpm-lock.yaml` ni `pnpm-workspace.yaml`.
> Bun no reporta scripts de instalación sin confianza en este proyecto
> (`bun pm untrusted` → 0): esbuild y sharp publican binarios precompilados.

## Estructura

- `src/pages/` — rutas. `index.astro` (home) y `proyectos/[slug].astro` (detalle por proyecto)
- `src/components/` — un componente por sección: `Header`, `Hero`, `Services`, `About`, `Projects`, `Contact`, `Footer`
- `src/layouts/Layout.astro` — shell HTML: `<head>`, fuentes, `<ClientRouter />`, scripts globales
- `src/content/projects/*.md` — colección `projects`; el schema vive en `src/content.config.ts`
- `src/assets/projects/<slug>/` — fotos originales de cada proyecto (fuente de verdad)
- `src/lib/images.ts` — helper `optimizarFoto()`: webp + `srcset` para las fotos
- `src/styles/global.css` — Tailwind v4 + tokens `@theme` + animaciones de scroll-reveal
- `public/` — estáticos (`favicon.png`, `favicon-32.png`, `favicon.ico`, `public/images/logo-fexsi.webp`,
  `public/projects/<slug>/` para videos y pistas WebVTT)
- `scripts/verify-ui.mjs` — verificación funcional en navegador real (CDP, sin dependencias)
- `scripts/generate-favicon.mjs` — regenera los favicons desde `public/images/logo-fexsi.webp`
- `biome.jsonc` — configuración de Biome (lint + formato)
- `DESIGN.md` — sistema de diseño: por qué de cada decisión, no solo qué valor tiene

## Convenciones de código

- TypeScript estricto (`astro/tsconfigs/strict`); `.astro` con frontmatter tipado
- Tailwind v4 vía `@tailwindcss/vite` — **no** hay `tailwind.config.js`; los tokens se declaran con `@theme` en `src/styles/global.css`
- Componentes: un `.astro` por sección, sin estado global, sin librería de UI externa
- Iconos: SVG inline con `stroke-width="1.5"` y `currentColor`; nunca emoji ni glifos unicode
- El sitio es bilingüe-free: **todo el copy visible va en español de Chile**
- Línea terminada en LF en todo el repo (`.gitattributes`); Biome formatea con `lineEnding: "lf"`

## Biome

Biome se ocupa del lint y del formato de JS, TS, JSON, CSS y Markdown. La configuración está en
`biome.jsonc`, con las decisiones documentadas ahí mismo.
- **El formateador está desactivado para `.astro`**: el de HTML es experimental y reescribe el
  marcado de Astro (colapsa atributos a una línea, quita la barra de cierre y desindenta los
  `<script>` inline). El lint **sí** corre sobre `.astro` y ahí sí encuentra bugs reales
  (por ejemplo, botones sin `type="button"`).
- Dos reglas de accesibilidad están apagadas a propósito: Biome no evalúa `aria-label` en `<a>`
  ni el `aria-hidden` de un ancestro al juzgar un `<svg>`, y marca falsos positivos en los
  enlaces de icono y en los iconos decorativos. El contrato real está en este documento.
- `css.parser.tailwindDirectives` está habilitado para que `@theme`, `@source` y `@utility` no
  se confundan con un error de sintaxis.
- Biome no verifica tipos: para eso está `bun run typecheck` (`astro check`), que sí cubre los
  archivos `.astro`.


## Imágenes y video

Las fotos **no** van en `public/`: viven en `src/assets/projects/<slug>/` y entran al build por el
helper `image()` del schema, que las resuelve a `ImageMetadata` y permite que Astro las sirva en
webp con `srcset`.
- Para renderizar una foto se usa `optimizarFoto()` de `src/lib/images.ts`, no `<Image>` de
  `astro:assets`: el componente `Image` no reenvía `transition:name` al `<img>`, y la transición de
  vista de la portada del proyecto depende de ese atributo.
- `optimizarFoto()` recorta la lista de anchos al ancho real del archivo (nunca amplía) y **no
  recorta la imagen**: la proporción original se conserva y el encuadre final lo decide el CSS
  (`object-cover`).
- El `src` que devuelve `optimizarFoto()` es siempre la variante más grande; esa URL es la que
  usa el lightbox (va en `data-full` de cada miniatura).
- Cada foto necesita texto alternativo real y descriptivo. En la galería el schema exige el par
  `{ image, alt }`; no se accepts "Fotografía 3 del proyecto".
- El favicon se genera desde el logo real: `node scripts/generate-favicon.mjs` produce
  `public/favicon.png`, `public/favicon-32.png` y `public/favicon.ico`. No se versiona un
  `favicon.svg` de Astro.

Los videos de proceso se guardan en `public/projects/<slug>/` (son binarios grandes, no pasan por
el pipeline de imágenes) y el schema **exige** sus dos pistas WebVTT (`videoCaptions` y
`videoDescriptions`): sin subtítulos un video no es accesible y Biome (`useMediaCaption`) lo
rechaza. Los `<track>` van como hijos directos de `<video>`: dentro de una expresión `{cond && ...}`
el analizador no los ve y la regla vuelve a fallar.

## Paleta y tokens

Todos los colores salen de `@theme` en `src/styles/global.css`. La paleta por defecto de Tailwind
está desactivada (`--color-*: initial`): si necesitas un color, decláralo ahí primero.
- `steel-50…950` — neutros fríos con tinte petróleo heredado del logo (fondos y texto)
- `flame-200…900` — naranja de seguridad de la marca (acentos, CTA, énfasis puntual)
- `success-50` / `success-800` y `danger-50` / `danger-800` — estados de formulario, únicos
  semánticos permitidos
- `white` / `black` — declarados explícitamente

Regla de acento: el color solo donde significa algo (categoría de proyecto, CTA, foco). Nunca
degradado en texto, nunca franja lateral de color, nunca un color por card repetida.


## Reglas de diseño (no negociables)

El proyecto usa **Impeccable** como detector de anti-patrones. Antes de tocar UI:

```bash
npx impeccable detect src/     # rápido, reglas por regex sobre .astro
npx impeccable detect dist/index.html   # completo, sobre el HTML compilado
npx impeccable detect http://localhost:4321/   # completo, sobre el sitio renderizado
```

Ojo: `npx impeccable detect dist/` (la carpeta) solo escanea `.css` y `.js` y **no** corre las reglas
de elemento. Para la revisión completa hay que pasarle cada HTML compilado, uno por uno.

`.impeccable/config.json` ignora `cramped-padding`: el motor CSS del detector (jsdom) no resuelve
propiedades lógicas ni `var()`, así que reporta falsos positivos en las utilidades propias
(`.section-pad`, `.shell`). El padding se escribe físico a propósito; no "arreglar" ese aviso.

Anti-patrones ya eliminados y que **no deben reintroducirse**:
- Texto con degradado (`bg-clip-text` + `bg-gradient`) → el énfasis va por peso y tamaño
- Tipografía Inter / Roboto / Space Grotesk → el sitio usa **Chivo** (display) y **Barlow** (texto)
- Franja de color lateral en cards (`border-l` > 1px) y cards anidadas
- Eyebrow/kicker sobre un heading → el encabezado habla solo
- `animate-bounce` / easing elástico → `cubic-bezier(0.16, 1, 0.3, 1)`
- Puntos de estado con `animate-pulse` decorativos
- Texto gris (`text-slate-*`) sobre superficies de color → se tiñe del color de fondo o se usa blanco
- `<img>` con `src` vacío

Contrato de accesibilidad: contraste WCAG AA (4.5:1 texto, 3:1 texto grande), foco visible,
navegación por teclado, `prefers-reduced-motion` respetado, y contenido visible **sin JS**
(la clase `.reveal` solo oculta si `html.js` está presente; la navegación móvil cae a
`max-md:noscript:block` y el botón hamburguesa a `noscript:hidden`).

Regla de scroll: **no** declarar `scroll-behavior: smooth` en `html`. Afecta al scroll nativo del
navegador (restauración del historial y salto a un ancla de otra página) y hace que la página
recorra todo el contenido desde arriba. El scroll suave se aplica solo a los anclos de la misma
página, explícitamente con `scrollIntoView({ behavior: "smooth" })` en `Layout.astro`.

Regla de transición de vista: la ficha de proyecto comparte **dos** elementos con la portada del
proyecto, y ambos deben llevar `transition:name`:
- la foto → `proyecto-${id}`
- la capa de degradado oscuro → `proyecto-${id}-capa`

Si la capa no viaja, el oscurecimiento se queda en la captura de la raíz y aparece de golpe al
final del movimiento (la foto vuela limpia y se oscurece de golpe). El CSS de `global.css`
redefine los pseudo-elementos de la transición: fundido plano sin `mix-blend-mode: plus-lighter`
(el de Astro lava las fotos al superponerse) e instantánea vieja de los grupos con nombre oculta,
para que la foto no aparezca duplicada por el recorte distinto de la ficha y la portada.

## Proceso de trabajo

1. `bun run build` debe terminar sin errores antes de dar por cerrado cualquier cambio
2. `bun run check` (Biome + `astro check`) debe quedar sin errores ni avisos
3. `npx impeccable detect dist/` debe quedar sin fallos (los avisos no bloquean)
4. Verificar en navegador real a móvil (390px) y escritorio (1280px): navegación, scroll-spy,
   formulario y lightbox, sin errores en consola
5. Revisar consola del navegador: cero errores

Para la verificación interactiva se usa `bun run verify` (o `node scripts/verify-ui.mjs`): levanta
Edge/Chrome headless y le habla por CDP con el `WebSocket` nativo de Node (sin dependencias).
Comprueba que el menú móvil, el scroll-spy, el formulario y el lightbox responden de verdad, no
solo que el HTML es correcto. El `fetch` del formulario se simula dentro de la página: nada sale
a la red.

## Git

- Rama por defecto `main`; crear rama antes de cualquier cambio sizeable
- Commits convencionales: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- `.gitattributes` fija `eol=lf` para todo el repo: no reintroducir CRLF ni borrar ese archivo
- No commitear secretos. La `access_key` de Web3Forms en `src/components/Contact.astro` es una
  clave pública de servicio, no un secreto: no la trates como una, pero no la muevas sin avisar.

## Contenido

- Los proyectos se agregan como `.md` en `src/content/projects/` siguiendo el schema
  (`title`, `category`, `description`, `coverImage` + `coverAlt`, `gallery` = lista de
  `{ image, alt }`, y opcionalmente `video` + `videoCaptions` + `videoDescriptions`)
- El schema usa `import { z } from "astro/zod"`: `z` desde `astro:content` está deprecado en
  Astro 6 y `astro check` lo marca
- Las fotos de un proyecto se guardan en `src/assets/projects/<slug>/`; el path va en el frontmatter
  relativo a `src/content/projects/`
- No inventar cifras, certificaciones, clientes ni benchmarks. El copy debe describir
  únicamente trabajo realmente realizado (procesos, normas, tolerancias mencionadas en cada ficha)
- Tampoco inventar los textos alternativos: se describen las fotos mirando la foto
