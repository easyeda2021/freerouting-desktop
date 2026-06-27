# FreeRouting Desktop App — 实现计划

## 上下文

FreeRouting 是一个 Java 的 PCB 自动布线器，现有 Swing GUI 界面老旧。目标是创建一个全新的 **Go + WebView 桌面应用**，用现代 Web 技术重写 GUI 界面，通过 Go 宿主管理 FreeRouting Java JAR 进程，前端 JS 直接与 JAR HTTP API 通信，实现 DSN 文件打开、PCB 板图 Canvas 渲染、布线进度监控等功能。

FreeRouting 源码在 `D:\教程\easyeda-docs\github-eext\freerouting`

**关键约束：**
- JAR 文件不打包进安装包，首次运行时从 GitHub Releases 下载
- FreeRouting 仓库已有预构建的 executable JAR，直接 `java -jar` 运行
- 前端用纯 CSS 布局，无重型 UI 框架，UI 设计需要美观有现代感
- PCB 几何数据从 SES 文件解析获取（前端 JS 直接解析），不修改 Java 代码
- 跨平台支持：Windows / macOS / Linux

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│              Go + WebView Desktop App                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Go 宿主 (main.go)                 单二进制 ~5-10MB      ││
│  │  ┌────────────┐ ┌──────────────┐ ┌──────────────────┐   ││
│  │  │ JAR Mgr    │ │ CORS Proxy   │ │ File Dialog      │   ││
│  │  │ 下载/启动/ │ │ 给JAR HTTP   │ │ 打开DSN/保存SES  │   ││
│  │  │ 停止JAR    │ │ 响应加CORS头 │ │                  │   ││
│  │  └────────────┘ └──────────────┘ └──────────────────┘   ││
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
                        ┌──────┴──────┐
                        │   Java JAR  │
                        │ (API Mode)  │
                        │ :37864      │
                        └─────────────┘
```

**为什么前端直接调 JAR API 而不是通过 Go 中转？**

JAR 返回的 HTTP 响应不带 CORS 头，浏览器 `fetch()` 会拦截跨域请求。Go 宿主的 CORS Proxy 只做一件事：在响应头加上 `Access-Control-Allow-Origin`，其余字节原封不动透传。这比在 Go 里封装 API 省掉几百行代码。

## 平台 WebView 引擎

| 平台 | WebView 引擎 | 额外要求 |
|------|-------------|---------|
| Windows | Edge WebView2 | Win10+ 内置 |
| macOS | Cocoa WKWebView | 内置 |
| Linux | GTK + WebKitGTK | `libgtk-3-dev libwebkit2gtk-4.1-dev`（桌面发行版通常已有） |

使用 [github.com/webview/webview](https://github.com/webview/webview) Go 库，一套 API 绑定三平台原生 WebView。

## 目录结构

```
freerouting-desktop/
├── main.go                      # Go 宿主入口 + WebView 窗口
├── jar_manager.go               # JAR 下载、版本检查、进程管理
├── cors_proxy.go                # CORS 反向代理（给 JAR 响应加头）
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
│   │   │   └── JarSetupWizard.tsx # 首次运行 JAR 安装向导
│   │   ├── lib/
│   │   │   ├── pcb-renderer.ts  # PCB Canvas 渲染引擎核心（LeaferJS）
│   │   │   ├── ses-parser.ts    # SES 文件解析（前端 JS）
│   │   │   ├── board-types.ts   # PCB 数据类型定义
│   │   │   └── api.ts           # JAR API 调用封装（fetch + SSE）
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
| Java 通信 | **前端直连 JAR HTTP** | 省掉 Go 中间层，Go 只做 CORS Proxy（~20行） |
| CORS | **Go 反向代理** | JAR 不带 CORS 头，Go 给响应加头 |
| PCB 渲染 | **LeaferJS** | 高性能 Canvas 2D，内置场景图/缩放/平移/事件 |
| SES 解析 | **前端 JS** | 前后端同一份解析代码，省掉 Rust/Go parser |
| 前端 UI | **纯 CSS 布局** | 无框架依赖，体积小 |
| 状态管理 | **React Context + useReducer** | 轻量、无额外依赖 |
| 前端构建 | Vite + React + TypeScript | 标准工具链 |
| JRE | 系统 `java` 命令 | JAR 可执行，用户提供 Java 运行时 |
| 跨平台 | Go 交叉编译 | `GOOS=darwin/linux/windows go build` |

