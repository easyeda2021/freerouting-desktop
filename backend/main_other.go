//go:build !windows

package main

import "unsafe"

func screenSize() (int, int) {
	return 1600, 1000
}

func centerWindow(width, height int) {
	// no-op on non-Windows platforms
}

func prepareWindow(win unsafe.Pointer, width, height int) {
	// no-op on non-Windows platforms
}
