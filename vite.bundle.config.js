/**
 * Kolid: standalone IIFE bundle build for browser <script> consumption.
 *
 * Produces a single self-contained file exposing `window.GSPLAT`,
 * mirroring the legacy nodes/web/js/gsplat-bundle.js contract used by
 * gaussian_node.html (SPLAT.Scene / Camera / WebGLRenderer / OrbitControls /
 * PLYLoader / Vector3 ...).
 *
 * Usage:
 *   npx vite build --config vite.bundle.config.js
 *
 * Workers are inlined (?worker&inline) and the WASM modules are compiled with
 * SINGLE_FILE=1, so the output is a single .js file with no external runtime
 * assets.
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    base: './',
    build: {
        outDir: 'dist-bundle',
        emptyOutDir: true,
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'GSPLAT',
            formats: ['iife'],
            fileName: () => 'gsplat-bundle.js'
        },
        rollupOptions: {
            output: {
                // Keep everything in one file; inline workers/wasm already handled
                // by the `?worker&inline` imports and SINGLE_FILE wasm.
                inlineDynamicImports: true
            }
        },
        sourcemap: false,
        target: 'esnext',
        copyPublicDir: false,
        minify: 'esbuild'
    },
    worker: {
        format: 'es',
        sourcemap: false
    },
    publicDir: false
});
