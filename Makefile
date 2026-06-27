VERSION := $(shell cat VERSION | tr -d '\n\r ')
BINARY := freerouting-desktop

.PHONY: all clean frontend windows macos linux

all: windows

frontend:
	cd frontend && npm run build

windows: frontend
	GOOS=windows GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=windows" \
		-o build/$(BINARY)-$(VERSION)-windows-x64.exe .
	cd build && zip $(BINARY)-$(VERSION)-windows-x64.zip $(BINARY)-$(VERSION)-windows-x64.exe

macos: frontend
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=macos" \
		-o build/$(BINARY)-$(VERSION)-macos-x64 .
	cd build && tar -czf $(BINARY)-$(VERSION)-macos-x64.tar.gz $(BINARY)-$(VERSION)-macos-x64

macos-arm: frontend
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=macos" \
		-o build/$(BINARY)-$(VERSION)-macos-arm64 .
	cd build && tar -czf $(BINARY)-$(VERSION)-macos-arm64.tar.gz $(BINARY)-$(VERSION)-macos-arm64

linux: frontend
	GOOS=linux GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=linux" \
		-o build/$(BINARY)-$(VERSION)-linux-x64 .
	cd build && tar -czf $(BINARY)-$(VERSION)-linux-x64.tar.gz $(BINARY)-$(VERSION)-linux-x64

clean:
	rm -rf build/
