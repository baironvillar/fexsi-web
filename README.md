# Fexsi SpA — sitio web

Sitio corporativo de **Fexsi SpA** (Antofagasta, Chile): maestranza, calderería y
obras civiles para la industria minera y la gran minería.

Sitio estático generado con [Astro 6](https://astro.build) y
[Tailwind CSS 4](https://tailwindcss.com), con contenido en Markdown mediante
Content Collections. Gestor de paquetes y runtime: [Bun](https://bun.sh). Lint y formato:
[Biome](https://biomejs.dev).

## Comandos

| Comando             | Acción                                     |
| :------------------ | :----------------------------------------- |
| `bun install`       | Instala dependencias                       |
| `bun dev`           | Servidor de desarrollo en `localhost:4321` |
| `bun run build`     | Build de producción en `./dist/`           |
| `bun run preview`   | Sirve el build localmente                  |
| `bun run lint`      | Biome: lint + formato, solo informa        |
| `bun run lint:fix`  | Biome: aplica los fixes y el formato       |
| `bun run typecheck` | `astro check`: tipos de los `.astro`       |
| `bun run check`     | Biome + `astro check`                      |
| `bun run verify`    | Verificación funcional en navegador real   |

El lockfile es `bun.lock`. No reintroducir `pnpm-lock.yaml` ni `pnpm-workspace.yaml`.

## Estructura

```text
src/
├── components/            # un componente por sección de la home
│   ├── Header.astro
│   ├── Hero.astro
│   ├── Services.astro
│   ├── About.astro
│   ├── Projects.astro
│   ├── Contact.astro
│   └── Footer.astro
├── content/
│   └── projects/*.md      # fichas de proyectos (colección `projects`)
├── layouts/
│   └── Layout.astro       # shell: head, tipografías, transiciones de vista
├── pages/
│   ├── index.astro        # home
│   └── proyectos/[slug].astro
├── styles/
│   └── global.css         # tokens @theme, base y utilidades propias
└── content.config.ts      # schema de la colección `projects`

scripts/
└── verify-ui.mjs          # verificación funcional en navegador real (CDP, sin dependencias)
```

## Contenido

Los proyectos viven en `src/content/projects/*.md` y siguen el schema declarado en
`src/content.config.ts`:

```yaml
title: "Fabricación de Tolvas"
category: "Calderería Pesada"
description: "Construcción integral de tolvas de alta resistencia para camiones mineros."
coverImage: "https://…/cover.jpg"
gallery:
  - "https://…/foto-1.jpg"
```

Al agregar un archivo, la ruta `/proyectos/<id-del-archivo>` se genera automáticamente.

## Diseño

El sistema visual vive en `src/styles/global.css` (tokens `@theme` de Tailwind v4):
paleta **acero** (neutros fríos con tinte petróleo, tomado del logo) + **flame**
(naranja de seguridad de marca), tipografías **Chivo** (display) y **Barlow** (texto),
y radios cortos con estética de documento técnico.

`AGENTS.md` describe las convenciones del repositorio y los anti-patrones de UI que
no deben reintroducirse. `DESIGN.md` documenta el sistema de diseño.

## Auditoría de diseño

El proyecto usa [Impeccable](https://impeccable.style) como detector de anti-patrones:

```bash
npx impeccable detect src/     # rápido, sobre los .astro
npx impeccable detect dist/    # completo, sobre el HTML compilado
```

## Lint y formato

[Biome](https://biomejs.dev) se ocupa del lint y del formato de JS, TS, JSON, CSS y Markdown
(configuración en `biome.jsonc`). Dos decisiones a tener en cuenta:
- El formateador está **desactivado para `.astro`**: el de HTML es experimental y reescribe el
  marcado de Astro de una forma que no queremos en el repo. El lint sí corre sobre `.astro`.
- Biome **no verifica tipos**: de eso se encarga `bun run typecheck` (`astro check`), que sí
  cubre los archivos `.astro`.

`.gitattributes` fija `eol=lf` para todo el repositorio, de modo que el formato sea idéntico en
Windows, Linux y macOS.

## Verificación funcional

`scripts/verify-ui.mjs` levanta Chrome/Edge headless y se conecta por CDP para comprobar el
comportamiento real —menú móvil, scroll-spy, formulario en sus tres desenlaces y lightbox—,
incluido el comportamiento sin JavaScript. No usa dependencias: habla con el navegador por el
`WebSocket` nativo de Node.

```bash
bun run preview --port 4321 &
bun run verify http://127.0.0.1:4321
```

La llamada al formulario se simula dentro de la página: ningún dato sale de la máquina.

## Despliegue

`bun run build` genera un sitio estático en `dist/`, publicable en cualquier hosting
estático (Netlify, Vercel, Cloudflare Pages, GitHub Pages).

---

© Fexsi SpA · Desarrollado por [Bairon Villar](https://linkedin.com/in/baironvillarberrios)