## 首期范围（MVP）

1. **JAR 下载与进程管理**
2. **打开 DSN 文件 → 启动 API 布线**
3. **从 SES 输出解析 PCB 几何数据**（前端 JS 解析）
4. **Canvas 渲染 PCB 板图（走线/过孔/焊盘）**
5. **布线进度面板 + 实时日志**
6. **导出 SES 结果文件**

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
package main

import (
    "net/http"
    "net/http/httputil"
    "net/url"
    webview "github.com/webview/webview_go"
)

func main() {
    // 启动 CORS 代理
    go startCORSProxy()

    // 检查 JAR 状态
    // startJARServer()

    w := webview.New(false)
    defer w.Destroy()
    w.SetTitle("FreeRouting Desktop")
    w.SetSize(1400, 900, webview.HintNone)
    w.Navigate("http://localhost:1420") // Vite dev server
    w.Run()
}
```

### 1.3 前端脚手架

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install react react-dom leafer-ui
npm install -D @types/react @types/react-dom typescript vite @vitejs/plugin-react
```

### 1.4 Vite 配置

```typescript
// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 1420 },
  build: { outDir: '../dist' }
})
```

### 产出
- Go 宿主启动 WebView 窗口，加载 Vite dev server
- 窗口 1400x900，基本布局骨架

---

## 阶段 2：JAR 管理器 (Go)

**文件：** [jar_manager.go](jar_manager.go)

### 2.1 目录结构

JAR 和相关文件存放在用户 app data 目录下：
```
{app_data_dir}/freerouting/
├── freerouting.jar
├── version.txt
└── java/                  # 未来扩展：便携版 JRE
```

各平台路径：
- Windows: `%APPDATA%/freerouting/`
- macOS: `~/Library/Application Support/freerouting/`
- Linux: `~/.config/freerouting/`

### 2.2 功能点

#### JAR 状态检查
- 启动时检查 `freerouting.jar` 是否存在
- 读取 `version.txt` 获取当前版本
- Go 通过 WebView `w.Bind()` 暴露 `checkJarStatus()` 给前端

#### JAR 下载
- 从 FreeRouting GitHub Releases 下载最新 executable JAR
- 下载 URL: `https://github.com/andrasfuchs/freerouting/releases/latest/download/freerouting-executable.jar`
- 通过 WebView `w.Eval()` 推送下载进度百分比到前端
- 下载完成后写入 app data 目录

#### JAR 进程管理
- **启动命令：**
  ```
  java -jar "{jar_path}" \
    --api_server.enabled=true \
    --api_server.endpoints=http://127.0.0.1:37864 \
    --api_server.authentication.enabled=false \
    --gui.enabled=false \
    --logging.console.level=INFO \
    --logging.file.enabled=false
  ```
- 使用 `os/exec` 启动子进程
- 启动后轮询 `GET http://127.0.0.1:37864/v1/system/status` 确认就绪（最多等待 15 秒）
- 应用退出时自动 kill 子进程

#### 空闲超时
```
--api_server.idle_timeout=300   # 5 分钟无活动自动退出
```

#### 健康检查
- 每 5 秒轮询 `/v1/system/status`
- 进程崩溃时自动重启（最多 3 次）
- 通过 WebView `w.Eval()` 通知前端状态变化

### 2.3 Go 暴露给前端的函数

```go
// 通过 w.Bind() 注册，前端 window 对象上直接调用
w.Bind("checkJarStatus", func() string { ... })
// 返回 JSON: {"status": "not-installed"|"downloading"|"ready"|"error", "version": "...", "progress": 0}

w.Bind("downloadJar", func() { ... })
// 异步下载，通过 Eval 推送进度

w.Bind("startJar", func() string { ... })
// 启动 JAR，返回 nil 或 error

w.Bind("stopJar", func() { ... })

w.Bind("openFileDialog", func() string { ... })
// 打开原生文件对话框，返回文件路径

w.Bind("saveFileDialog", func(defaultName string) string { ... })
// 保存文件对话框，返回保存路径
```

---

## 阶段 3：CORS 反向代理 (Go)

**文件：** [cors_proxy.go](cors_proxy.go)

JAR 的 HTTP 响应不带 CORS 头，WebView 中 fetch 会被拦截。Go 起一个本地反向代理，给所有响应加上 CORS 头。

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

前端请求 `http://127.0.0.1:9080/v1/...`，Go 代理转发到 `http://127.0.0.1:37864/v1/...`，加上 CORS 头。

