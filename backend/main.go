package main

import (
	"embed"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
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

func main() {
	logFile, _ := os.Create(os.TempDir() + "/fr.log")
	writers := []io.Writer{os.Stderr}
	if logFile != nil {
		writers = append(writers, logFile)
		defer logFile.Close()
	}
	log.SetOutput(io.MultiWriter(writers...))

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
	w := webview.New(false)
	log.Println("Step 3: WebView created OK")
	defer w.Destroy()

	w.SetTitle("FreeRouting Desktop " + version)
	w.SetSize(1400, 900, webview.HintNone)

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
	log.Println("Exited.")
}
