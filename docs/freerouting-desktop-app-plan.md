# FreeRouting Desktop App — 实现计划

## 上下文

FreeRouting 是一个 PCB 自动布线器，目前已发布 v2.2.4，提供各平台原生安装包。目标是创建一个全新的 **Go + WebView 桌面应用**，用现代 Web 技术重写 GUI 界面。Go 宿主检测系统是否已安装 FreeRouting，未安装则自动下载对应平台的安装包并安装，然后以 API 模式启动 FreeRouting 进程，前端 JS 直接与 FreeRouting HTTP API 通信。

FreeRouting 源码在 `D:\教程\easyeda-docs\github-eext\freerouting`

**关键约束：**
- 不再依赖 JAR 文件，直接使用 FreeRouting 各平台原生安装包
- 启动时检测系统是否已安装 FreeRouting，未安装则自动下载最新版本
- Windows: 安装 .msi 后通过 CLI 参数以 API 模式启动 exe
- macOS/Linux: 安装包自带运行时，安装后直接启动
- 前端用纯 CSS 布局，无重型 UI 框架，UI 设计需要美观有现代感
- PCB 几何数据从 SES 文件解析获取（前端 JS 直接解析）
- 跨平台支持：Windows / macOS / Linux

## FreeRouting 发布资产

最新版本 v2.2.4 提供：

| 平台 | 安装包 | 说明 |
|------|--------|------|
| Windows | `freerouting-2.2.4-windows-x64.msi` | MSI 安装，安装后 exe 自带 JRE |
| macOS | `freerouting-2.2.4-macos-arm64.dmg` | DMG 安装，自带 JRE |
| Linux | `freerouting-2.2.4-linux-x64.zip` | 解压即用，自带 JRE |

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│              Go + WebView Desktop App                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Go 宿主 (main.go)                 单二进制 ~5-10MB      ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  ││
│  │  │ FR Installer │ │ CORS Proxy   │ │ File Dialog      │  ││
│  │  │ 检测已安装/  │ │ 给FR HTTP    │ │ 打开DSN/保存SES  │  ││
│  │  │ 下载安装/    │ │ 响应加CORS头 │ │                  │  ││
│  │  │ 启动/停止FR  │ │              │ │                  │  ││
│  │  └──────────────┘ └──────────────┘ └──────────────────┘  ││
│  └──────────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────┐│
│  │  WebView 窗口                                            ││
│  │  ┌────────────────────────────────────────────────────┐  ││
│  │  │  前端 (React + TypeScript + LeaferJS)              │  ││
│  │  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │  ││
│  │  │  │ File Mgr │ │ Job Mgr  │ │ PCB Canvas        │  │  ││
│  │  │  │          │ │ Progress │ │ Renderer          │  │  ││
│  │  │  │          │ │          │ │ (LeaferJS引擎)    │  │  ││
│  │  │  └──────────┘ └──────────┘ └───────────────────┘  │  ││
│  │  │  ┌──────────────────────────────────────────────┐  │  ││
│  │  │  │  SES Parser (前端 JS 解析)                    │  │  ││
│  │  │  │  解析 SES 文本 → 提取走线/过孔/焊盘几何数据    │  │  ││
│  │  │  └──────────────────────────────────────────────┘  │  ││
│  │  └────────────────────────────────────────────────────┘  ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
                               │ HTTP REST + SSE
                               │ (通过 Go CORS Proxy)
                        ┌──────┴──────────────────┐
                        │   FreeRouting 进程       │
                        │ (API Mode, :37864)       │
                        │  自带 JRE，无需用户安装   │
                        └─────────────────────────┘
