import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    resolve: {
        alias: [
            {
                find: /^three$/,
                replacement: fileURLToPath(new URL('./src/vendor/three-webgpu-shim.js', import.meta.url))
            }
        ]
    },
    optimizeDeps: {
        exclude: ['three', 'three-mesh-bvh']
    },
    build: {
        chunkSizeWarningLimit: 1200
    }
});