---

## 阶段 4：FreeRouting API 调用（前端 JS）

**文件：** [frontend/src/lib/api.ts](frontend/src/lib/api.ts)

前端 JS 直接通过 Go CORS Proxy 调用 JAR API。所有请求走 `http://127.0.0.1:9080`。

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
// 日志流: GET /v1/jobs/{jobId}/logs/stream
const eventSource = new EventSource(`http://127.0.0.1:9080/v1/jobs/${jobId}/logs/stream`)
eventSource.onmessage = (event) => {
  const log = JSON.parse(event.data)
  // log: { timestamp, type: "Info"|"Warn"|"Error", message, topic }
}

// 输出流: GET /v1/jobs/{jobId}/output/stream
const eventSource = new EventSource(`http://127.0.0.1:9080/v1/jobs/${jobId}/output/stream`)
eventSource.onmessage = (event) => {
  const output = JSON.parse(event.data)
  // output: { job_id, data: "<base64 ses>", crc32 }
  // → base64 解码 → SES 文本 → ses-parser 解析 → 更新 boardData
}
```

### DSN 文件上传

前端通过 `window.openFileDialog()` 获取文件路径后，用 Go 暴露的 `readFile()` 读文件内容，Base64 编码后上传：

```typescript
const filePath = await window.openFileDialog()
const content = await window.readFile(filePath)
const base64 = btoa(content)
await fetch(`http://127.0.0.1:9080/v1/jobs/${jobId}/input`, {
  method: 'POST',
  body: JSON.stringify({ filename: 'design.dsn', data: base64 })
})
```

---

## 阶段 5：SES 文件解析器（前端 JS）

**文件：** [frontend/src/lib/ses-parser.ts](frontend/src/lib/ses-parser.ts)

### SES 格式

SES (Specctra Session File) 是 Lisp-style S-expression 格式。从 FreeRouting 源码 `SesWriter.java` 确认输出格式。

**完整结构示例：**

```
(session "design_name"
  (base_design "design.dsn")
  (placement
    (resolution um 10)
    (component "pkg:pkg"
      (place REFDES x y front|back rotation)
    )
  )
  (was_is)
  (routes
    (resolution um 10)
    (parser
      (host_cad "KiCad's Pcbnew")
      (host_version "5.1.5")
    )
    (library_out
      (padstack "name"
        (shape (circle layer diameter x y))
        (attach off)
      )
    )
    (network_out
      (net NET_NAME
        (wire
          (path LAYER_NAME WIDTH
            x1 y1
            x2 y2
          )
        )
        (via "padstack_name" x y)
      )
    )
  )
)
```

### 关键格式细节

**走线 (Wire/Path)**：
```
(wire
  (path LAYER_NAME WIDTH_INT
    x1 y1
    x2 y2
    ...
  )
)
```
- `LAYER_NAME` = 字符串，如 `"F.Cu"` 或 `TOP`
- `WIDTH_INT` = 整数
- 坐标 = 整数

**过孔 (Via)**：
```
(via "padstack_name" x y)
```
- `padstack_name` = 字符串，可能带引号
- `x y` = 整数坐标

**Padstack**：
```
(padstack "name"
  (shape (circle LAYER diameter cx cy))
  (shape (rect LAYER llx lly urx ury))
  (shape (polygon LAYER 0 x1 y1 x2 y2 ...))
  (attach off)
)
```

**Resolution/单位**：
```
(resolution um 10)  → 单位=微米, 分母=10 → 坐标 = 0.1um 精度
(resolution mm 100) → 单位=毫米, 分母=100 → 坐标 = 0.01mm 精度
```

**坐标转换公式**：
```
board_x = ses_x / denominator
```

### 解析器实现

S-expression 递归下降解析器，TypeScript 实现：

```typescript
// ===== Tokenizer =====
type Token =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'string'; value: string }
  | { type: 'integer'; value: number }
  | { type: 'float'; value: number }

class SesTokenizer {
  private input: string
  private pos: number = 0

  constructor(input: string) { this.input = input }

  nextToken(): Token | null {
    this.skipWhitespace()
    if (this.pos >= this.input.length) return null

    const ch = this.input[this.pos]
    if (ch === '(') { this.pos++; return { type: 'open' } }
    if (ch === ')') { this.pos++; return { type: 'close' } }
    if (ch === '"') return this.readString()
    if (/[-+]?\d/.test(ch)) return this.readNumber()
    return this.readBareword()
  }
  // ...
}