```

**为什么前端直接调 FreeRouting API 而不是通过 Go 中转？**

FreeRouting 的 HTTP 响应不带 CORS 头，WebView 中 fetch 会被拦截。Go 宿主的 CORS Proxy 只做一件事：在响应头加上 `Access-Control-Allow-Origin`，其余字节原封不动透传。

## 平台 WebView 引擎

| 平台 | WebView 引擎 | 额外要求 |
|------|-------------|---------|
| Windows | Edge WebView2 | Win10+ 内置 |
| macOS | Cocoa WKWebView | 内置 |
| Linux | GTK + WebKitGTK | `libgtk-3-dev libwebkit2gtk-4.1-dev`（桌面发行版通常已有） |

使用 [github.com/webview/webview](https://github.com/webview/webview) Go 库。

## 目录结构

```
freerouting-desktop/
├── main.go                      # Go 宿主入口 + WebView 窗口
├── fr_installer.go              # FreeRouting 检测/下载/安装/进程管理
├── cors_proxy.go                # CORS 反向代理（给 FR 响应加头）
├── file_dialog.go               # 三平台原生文件对话框
├── go.mod
├── go.sum
├── frontend/                    # React 前端（纯静态）
│   ├── src/
│   │   ├── App.tsx              # 主应用 + 状态管理
│   │   ├── components/
│   │   │   ├── MenuBar.tsx      # 顶部菜单（打开、布线、导出）
│   │   │   ├── BoardCanvas.tsx  # PCB Canvas 渲染主组件
│   │   │   ├── SidePanel.tsx    # 右侧面板（层控制 + 属性）
│   │   │   ├── ProgressPanel.tsx # 布线进度面板
│   │   │   ├── LogPanel.tsx     # 日志面板
│   │   │   └── SetupWizard.tsx  # 首次运行安装向导
│   │   ├── lib/
│   │   │   ├── pcb-renderer.ts  # PCB Canvas 渲染引擎核心（LeaferJS）
│   │   │   ├── ses-parser.ts    # SES 文件解析（前端 JS）
│   │   │   ├── board-types.ts   # PCB 数据类型定义
│   │   │   └── api.ts           # FR API 调用封装（fetch + SSE）
│   │   └── index.html
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## 关键技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 宿主语言 | **Go** | 单二进制 ~5-10MB，跨平台，编译秒级 |
| WebView | **webview/webview** | 一套 Go API 绑定三平台原生 WebView |
| FR 通信 | **前端直连 FR HTTP** | Go 只做 CORS Proxy（~20行） |
| CORS | **Go 反向代理** | FR 不带 CORS 头，Go 给响应加头 |
| PCB 渲染 | **LeaferJS** | 高性能 Canvas 2D，内置场景图/缩放/平移/事件 |
| SES 解析 | **前端 JS** | 省掉 Go parser，前后端同一份解析代码 |
| 前端 UI | **纯 CSS 布局** | 无框架依赖，体积小 |
| 状态管理 | **React Context + useReducer** | 轻量、无额外依赖 |
| 前端构建 | Vite + React + TypeScript | 标准工具链 |
| FR 运行时 | **安装包自带 JRE** | 用户无需安装 Java |
| 跨平台 | Go 交叉编译 | `GOOS=darwin/linux/windows go build` |

## 首期范围（MVP）

1. **检测/下载/安装 FreeRouting**（各平台原生安装包）
2. **启动 FreeRouting API 模式** + 进程管理
3. **打开 DSN 文件 → 启动 API 布线**
4. **从 SES 输出解析 PCB 几何数据**（前端 JS 解析）
5. **Canvas 渲染 PCB 板图（走线/过孔/焊盘）**
6. **布线进度面板 + 实时日志**
7. **导出 SES 结果文件**

暂不实现：交互式布线（鼠标拖拽布线）、飞线显示、DRC 检查。

---

## 阶段 1：Go 宿主脚手架

### 1.1 初始化 Go 模块

```bash
go mod init freerouting-desktop
go get github.com/webview/webview_go
```

### 1.2 main.go — WebView 窗口

