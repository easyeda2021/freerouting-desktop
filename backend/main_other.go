//go:build !windows

package main

func screenSize() (int, int) {
	return 1600, 1000
}

func centerWindow(width, height int) {
	// no-op on non-Windows platforms
}
