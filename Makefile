VERSION := $(shell cat VERSION | tr -d '\n\r ')
DEV_VERSION := test-$(shell date +%Y%m%d-%H%M%S)
BINARY := freerouting-desktop
ROOT := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))

.PHONY: all clean frontend icons windows macos macos-arm linux ci-windows ci-macos ci-macos-arm ci-linux bump-version

all: windows

bump-version:
	$(eval PATCH := $(word 3, $(subst ., ,$(VERSION))))
	$(eval NEW_PATCH := $(shell echo $$($$(($(PATCH)+1)))))
	$(eval NEW_VER := $(word 1, $(subst ., ,$(VERSION))).$(word 2, $(subst ., ,$(VERSION))).$(NEW_PATCH))
	@echo $(NEW_VER) > $(ROOT)VERSION
	@echo "Version bumped: $(VERSION) -> $(NEW_VER)"

frontend:
	cd $(ROOT)frontend && npm run build

icons:
	python3 $(ROOT)scripts/gen-ico.py

# Copy frontend dist into backend/ for Go embed
backend/dist: frontend
	rm -rf $(ROOT)backend/dist
	cp -r $(ROOT)frontend/dist $(ROOT)backend/dist

# Generate Windows resources with icon and FileDescription
backend/rsrc_windows_amd64.syso:
	python3 $(ROOT)scripts/gen-res.py

# Local debug builds use test + timestamp so they are easy to distinguish from
# release builds.
windows: backend/dist backend/rsrc_windows_amd64.syso
	cd $(ROOT)backend && \
		GOOS=windows GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -H windowsgui -X main.version=$(DEV_VERSION) -X main.platform=windows" \
		-o $(ROOT)build/$(BINARY)-$(DEV_VERSION)-windows-x64.exe .
	@echo "Build: $(BINARY)-$(DEV_VERSION)-windows-x64.exe"

macos: backend/dist
	cd $(ROOT)backend && \
		GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(DEV_VERSION) -X main.platform=macos" \
		-o $(ROOT)build/$(BINARY)-$(DEV_VERSION)-macos-x64 .
	@echo "Build: $(BINARY)-$(DEV_VERSION)-macos-x64"

macos-arm: backend/dist
	cd $(ROOT)backend && \
		GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(DEV_VERSION) -X main.platform=macos" \
		-o $(ROOT)build/$(BINARY)-$(DEV_VERSION)-macos-arm64 .
	@echo "Build: $(BINARY)-$(DEV_VERSION)-macos-arm64"

linux: backend/dist
	cd $(ROOT)backend && \
		GOOS=linux GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(DEV_VERSION) -X main.platform=linux" \
		-o $(ROOT)build/$(BINARY)-$(DEV_VERSION)-linux-x64 .
	@echo "Build: $(BINARY)-$(DEV_VERSION)-linux-x64"

# CI / release builds use the exact VERSION from the repository.
ci-windows: backend/dist backend/rsrc_windows_amd64.syso
	cd $(ROOT)backend && \
		GOOS=windows GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -H windowsgui -X main.version=$(VERSION) -X main.platform=windows" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-windows-x64.exe .
	@echo "Build: $(BINARY)-$(VERSION)-windows-x64.exe"

ci-macos: backend/dist
	cd $(ROOT)backend && \
		GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=macos" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-macos-x64 .
	@echo "Build: $(BINARY)-$(VERSION)-macos-x64"

ci-macos-arm: backend/dist
	cd $(ROOT)backend && \
		GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=macos" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-macos-arm64 .
	@echo "Build: $(BINARY)-$(VERSION)-macos-arm64"

ci-linux: backend/dist
	cd $(ROOT)backend && \
		GOOS=linux GOARCH=amd64 CGO_ENABLED=1 \
		go build -ldflags="-s -w -X main.version=$(VERSION) -X main.platform=linux" \
		-o $(ROOT)build/$(BINARY)-$(VERSION)-linux-x64 .
	@echo "Build: $(BINARY)-$(VERSION)-linux-x64"

clean:
	rm -rf $(ROOT)build/ $(ROOT)backend/dist/ $(ROOT)backend/*.syso $(ROOT)backend/icon.png $(ROOT)backend/winres.json
