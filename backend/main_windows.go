//go:build windows

package main

import (
	"log"
	"runtime"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	procRegisterClassExW         = user32.NewProc("RegisterClassExW")
	procCreateWindowExW          = user32.NewProc("CreateWindowExW")
	procDefWindowProcW           = user32.NewProc("DefWindowProcW")
	procLoadCursorW              = user32.NewProc("LoadCursorW")
	procFindWindowExW            = user32.NewProc("FindWindowExW")
	procGetClientRect            = user32.NewProc("GetClientRect")
	procSetWindowPos             = user32.NewProc("SetWindowPos")
	procGetWindowRect            = user32.NewProc("GetWindowRect")
	procGetSystemMetrics         = user32.NewProc("GetSystemMetrics")
	procSendMessageW             = user32.NewProc("SendMessageW")
	procLoadImageW               = user32.NewProc("LoadImageW")
	procShowWindow               = user32.NewProc("ShowWindow")
	procSetForegroundWindow      = user32.NewProc("SetForegroundWindow")
	procBringWindowToTop         = user32.NewProc("BringWindowToTop")
	procSetThreadDpiAwarenessCtx = user32.NewProc("SetThreadDpiAwarenessContext")
	procIsWindow                 = user32.NewProc("IsWindow")
	procIsIconic                 = user32.NewProc("IsIconic")
	procGetModuleHandleW         = kernel32.NewProc("GetModuleHandleW")
)

// mainHwnd is the top-level window passed to WebView. It is created hidden and
// only shown once the desired size/title/icon are ready, eliminating the small
// default-size startup flash.
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

const (
	wsOverlappedWindow = 0x00CF0000
	cwUseDefault       = 0x80000000
)

const (
	swpNoSize       = 0x0001
	swpNoZOrder     = 0x0004
	swpNoActivate   = 0x0010
	swpShowWindow   = 0x0040
	swpFrameChanged = 0x0020
)

type wndClassExW struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     uintptr
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}

type winRect struct {
	left   int32
	top    int32
	right  int32
	bottom int32
}

func init() {
	// WebView2/COM and the parent window must live on a single OS thread.
	runtime.LockOSThread()
}

func screenSize() (int, int) {
	sw, _, _ := procGetSystemMetrics.Call(0) // SM_CXSCREEN = 0
	sh, _, _ := procGetSystemMetrics.Call(1) // SM_CYSCREEN = 1
	return int(sw), int(sh)
}

func createHostWindow(width, height int) unsafe.Pointer {
	// WebView2 requires STA on the thread that creates the environment.
	coRet, _, _ := procCoInitializeEx.Call(0, uintptr(coInitApartmentThreaded))
	log.Printf("[host] CoInitializeEx result=0x%x", coRet)

	// Make this thread per-monitor DPI aware so the WebView renders sharply on
	// high-DPI displays and avoids the fuzzy upscaled look.
	procSetThreadDpiAwarenessCtx.Call(^uintptr(3))

	hInstance, _, _ := procGetModuleHandleW.Call(0)

	className, _ := syscall.UTF16PtrFromString("frHiddenParent")
	title, _ := syscall.UTF16PtrFromString("FreeRouting Desktop " + version)

	wc := wndClassExW{
		cbSize:        uint32(unsafe.Sizeof(wndClassExW{})),
		lpfnWndProc:   procDefWindowProcW.Addr(),
		hInstance:     hInstance,
		hIcon:         loadAppIcon(hInstance),
		hCursor:       loadArrowCursor(),
		hbrBackground: 0,
		lpszClassName: className,
	}
	wc.hIconSm = wc.hIcon

	atom, _, err := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	if atom == 0 {
		log.Printf("[host] RegisterClassExW failed: %v", err)
		return nil
	}

	hwnd, _, err := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(title)),
		uintptr(wsOverlappedWindow),
		uintptr(cwUseDefault),
		uintptr(cwUseDefault),
		0,
		0,
		0,
		0,
		hInstance,
		0,
	)
	if hwnd == 0 {
		log.Printf("[host] CreateWindowExW failed: %v", err)
		return nil
	}

	mainHwnd = hwnd
	return unsafe.Pointer(hwnd)
}

func loadAppIcon(hInstance uintptr) uintptr {
	iconName, _ := syscall.UTF16PtrFromString("#1")
	hIcon, _, _ := procLoadImageW.Call(
		hInstance,
		uintptr(unsafe.Pointer(iconName)),
		uintptr(imageIcon),
		0,
		0,
		uintptr(lrDefaultSize|lrShared),
	)
	return hIcon
}

func loadArrowCursor() uintptr {
	// IDC_ARROW = MAKEINTRESOURCE(32512)
	ret, _, _ := procLoadCursorW.Call(0, uintptr(32512))
	return ret
}

func prepareWindow(win unsafe.Pointer, width, height int) {
	hwnd := uintptr(win)
	if hwnd == 0 {
		return
	}
	mainHwnd = hwnd
	setWindowIcon(hwnd)
	centerWindow(hwnd)
	resizeWebviewWidget(hwnd)
	procShowWindow.Call(hwnd, uintptr(swShow))
	bringWindowToForeground(hwnd)
	startWindowWatcher(hwnd)
}

// startWindowWatcher polls the parent window so we can resize the WebView
// widget when the user resizes the window and terminate the message loop when
// the window is destroyed, all without a custom WndProc callback.
func startWindowWatcher(hwnd uintptr) {
	go func() {
		var lastRect winRect
		for {
			time.Sleep(100 * time.Millisecond)
			if hwnd == 0 {
				return
			}
			exists, _, _ := procIsWindow.Call(hwnd)
			if exists == 0 {
				if wv != nil {
					wv.Terminate()
				}
				return
			}
			var r winRect
			procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&r)))
			if r.left != lastRect.left || r.top != lastRect.top || r.right != lastRect.right || r.bottom != lastRect.bottom {
				lastRect = r
				// Don't resize the WebView widget while the window is minimized;
				// the 'window rect' in that state is the taskbar button size.
				if iconic, _, _ := procIsIconic.Call(hwnd); iconic == 0 {
					resizeWebviewWidget(hwnd)
				}
			}
		}
	}()
}

func centerWindow(hwnd uintptr) {
	sw, _, _ := procGetSystemMetrics.Call(0) // SM_CXSCREEN = 0
	sh, _, _ := procGetSystemMetrics.Call(1) // SM_CYSCREEN = 1

	var r winRect
	procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&r)))
	winW := int(r.right - r.left)
	winH := int(r.bottom - r.top)

	x := int(sw)/2 - winW/2
	y := int(sh)/2 - winH/2
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	procSetWindowPos.Call(hwnd, 0, uintptr(x), uintptr(y), 0, 0, swpNoZOrder|swpNoActivate|swpNoSize)
}

func resizeWebviewWidget(parentHwnd uintptr) {
	className, _ := syscall.UTF16PtrFromString("webview_widget")
	widget, _, _ := procFindWindowExW.Call(
		parentHwnd,
		0,
		uintptr(unsafe.Pointer(className)),
		0,
	)
	if widget == 0 {
		return
	}
	var r winRect
	procGetClientRect.Call(parentHwnd, uintptr(unsafe.Pointer(&r)))
	procSetWindowPos.Call(
		widget,
		0,
		0,
		0,
		uintptr(r.right-r.left),
		uintptr(r.bottom-r.top),
		swpNoZOrder|swpNoActivate|swpShowWindow,
	)
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
