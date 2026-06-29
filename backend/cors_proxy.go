package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
)

func startCORSProxy() {
	target, err := url.Parse("http://127.0.0.1:37864")
	if err != nil {
		log.Fatalf("Invalid proxy target: %v", err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		w.Header().Set("Access-Control-Expose-Headers", "*")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		proxy.ServeHTTP(w, r)
	})

	log.Println("CORS proxy listening on :9080 -> :37864")
	if err := http.ListenAndServe("127.0.0.1:9080", mux); err != nil {
		log.Printf("CORS proxy error: %v", err)
	}
}
