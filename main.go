package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	webview "github.com/webview/webview_go"
)

//go:embed all:frontend/dist
var dist embed.FS

func main() {
	log.SetFlags(log.Ltime)

	go startCORSProxy()

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

	w.Bind("checkFRStatus", checkFRStatus)
	w.Bind("downloadFR", downloadFR)
	w.Bind("startFR", startFR)
	w.Bind("stopFR", stopFR)
	w.Bind("openFileDialog", openFileDialog)
	w.Bind("saveFileDialog", saveFileDialog)
	w.Bind("readFile", readFile)
	w.Bind("writeFile", writeFile)

	devMode := os.Getenv("FR_DEV") != "0"
	if devMode {
		log.Println("Dev mode: loading from http://localhost:1420")
		w.Navigate("http://localhost:1420")
	} else {
		sub, _ := fs.Sub(dist, "frontend/dist")
		http.Handle("/", http.FileServer(http.FS(sub)))
		go http.ListenAndServe("127.0.0.1:1421", nil)
		log.Println("Prod mode: serving embedded dist on :1421")
		w.Navigate("http://127.0.0.1:1421")
	}

	w.Run()
}
