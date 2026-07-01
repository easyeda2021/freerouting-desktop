package main

import (
	"embed"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime/debug"
	"syscall"
	"time"

	webview "github.com/webview/webview_go"
)

//go:embed all:dist
var dist embed.FS

var (
	version  = "dev"
	platform = "dev"
)

// wv is the active WebView instance; it is referenced by the Win32 WndProc to
// terminate the message loop when the parent window is destroyed.
var wv webview.WebView

func main() {
	logPath := filepath.Join(getFreeRoutingDir(), "app.log")
	logFile, _ := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	writers := []io.Writer{}
	if logFile != nil {
		writers = append(writers, logFile)
		defer logFile.Close()
	}
	// In dev mode (console app) also mirror to stderr; in GUI builds stderr
	// writes can fail and block the file writer when using MultiWriter.
	if version == "dev" {
		writers = append(writers, os.Stderr)
	}
	if len(writers) > 0 {
		log.SetOutput(io.MultiWriter(writers...))
	}

	defer func() {
		if r := recover(); r != nil {
			log.Printf("PANIC: %v\n%s", r, debug.Stack())
		}
	}()

	log.Printf("FreeRouting Desktop %s (%s)", version, platform)

	go startCORSProxy()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		stopFreeRouting()
		os.Exit(0)
	}()

	// Step 1: verify embed
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		log.Printf("FATAL: embed error: %v", err)
		return
	}
	log.Println("Step 1: embed OK")

	// Step 2: start HTTP server
	fmux := http.NewServeMux()
	fmux.Handle("/", noCacheHandler(http.FileServer(http.FS(sub))))
	go http.ListenAndServe("127.0.0.1:1421", fmux)
	time.Sleep(200 * time.Millisecond)
	log.Println("Step 2: HTTP server started")

	// Step 3: create WebView inside a hidden parent window so the initial
	// default-size flash is avoided.
	log.Println("Step 3: creating WebView...")
	winW, winH := initialWindowSize()
	hostWnd := createHostWindow(winW, winH)
	w := webview.NewWindow(true, hostWnd)
	wv = w
	log.Println("Step 3: WebView created OK")
	defer w.Destroy()

	w.SetTitle("FreeRouting Desktop " + version)
	w.SetSize(winW, winH, webview.HintNone)
	prepareWindow(w.Window(), winW, winH)

	w.Bind("checkFreeRoutingStatus", checkFreeRoutingStatus)
	w.Bind("selectFreeRoutingPath", selectFreeRoutingPath)
	w.Bind("startFreeRouting", startFreeRouting)
	w.Bind("stopFreeRouting", stopFreeRouting)
	w.Bind("openURL", openURL)
	w.Bind("openFileDialog", openFileDialog)
	w.Bind("saveFileDialog", saveFileDialog)
	w.Bind("readFile", readFile)
	w.Bind("writeFile", writeFile)
	w.Bind("getAppVersion", func() string { return version })

	log.Println("Step 4: navigating...")
	// Append the build version as a cache-busting query parameter so WebView2
	// always fetches the freshly embedded frontend instead of a stale disk cache.
	w.Navigate("http://127.0.0.1:1421?v=" + version)
	log.Println("Step 5: running...")
	w.Run()
	log.Println("Window closed. Cleaning up FreeRouting process...")
	stopFreeRouting()
	log.Println("Exited.")
}

func initialWindowSize() (int, int) {
	sw, sh := screenSize()
	w := int(float64(sw) * 0.8)
	h := int(float64(sh) * 0.8)
	if w < 1024 { w = 1024 }
	if h < 768 { h = 768 }
	return w, h
}

// noCacheHandler wraps a file server and disables HTTP caching so the embedded
// frontend is always loaded fresh after each rebuild.
func noCacheHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		next.ServeHTTP(w, r)
	})
}
