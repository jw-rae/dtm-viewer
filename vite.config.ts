import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
    base: command === 'build' ? '/digital-terrain-model-viewer/' : '/',
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
}))
