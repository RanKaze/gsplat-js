# GSplat 渲染器（gsplat.js）集成说明

本目录（`nodes/web/js/gsplat-bundle.js`）是 **SnapshotGaussianNode** 的 `method = "GSplat"` 分支所使用的浏览器端渲染 bundle。

## 架构：以 git submodule 方式引入（参考 SuperSplat）

与 `nodes/web/supersplat` 完全相同的管理模式 —— 源码作为 **git submodule** 挂载，构建产物再落到本目录：

```
nodes/web/
├── supersplat/            # git submodule -> playcanvas/supersplat   (SuperSplat 分支)
│   └── dist/              #   rollup 构建产物
├── gsplat-js/             # git submodule -> huggingface/gsplat.js   (GSplat 分支)
│   ├── src/               #   上游 TypeScript 源码
│   ├── vite.bundle.config.js   # Kolid 自建的 IIFE 打包配置（非上游文件）
│   └── dist-bundle/       #   构建产物（已 gitignore）
└── js/
    └── gsplat-bundle.js   # ← 最终交付：拷贝自 gsplat-js/dist-bundle/gsplat-bundle.js
```

`.gitmodules` 中登记：

```ini
[submodule "nodes/web/gsplat-js"]
	path = nodes/web/gsplat-js
	url = https://github.com/huggingface/gsplat.js.git
```

## 为什么需要自建 `vite.bundle.config.js`

上游 gsplat.js（v1.2.9）的官方 `vite build` **只产出 ES module**（`dist/index.es.js`），
不再提供 UMD/IIFE 全局导出。而 `gaussian_node.html` 使用
`<script src="./js/gsplat-bundle.js"></script>` + `window.GSPLAT` 的传统加载方式。

因此新增 `vite.bundle.config.js`，用同一份 `src/index.ts` 入口，改为输出
**IIFE 格式并挂载 `window.GSPLAT`**，与旧 bundle 的对外契约保持一致：

- `formats: ['iife']`，`name: 'GSPLAT'`
- `inlineDynamicImports: true`（单文件）
- Worker 通过上游的 `?worker&inline` 语法内联为 blob URL
- WASM 通过 `SINGLE_FILE=1` 编译内联（`src/wasm/*.js` 已随仓库提交，无需 emscripten 重新编译）

## Kolid 本地补丁（升上游版本时必须重新打）

上游源码与 Kolid 交付版之间**共有两处**功能性差异：

| 文件 | 补丁 | 为什么 |
|---|---|---|
| `src/renderers/WebGLRenderer.ts`（`getContext("webgl2", ...)`） | 增加 `preserveDrawingBuffer: true` | `gaussian_node.html` 的 `takeScreenshotAndClose()` 是在事件回调里（rAF 之外）把 WebGL canvas `drawImage` 到临时 2D canvas 再 `toDataURL`。没有这个属性时按 WebGL 规范只能拿到已被清空的缓冲区，节点收到的是一张纯黑 PNG |
| `src/controls/OrbitControls.ts`（`update()` 键盘段） | ① 帧移动量按 dt 归一化到 60 Hz（`frameScale = min(dt_s, 0.1) * 60`）；② 按住 Shift 时移动速度 ×4；③ `E`/`Q` 从“水平旋转”改为**垂直平移**（沿世界 −Y / +Y，本视图世界 Y 向下所以 `up = (0,-1,0)`），R/F 俯仰旋转保留 | ①原实现每帧固定步长，高刷屏/headless 下移动速度随帧率漂移；②③按用户要求 WASDQE 移动方案（Q 下 E 上、Shift 加速） |

> 2026-10-10 那次改造成 submodule 构建时 `preserveDrawingBuffer` 这颗补丁被漏掉了，2026-10-11 补回。
> 上述 WebGLRenderer 差异已通过复现旧打包管线（esbuild 直接把官方 `dist/index.es.js` 打成 IIFE）与旧 bundle 逐行对比确认：
> 归一化空白后整份文件只差 10 个 hunk，其余 9 处全是 esbuild 版本降级写法（`static{}` ↔ 类后赋值、
> `??=` ↔ `?? (…)`、类名形式）和入口文件名/注释。`OrbitControls` 的 ①②③ 是 2026-10-11 之后新加的功能
> 补丁，**不在**那次逐 hunk 对比覆盖范围内。

