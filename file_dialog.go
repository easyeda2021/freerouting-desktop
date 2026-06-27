package main

import (
	"fmt"
	"os"
	"os/exec"
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
	script := `
	Add-Type -AssemblyName System.Windows.Forms
	$dialog = New-Object System.Windows.Forms.OpenFileDialog
	$dialog.Filter = "DSN Files (*.dsn)|*.dsn|SES Files (*.ses)|*.ses|All Files (*.*)|*.*"
	$dialog.Title = "Open Design File"
	if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
		$dialog.FileName
	}
	`
	out, err := exec.Command("powershell", "-NoProfile", "-Command", script).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func saveFileDialogWindows(defaultName string) (string, error) {
	script := fmt.Sprintf(`
	Add-Type -AssemblyName System.Windows.Forms
	$dialog = New-Object System.Windows.Forms.SaveFileDialog
	$dialog.Filter = "SES Files (*.ses)|*.ses|All Files (*.*)|*.*"
	$dialog.FileName = "%s"
	$dialog.Title = "Save SES File"
	if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
		$dialog.FileName
	}
	`, defaultName)
	out, err := exec.Command("powershell", "-NoProfile", "-Command", script).Output()
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
	dialog := "zenity"
	if _, err := exec.LookPath("zenity"); err != nil {
		if _, err := exec.LookPath("kdialog"); err == nil {
			dialog = "kdialog"
		} else {
			return "", fmt.Errorf("no file dialog tool found (install zenity or kdialog)")
		}
	}
	if dialog == "zenity" {
		out, err := exec.Command("zenity", "--file-selection", "--file-filter=*.dsn *.ses").Output()
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(out)), nil
	}
	out, err := exec.Command("kdialog", "--getopenfilename", ".", "*.dsn *.ses").Output()
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
	dir := getAppDataDir()
	os.MkdirAll(dir, 0755)
}
