package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

func hideWindow(cmd *exec.Cmd) {
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}
}

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

func fileDialogWindows(filter, title string) (string, error) {
	initialDir := getLastDir()
	dirScript := ""
	if initialDir != "" {
		dirScript = fmt.Sprintf(`$dialog.InitialDirectory = "%s"`, strings.ReplaceAll(initialDir, `\`, `\\`))
	}
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
`, filter, title, dirScript)
	cmd := exec.Command("powershell", "-NoProfile", "-Command", script)
	hideWindow(cmd)
	out, err := cmd.Output()
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
if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
	$dialog.FileName
}
$form.Dispose()
`, defaultName)
	cmd := exec.Command("powershell", "-NoProfile", "-Command", script)
	hideWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// macOS: use osascript for file dialogs
func openFileDialogMacOS() (string, error) {
	script := `osascript -e 'POSIX path of (choose file of type {"dsn", "ses"})'`
	out, err := exec.Command("sh", "-c", script).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func openExecutableDialogMacOS() (string, error) {
	out, err := exec.Command("sh", "-c", `osascript -e 'POSIX path of (choose file)'`).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func saveFileDialogMacOS(defaultName string) (string, error) {
	script := fmt.Sprintf(`osascript -e 'POSIX path of (choose file name default name "%s")'`, defaultName)
	out, err := exec.Command("sh", "-c", script).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
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
	if dialog == "zenity" {
		args := []string{"--file-selection"}
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
	out, err := exec.Command("kdialog", "--getopenfilename", ".", filter).Output()
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
	if dialog == "zenity" {
		out, err := exec.Command("zenity", "--file-selection", "--save", "--confirm-overwrite", "--filename="+defaultName).Output()
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(out)), nil
	}
	out, err := exec.Command("kdialog", "--getsavefilename", defaultName).Output()
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

