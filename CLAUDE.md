# CLAUDE.md

FreeRouting Desktop — Go + WebView PCB auto-router GUI.

## Build & Run

```bash
# Frontend dev server
cd frontend && npm run dev          # → localhost:1420

# Go host (dev mode, loads frontend from Vite dev server)
# MinGW-w64 must be on PATH; webview_go requires CGO on Windows.
export PATH="/c/msys64/mingw64/bin:$PATH" && export CC=gcc && cd backend && go run .

# Production build (requires make, go-winres, MinGW-w64 on PATH)
export PATH="/c/msys64/mingw64/bin:$PATH"
make windows
```

## Architecture

```
Go host (backend/)
├── main.go            — Entry point, WebView window, Go↔JS bridge
├── fr_installer.go    — FR detection, download, install, process lifecycle
├── cors_proxy.go      — Reverse proxy that adds CORS headers (:9080→:37864)
├── file_dialog.go     — Native file dialogs (Win/Mac/Linux)
└── dist/              — (generated) copied from frontend/dist for embed

Frontend (frontend/src/)
├── App.tsx           — Root component, global state (React Context + useReducer)
├── components/
│   ├── MenuBar.tsx        — Open DSN, Export SES, FR status
│   ├── BoardCanvas.tsx    — LeaferJS PCB renderer
│   ├── SidePanel.tsx      — Layer visibility, board stats
│   ├── ProgressPanel.tsx  — Routing progress bar
│   ├── LogPanel.tsx       — Real-time scrollable log
│   └── SetupWizard.tsx    — First-run FR download/install wizard
└── lib/
    ├── pcb-renderer.ts    — LeaferJS rendering engine
    ├── ses-parser.ts      — SES (Specctra Session File) parser
    ├── board-types.ts     — PCB data types (Trace, Via, Pad, Component)
    └── api.ts             — FR API client (fetch + SSE via CORS proxy)
```

## Key Decisions

- **Go host, not Tauri/Rust** — single ~5-10MB binary, cross-platform, fast compile
- **No JAR, no Java** — FreeRouting v2.2.4+ ships platform installers (.msi/.dmg/.zip) with bundled JRE
- **Detect existing install** — checks registry (Win), /Applications (Mac), PATH (Linux) first
- **Auto-download if missing** — downloads platform package from GitHub Releases, installs to `~/Freerouting-Desktop/`
- **Frontend calls FR API directly** through Go CORS proxy at `127.0.0.1:9080` → `127.0.0.1:37864`
- **SES parser in frontend JS** — no Go parser needed
- **LeaferJS** for PCB rendering (scene graph, zoom/pan, layers, events built-in)
- **Pure CSS layout** — no UI framework
- **React Context + useReducer** for state — no external state lib

## Go ↔ Frontend Bridge

Go exposes functions to frontend via `w.Bind()`:
- `checkFRStatus()` → `{status, version, progress}`
- `downloadFR()` → async with progress callbacks
- `startFR()` / `stopFR()`
- `openFileDialog()` / `saveFileDialog(name)`
- `readFile(path)` / `writeFile(path, data)`

## FR API (via CORS proxy at 127.0.0.1:9080)

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

## FR Startup (API mode, all platforms)

```
<fr-binary> \
  --api_server.enabled=true \
  --api_server.endpoints=http://127.0.0.1:37864 \
  --api_server.authentication.enabled=false \
  --api_server.idle_timeout=300 \
  --gui.enabled=false \
  --logging.console.level=INFO \
  --logging.file.enabled=false
```

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
├── backend/               # Go host
│   ├── main.go
│   ├── fr_installer.go
│   ├── cors_proxy.go
│   ├── file_dialog.go
│   ├── go.mod / go.sum
│   └── dist/              # (generated)
├── frontend/              # React frontend
│   ├── src/ (as above)
│   ├── package.json
│   └── vite.config.ts
├── docs/                  # Documentation
│   └── freerouting-desktop-app-plan.md
├── images/                # App icons
├── build/                 # Build artifacts
├── Makefile
├── VERSION
├── README.md
└── CLAUDE.md
```
