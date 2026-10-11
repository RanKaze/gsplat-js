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
npm install
./node_modules/.bin/vite build --config vite.bundle.config.js
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

- **2026-10-10**：替换手工打包的旧 bundle（2026-02-06 产出的 gsplat.js 旧版），
  改为 submodule + 自建 IIFE 构建。上游 `huggingface/gsplat.js` v1.2.9（commit `dbe93f6`）。
  旧文件备份于 `js/gsplat-bundle.js.old-20260206`。