```go
func main() {
    go startCORSProxy()

    w := webview.New(false)
    defer w.Destroy()
    w.SetTitle("FreeRouting Desktop")
    w.SetSize(1400, 900, webview.HintNone)

    // 绑定 Go 函数到 JS
    w.Bind("checkFRStatus", checkFRStatus)
    w.Bind("downloadFR", downloadFR)
    w.Bind("startFR", startFR)
    w.Bind("stopFR", stopFR)
    w.Bind("openFileDialog", openFileDialog)
    w.Bind("saveFileDialog", saveFileDialog)
    w.Bind("readFile", readFile)
    w.Bind("writeFile", writeFile)

    // 开发模式加载 Vite dev server，生产模式加载嵌入 dist
    if isDev() {
        w.Navigate("http://localhost:1420")
    } else {
        w.Navigate("file://" + getDistPath() + "/index.html")
    }
    w.Run()
}
```

### 1.3 前端脚手架

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install react react-dom leafer-ui
npm install -D typescript vite @vitejs/plugin-react
```

### 产出
- Go 宿主启动 WebView 窗口
- 窗口 1400x900，基本布局骨架

---

## 阶段 2：FreeRouting 安装器 (Go)

**文件：** [fr_installer.go](fr_installer.go)

### 2.1 检测策略（按平台）

#### Windows
1. 检查注册表 `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Freerouting` 是否存在
2. 检查常见安装路径 `C:\Program Files\Freerouting\*`、`%LOCALAPPDATA%\Programs\Freerouting\*`
3. 找到 `freerouting.exe`（或 `Freerouting.exe`）即认为已安装

#### macOS
1. 检查 `/Applications/Freerouting.app` 是否存在
2. 检查 `~/Applications/Freerouting.app`

#### Linux
1. 检查 `~/.local/share/freerouting/` 或 `/opt/freerouting/` 下是否有可执行文件
2. 检查 `which freerouting` 或 `flatpak list | grep freerouting`

### 2.2 下载策略

未检测到已安装时，从 GitHub Releases 下载对应平台的最新安装包：

| 平台 | 下载文件 | 下载后操作 |
|------|---------|-----------|
| Windows | `freerouting-{version}-windows-x64.msi` | `msiexec /i` 静默安装到 `~/Freerouting-Desktop/` |
| macOS | `freerouting-{version}-macos-arm64.dmg` | 挂载 DMG → 复制 .app 到 `~/Freerouting-Desktop/` |
| Linux | `freerouting-{version}-linux-x64.zip` | 解压到 `~/Freerouting-Desktop/freerouting/` |

**版本获取：** 从 GitHub API `https://api.github.com/repos/freerouting/freerouting/releases/latest` 获取最新版本号和下载 URL。

**下载进度：** 通过 `w.Eval()` 推送到前端。

### 2.3 进程管理

#### Windows
```
"C:\Users\<user>\Freerouting-Desktop\Freerouting\freerouting.exe" ^
  --api_server.enabled=true ^
  --api_server.endpoints=http://127.0.0.1:37864 ^
  --api_server.authentication.enabled=false ^
  --api_server.idle_timeout=300 ^
  --gui.enabled=false
```

#### macOS
```
~/Freerouting-Desktop/Freerouting.app/Contents/MacOS/freerouting \
  --api_server.enabled=true \
  --api_server.endpoints=http://127.0.0.1:37864 \
  --api_server.authentication.enabled=false \
  --api_server.idle_timeout=300 \
  --gui.enabled=false
```

#### Linux
```
~/Freerouting-Desktop/freerouting/bin/freerouting \
  --api_server.enabled=true \
  --api_server.endpoints=http://127.0.0.1:37864 \
  --api_server.authentication.enabled=false \
  --api_server.idle_timeout=300 \
  --gui.enabled=false
```

### 2.4 健康检查

- 启动后轮询 `GET http://127.0.0.1:37864/v1/system/status` 确认就绪（最多 15 秒）
- 每 5 秒轮询健康检查
- 进程崩溃自动重启（最多 3 次）
- 应用退出时自动 kill 子进程

### 2.5 Go 暴露给前端的函数

```go
w.Bind("checkFRStatus", func() string { ... })
// 返回 JSON: {"status": "not-installed"|"downloading"|"installing"|"ready"|"error", "version": "...", "progress": 0}

w.Bind("downloadFR", func() { ... })
// 异步下载对应平台安装包，通过 Eval 推送进度

w.Bind("startFR", func() string { ... })
// 以 API 模式启动 FreeRouting

w.Bind("stopFR", func() { ... })
```

