/**
 * tauri-bridge.js - Expõe as APIs do Tauri para os scripts clássicos (public/js),
 * que não usam ES modules. Disponível como window.TauriBridge.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { load } from '@tauri-apps/plugin-store';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

window.TauriBridge = {
    invoke,
    listen,
    openDialog: open,
    saveDialog: save,
    loadStore: load,
    revealItemInDir,
};
