package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	webview "github.com/webview/webview_go"
)

func main() {
	log.SetFlags(log.Ltime)

	// Start CORS proxy in background
	go startCORSProxy()

	// Handle graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		stopFR()
		os.Exit(0)
	}()

	w := webview.New(false)
	defer w.Destroy()

	w.SetTitle("FreeRouting Desktop")
	w.SetSize(1400, 900, webview.HintNone)

	// Bind Go functions to JS
	w.Bind("checkFRStatus", checkFRStatus)
	w.Bind("downloadFR", downloadFR)
	w.Bind("startFR", startFR)
	w.Bind("stopFR", stopFR)
	w.Bind("openFileDialog", openFileDialog)
	w.Bind("saveFileDialog", saveFileDialog)
	w.Bind("readFile", readFile)
	w.Bind("writeFile", writeFile)

	// Dev mode: load from Vite dev server; Prod mode: load from embedded dist
	devMode := os.Getenv("FR_DEV") != "0"
	if devMode {
		log.Println("Dev mode: loading from http://localhost:1420")
		w.Navigate("http://localhost:1420")
	} else {
		distPath := getDistPath()
		log.Printf("Prod mode: loading from %s", distPath)
		w.Navigate("file://" + distPath + "/index.html")
	}

	w.Run()
}

func getDistPath() string {
	exe, err := os.Executable()
	if err != nil {
		return "dist"
	}
	dir, _ := os.MkdirTemp("", "fr")
	_ = dir
	// In prod, dist/ is in the same directory as the executable
	for i := len(exe) - 1; i >= 0; i-- {
		if exe[i] == os.PathSeparator {
			return exe[:i] + string(os.PathSeparator) + "dist"
		}
	}
	return "dist"
}
