package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func openNativeFileDialog() (string, error) {
	switch runtime.GOOS {
	case "windows":
		return openFileDialogWindows()
	case "darwin":
		return openFileDialogMacOS()
	default:
		return openFileDialogLinux()
	}
}

func openExecutableDialog() (string, error) {
	switch runtime.GOOS {
	case "windows":
		return openExecutableDialogWindows()
	case "darwin":
		return openExecutableDialogMacOS()
	default:
		return openExecutableDialogLinux()
	}
}

func saveNativeFileDialog(defaultName string) (string, error) {
	switch runtime.GOOS {
	case "windows":
		return saveFileDialogWindows(defaultName)
	case "darwin":
		return saveFileDialogMacOS(defaultName)
	default:
		return saveFileDialogLinux(defaultName)
	}
}

// Windows: use PowerShell to show file dialog
func openFileDialogWindows() (string, error) {
	return fileDialogWindows("DSN Files (*.dsn)|*.dsn|SES Files (*.ses)|*.ses|All Files (*.*)|*.*", "Open Design File")
}

func openExecutableDialogWindows() (string, error) {
	return fileDialogWindows("Executable (*.exe)|*.exe|All Files (*.*)|*.*", "Select FreeRouting Executable")
}

func initialDirScriptWindows() string {
	dir := getLastDir()
	if dir == "" {
		return ""
	}
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	escaped := strings.ReplaceAll(dir, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `"`, `\"`)
	return fmt.Sprintf(`$dialog.InitialDirectory = "%s"`, escaped)
}

func fileDialogWindows(filter, title string) (string, error) {
	script := fmt.Sprintf(`
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "%s"
$dialog.Title = "%s"
%s
if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
	$dialog.FileName
}
$form.Dispose()
`, filter, title, initialDirScriptWindows())
	// DO NOT hide window for file dialogs — PowerShell needs a visible window
	// to show Windows.Forms dialogs properly
	out, err := exec.Command("powershell", "-Sta", "-NoProfile", "-Command", script).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func saveFileDialogWindows(defaultName string) (string, error) {
	script := fmt.Sprintf(`
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Filter = "SES Files (*.ses)|*.ses|All Files (*.*)|*.*"
$dialog.FileName = "%s"
$dialog.Title = "Save SES File"
%s
if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
	$dialog.FileName
}
$form.Dispose()
`, defaultName, initialDirScriptWindows())
	// DO NOT hide window for file dialogs
	out, err := exec.Command("powershell", "-Sta", "-NoProfile", "-Command", script).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func initialDirMacOS() string {
	dir := getLastDir()
	if dir == "" {
		return ""
	}
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return dir
}

// macOS: use osascript for file dialogs
func openFileDialogMacOS() (string, error) {
	script := `osascript -e 'POSIX path of (choose file of type {"dsn", "ses"})'`
	if dir := initialDirMacOS(); dir != "" {
		script = fmt.Sprintf(`osascript -e 'POSIX path of (choose file of type {"dsn", "ses"} default location (POSIX file "%s"))'`, dir)
	}
	out, err := exec.Command("sh", "-c", script).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func openExecutableDialogMacOS() (string, error) {
	script := `osascript -e 'POSIX path of (choose file)'`
	if dir := initialDirMacOS(); dir != "" {
		script = fmt.Sprintf(`osascript -e 'POSIX path of (choose file default location (POSIX File "%s"))'`, dir)
	}
	out, err := exec.Command("sh", "-c", script).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func saveFileDialogMacOS(defaultName string) (string, error) {
	script := fmt.Sprintf(`osascript -e 'POSIX path of (choose file name default name "%s")'`, defaultName)
	if dir := initialDirMacOS(); dir != "" {
		script = fmt.Sprintf(`osascript -e 'POSIX path of (choose file name default name "%s" default location (POSIX file "%s"))'`, defaultName, dir)
	}
	out, err := exec.Command("sh", "-c", script).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func initialDirLinux() string {
	dir := getLastDir()
	if dir == "" {
		return ""
	}
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return dir
}

// Linux: use zenity or kdialog
func openFileDialogLinux() (string, error) {
	return fileDialogLinux("*.dsn *.ses")
}

func openExecutableDialogLinux() (string, error) {
	return fileDialogLinux("")
}

func fileDialogLinux(fileFilter string) (string, error) {
	dialog := "zenity"
	if _, err := exec.LookPath("zenity"); err != nil {
		if _, err := exec.LookPath("kdialog"); err == nil {
			dialog = "kdialog"
		} else {
			return "", fmt.Errorf("no file dialog tool found (install zenity or kdialog)")
		}
	}
	startDir := initialDirLinux()
	if startDir == "" {
		startDir = "."
	}
	if dialog == "zenity" {
		args := []string{"--file-selection", "--filename=" + startDir + string(filepath.Separator)}
		if fileFilter != "" {
			args = append(args, "--file-filter", fileFilter)
		}
		out, err := exec.Command("zenity", args...).Output()
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(out)), nil
	}
	// kdialog
	filter := "*"
	if fileFilter != "" {
		filter = fileFilter
	}
	out, err := exec.Command("kdialog", "--getopenfilename", startDir, filter).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func saveFileDialogLinux(defaultName string) (string, error) {
	dialog := "zenity"
	if _, err := exec.LookPath("zenity"); err != nil {
		if _, err := exec.LookPath("kdialog"); err == nil {
			dialog = "kdialog"
		} else {
			return "", fmt.Errorf("no file dialog tool found (install zenity or kdialog)")
		}
	}
	startDir := initialDirLinux()
	if startDir == "" {
		startDir = "."
	}
	if dialog == "zenity" {
		filename := defaultName
		if startDir != "" {
			filename = filepath.Join(startDir, defaultName)
		}
		out, err := exec.Command("zenity", "--file-selection", "--save", "--confirm-overwrite", "--filename="+filename).Output()
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(out)), nil
	}
	out, err := exec.Command("kdialog", "--getsavefilename", filepath.Join(startDir, defaultName)).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// Ensure the app data directory exists
func init() {
	os.MkdirAll(getFreeRoutingDir(), 0755)
}

// Public wrappers bound to JS

func openFileDialog() string {
	path, err := openNativeFileDialog()
	log.Printf("openFileDialog native returned path=%q err=%v", path, err)
	if err != nil {
		return ""
	}
	if path != "" {
		saveLastDir(filepath.Dir(path))
	}
	return path
}

func saveFileDialog(defaultName string) string {
	path, err := saveNativeFileDialog(defaultName)
	log.Printf("saveFileDialog native returned path=%q err=%v", path, err)
	if err != nil {
		return ""
	}
	if path != "" {
		saveLastDir(filepath.Dir(path))
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

func openURL(url string) {
	switch runtime.GOOS {
	case "windows":
		cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
		hideWindow(cmd)
		cmd.Start()
	case "darwin":
		exec.Command("open", url).Start()
	default:
		exec.Command("xdg-open", url).Start()
	}
}

