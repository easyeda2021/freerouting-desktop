package main

import (
	"encoding/json"
	"fmt"
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
		stopJar()
		os.Exit(0)
	}()

	w := webview.New(false)
	defer w.Destroy()

	w.SetTitle("FreeRouting Desktop")
	w.SetSize(1400, 900, webview.HintNone)

	// Bind Go functions to JS
	w.Bind("checkJarStatus", checkJarStatus)
	w.Bind("downloadJar", downloadJar)
	w.Bind("startJar", startJar)
	w.Bind("stopJar", stopJar)
	w.Bind("openFileDialog", openFileDialog)
	w.Bind("saveFileDialog", saveFileDialog)
	w.Bind("readFile", readFile)
	w.Bind("writeFile", writeFile)
	w.Bind("getAppDataDir", getAppDataDir)

	// Dev mode: load from Vite dev server; Prod mode: load from embedded dist
	devMode := os.Getenv("FR_DEV") != "0"
	if devMode {
		log.Println("Dev mode: loading from http://localhost:1420")
		w.Navigate("http://localhost:1420")
	} else {
		log.Println("Prod mode: loading from embedded dist")
		w.Navigate("file://" + getDistPath() + "/index.html")
	}

	w.Run()
}

func getDistPath() string {
	// In prod, dist/ is relative to the executable
	exe, err := os.Executable()
	if err != nil {
		return "dist"
	}
	return exe[:len(exe)-len(fmt.Sprint(os.PathSeparator))] + fmt.Sprint(os.PathSeparator) + "dist"
}

// pushToFrontend sends JSON data to the frontend via a custom event
func pushToFrontend(w webview.WebView, event string, data any) {
	payload, _ := json.Marshal(data)
	w.Eval(fmt.Sprintf(`window.dispatchEvent(new CustomEvent('%s', {detail: %s}))`, event, string(payload)))
}