// ===== Parser =====
type SExpr = string | number | SExpr[]

function parseSes(content: string): BoardData {
  const tokens = new SesTokenizer(content)
  const tree = parseSExpr(tokens)
  return extractBoardData(tree)
}
```

### 输出类型

```typescript
interface BoardData {
  resolutionUnit: string
  resolutionDenominator: number
  layers: LayerInfo[]
  traces: TraceData[]
  vias: ViaData[]
  components: ComponentData[]
  padstacks: PadstackData[]
}

interface TraceData {
  netName: string
  layer: string
  width: number
  corners: [number, number][]  // 已转换为板坐标
}

interface ViaData {
  netName: string
  padstackName: string
  center: [number, number]
  diameter: number
}

interface ComponentData {
  refdes: string
  package: string
  location: [number, number]
  side: 'front' | 'back'
  rotation: number
}

interface PadstackData {
  name: string
  shapes: ShapeData[]
}

interface ShapeData {
  layer: string
  shapeType: 'circle' | 'rect' | 'polygon'
  params: number[]
}
```

---

## 阶段 6：前端实现

### 6.1 界面布局（纯 CSS）

```
┌──────────────────────────────────────────────────────────────┐
│  MenuBar: [File] [Route] [View] [Help]                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    PCB Canvas (flex: 1)                      │
│                    LeaferJS 全区域渲染                        │
│                                                              │
│                                                              │
├───────────────────────────────────────┬──────────────────────┤
│  ProgressPanel (min-height: 120px)    │  SidePanel (240px)   │
│  ───────────────────────────────────  │  ───────────────     │
│  Pass: 5 | Routed: 150/200 | Score    │  ☑ TOP              │
│  85.30                                │  ☑ GND              │
│  ████████████████░░░░░ 75%            │  ☐ BOTTOM           │
│                                       │  ───────────────     │
│                                       │  Nets: 12            │
│                                       │  Vias: 45            │
├───────────────────────────────────────┴──────────────────────┤
│  LogPanel (min-height: 150px, overflow-y: scroll)            │
│  [12:00:01] INFO  Auto-router pass #5 completed...           │
│  [12:00:02] INFO  Score: 85.30 (5 unrouted)                 │
│  [12:00:05] WARN  Restoring earlier board...                 │
└──────────────────────────────────────────────────────────────┘
```

使用 CSS Grid 或 Flexbox 实现，所有面板均可调整大小。

### 6.2 PCB 渲染引擎（LeaferJS）

**文件：** [frontend/src/lib/pcb-renderer.ts](frontend/src/lib/pcb-renderer.ts)

使用 **LeaferJS**（https://leaferjs.com）作为 Canvas 渲染引擎。

**为什么用 LeaferJS 而不是自绘 Canvas：**
- 内置视图变换（zoom/pan），无需手动维护坐标变换矩阵
- 场景图管理，每个元素是独立对象，支持按需更新（非全量重绘）
- 内置鼠标/触摸事件系统（点击、拖拽、滚轮）
- 图层（Layer）天然对应 PCB 层
- 性能优秀，支持上万图形对象

**LeaferJS 集成：**

```bash
npm install leafer-ui
```

**渲染架构：**

```typescript
import { App, Line, Ellipse, Rect, Group, Layer } from 'leafer-ui'

class PcbRenderer {
  private app: App
  private layers: Map<string, Layer> = new Map()

  constructor(container: HTMLElement) {
    this.app = new App({
      view: container,
      tree: { type: 'design' },
    })
  }

  render(data: BoardData): void {
    this.clear()
    for (const trace of data.traces) {
      this.addTrace(trace)
    }
    for (const via of data.vias) {
      this.addVia(via)
    }
  }

  private addTrace(trace: TraceData): void {
    const layer = this.getOrCreateLayer(trace.layer)
    layer.add(new Line({
      points: trace.corners.flat(),
      strokeWidth: trace.width,
      stroke: this.getLayerColor(trace.layer),
      strokeCap: 'round',
      strokeJoin: 'round',
    }))
  }

  private addVia(via: ViaData): void {
    const layer = this.getOrCreateLayer(via.netName)
    layer.add(new Ellipse({
      x: via.center[0], y: via.center[1],
      width: via.diameter, height: via.diameter,
      fill: this.getLayerColor(via.netName),
    }))
  }

