# CLAUDE.md

FreeRouting Desktop — Go + WebView PCB auto-router GUI.

## Build & Run

```bash
# Frontend dev server
cd frontend && npm run dev          # → localhost:1420

# Go host (dev mode, loads frontend from Vite dev server)
go run .

# Production build
cd frontend && npm run build        # → ../dist/
go build -ldflags="-s -w" -o freerouting-desktop .
```

## Architecture

```
Go host (main.go)
├── jar_manager.go    — JAR download, version check, process lifecycle
├── cors_proxy.go     — Reverse proxy that adds CORS headers to JAR responses
└── WebView window    — Loads frontend (dev: localhost:1420, prod: embedded dist/)

Frontend (frontend/src/)
├── App.tsx           — Root component, global state (React Context + useReducer)
├── components/
│   ├── MenuBar.tsx        — File/Route/View/Help menus
│   ├── BoardCanvas.tsx    — LeaferJS PCB renderer
│   ├── SidePanel.tsx      — Layer visibility, board stats
│   ├── ProgressPanel.tsx  — Routing progress bar
│   ├── LogPanel.tsx       — Real-time scrollable log
│   └── JarSetupWizard.tsx — First-run JAR download wizard
└── lib/
    ├── pcb-renderer.ts    — LeaferJS rendering engine
    ├── ses-parser.ts      — SES (Specctra Session File) parser
    ├── board-types.ts     — PCB data types (Trace, Via, Pad, Component)
    └── api.ts             — JAR API client (fetch + SSE via CORS proxy)
```

## Key Decisions

- **Go host, not Tauri/Rust** — single ~5-10MB binary, cross-platform, fast compile
- **Frontend calls JAR API directly** through Go CORS proxy at `127.0.0.1:9080` → `127.0.0.1:37864`
- **SES parser in frontend JS** — no Rust/Go parser, same code for both environments
- **LeaferJS** for PCB rendering (scene graph, zoom/pan, layers, events built-in)
- **Pure CSS layout** — no UI framework
- **React Context + useReducer** for state — no external state lib
- JAR downloaded at first run from GitHub Releases, not bundled

## Go ↔ Frontend Bridge

Go exposes functions to frontend via `w.Bind()`:
- `checkJarStatus()` → `{status, version, progress}`
- `downloadJar()` → async with progress callbacks
- `startJar()` / `stopJar()`
- `openFileDialog()` / `saveFileDialog(name)`
- `readFile(path)` / `writeFile(path, data)`

Go pushes events to frontend via `w.Eval()`:
- `jarStatusChanged(status)`
- `downloadProgress(percent)`

## JAR API (via CORS proxy at 127.0.0.1:9080)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/sessions/create` | Create session |
| POST | `/v1/jobs/enqueue` | Enqueue job |
| POST | `/v1/jobs/{id}/input` | Upload DSN (base64) |
| PUT | `/v1/jobs/{id}/start` | Start routing |
| GET | `/v1/jobs/{id}` | Job status |
| GET | `/v1/jobs/{id}/output` | Download SES output |
| GET | `/v1/jobs/{id}/output/stream` | SSE output stream |
| GET | `/v1/jobs/{id}/logs/stream` | SSE log stream |
| GET | `/v1/system/status` | Health check |

## SES Format

S-expression based. Key structures:
- `(wire (path LAYER WIDTH x1 y1 x2 y2 ...))` — trace segments
- `(via "padstack_name" x y)` — via
- `(padstack "name" (shape (circle|rect|polygon LAYER params...)))` — pad definition
- Coordinates are integers, divide by resolution denominator to get board coords
- `(resolution um 10)` → coords in 0.1μm units

## File Structure

```
freerouting-desktop/
├── main.go
├── jar_manager.go
├── cors_proxy.go
├── go.mod / go.sum
├── frontend/
│   ├── src/ (as above)
│   ├── package.json
│   └── vite.config.ts
├── dist/              # frontend build output
├── README.md
└── freerouting-desktop-app-plan.md
```
