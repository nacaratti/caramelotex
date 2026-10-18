import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname, 'src');

// O frontend fica em src/. Os scripts do app (src/public/js) continuam
// como scripts clássicos com variáveis globais e são copiados sem bundling;
// só as bibliotecas de terceiros passam pelo Vite (src/vendor/editor-libs.js).
export default defineConfig({
    root,
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
    },
    build: {
        outDir: resolve(import.meta.dirname, 'dist'),
        emptyOutDir: true,
        target: 'es2021',
        rollupOptions: {
            input: {
                index: resolve(root, 'index.html'),
                projects: resolve(root, 'projects.html'),
                templates: resolve(root, 'templates.html'),
            },
        },
    },
});
