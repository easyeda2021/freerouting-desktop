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
	"runtime"
	"sync"
	"syscall"
	"time"
)

type FreeRoutingStatus struct {
	Status   string `json:"status"` // "loading", "not-installed", "ready", "error"
	Version  string `json:"version,omitempty"`
	Progress int    `json:"progress"`
	Message  string `json:"message,omitempty"`
}

type Config struct {
	BinPath     string `json:"bin_path"`
	LastDir     string `json:"last_dir"`
}

var (
	freeroutingProcess  *exec.Cmd
	freeroutingMutex    sync.Mutex
	freeroutingStatus   = FreeRoutingStatus{Status: "loading"}
	freeroutingBinPath  string
	configMutex         sync.Mutex
)

func getFreeRoutingDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Freerouting-Desktop")
}

func getConfigPath() string {
	return filepath.Join(getFreeRoutingDir(), "config.json")
}

func getLegacyConfigPath() string {
	return filepath.Join(getFreeRoutingDir(), "config.cfg")
}

func migrateConfig() {
	newPath := getConfigPath()
	oldPath := getLegacyConfigPath()
	if _, err := os.Stat(newPath); os.IsNotExist(err) {
		if _, err := os.Stat(oldPath); err == nil {
			if err := os.Rename(oldPath, newPath); err != nil {
				log.Printf("Failed to migrate old config.cfg to config.json: %v", err)
			} else {
				log.Printf("Migrated config.cfg to config.json")
			}
		}
	}
}

func checkFreeRoutingStatus() string {
	freeroutingMutex.Lock()
	defer freeroutingMutex.Unlock()

	savedPath := loadFreeRoutingPath()
	if savedPath != "" {
		if _, err := os.Stat(savedPath); err == nil {
			freeroutingBinPath = savedPath
			freeroutingStatus = FreeRoutingStatus{Status: "ready", Version: queryFRVersion()}
			goto done
		}
	}

	if bin, ok := checkFreeRoutingInstalledSystem(); ok {
		freeroutingBinPath = bin
		saveFreeRoutingPath(bin)
		freeroutingStatus = FreeRoutingStatus{Status: "ready", Version: queryFRVersion()}
		goto done
	}

	freeroutingStatus = FreeRoutingStatus{Status: "not-installed"}

done:
	data, _ := json.Marshal(freeroutingStatus)
	return string(data)
}

func queryFRVersion() string {
	return getFreeRoutingVersionFromAPI()
}

func loadConfig() Config {
	migrateConfig()
	var cfg Config
	data, err := os.ReadFile(getConfigPath())
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("Failed to read config: %v", err)
		}
		return cfg
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		log.Printf("Failed to parse config: %v", err)
	}
	return cfg
}

func saveConfig(cfg Config) error {
	configMutex.Lock()
	defer configMutex.Unlock()
	if err := os.MkdirAll(getFreeRoutingDir(), 0755); err != nil {
		log.Printf("Failed to create config dir: %v", err)
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		log.Printf("Failed to marshal config: %v", err)
		return err
	}
	// Write to temp file and rename for atomicity
	tmpPath := getConfigPath() + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		log.Printf("Failed to write config temp file: %v", err)
		return err
	}
	if err := renameWithOverwrite(tmpPath, getConfigPath()); err != nil {
		log.Printf("Failed to rename config temp file: %v", err)
		return err
	}
	return nil
}

func renameWithOverwrite(src, dst string) error {
	if runtime.GOOS == "windows" {
		if err := os.Remove(dst); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return os.Rename(src, dst)
}

func loadFreeRoutingPath() string {
	return loadConfig().BinPath
}

func saveFreeRoutingPath(path string) {
	cfg := loadConfig()
	cfg.BinPath = path
	saveConfig(cfg)
}

func getLastDir() string {
	return loadConfig().LastDir
}

func saveLastDir(dir string) {
	cfg := loadConfig()
	cfg.LastDir = dir
	saveConfig(cfg)
}

func getFreeRoutingVersionFromAPI() string {
	resp, err := http.Get("http://127.0.0.1:37864/v1/system/status")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return ""
	}
	// Try common version field names
	for _, key := range []string{"version", "Version", "freerouting_version", "application_version", "build_version"} {
		if v, ok := result[key]; ok {
			return fmt.Sprintf("%v", v)
		}
	}
	return ""
}

