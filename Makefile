VERSION := $(shell cat VERSION | tr -d '\n\r ')
BINARY := freerouting-desktop
ROOT := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))

.PHONY: all clean frontend icons windows macos macos-arm linux

all: windows

frontend:
	cd $(ROOT)frontend && npm run build

icons:
	python3 $(ROOT)scripts/gen-ico.py

# Copy frontend dist into backend/ for Go embed
backend/dist: frontend
	rm -rf $(ROOT)backend/dist
	cp -r $(ROOT)frontend/dist $(ROOT)backend/dist

# Generate Windows resource file with icon
backend/rsrc_windows_amd64.syso: icons
	cp $(ROOT)images/logo.png $(ROOT)backend/icon.png
	cd $(ROOT)backend && go-winres simply --icon icon.png

windows: backend/dist backend/rsrc_windows_amd64.syso
	cd $(ROOT)backend && \
		GOOS=windows GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -H windowsgui -X main.version=$(VERSION) -X main.platform=windows" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-windows-x64.exe .

macos: backend/dist
	cd $(ROOT)backend && \
		GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=macos" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-macos-x64 .

macos-arm: backend/dist
	cd $(ROOT)backend && \
		GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=macos" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-macos-arm64 .

linux: backend/dist
	cd $(ROOT)backend && \
		GOOS=linux GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=linux" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-linux-x64 .

clean:
	rm -rf $(ROOT)build/ $(ROOT)backend/dist/ $(ROOT)backend/*.syso $(ROOT)backend/icon.png