  // 视图控制（LeaferJS 内置）
  zoomTo(factor: number): void { this.app.tree.zoom = factor }
  panTo(x: number, y: number): void { this.app.tree.x = x; this.app.tree.y = y }
}
```

**PCB 元素映射：**

| PCB 元素 | LeaferJS 图形 | 说明 |
|---------|---------------|------|
| 走线 (Trace) | `Line` 或 `Path` | 多段线，`strokeWidth` = 走线宽度 |
| 过孔 (Via) | `Ellipse` | 外圆 = 焊盘，内圆 = 钻孔（两层叠加） |
| 焊盘 (Pad) | `Rect` / `Ellipse` / `Polygon` | 根据 padstack 形状选择 |
| 板框 | `Rect` | 板子外形 |
| 铜皮 | `Polygon` | 闭合多边形 |

**内置交互（LeaferJS 自动提供）：**
- 鼠标滚轮缩放
- 鼠标拖拽平移
- 元素点击/悬停事件
- 视口适配 `this.app.tree.fit()`

### 6.3 坐标处理

SES 坐标系与屏幕坐标系 Y 轴相反：

```typescript
// SES 坐标 → 屏幕坐标
function sesToScreen(x: number, y: number, boardHeight: number): [number, number] {
  return [x, boardHeight - y]
}
```

### 6.4 组件说明

| 组件 | 文件 | 功能 |
|------|------|------|
| `App.tsx` | 根组件 | 全局状态（Context）、布局容器 |
| `MenuBar.tsx` | 顶部菜单 | 打开 DSN、开始布线、停止布线、导出 SES |
| `BoardCanvas.tsx` | PCB 渲染 | 初始化 LeaferJS、管理 PcbRenderer、处理鼠标事件 |
| `ProgressPanel.tsx` | 进度面板 | 进度条、Pass 编号、分数、统计信息 |
| `LogPanel.tsx` | 日志面板 | 实时滚动日志列表 |
| `SidePanel.tsx` | 侧边面板 | 层可见性开关、板子统计 |
| `JarSetupWizard.tsx` | JAR 安装向导 | 下载进度条、状态提示 |

### 6.5 状态管理（React Context）

```typescript
interface AppState {
  // JAR
  jarStatus: 'loading' | 'not-installed' | 'downloading' | 'ready' | 'error'
  jarVersion: string | null
  downloadProgress: number

  // Session / Job
  sessionId: string | null
  jobId: string | null
  jobState: string       // QUEUED | READY_TO_START | RUNNING | COMPLETED | ...
  jobStage: string       // IDLE | ROUTING | OPTIMIZATION

  // Board
  boardData: BoardData | null

  // Progress
  currentPass: number
  routedCount: number
  incompleteCount: number
  score: number
  logEntries: LogEntry[]

  // UI
  layerVisibility: Record<string, boolean>
  zoom: number
  panX: number
  panY: number
}
```

---

## 阶段 7：核心交互流程

### 7.1 首次运行流程

```
应用启动
  → Go: 检查 app_data 目录下 freerouting.jar
  → 不存在 → Go: 从 GitHub Releases 下载
    → 通过 w.Eval() 推送进度到前端
    → 下载完成 → Go: 启动 JAR 进程
    → Go: 轮询 /v1/system/status 等待就绪
    → 就绪 → Go: 通知前端 → 进入主界面
  → 存在 → Go: 直接启动 JAR → 进入主界面
```

### 7.2 打开 DSN 流程

```
用户点击 File → Open
  → 前端调用 window.openFileDialog()
  → Go: 弹出原生文件对话框 → 返回文件路径
  → 前端调用 window.readFile(filePath) 读取文件内容
  → 前端: POST /v1/sessions/create → 获得 sessionId
  → 前端: POST /v1/jobs/enqueue → 获得 jobId
  → 前端: Base64 编码 DSN → POST /v1/jobs/{jobId}/input
  → 前端: PUT /v1/jobs/{jobId}/start → 开始布线
  → 前端: new EventSource(日志流) → 实时日志
  → 前端: new EventSource(输出流) → 实时 SES
    → 收到 SES → ses-parser 解析 → 更新 boardData
    → LeaferJS 自动重绘
```

### 7.3 进度更新流程

```
每 2 秒轮询 GET /v1/jobs/{jobId}
  → 更新 jobState、currentPass
  → 前端更新进度条

SSE /logs/stream 推送
  → 每次新日志 → 追加到 logEntries
  → 自动滚动到底部
  → 从日志中正则提取 Score
