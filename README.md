# FreeRouting Desktop

Modern desktop GUI for [FreeRouting](https://github.com/freerouting/freerouting), a PCB auto-router.

Replaces the old Swing GUI with a **Go + WebView** desktop app. The Go host detects whether FreeRouting is installed on the system, downloads and installs it if not, then launches it in API mode. The frontend (React + TypeScript + LeaferJS) renders the PCB board and communicates directly with the FreeRouting HTTP API through a CORS proxy.

## Architecture

```
Go Host (WebView + FR Installer + CORS Proxy)
  └── WebView Window
       └── React Frontend (LeaferJS PCB Renderer + SES Parser)
            ↓ fetch/SSE via CORS proxy (:9080)
       FreeRouting Process (API Mode :37864, self-contained JRE)
```

- **Go host** (~5-10MB): WebView window, FR detection/download/install/process management, CORS proxy, native file dialogs
- **Frontend** (~0.5MB gzipped): React + TypeScript + LeaferJS for PCB canvas rendering, JS SES parser
- **No Rust, no Java, no Node.js runtime bundled** — single Go binary + static HTML/JS

## Platform Support

| Platform | WebView Engine | FreeRouting Package |
|----------|---------------|---------------------|
| Windows | Edge WebView2 (built-in) | `.msi` installer |
| macOS | Cocoa WKWebView (built-in) | `.dmg` image |
| Linux | GTK + WebKitGTK | `.zip` archive |

FreeRouting packages bundle their own JRE — users never need to install Java.

## Development

### Prerequisites

- [Go](https://go.dev/dl/) 1.21+
- [Node.js](https://nodejs.org/) 18+
- C compiler (MinGW-w64 on Windows, Xcode CLI on macOS, GCC on Linux)

### Setup

```bash
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
cd frontend && npm run build    # → ../dist/

# Build Go binary
go build -ldflags="-s -w" -o freerouting-desktop .

# Cross-compile
GOOS=windows go build -ldflags="-s -w" -o freerouting-desktop.exe .
GOOS=darwin  go build -ldflags="-s -w" -o freerouting-desktop-mac .
GOOS=linux   go build -ldflags="-s -w" -o freerouting-desktop-linux .
```

## How It Works

1. App starts → Go host detects if FreeRouting is installed on the system
2. If not installed → downloads the platform-specific package from GitHub Releases → installs to `~/Freerouting-Desktop/`
3. Launches FreeRouting in API mode with `--gui.enabled=false`
4. Frontend opens DSN file → sends to FR API via CORS proxy → starts routing
5. FR pushes progress via SSE → frontend parses SES output → LeaferJS renders PCB board in real-time
6. User exports completed SES file

## License

MIT
