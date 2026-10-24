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
    // Pré-empacota as dependências na inicialização do servidor de dev, para
    // não reotimizar (e invalidar módulos já carregados) com o app aberto.
    optimizeDeps: {
        include: [
            '@codemirror/state', '@codemirror/view', '@codemirror/commands', '@codemirror/search',
            '@codemirror/autocomplete', '@codemirror/lint', '@codemirror/language',
            '@codemirror/legacy-modes/mode/stex', '@lezer/highlight',
            'pdfjs-dist', 'pako', 'jszip', 'mathlive',
            '@tauri-apps/api/core', '@tauri-apps/api/event', '@tauri-apps/plugin-dialog',
            '@tauri-apps/plugin-store', '@tauri-apps/plugin-opener', '@tauri-apps/api/app',
            '@tauri-apps/plugin-updater', '@tauri-apps/plugin-process',
        ],
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