```

### 7.4 PCB 渲染更新流程

```
SSE /output/stream 推送新 SES 数据
  → 前端收到 → Base64 解码
  → ses-parser 解析 SES 文本 → BoardData
  → 更新 React state
  → BoardCanvas 检测到 boardData 变化
  → pcbRenderer.render(boardData)
```

### 7.5 导出 SES 流程

```
布线完成（jobState === COMPLETED）或用户随时 File → Export SES
  → 前端: GET /v1/jobs/{jobId}/output
  → 获取 Base64 SES 数据
  → 前端调用 window.saveFileDialog('output.ses')
  → Go: 弹出保存对话框 → 返回路径
  → 前端调用 window.writeFile(path, content)
  → Go: 写入文件
```

---

## 阶段 8：构建与发布

### 8.1 开发模式

```bash
# 终端 1：启动前端 dev server
cd frontend && npm run dev    # → localhost:1420

# 终端 2：启动 Go 宿主
go run .                       # 打开 WebView 加载 localhost:1420
```

### 8.2 生产构建

```bash
# 构建前端静态文件
cd frontend && npm run build    # → ../dist/

# 构建 Go 二进制
go build -ldflags="-s -w" -o freerouting-desktop .

# 交叉编译
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o freerouting-desktop.exe .
GOOS=darwin  GOARCH=amd64 go build -ldflags="-s -w" -o freerouting-desktop-mac .
GOOS=linux   GOARCH=amd64 go build -ldflags="-s -w" -o freerouting-desktop-linux .
```

Go 生产构建时，将 `w.Navigate()` 指向内嵌的 `dist/` 目录（使用 `embed` 包或 `file://` 路径加载本地 HTML）。

### 8.3 打包体积估算

| 组成部分 | 大小 |
|---------|------|
| Go 二进制 | ~5-10MB（含 webview 绑定） |
| 前端静态资源 | ~2MB（React + LeaferJS） |
| **总安装包** | **~7-12MB** |

不含 JAR 文件（首次运行时下载）、不含 Java 运行时（用户系统自带）。

### 8.4 首次运行

安装后首次启动：
1. Go 宿主检查 app data 目录下 `freerouting.jar`
2. 不存在 → 从 GitHub Releases 下载（约 8-15MB）
3. 自动启动 JAR 进程
4. 进入主界面

---

## 验证方法

1. **JAR 管理：** 首次启动弹出下载向导，下载完成能启动 Java 进程并健康检查通过
2. **文件打开：** 选择示例 DSN 文件，能创建 Session + Job 并上传成功
3. **布线执行：** 启动布线后 SSE 日志流实时显示、进度面板更新
4. **PCB 渲染：** Canvas 正确绘制走线（多段线）、过孔（圆）、焊盘（矩形/圆）
5. **增量更新：** 布线过程中 SES 变更后 Canvas 自动刷新显示新走线
6. **导出 SES：** 完成后下载 SES 文件能在 KiCad/EasyEDA 中正常导入
7. **进程管理：** 关闭应用后 Java 子进程被正确终止
8. **跨平台：** Windows/macOS/Linux 三平台均能编译并运行

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
# 基础 API 模式启动（本地使用）
java -jar freerouting.jar \
  --api_server.enabled=true \
  --api_server.endpoints=http://127.0.0.1:37864 \
  --api_server.authentication.enabled=false \
  --api_server.idle_timeout=300 \
  --gui.enabled=false \
  --logging.console.level=INFO \
  --logging.file.enabled=false

# 路由器参数
--router.enabled=true
--router.max_passes=100
--router.max_threads=4
--router.via_costs=42

# 输入输出（批处理模式）
-de <input.dsn>       # 输入 DSN 文件
-do <output.ses>      # 输出 SES 文件
```

### 输入/输出 API

**`POST /v1/jobs/{jobId}/input`** 请求体：
```json
{
  "filename": "design.dsn",
  "data": "<base64 encoded DSN content>"
}
```

**`GET /v1/jobs/{jobId}/output`** 响应体：
```json
{
  "job_id": "a4155510-...",
  "data": "<base64 encoded SES content>",
  "size": 13150,
  "crc32": 264089660,
  "format": "SES",
  "statistics": {
    "layer_count": 2,
    "component_count": 15,
    "total_net_count": 160,
    "routed_net_count": 267,
    "unrouted_net_count": 75,
    "via_count": 133
  },
  "filename": "design.ses"
}
```
