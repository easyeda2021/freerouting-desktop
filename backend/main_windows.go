//go:build windows

package main

import (
	"syscall"
	"time"
	"unsafe"
)

var (
	user32               = syscall.NewLazyDLL("user32.dll")
	procFindWindowW      = user32.NewProc("FindWindowW")
	procGetSystemMetrics = user32.NewProc("GetSystemMetrics")
	procSetWindowPos     = user32.NewProc("SetWindowPos")
	procMoveWindow       = user32.NewProc("MoveWindow")
	procGetWindowRect    = user32.NewProc("GetWindowRect")
	procSendMessageW     = user32.NewProc("SendMessageW")
	procLoadImageW       = user32.NewProc("LoadImageW")
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	procGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")
)

const (
	wmSetIcon = 0x0080
	iconSmall = 0
	iconBig   = 1
)

const (
	imageIcon    = 1
	lrDefaultSize = 0x0040
	lrShared      = 0x8000
)

func screenSize() (int, int) {
	sw, _, _ := procGetSystemMetrics.Call(0) // SM_CXSCREEN = 0
	sh, _, _ := procGetSystemMetrics.Call(1) // SM_CYSCREEN = 1
	return int(sw), int(sh)
}

func centerWindow(width, height int) {
	// Find the window by title and center it using Win32 API.
	// We retry a few times since the window may not be ready immediately.
	go func() {
		for i := 0; i < 20; i++ {
			time.Sleep(100 * time.Millisecond)
			hwnd := findWindow("FreeRouting Desktop " + version)
			if hwnd == 0 {
				continue
			}
			setWindowCenter(hwnd, width, height)
			return
		}
	}()
}

func findWindow(title string) uintptr {
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	ret, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(titlePtr)))
	return ret
}

func setWindowCenter(hwnd uintptr, width, height int) {
	sw, _, _ := procGetSystemMetrics.Call(0) // SM_CXSCREEN = 0
	sh, _, _ := procGetSystemMetrics.Call(1) // SM_CYSCREEN = 1
	x := int(sw)/2 - width/2
	y := int(sh)/2 - height/2
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	procMoveWindow.Call(hwnd, uintptr(x), uintptr(y), uintptr(width), uintptr(height), 1)
	setWindowIcon(hwnd)
}

func setWindowIcon(hwnd uintptr) {
	// Load the first icon group (ID 1) from the executable and apply it to
	// both the small and big title-bar icons.
	hInstance, _, _ := procGetModuleHandleW.Call(0)
	iconName, _ := syscall.UTF16PtrFromString("#1")
	hIcon, _, _ := procLoadImageW.Call(
		hInstance,
		uintptr(unsafe.Pointer(iconName)),
		uintptr(imageIcon),
		0,
		0,
		uintptr(lrDefaultSize|lrShared),
	)
	if hIcon == 0 {
		return
	}
	procSendMessageW.Call(hwnd, uintptr(wmSetIcon), uintptr(iconSmall), hIcon)
	procSendMessageW.Call(hwnd, uintptr(wmSetIcon), uintptr(iconBig), hIcon)
}
