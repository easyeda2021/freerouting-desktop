package main

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// FRStatus represents the current state of FreeRouting on the system
type FRStatus struct {
	Status   string `json:"status"` // "loading", "not-installed", "downloading", "installing", "ready", "error"
	Version  string `json:"version,omitempty"`
	Progress int    `json:"progress"`
	Message  string `json:"message,omitempty"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type githubRelease struct {
	TagName string        `json:"tag_name"`
	Assets  []githubAsset `json:"assets"`
}

var (
	frProcess   *exec.Cmd
	frMutex     sync.Mutex
	frStatus    = FRStatus{Status: "loading"}
	frInstallCh = make(chan bool, 1)
)

func getFRDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Freerouting-Desktop")
}

func getFRBinDir() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(getFRDir(), "Freerouting")
	case "darwin":
		return filepath.Join(getFRDir(), "Freerouting.app", "Contents", "MacOS")
	default:
		return filepath.Join(getFRDir(), "freerouting", "bin")
	}
}

func getFRBinary() string {
	bin := filepath.Join(getFRBinDir(), "freerouting")
	if runtime.GOOS == "windows" {
		return bin + ".exe"
	}
	return bin
}

// checkFRInstalledSystem checks if FreeRouting is installed system-wide
func checkFRInstalledSystem() (string, bool) {
	switch runtime.GOOS {
	case "windows":
		return checkFRWindows()
	case "darwin":
		return checkFRMacOS()
	default:
		return checkFRLinux()
	}
}

func checkFRWindows() (string, bool) {
	// Check common install paths
	paths := []string{
		filepath.Join(os.Getenv("ProgramFiles"), "Freerouting", "freerouting.exe"),
		filepath.Join(os.Getenv("LocalAppData"), "Programs", "Freerouting", "freerouting.exe"),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "Freerouting", "freerouting.exe"),
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p, true
		}
	}
	return "", false
}

func checkFRMacOS() (string, bool) {
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

func checkFRLinux() (string, bool) {
	// Check PATH first
	if p, err := exec.LookPath("freerouting"); err == nil {
		return p, true
	}
	// Check common install locations
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

func checkFRStatus() string {
	frMutex.Lock()
	defer frMutex.Unlock()

	// First check our own install
	bin := getFRBinary()
	if _, err := os.Stat(bin); err == nil {
		version := ""
		if v, err := os.ReadFile(filepath.Join(getFRDir(), "version.txt")); err == nil {
			version = strings.TrimSpace(string(v))
		}
		frStatus = FRStatus{Status: "ready", Version: version}
	} else if sysBin, ok := checkFRInstalledSystem(); ok {
		frStatus = FRStatus{Status: "ready", Version: "system"}
		// symlink/copy to our dir for management
		_ = sysBin
	} else {
		frStatus = FRStatus{Status: "not-installed"}
	}

	data, _ := json.Marshal(frStatus)
	return string(data)
}

// getLatestRelease fetches the latest FreeRouting release info from GitHub
func getLatestRelease() (*githubRelease, error) {
	resp, err := http.Get("https://api.github.com/repos/freerouting/freerouting/releases/latest")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}
	return &release, nil
}

// pickAsset selects the correct asset for the current platform
func pickAsset(release *githubRelease) *githubAsset {
	suffixes := map[string]string{
		"windows": "-windows-x64.msi",
		"darwin":  "-macos-arm64.dmg",
		"linux":   "-linux-x64.zip",
	}
	suffix := suffixes[runtime.GOOS]
	for i := range release.Assets {
		if strings.HasSuffix(release.Assets[i].Name, suffix) {
			return &release.Assets[i]
		}
	}
	return nil
}

func downloadFR() {
	frMutex.Lock()
	frStatus = FRStatus{Status: "downloading", Progress: 0}
	frMutex.Unlock()

	os.MkdirAll(filepath.Join(getFRDir(), "downloads"), 0755)

	release, err := getLatestRelease()
	if err != nil {
		frMutex.Lock()
		frStatus = FRStatus{Status: "error", Message: fmt.Sprintf("Failed to fetch release: %v", err)}
		frMutex.Unlock()
		return
	}

	asset := pickAsset(release)
	if asset == nil {
		frMutex.Lock()
		frStatus = FRStatus{Status: "error", Message: "No package found for your platform"}
		frMutex.Unlock()
		return
	}

	log.Printf("Downloading %s...", asset.Name)
	downloadPath := filepath.Join(getFRDir(), "downloads", asset.Name)

	resp, err := http.Get(asset.BrowserDownloadURL)
	if err != nil {
		frMutex.Lock()
		frStatus = FRStatus{Status: "error", Message: fmt.Sprintf("Download failed: %v", err)}
		frMutex.Unlock()
		return
	}
	defer resp.Body.Close()

	out, err := os.Create(downloadPath)
	if err != nil {
		frMutex.Lock()
		frStatus = FRStatus{Status: "error", Message: fmt.Sprintf("Cannot create file: %v", err)}
		frMutex.Unlock()
		return
	}
	defer out.Close()

	totalSize := resp.ContentLength
	buf := make([]byte, 32*1024)
	var downloaded int64
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			out.Write(buf[:n])
			downloaded += int64(n)
			if totalSize > 0 {
				progress := int(downloaded * 100 / totalSize)
				frMutex.Lock()
				frStatus.Progress = progress
				frMutex.Unlock()
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			frMutex.Lock()
			frStatus = FRStatus{Status: "error", Message: fmt.Sprintf("Download interrupted: %v", err)}
			frMutex.Unlock()
			return
		}
	}

	// Install
	frMutex.Lock()
	frStatus.Status = "installing"
	frMutex.Unlock()

	if err := installFR(downloadPath, release.TagName); err != nil {
		frMutex.Lock()
		frStatus = FRStatus{Status: "error", Message: fmt.Sprintf("Install failed: %v", err)}
		frMutex.Unlock()
		return
	}

	// Write version
	os.WriteFile(filepath.Join(getFRDir(), "version.txt"), []byte(release.TagName), 0644)

	frMutex.Lock()
	frStatus = FRStatus{Status: "ready", Version: release.TagName}
	frMutex.Unlock()

	log.Println("FreeRouting install complete")
	frInstallCh <- true
}

func installFR(downloadPath, version string) error {
	switch runtime.GOOS {
	case "windows":
		return installMSI(downloadPath)
	case "darwin":
		return installDMG(downloadPath)
	default:
		return installZip(downloadPath)
	}
}

func installMSI(msiPath string) error {
	targetDir := getFRBinDir()
	os.MkdirAll(targetDir, 0755)

	cmd := exec.Command("msiexec", "/i", msiPath, "/qn", fmt.Sprintf("INSTALLDIR=%s", targetDir))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func installDMG(dmgPath string) error {
	// Mount DMG
	mountPoint := filepath.Join(os.TempDir(), "freerouting_mount")
	os.MkdirAll(mountPoint, 0755)

	cmd := exec.Command("hdiutil", "attach", dmgPath, "-mountpoint", mountPoint, "-nobrowse")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("mount DMG failed: %v — %s", err, string(out))
	}
	defer exec.Command("hdiutil", "detach", mountPoint).Run()

	// Copy .app to our directory
	appDir := filepath.Join(getFRDir(), "Freerouting.app")
	os.RemoveAll(appDir) // remove old version
	cmd = exec.Command("cp", "-R", filepath.Join(mountPoint, "Freerouting.app"), appDir)
	return cmd.Run()
}

func installZip(zipPath string) error {
	targetDir := filepath.Join(getFRDir(), "freerouting")
	os.RemoveAll(targetDir) // remove old version
	os.MkdirAll(targetDir, 0755)

	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		dest := filepath.Join(targetDir, f.Name)
		if !strings.HasPrefix(filepath.Clean(dest), filepath.Clean(targetDir)) {
			continue // zip slip protection
		}
		if f.FileInfo().IsDir() {
			os.MkdirAll(dest, 0755)
			continue
		}
		os.MkdirAll(filepath.Dir(dest), 0755)
		out, err := os.Create(dest)
		if err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			out.Close()
			return err
		}
		io.Copy(out, rc)
		rc.Close()
		out.Close()
	}
	// Make bin/freerouting executable
	bin := filepath.Join(targetDir, "bin", "freerouting")
	if _, err := os.Stat(bin); err == nil {
		os.Chmod(bin, 0755)
	}
	return nil
}

func startFR() string {
	frMutex.Lock()
	defer frMutex.Unlock()

	if frProcess != nil {
		return ""
	}

	bin := getFRBinary()
	if _, err := os.Stat(bin); os.IsNotExist(err) {
		// Try system install
		sysBin, ok := checkFRInstalledSystem()
		if !ok {
			return "FreeRouting not found"
		}
		bin = sysBin
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

	frProcess = exec.Command(bin, args...)
	frProcess.Stdout = os.Stdout
	frProcess.Stderr = os.Stderr

	if err := frProcess.Start(); err != nil {
		frProcess = nil
		return fmt.Sprintf("Failed to start FreeRouting: %v", err)
	}

	log.Printf("FreeRouting started (PID: %d)", frProcess.Process.Pid)

	// Wait for readiness
	go func() {
		for i := 0; i < 30; i++ {
			time.Sleep(500 * time.Millisecond)
			resp, err := http.Get("http://127.0.0.1:37864/v1/system/status")
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					frMutex.Lock()
					frStatus.Status = "ready"
					frMutex.Unlock()
					log.Println("FreeRouting API is ready")
					return
				}
			}
		}
		log.Println("FreeRouting startup timed out")
	}()

	return ""
}

func stopFR() {
	frMutex.Lock()
	defer frMutex.Unlock()

	if frProcess == nil {
		return
	}

	log.Println("Stopping FreeRouting...")
	if err := frProcess.Process.Kill(); err != nil {
		log.Printf("Error killing FreeRouting: %v", err)
	}
	frProcess.Wait()
	frProcess = nil
	log.Println("FreeRouting stopped")
}

func init() {
	os.MkdirAll(getFRDir(), 0755)
	os.MkdirAll(filepath.Join(getFRDir(), "downloads"), 0755)
}
