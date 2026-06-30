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
	procSendMessageW        = user32.NewProc("SendMessageW")
	procLoadImageW          = user32.NewProc("LoadImageW")
	procShowWindow          = user32.NewProc("ShowWindow")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	procBringWindowToTop    = user32.NewProc("BringWindowToTop")
	kernel32                = syscall.NewLazyDLL("kernel32.dll")
	procGetModuleHandleW    = kernel32.NewProc("GetModuleHandleW")
)

// mainHwnd is discovered by centerWindow and reused by native dialogs.
var mainHwnd uintptr

const (
	wmSetIcon = 0x0080
	iconSmall = 0
	iconBig   = 1
)

const (
	imageIcon     = 1
	lrDefaultSize = 0x0040
	lrShared      = 0x8000
)

const (
	swHide    = 0
	swShow    = 5
	swRestore = 9
)

func screenSize() (int, int) {
	sw, _, _ := procGetSystemMetrics.Call(0) // SM_CXSCREEN = 0
	sh, _, _ := procGetSystemMetrics.Call(1) // SM_CYSCREEN = 1
	return int(sw), int(sh)
}

func prepareWindow(win unsafe.Pointer, width, height int) {
	// webview_go may create the window at a default small size before we can
	// resize it. Find the actual top-level window by title and hide it first,
	// then apply size/icon and show it to avoid the startup flash.
	title := "FreeRouting Desktop " + version
	var hwnd uintptr
	for i := 0; i < 50 && hwnd == 0; i++ {
		hwnd = findWindow(title)
		if hwnd == 0 {
			time.Sleep(10 * time.Millisecond)
		}
	}
	if hwnd == 0 {
		hwnd = uintptr(win)
	}
	if hwnd == 0 {
		return
	}
	mainHwnd = hwnd
	procShowWindow.Call(hwnd, uintptr(swHide))
	setWindowSizeAndCenter(hwnd, width, height)
	setWindowIcon(hwnd)
	procShowWindow.Call(hwnd, uintptr(swShow))
	bringWindowToForeground(hwnd)
}

func centerWindow(width, height int) {
	// Legacy fallback: find the window asynchronously by title.
	go func() {
		for i := 0; i < 20; i++ {
			time.Sleep(100 * time.Millisecond)
			hwnd := findWindow("FreeRouting Desktop " + version)
			if hwnd == 0 {
				continue
			}
			mainHwnd = hwnd
			setWindowSizeAndCenter(hwnd, width, height)
			setWindowIcon(hwnd)
			bringWindowToForeground(hwnd)
			return
		}
	}()
}

func findWindow(title string) uintptr {
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	ret, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(titlePtr)))
	return ret
}

func setWindowSizeAndCenter(hwnd uintptr, width, height int) {
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

func bringWindowToForeground(hwnd uintptr) {
	procSetForegroundWindow.Call(hwnd)
	procBringWindowToTop.Call(hwnd)
}