### 2.6 存储路径

所有下载和安装文件存放在用户目录下（非系统目录）：
```
{HOME}/Freerouting-Desktop/
├── freerouting/              # 安装目录（Linux 解压内容 / macOS .app 副本 / Windows 安装目标）
├── downloads/                # 下载的安装包缓存
└── version.txt               # 当前版本号
```

各平台路径：
- Windows: `C:\Users\<用户名>\Freerouting-Desktop\`
- macOS: `/Users/<用户名>/Freerouting-Desktop/`
- Linux: `/home/<用户名>/Freerouting-Desktop/`

---

## 阶段 3：CORS 反向代理 (Go)

**文件：** [cors_proxy.go](cors_proxy.go)

FreeRouting 的 HTTP 响应不带 CORS 头，Go 起一个本地反向代理，给所有响应加上 CORS 头。

```go
func startCORSProxy() {
    target, _ := url.Parse("http://127.0.0.1:37864")
    proxy := httputil.NewSingleHostReverseProxy(target)

    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        w.Header().Set("Access-Control-Allow-Headers", "*")
        if r.Method == "OPTIONS" {
            w.WriteHeader(http.StatusNoContent)
            return
        }
        proxy.ServeHTTP(w, r)
    })

    http.ListenAndServe("127.0.0.1:9080", nil)
}
```

前端请求 `http://127.0.0.1:9080/v1/...`，Go 代理转发到 `http://127.0.0.1:37864/v1/...`。

---

## 阶段 4：FreeRouting API 调用（前端 JS）

**文件：** [frontend/src/lib/api.ts](frontend/src/lib/api.ts)

前端 JS 直接通过 Go CORS Proxy 调用 FreeRouting API。所有请求走 `http://127.0.0.1:9080`。

### Session & Job 生命周期

```
POST /v1/sessions/create
  Headers: Freerouting-Profile-ID=<uuid>, Freerouting-Environment-Host=FreeRoutingDesktop/0.1.0
  Response: { "id": "session-uuid", ... }

POST /v1/jobs/enqueue
  Body: { "session_id": "...", "name": "My Design", "state": "QUEUED" }
  Response: { "id": "job-uuid", ... }

POST /v1/jobs/{jobId}/input
  Body: { "filename": "design.dsn", "data": "<base64 dsn content>" }
  Response: { "id": "...", "state": "QUEUED", ... }

PUT /v1/jobs/{jobId}/start
  Response: { "id": "...", "state": "READY_TO_START", ... }

GET /v1/jobs/{jobId}
  Response: { "id": "...", "state": "RUNNING", "stage": "ROUTING", "current_pass": 5, ... }

GET /v1/jobs/{jobId}/output
  Response: { "job_id": "...", "data": "<base64 ses content>", "crc32": 12345 }
```

### SSE 流处理

```typescript
// 日志流
const es = new EventSource(`http://127.0.0.1:9080/v1/jobs/${jobId}/logs/stream`)
es.onmessage = (event) => { const log = JSON.parse(event.data) }

