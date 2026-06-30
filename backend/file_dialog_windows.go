//go:build windows

package main

import (
	"log"
	"runtime"
	"strings"
	"syscall"
	"unsafe"
)

var (
	comdlg32               = syscall.NewLazyDLL("comdlg32.dll")
	procGetOpenFileNameW   = comdlg32.NewProc("GetOpenFileNameW")
	procGetSaveFileNameW   = comdlg32.NewProc("GetSaveFileNameW")
	procCommDlgExtendedErr = comdlg32.NewProc("CommDlgExtendedError")
	ole32                  = syscall.NewLazyDLL("ole32.dll")
	procCoInitializeEx     = ole32.NewProc("CoInitializeEx")
	procCoUninitialize     = ole32.NewProc("CoUninitialize")
)

const coInitApartmentThreaded = 0x2

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

func init() {
	openFileDialogWindows = func() (string, error) {
		return showFileDialogWindows("DSN Files (*.dsn)|*.dsn|SES Files (*.ses)|*.ses|All Files (*.*)|*.*", "Open Design File", false, "")
	}
	openExecutableDialogWindows = func() (string, error) {
		return showFileDialogWindows("Executable (*.exe)|*.exe|All Files (*.*)|*.*", "Select FreeRouting Executable", false, "")
	}
	saveFileDialogWindows = func(defaultName string) (string, error) {
		return showFileDialogWindows("SES Files (*.ses)|*.ses|All Files (*.*)|*.*", "Save SES File", true, defaultName)
	}
}

func parseFilterWindows(filter string) (*uint16, error) {
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
	// Run the dialog on a dedicated thread with STA apartment. The main Go
	// thread may already be in MTA, which causes GetOpenFileNameW to fail.
	result := make(chan string, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()

		coRet, _, _ := procCoInitializeEx.Call(0, uintptr(coInitApartmentThreaded))
		log.Printf("[dialog] CoInitializeEx result=0x%x", coRet)
		defer procCoUninitialize.Call()

		path, err := runFileDialogOnSTA(filter, title, save, defaultName)
		if err != nil {
			log.Printf("[dialog] runFileDialogOnSTA error: %v", err)
		}
		log.Printf("[dialog] runFileDialogOnSTA returned path=%q", path)
		result <- path
	}()
	return <-result, nil
}

func runFileDialogOnSTA(filter, title string, save bool, defaultName string) (string, error) {
	filterPtr, err := parseFilterWindows(filter)
	if err != nil {
		log.Printf("[dialog] parseFilterWindows failed: %v", err)
		return "", err
	}
	log.Printf("[dialog] filter parsed, ptr=%p", filterPtr)
	titlePtr, err := syscall.UTF16PtrFromString(title)
	if err != nil {
		log.Printf("[dialog] UTF16PtrFromString(title=%q) failed: %v", title, err)
		return "", err
	}
	log.Printf("[dialog] title parsed, ptr=%p", titlePtr)

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
	log.Printf("[dialog] struct size=%d save=%v", ofn.lStructSize, save)

	var ret uintptr
	if save {
		ret, _, _ = procGetSaveFileNameW.Call(uintptr(unsafe.Pointer(&ofn)))
	} else {
		ret, _, _ = procGetOpenFileNameW.Call(uintptr(unsafe.Pointer(&ofn)))
	}
	if ret == 0 {
		errCode, _, _ := procCommDlgExtendedErr.Call()
		log.Printf("[dialog] GetOpenFileNameW returned 0, CommDlgExtendedError=%d", errCode)
		return "", nil
	}
	selected := syscall.UTF16ToString(fileBuf)
	log.Printf("[dialog] selected path=%q", selected)
	return selected, nil
}