`git checkout` 到新的上游 tag 会把这两处都冲掉，所以升级流程里必须重打（见下一节）。

## 重新构建步骤

```bash
cd nodes/web/gsplat-js

# 1) 安装依赖
#    注：沙箱环境里 `npm ci` 可能因 safe-delete 超时而失败，属环境问题，
#    改用 `npm install` 即可；若报缺少 rollup 原生二进制，补装：
#    npm install --no-save @rollup/rollup-win32-x64-msvc
npm install

# 2) 构建 IIFE bundle（跳过需要 emcc 的 build:wasm 步骤）
./node_modules/.bin/vite build --config vite.bundle.config.js

# 3) 部署到最终位置
cp dist-bundle/gsplat-bundle.js ../js/gsplat-bundle.js
```

## 更新上游版本

```bash
cd nodes/web/gsplat-js
git fetch && git checkout <新版本 tag/commit>
# 1) 重新打 Kolid 本地补丁（见上一节，共两处，checkout 会全部冲掉）：
#    a. src/renderers/WebGLRenderer.ts 的 getContext("webgl2", ...) 里补回 preserveDrawingBuffer: true
#    b. src/controls/OrbitControls.ts 的 update() 键盘段：dt 归一化 + Shift 加速 + E/Q 垂直平移
# 2) 确认补丁已在产物里（应打印 preserveDrawingBuffer:!0 与 ShiftLeft）：
npm install
./node_modules/.bin/vite build --config vite.bundle.config.js
grep -o 'getContext("webgl2",{[^}]*}' dist-bundle/gsplat-bundle.js
grep -c 'ShiftLeft' dist-bundle/gsplat-bundle.js
cp dist-bundle/gsplat-bundle.js ../js/gsplat-bundle.js
# 回到项目根目录提交新的 submodule 指针
cd ../../.. && git add nodes/web/gsplat-js nodes/web/js/gsplat-bundle.js
```

## 与 `gaussian_node.html` 的兼容性

已通过完整调用序列验证（`window.GSPLAT` 契约保持不变）：

| HTML 中使用的 API | gsplat.js v1.2.9 | 状态 |
|---|---|---|
| `SPLAT.Scene / Camera / WebGLRenderer / OrbitControls` | 同名导出 | ✅ |
| `SPLAT.PLYLoader.LoadAsync(url, scene)` | 签名向后兼容 | ✅ |
| `SPLAT.Vector3` | 同名导出 | ✅ |
| `camera.data.fx / fy` | 保留 | ✅ |
| `scene.objects / scene.removeObject(obj)` | 保留 | ✅ |
| `controls.setCameraTarget(v) / update()` | 保留 | ✅ |
| `splat.data.scales / .changed / .detached` | 保留 | ✅ |
| `renderer.setSize() / render()` | 保留 | ✅ |
| `renderer._renderData`（旧代码的可选分支） | 已移除，但 HTML 用防御式 `if` 守卫，行为与旧版一致（旧版同样为 `undefined`） | ⚠️ 无害 |

结论：`gaussian_node.html` **无需修改**。

## 版本历史

- **2026-10-11（2）**：`OrbitControls.ts` 键盘移动补丁 —— WASDQE 移动方案：`E`/`Q` 垂直平移
  （世界 −Y/+Y），Shift ×4 加速，帧移动量按 dt 归一化到 60 Hz。同时 `gaussian_node.html` 的
  `applyFocalFromIntrinsics()` 改为单一各向同性缩放（`min(w/W, h/H)`），修复画布宽高比 ≠ 源图
  宽高比时 fx≠fy 造成的画面拉伸（实测拉伸比 1.2458 → 1.0000）。
- **2026-10-11**：补回 10-10 改造时漏掉的 `preserveDrawingBuffer: true`（截图路径全黑）。
  同时用「复现旧 esbuild 管线 + 逐 hunk 对比」审计出旧 bundle 的全部手工补丁清单：仅此一处。
- **2026-10-10**：替换手工打包的旧 bundle（2026-02-06 产出的 gsplat.js 旧版），
  改为 submodule + 自建 IIFE 构建。上游 `huggingface/gsplat.js` v1.2.9（commit `dbe93f6`）。
  旧文件备份于 `js/gsplat-bundle.js.old-20260206`。