// 输出流（实时 SES）
const es = new EventSource(`http://127.0.0.1:9080/v1/jobs/${jobId}/output/stream`)
es.onmessage = (event) => {
  const output = JSON.parse(event.data)
  // output.data → base64 解码 → SES 文本 → ses-parser 解析 → 更新 boardData
}
```

---

## 阶段 5：SES 文件解析器（前端 JS）

**文件：** [frontend/src/lib/ses-parser.ts](frontend/src/lib/ses-parser.ts)

SES (Specctra Session File) 是 Lisp-style S-expression 格式，FreeRouting 的布线输出格式。递归下降解析器，TypeScript 实现。

**核心结构：**

```
(session "design_name"
  (placement ...)
  (routes
    (resolution um 10)
    (library_out
      (padstack "name" (shape (circle layer diameter x y)) ...)
    )
    (network_out
      (net NET_NAME
        (wire (path LAYER_NAME WIDTH x1 y1 x2 y2 ...))
        (via "padstack_name" x y)
      )
    )
  )
)
```

**解析输出类型：**

```typescript
interface BoardData {
  resolutionUnit: string
  resolutionDenominator: number
  layers: LayerInfo[]
  traces: TraceData[]       // netName, layer, width, corners[][]
  vias: ViaData[]           // netName, padstackName, center[x,y], diameter
  components: ComponentData[]
  padstacks: PadstackData[]
}
```

坐标转换：`board_coord = ses_coord / denominator`

---

## 阶段 6：前端实现

### 6.1 界面布局（纯 CSS）

```
┌──────────────────────────────────────────────────────────────┐
│  MenuBar: [Open DSN] [Export SES]          FR: v2.2.4 ready  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    PCB Canvas (flex: 1)                      │
│                    LeaferJS 全区域渲染                        │
│                                                              │
├───────────────────────────────────────┬──────────────────────┤
│  ProgressPanel                        │  SidePanel (220px)   │
│  State: RUNNING | Pass: 5 | Score 85  │  ☑ F.Cu             │
│  ████████████████░░░░░ 75%            │  ☑ B.Cu             │
│                                       │  ───────────────     │
│                                       │  Traces: 150         │
│                                       │  Vias: 45            │
├───────────────────────────────────────┴──────────────────────┤
│  LogPanel (height: 150px, monospace)                         │
│  12:00:01 INFO  Auto-router pass #5 completed...             │
│  12:00:02 INFO  Score: 85.30 (5 unrouted)                   │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 PCB 渲染引擎（LeaferJS）

使用 LeaferJS（https://leaferjs.com）作为 Canvas 渲染引擎。

PCB 元素 → LeaferJS 图形映射：

| PCB 元素 | LeaferJS 图形 | 说明 |
|---------|---------------|------|
| 走线 | `Line` / `Path` | `strokeWidth` = 走线宽度 |
| 过孔 | `Ellipse` | 圆形，外圆+内圆两层 |
| 焊盘 | `Rect` / `Ellipse` / `Polygon` | 根据 padstack 形状 |
| 板框 | `Rect` | 板子外形 |

内置交互：鼠标滚轮缩放、拖拽平移、视口自适应。

### 6.3 组件说明

| 组件 | 功能 |
|------|------|
| `App.tsx` | 根组件，全局状态（React Context + useReducer） |
| `MenuBar.tsx` | 打开 DSN、导出 SES、FR 状态显示 |
| `BoardCanvas.tsx` | LeaferJS 初始化、PcbRenderer 管理 |
| `ProgressPanel.tsx` | 布线进度条、Pass/Score 信息 |
| `LogPanel.tsx` | 实时滚动日志，monospace |
| `SidePanel.tsx` | 层可见性开关、板子统计 |
| `SetupWizard.tsx` | 首次运行下载/安装 FreeRouting |

### 6.4 状态管理

```typescript
interface AppState {
  // FreeRouting
  frStatus: 'loading' | 'not-installed' | 'downloading' | 'installing' | 'ready' | 'error'
  frVersion: string | null
  downloadProgress: number

  // Session / Job
  sessionId: string | null
  jobId: string | null
  jobState: string
  jobStage: string

  // Board
  boardData: BoardData | null
  layerVisibility: Record<string, boolean>

  // Progress
  currentPass: number
  score: number
  logEntries: LogEntry[]
}
```

---

## 阶段 7：核心交互流程

### 7.1 首次运行流程

```
应用启动
  → Go: 检测系统是否已安装 FreeRouting
  → 已安装（系统级） → 直接启动 API 模式 → 进入主界面
  → 未安装 → 显示 SetupWizard
    → 从 GitHub API 获取最新版本
    → 下载对应平台安装包（显示进度）
    → 安装到 ~/Freerouting-Desktop/
    → 启动 API 模式
    → 轮询 /v1/system/status 等待就绪
    → 就绪 → 关闭向导 → 进入主界面
```

