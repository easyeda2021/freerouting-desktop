package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"unsafe"
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

var (
	comdlg32             = syscall.NewLazyDLL("comdlg32.dll")
	procGetOpenFileNameW = comdlg32.NewProc("GetOpenFileNameW")
	procGetSaveFileNameW = comdlg32.NewProc("GetSaveFileNameW")
)

type openFileName struct {
	lStructSize       uint32
	hwndOwner         uintptr
	hInstance         uintptr
	lpstrFilter       *uint16
	lpstrCustomFilter *uint16
	nMaxCustFilter    uint32
	nFilterIndex      uint32
	lpstrFile         *uint16
	nMaxFile          uint32
	lpstrFileTitle    *uint16
	nMaxFileTitle     uint32
	lpstrInitialDir   *uint16
	lpstrTitle        *uint16
	Flags             uint32
	nFileOffset       uint16
	nFileExtension    uint16
	lpstrDefExt       *uint16
	lCustData         uintptr
	lpfnHook          uintptr
	lpTemplateName    *uint16
	pvReserved        uintptr
	dwReserved        uint32
	FlagsEx           uint32
}

const (
	ofnFileMustExist    = 0x00001000
	ofnPathMustExist    = 0x00000800
	ofnHideReadOnly     = 0x00000004
	ofnOverwritePrompt  = 0x00000002
	ofnNoReadOnlyReturn = 0x00008000
)

func parseFilterWindows(filter string) (*uint16, error) {
	// Convert "Text (*.txt)|*.txt|All (*.*)|*.*" to Windows double-null-terminated filter
	parts := strings.Split(filter, "|")
	if len(parts)%2 != 0 {
		parts = append(parts, "*.*")
	}
	var sb strings.Builder
	for i := 0; i < len(parts); i += 2 {
		sb.WriteString(parts[i])
		sb.WriteByte(0)
		sb.WriteString(parts[i+1])
		sb.WriteByte(0)
	}
	sb.WriteByte(0)
	return syscall.UTF16PtrFromString(sb.String())
}

func showFileDialogWindows(filter, title string, save bool, defaultName string) (string, error) {
	filterPtr, err := parseFilterWindows(filter)
	if err != nil {
		return "", err
	}
	titlePtr, err := syscall.UTF16PtrFromString(title)
	if err != nil {
		return "", err
	}

	const maxPath = 4096
	fileBuf := make([]uint16, maxPath)
	if save && defaultName != "" {
		namePtr, err := syscall.UTF16PtrFromString(defaultName)
		if err == nil {
			for i := 0; i < maxPath; i++ {
				v := *(*uint16)(unsafe.Pointer(uintptr(unsafe.Pointer(namePtr)) + uintptr(i)*unsafe.Sizeof(fileBuf[0])))
				fileBuf[i] = v
				if v == 0 {
					break
				}
			}
		}
	}

	var ofn openFileName
	ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
	ofn.lpstrFilter = filterPtr
	ofn.nFilterIndex = 1
	ofn.lpstrFile = &fileBuf[0]
	ofn.nMaxFile = maxPath
	ofn.lpstrTitle = titlePtr
	ofn.Flags = ofnFileMustExist | ofnPathMustExist | ofnHideReadOnly
	if save {
		ofn.Flags = ofnPathMustExist | ofnOverwritePrompt | ofnNoReadOnlyReturn | ofnHideReadOnly
	}

	var ret uintptr
	if save {
		ret, _, _ = procGetSaveFileNameW.Call(uintptr(unsafe.Pointer(&ofn)))
	} else {
		ret, _, _ = procGetOpenFileNameW.Call(uintptr(unsafe.Pointer(&ofn)))
	}
	if ret == 0 {
		return "", nil
	}
	return syscall.UTF16ToString(fileBuf), nil
}

// Windows: use native COMDLG32 file dialogs
func openFileDialogWindows() (string, error) {
	return showFileDialogWindows("DSN Files (*.dsn)|*.dsn|SES Files (*.ses)|*.ses|All Files (*.*)|*.*", "Open Design File", false, "")
}

func openExecutableDialogWindows() (string, error) {
	return showFileDialogWindows("Executable (*.exe)|*.exe|All Files (*.*)|*.*", "Select FreeRouting Executable", false, "")
}

func saveFileDialogWindows(defaultName string) (string, error) {
	return showFileDialogWindows("SES Files (*.ses)|*.ses|All Files (*.*)|*.*", "Save SES File", true, defaultName)
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
	script := `osascript -e 'POSIX path of (choose file)'`
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
		args := []string{"--file-selection", "--filename=." + string(filepath.Separator)}
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
	out, err := exec.Command("kdialog", "--getsavefilename", ".", defaultName).Output()
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
	return path
}

func saveFileDialog(defaultName string) string {
	path, err := saveNativeFileDialog(defaultName)
	log.Printf("saveFileDialog native returned path=%q err=%v", path, err)
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

