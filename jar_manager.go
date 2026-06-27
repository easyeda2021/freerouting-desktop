package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// JarStatus represents the current state of the JAR
type JarStatus struct {
	Status   string `json:"status"` // "not-installed", "downloading", "ready", "error"
	Version  string `json:"version,omitempty"`
	Progress int    `json:"progress"`
	Message  string `json:"message,omitempty"`
}

var (
	jarProcess   *exec.Cmd
	jarMutex     sync.Mutex
	jarStatus    = JarStatus{Status: "loading"}
	downloadDone = make(chan bool, 1)
)

func getAppDataDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Freerouting-Desktop", "freerouting")
}

func getJarPath() string {
	return filepath.Join(getAppDataDir(), "freerouting-executable.jar")
}

func getVersionPath() string {
	return filepath.Join(getAppDataDir(), "version.txt")
}

func checkJarStatus() string {
	jarMutex.Lock()
	defer jarMutex.Unlock()

	jarPath := getJarPath()
	if _, err := os.Stat(jarPath); os.IsNotExist(err) {
		jarStatus = JarStatus{Status: "not-installed"}
	} else {
		version := ""
		if v, err := os.ReadFile(getVersionPath()); err == nil {
			version = string(v)
		}
		jarStatus = JarStatus{Status: "ready", Version: version}
	}

	data, _ := json.Marshal(jarStatus)
	return string(data)
}

func downloadJar() {
	jarMutex.Lock()
	jarStatus = JarStatus{Status: "downloading", Progress: 0}
	jarMutex.Unlock()

	// Ensure app data dir exists
	os.MkdirAll(getAppDataDir(), 0755)

	jarPath := getJarPath()
	downloadURL := "https://github.com/freerouting/freerouting/releases/latest/download/freerouting-executable.jar"

	log.Printf("Downloading JAR from %s", downloadURL)

	resp, err := http.Get(downloadURL)
	if err != nil {
		jarMutex.Lock()
		jarStatus = JarStatus{Status: "error", Message: fmt.Sprintf("Download failed: %v", err)}
		jarMutex.Unlock()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		jarMutex.Lock()
		jarStatus = JarStatus{Status: "error", Message: fmt.Sprintf("Download failed: HTTP %d", resp.StatusCode)}
		jarMutex.Unlock()
		return
	}

	totalSize := resp.ContentLength
	out, err := os.Create(jarPath)
	if err != nil {
		jarMutex.Lock()
		jarStatus = JarStatus{Status: "error", Message: fmt.Sprintf("Cannot create file: %v", err)}
		jarMutex.Unlock()
		return
	}
	defer out.Close()

	buf := make([]byte, 32*1024)
	var downloaded int64
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			out.Write(buf[:n])
			downloaded += int64(n)
			if totalSize > 0 {
				progress := int(downloaded * 100 / totalSize)
				jarMutex.Lock()
				jarStatus.Progress = progress
				jarMutex.Unlock()
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			jarMutex.Lock()
			jarStatus = JarStatus{Status: "error", Message: fmt.Sprintf("Download interrupted: %v", err)}
			jarMutex.Unlock()
			return
		}
	}

	jarMutex.Lock()
	jarStatus = JarStatus{Status: "ready"}
	jarMutex.Unlock()

	log.Println("JAR download complete")
	downloadDone <- true
}

func startJar() string {
	jarMutex.Lock()
	defer jarMutex.Unlock()

	if jarProcess != nil {
		return ""
	}

	jarPath := getJarPath()
	if _, err := os.Stat(jarPath); os.IsNotExist(err) {
		return fmt.Sprintf("JAR not found at %s", jarPath)
	}

	args := []string{
		"-jar", jarPath,
		"--api_server.enabled=true",
		"--api_server.endpoints=http://127.0.0.1:37864",
		"--api_server.authentication.enabled=false",
		"--api_server.idle_timeout=300",
		"--gui.enabled=false",
		"--logging.console.level=INFO",
		"--logging.file.enabled=false",
	}

	jarProcess = exec.Command("java", args...)
	jarProcess.Stdout = os.Stdout
	jarProcess.Stderr = os.Stderr

	if err := jarProcess.Start(); err != nil {
		jarProcess = nil
		return fmt.Sprintf("Failed to start JAR: %v", err)
	}

	log.Printf("JAR started (PID: %d)", jarProcess.Process.Pid)

	// Wait for readiness
	go func() {
		for i := 0; i < 30; i++ {
			time.Sleep(500 * time.Millisecond)
			resp, err := http.Get("http://127.0.0.1:37864/v1/system/status")
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					jarMutex.Lock()
					jarStatus.Status = "ready"
					jarMutex.Unlock()
					log.Println("JAR API is ready")
					return
				}
			}
		}
		log.Println("JAR startup timed out")
	}()

	return ""
}

func stopJar() {
	jarMutex.Lock()
	defer jarMutex.Unlock()

	if jarProcess == nil {
		return
	}

	log.Println("Stopping JAR process...")
	if err := jarProcess.Process.Kill(); err != nil {
		log.Printf("Error killing JAR: %v", err)
	}
	jarProcess.Wait()
	jarProcess = nil
	log.Println("JAR stopped")
}

func openFileDialog() string {
	// Open a native file dialog via OS-specific command
	// webview/webview_go doesn't have built-in dialog support,
	// so we use platform-specific methods
	path, err := openNativeFileDialog()
	if err != nil {
		return ""
	}
	return path
}

func saveFileDialog(defaultName string) string {
	path, err := saveNativeFileDialog(defaultName)
	if err != nil {
		return ""
	}
	return path
}

func readFile(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(data)
}

func writeFile(path string, data string) string {
	err := os.WriteFile(path, []byte(data), 0644)
	if err != nil {
		return err.Error()
	}
	return ""
}
