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
- [Make](https://www.gnu.org/software/make/)
- C compiler (MinGW-w64 on Windows, Xcode CLI on macOS, GCC on Linux)
- [go-winres](https://github.com/tc-hib/go-winres) (`go install github.com/tc-hib/go-winres@latest`) — required for Windows icon/version resources

### Setup

```bash
git clone git@github.com:easyeda2021/freerouting-desktop.git
cd freerouting-desktop

# Frontend
cd frontend
npm install
npm run dev          # → localhost:1420

# Go host (separate terminal)
cd backend && go run .   # opens WebView loading localhost:1420
```

### Build

The project uses a Makefile to build the frontend, embed it into the Go binary, generate Windows resources (icon/version info), and compile the final executable.

```bash
# Windows (requires MinGW-w64 in PATH)
make windows

# macOS
make macos

# Linux
make linux
```

The Windows executable is written to `build/freerouting-desktop-<version>-windows-x64.exe`.

**Note on Windows toolchains:** `webview_go` requires CGO. Make sure MinGW-w64 is installed and its `bin` directory is on your PATH, then build with the compiler discoverable as `gcc`:

```powershell
# Example with MSYS2 MinGW-w64
$env:PATH = "C:\msys64\mingw64\bin;" + $env:PATH
make windows
```

#### Simplified / no-icon build

If you only need a runnable binary without icons or Windows version metadata, you can build directly after `cd frontend && npm run build`:

```bash
cd backend
# On Windows with MinGW in PATH
go build -ldflags="-s -w -H windowsgui" -o freerouting-desktop.exe .
```

Cross-compilation is limited because `webview_go` depends on CGO and platform-specific WebView libraries; building for Windows must be done on Windows (or with a matching MinGW toolchain).

## How It Works

1. App starts → Go host detects if FreeRouting is installed on the system
2. If not installed → downloads the platform-specific package from GitHub Releases → installs to `~/Freerouting-Desktop/`
3. Launches FreeRouting in API mode with `--gui.enabled=false`
4. Frontend opens DSN file → sends to FR API via CORS proxy → starts routing
5. FR pushes progress via SSE → frontend parses SES output → LeaferJS renders PCB board in real-time
6. User exports completed SES file

## License

MIT