func selectFreeRoutingPath() string {
	path, _ := openExecutableDialog()
	if path == "" {
		return ""
	}
	if _, err := os.Stat(path); err != nil {
		return ""
	}
	freeroutingMutex.Lock()
	freeroutingBinPath = path
	saveFreeRoutingPath(path)
	freeroutingStatus = FreeRoutingStatus{Status: "ready", Version: queryFRVersion()}
	freeroutingMutex.Unlock()
	return path
}

func checkFreeRoutingInstalledSystem() (string, bool) {
	switch runtime.GOOS {
	case "windows":
		return checkFreeRoutingWindows()
	case "darwin":
		return checkFreeRoutingMacOS()
	default:
		return checkFreeRoutingLinux()
	}
}

func checkFreeRoutingWindows() (string, bool) {
	paths := []string{
		filepath.Join(os.Getenv("ProgramFiles"), "Freerouting", "freerouting.exe"),
		filepath.Join(os.Getenv("LocalAppData"), "Programs", "Freerouting", "freerouting.exe"),
		filepath.Join(os.Getenv("LocalAppData"), "freerouting", "freerouting.exe"),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "Freerouting", "freerouting.exe"),
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p, true
		}
	}
	return "", false
}

func checkFreeRoutingMacOS() (string, bool) {
	paths := []string{
		"/Applications/Freerouting.app/Contents/MacOS/freerouting",
		filepath.Join(os.Getenv("HOME"), "Applications", "Freerouting.app", "Contents", "MacOS", "freerouting"),
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p, true
		}
	}
	return "", false
}

func checkFreeRoutingLinux() (string, bool) {
	if p, err := exec.LookPath("freerouting"); err == nil {
		return p, true
	}
	paths := []string{
		"/opt/freerouting/bin/freerouting",
		filepath.Join(os.Getenv("HOME"), ".local", "bin", "freerouting"),
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p, true
		}
	}
	return "", false
}

func startFreeRouting() string {
	freeroutingMutex.Lock()
	defer freeroutingMutex.Unlock()

	if freeroutingProcess != nil {
		return ""
	}

	bin := freeroutingBinPath
	if bin == "" {
		return "FreeRouting not found. Please select the executable first."
	}
	if _, err := os.Stat(bin); os.IsNotExist(err) {
		return "FreeRouting executable not found at: " + bin
	}

	args := []string{
		"--api_server.enabled=true",
		"--api_server.endpoints=http://127.0.0.1:37864",
		"--api_server.authentication.enabled=false",
		"--api_server.idle_timeout=300",
		"--gui.enabled=false",
		"--logging.console.level=INFO",
		"--logging.file.enabled=false",
	}

	freeroutingProcess = exec.Command(bin, args...)
	freeroutingProcess.Stdout = os.Stdout
	freeroutingProcess.Stderr = os.Stderr
	if runtime.GOOS == "windows" {
		freeroutingProcess.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}

	if err := freeroutingProcess.Start(); err != nil {
		freeroutingProcess = nil
		return "Failed to start FreeRouting: " + err.Error()
	}

	log.Printf("FreeRouting started (PID: %d)", freeroutingProcess.Process.Pid)

	go func() {
		for i := 0; i < 30; i++ {
			time.Sleep(500 * time.Millisecond)
			resp, err := http.Get("http://127.0.0.1:37864/v1/system/status")
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					freeroutingMutex.Lock()
					freeroutingStatus.Status = "ready"
					freeroutingStatus.Version = getFreeRoutingVersionFromAPI()
					freeroutingMutex.Unlock()
					log.Printf("FreeRouting API is ready, version: %s", freeroutingStatus.Version)
					return
				}
			}
		}
		log.Println("FreeRouting startup timed out")
	}()

	return ""
}

func stopFreeRouting() {
	freeroutingMutex.Lock()
	defer freeroutingMutex.Unlock()

	if freeroutingProcess == nil {
		return
	}

	log.Println("Stopping FreeRouting...")
	if err := freeroutingProcess.Process.Kill(); err != nil {
		log.Printf("Error killing FreeRouting: %v", err)
	}
	freeroutingProcess.Wait()
	freeroutingProcess = nil
	log.Println("FreeRouting stopped")
}

func init() {
	os.MkdirAll(getFreeRoutingDir(), 0755)
}