### 7.2 打开 DSN 流程

```
用户点击 Open DSN
  → window.openFileDialog() → 选择 .dsn 文件
  → window.readFile(path) → 读取文件内容
  → POST /v1/sessions/create → sessionId
  → POST /v1/jobs/enqueue → jobId
  → Base64 编码 DSN → POST /v1/jobs/{jobId}/input
  → PUT /v1/jobs/{jobId}/start → 开始布线
  → EventSource(日志流) → 实时日志
  → EventSource(输出流) → 实时 SES → 解析 → 渲染
```

### 7.3 导出 SES 流程

```
布线完成后或用户随时 Export SES
  → GET /v1/jobs/{jobId}/output → Base64 SES
  → window.saveFileDialog('output.ses') → 选择保存路径
  → window.writeFile(path, content)
```

---

## 阶段 8：构建与发布

### 8.1 开发模式

```bash
# 终端 1：启动前端 dev server
cd frontend && npm run dev    # → localhost:1420

# 终端 2：启动 Go 宿主
go run .
```

### 8.2 生产构建

```bash
cd frontend && npm run build    # → ../dist/

# 各平台编译
GOOS=windows go build -ldflags="-s -w" -o freerouting-desktop.exe .
GOOS=darwin  go build -ldflags="-s -w" -o freerouting-desktop-mac .
GOOS=linux   go build -ldflags="-s -w" -o freerouting-desktop-linux .
```

### 8.3 打包体积估算

| 组成部分 | 大小 |
|---------|------|
| Go 二进制 | ~5-10MB |
| 前端静态资源 | ~0.5MB（gzip 后） |
| **总安装包** | **~5-10MB** |

不含 FreeRouting（首次运行时下载/安装），不含 Java 运行时（FR 自带）。

---

## 验证方法

1. **FR 检测：** 系统已安装 FR 时直接启动；未安装时自动下载安装
2. **进程管理：** 启动/停止 FreeRouting API 模式，健康检查通过
3. **文件打开：** 选择 DSN 文件，创建 Session + Job 并上传成功
4. **布线执行：** SSE 日志流实时显示、进度面板更新
5. **PCB 渲染：** Canvas 正确绘制走线、过孔、焊盘
6. **增量更新：** 布线过程中 SES 变更后 Canvas 自动刷新
7. **导出 SES：** 下载 SES 文件能在 KiCad/EasyEDA 中正常导入
8. **进程管理：** 关闭应用后 FreeRouting 子进程被正确终止
9. **跨平台：** Windows/macOS/Linux 三平台均能编译并运行

---

## 参考信息

### FreeRouting API 端点

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/v1/sessions/create` | 创建 session |
| POST | `/v1/jobs/enqueue` | 入队 job |
| POST | `/v1/jobs/{id}/input` | 上传 DSN（Base64） |
| PUT | `/v1/jobs/{id}/start` | 开始布线 |
| GET | `/v1/jobs/{id}` | 获取 job 状态 |
| PUT | `/v1/jobs/{id}/cancel` | 取消 |
| GET | `/v1/jobs/{id}/output` | 下载 SES 输出 |
| GET | `/v1/jobs/{id}/output/stream` | SSE 输出流 |
| GET | `/v1/jobs/{id}/logs/stream` | SSE 日志流 |
| GET | `/v1/system/status` | 健康检查 |

### FreeRouting CLI 启动参数

```
freerouting \
  --api_server.enabled=true \
  --api_server.endpoints=http://127.0.0.1:37864 \
  --api_server.authentication.enabled=false \
  --api_server.idle_timeout=300 \
  --gui.enabled=false \
  --logging.console.level=INFO \
  --logging.file.enabled=false
```

### GitHub Releases API

```
GET https://api.github.com/repos/freerouting/freerouting/releases/latest
→ { "tag_name": "v2.2.4", "assets": [{ "name": "freerouting-2.2.4-windows-x64.msi", "browser_download_url": "..." }, ...] }
```
