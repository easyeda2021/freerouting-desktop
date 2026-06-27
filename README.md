# FreeRouting Desktop

Modern desktop GUI for [FreeRouting](https://github.com/freerouting/freerouting), a Java PCB auto-router.

Replaces the old Swing GUI with a **Go + WebView** desktop app. The Go host manages the FreeRouting JAR process and provides a native WebView window. The frontend (React + TypeScript + LeaferJS) renders the PCB board and communicates directly with the JAR's HTTP API through a CORS proxy.

## Architecture

```
Go Host (WebView + JAR Manager + CORS Proxy)
  └── WebView Window
       └── React Frontend (LeaferJS PCB Renderer + SES Parser)
            ↓ fetch/SSE via CORS proxy
       Java JAR (FreeRouting API :37864)
```

- **Go host** (~5-10MB): WebView window, JAR download/process management, CORS reverse proxy, native file dialogs
- **Frontend** (~2MB): React + TypeScript + LeaferJS for PCB canvas rendering, JS SES parser
- **No Rust, no Node.js runtime bundled** — single Go binary + static HTML/JS

## Platform Support

| Platform | WebView Engine | Requirements |
|----------|---------------|--------------|
| Windows | Edge WebView2 | Win10+ (built-in) |
| macOS | Cocoa WKWebView | Built-in |
| Linux | GTK + WebKitGTK | `libgtk-3-dev libwebkit2gtk-4.1-dev` |

## Development

### Prerequisites

- [Go](https://go.dev/dl/) 1.21+
- [Node.js](https://nodejs.org/) 18+
- [Java](https://adoptium.net/) 17+ (for running FreeRouting JAR)

### Setup

```bash
# Clone
git clone git@github.com:easyeda2021/freerouting-desktop.git
cd freerouting-desktop

# Frontend
cd frontend
npm install
npm run dev          # → localhost:1420

# Go host (separate terminal)
go run .             # opens WebView loading localhost:1420
```

### Build

```bash
# Build frontend
cd frontend && npm run build    # → ../dist/

# Build Go binary
go build -ldflags="-s -w" -o freerouting-desktop .

# Cross-compile
GOOS=windows go build -ldflags="-s -w" -o freerouting-desktop.exe .
GOOS=darwin  go build -ldflags="-s -w" -o freerouting-desktop-mac .
GOOS=linux   go build -ldflags="-s -w" -o freerouting-desktop-linux .
```

## How It Works

1. App starts → Go host checks for `freerouting-executable.jar` in app data dir → downloads from GitHub Releases if missing
2. Go host launches JAR in API mode (`java -jar freerouting-executable.jar --api_server.enabled=true ...`)
3. Frontend opens DSN file → sends to JAR API via CORS proxy → starts routing
4. JAR pushes progress via SSE → frontend parses SES output → LeaferJS renders PCB board in real-time
5. User exports completed SES file

## License

MIT
