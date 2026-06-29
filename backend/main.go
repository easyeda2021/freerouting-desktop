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
	home, _ := os.UserHomeDir()
	logPath := home + "/freerouting-desktop.log"
	logFile, _ := os.Create(logPath)
	writers := []io.Writer{os.Stderr}
	if logFile != nil {
		writers = append(writers, logFile)
	}
	log.SetOutput(io.MultiWriter(writers...))
	defer func() {
		if r := recover(); r != nil {
			log.Printf("PANIC: %v\n%s", r, debug.Stack())
		}
		if logFile != nil {
			logFile.Close()
		}
	}()

	log.SetFlags(log.Ltime)
	log.Printf("FreeRouting Desktop %s (%s)", version, platform)

	go startCORSProxy()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		stopFR()
		os.Exit(0)
	}()

	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		log.Printf("embed error: %v", err)
		return
	}
	log.Println("Embed OK, starting HTTP...")

	fmux := http.NewServeMux()
	fmux.Handle("/", http.FileServer(http.FS(sub)))
	go http.ListenAndServe("127.0.0.1:1421", fmux)
	time.Sleep(100 * time.Millisecond)
	log.Println("HTTP server started, creating WebView...")

	w := webview.New(false)
	log.Println("WebView created")
	defer w.Destroy()

	w.SetTitle("FreeRouting Desktop " + version)
	w.SetSize(1400, 900, webview.HintNone)

	w.Bind("checkFRStatus", checkFRStatus)
	w.Bind("downloadFR", downloadFR)
	w.Bind("startFR", startFR)
	w.Bind("stopFR", stopFR)
	w.Bind("openFileDialog", openFileDialog)
	w.Bind("saveFileDialog", saveFileDialog)
	w.Bind("readFile", readFile)
	w.Bind("writeFile", writeFile)

	devMode := os.Getenv("FR_DEV") == "1"
	if devMode {
		log.Println("Dev: http://localhost:1420")
		w.Navigate("http://localhost:1420")
	} else {
		log.Println("Prod: http://127.0.0.1:1421")
		w.Navigate("http://127.0.0.1:1421")
	}

	log.Println("Calling w.Run()...")
	w.Run()
	log.Println("Exited.")
}
