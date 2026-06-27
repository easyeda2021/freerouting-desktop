VERSION := $(shell cat VERSION | tr -d '\n\r ')
BINARY := freerouting-desktop
ROOT := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))

.PHONY: all clean frontend windows macos macos-arm linux

all: windows

frontend:
	cd $(ROOT)frontend && npm run build

# Copy frontend dist into backend/ for Go embed
backend/dist: frontend
	rm -rf $(ROOT)backend/dist
	cp -r $(ROOT)frontend/dist $(ROOT)backend/dist

windows: backend/dist
	cd $(ROOT)backend && \
		GOOS=windows GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -H windowsgui -X main.version=$(VERSION) -X main.platform=windows" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-windows-x64.exe .
	cd $(ROOT)build && zip $(BINARY)-$(VERSION)-windows-x64.zip $(BINARY)-$(VERSION)-windows-x64.exe

macos: backend/dist
	cd $(ROOT)backend && \
		GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=macos" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-macos-x64 .
	cd $(ROOT)build && tar -czf $(BINARY)-$(VERSION)-macos-x64.tar.gz $(BINARY)-$(VERSION)-macos-x64

macos-arm: backend/dist
	cd $(ROOT)backend && \
		GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=macos" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-macos-arm64 .
	cd $(ROOT)build && tar -czf $(BINARY)-$(VERSION)-macos-arm64.tar.gz $(BINARY)-$(VERSION)-macos-arm64

linux: backend/dist
	cd $(ROOT)backend && \
		GOOS=linux GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=linux" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-linux-x64 .
	cd $(ROOT)build && tar -czf $(BINARY)-$(VERSION)-linux-x64.tar.gz $(BINARY)-$(VERSION)-linux-x64

clean:
	rm -rf $(ROOT)build/ $(ROOT)backend/dist/
