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
}
