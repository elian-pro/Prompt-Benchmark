# ZEBRA · LEAD STRESS

Herramienta interna de **red-teaming / pruebas de estrés conversacional** para
chatbots de perfilamiento de leads. Pone a tres IAs a trabajar: un **chatbot bajo
prueba** (espejo de producción), un **lead adversarial** que intenta romperlo, y un
**juez** que produce un reporte de cómo corregir el prompt antes de producción.

> La fuente de verdad del proyecto es [`SPEC.md`](./SPEC.md).

## Estado de construcción

Construcción incremental siguiendo el orden de `SPEC.md §12`:

- [x] **Fase 1 — Scaffold** (Next.js App Router + TypeScript, `.gitignore` con `.env`, `.secrets/` y `/data` protegidos).
- [x] **Fase 2 — Settings + manejo seguro de keys** (backend, enmascarado, prioridad env var → archivo local).
- [ ] Fase 3 — Presets adversariales + taxonomía de modos de fallo.
- [ ] Fase 4 — Motor de conversación (render en vivo).
- [ ] Fase 5 — Persistencia de corridas.
- [ ] Fase 6 — Juez + pantalla de Reporte.
- [ ] Fase 7 — Historial.
- [ ] Fase 8 — Línea de diseño ZEBRA.
- [ ] Fase 9 — Despliegue.

## Desarrollo local

```bash
npm install
npm run dev          # http://localhost:3000
```

1. Abre `/settings`.
2. Pega tus API keys de OpenAI y Anthropic, y ajusta modelos/parámetros por rol.
3. Las keys se guardan en `.secrets/keys.json` (fuera de Git, permisos `0600`).

## Manejo seguro de keys (SPEC §6)

Reglas no negociables, ya implementadas en la fase 2:

- Las keys se manejan **solo en el backend** (`lib/keys.ts`, marcado `server-only`).
  El frontend nunca recibe ni envía la key completa.
- El frontend solo recibe una versión **enmascarada** (`sk-...4f2a`).
- **Prioridad de fuentes:** variable de entorno → `.secrets/keys.json`.
  Si la env var existe, **gana** y la UI la muestra como "definida por variable de
  entorno" y no permite sobrescribirla.
- `.secrets/`, `/data` y `.env*` están en `.gitignore` y **nunca** se commitean.

## Variables de entorno

Copia `.env.example` a `.env` para desarrollo local. En producción (Easypanel) se
definen como env vars del servicio (ver SPEC §14):

| Variable            | Descripción                                                        | Local (default) | Producción            |
| ------------------- | ------------------------------------------------------------------ | --------------- | --------------------- |
| `OPENAI_API_KEY`    | Key de OpenAI para el chatbot bajo prueba.                         | (vacío)         | definida en Easypanel |
| `ANTHROPIC_API_KEY` | Key de Anthropic para el lead adversarial y el juez.              | (vacío)         | definida en Easypanel |
| `DATA_DIR`          | Ruta de datos persistentes (corridas).                            | `./data`        | `/data` (volumen)     |
| `NODE_ENV`          | Entorno de ejecución.                                              | `development`   | `production`          |

> En producción las keys vienen de las env vars, **no** del archivo local (que ni
> existe en el servidor porque está en `.gitignore`). El volumen persistente para
> `DATA_DIR` se configura en la fase de despliegue.

## Scripts

| Comando         | Acción                          |
| --------------- | ------------------------------- |
| `npm run dev`   | Servidor de desarrollo.         |
| `npm run build` | Build de producción.            |
| `npm start`     | Arranca el build de producción. |
| `npm run lint`  | Lint.                           |
