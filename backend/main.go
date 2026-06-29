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
	"runtime"
	"runtime/debug"
	"syscall"
	"time"
	"unsafe"

	webview "github.com/webview/webview_go"
)

//go:embed all:dist
var dist embed.FS

var (
	version  = "dev"
	platform = "dev"
)

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
	fmux.Handle("/", http.FileServer(http.FS(sub)))
	go http.ListenAndServe("127.0.0.1:1421", fmux)
	time.Sleep(200 * time.Millisecond)
	log.Println("Step 2: HTTP server started")

	// Step 3: create WebView
	log.Println("Step 3: creating WebView...")
	w := webview.New(true)
	log.Println("Step 3: WebView created OK")
	defer w.Destroy()

	w.SetTitle("FreeRouting Desktop " + version)
	winW, winH := initialWindowSize()
	w.SetSize(winW, winH, webview.HintNone)
	centerWindow(winW, winH)

	w.Bind("checkFreeRoutingStatus", checkFreeRoutingStatus)
	w.Bind("selectFreeRoutingPath", selectFreeRoutingPath)
	w.Bind("startFreeRouting", startFreeRouting)
	w.Bind("stopFreeRouting", stopFreeRouting)
	w.Bind("openURL", openURL)
	w.Bind("openFileDialog", openFileDialog)
	w.Bind("saveFileDialog", saveFileDialog)
	w.Bind("readFile", readFile)
	w.Bind("writeFile", writeFile)
	w.Bind("getLastDir", getLastDir)
	w.Bind("saveLastDir", saveLastDir)

	log.Println("Step 4: navigating...")
	w.Navigate("http://127.0.0.1:1421")
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

func screenSize() (int, int) {
	if runtime.GOOS == "windows" {
		sw, _, _ := procGetSystemMetrics.Call(0) // SM_CXSCREEN = 0
		sh, _, _ := procGetSystemMetrics.Call(1) // SM_CYSCREEN = 1
		return int(sw), int(sh)
	}
	return 1600, 1000
}

func centerWindow(width, height int) {
	if runtime.GOOS != "windows" {
		return
	}
	// Find the window by title and center it using Win32 API
	// We retry a few times since the window may not be ready immediately
	go func() {
		for i := 0; i < 20; i++ {
			time.Sleep(100 * time.Millisecond)
			hwnd := findWindow("FreeRouting Desktop " + version)
			if hwnd == 0 {
				continue
			}
			setWindowCenter(hwnd, width, height)
			return
		}
	}()
}

// Win32 API
var (
	user32              = syscall.NewLazyDLL("user32.dll")
	procFindWindowW     = user32.NewProc("FindWindowW")
	procGetSystemMetrics = user32.NewProc("GetSystemMetrics")
	procSetWindowPos    = user32.NewProc("SetWindowPos")
	procMoveWindow      = user32.NewProc("MoveWindow")
	procGetWindowRect   = user32.NewProc("GetWindowRect")
)

func findWindow(title string) uintptr {
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	ret, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(titlePtr)))
	return ret
}

func setWindowCenter(hwnd uintptr, width, height int) {
	sw, _, _ := procGetSystemMetrics.Call(0) // SM_CXSCREEN = 0
	sh, _, _ := procGetSystemMetrics.Call(1) // SM_CYSCREEN = 1
	x := int(sw)/2 - width/2
	y := int(sh)/2 - height/2
	if x < 0 { x = 0 }
	if y < 0 { y = 0 }
	procMoveWindow.Call(hwnd, uintptr(x), uintptr(y), uintptr(width), uintptr(height), 1)
}
