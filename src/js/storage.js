/**
 * storage.js - Acesso aos projetos locais (pastas do computador do usuário)
 *
 * Módulo ES: usa as APIs do Tauri diretamente.
 *
 * Um projeto é uma pasta. O backend Rust mantém a pasta aberta e todos os
 * caminhos trocados com ele são relativos a ela, com "/" como separador.
 */
import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { load as loadStore } from '@tauri-apps/plugin-store';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import JSZip from 'jszip';

export const StorageService = {
    CURRENT_PROJECT_KEY: 'caramelotex.currentProject',
    RECENTS_FILE: 'recent-projects.json',
    MAX_RECENTS: 20,
    /** Arquivos de texto maiores que isso não são abertos no editor. */
    MAX_TEXT_SIZE: 4 * 1024 * 1024,

    _invoke(cmd, args) {
        if (!isTauri()) {
            return Promise.reject(new Error('O CarameloTeX precisa rodar como aplicativo (Tauri), não no navegador.'));
        }
        return tauriInvoke(cmd, args);
    },

    // ---------------------------------------------------------------
    // Projeto atual (estado da sessão entre as páginas)
    // ---------------------------------------------------------------

    setCurrentProjectPath(path) {
        localStorage.setItem(this.CURRENT_PROJECT_KEY, path);
    },

    getCurrentProjectPath() {
        return localStorage.getItem(this.CURRENT_PROJECT_KEY);
    },

    // ---------------------------------------------------------------
    // Projetos recentes
    // ---------------------------------------------------------------

    async _recentsStore() {
        return loadStore(this.RECENTS_FILE, { autoSave: false });
    },

    /** @returns {Promise<Array<{path: string, name: string, lastOpened: number}>>} */
    async listRecent() {
        const store = await this._recentsStore();
        return (await store.get('projects')) || [];
    },

    async addRecent(path, name) {
        const store = await this._recentsStore();
        const projects = ((await store.get('projects')) || []).filter(p => p.path !== path);
        projects.unshift({ path, name, lastOpened: Date.now() });
        await store.set('projects', projects.slice(0, this.MAX_RECENTS));
        await store.save();
    },

    async removeRecent(path) {
        const store = await this._recentsStore();
        const projects = ((await store.get('projects')) || []).filter(p => p.path !== path);
        await store.set('projects', projects);
        await store.save();
    },

    // ---------------------------------------------------------------
    // Diálogos do sistema
    // ---------------------------------------------------------------

    /** Pede uma pasta ao usuário. Retorna o caminho ou null se cancelar. */
    async pickFolder(title) {
        const result = await openDialog({ directory: true, multiple: false, title });
        return result || null;
    },

    // ---------------------------------------------------------------
    // Abrir e carregar projeto
    // ---------------------------------------------------------------

    /**
     * Abre a pasta no backend e registra nos recentes.
     * @returns {Promise<{root, name, mainFile, engine, files: Array<{path, kind, size}>}>}
     */
    async openProject(path) {
        const info = await this._invoke('open_project', { dir: path });
        this.setCurrentProjectPath(info.root);
        await this.addRecent(info.root, info.name);
        return info;
    },

    /**
     * Monta o mapa de arquivos usado pelo editor a partir da listagem do disco.
     * Texto é carregado inteiro; binários ficam só listados (content null),
     * porque a compilação lê direto do disco.
     */
    async loadProjectFiles(info) {
        const files = {};
        const textEntries = [];

        for (const entry of info.files) {
            if (entry.kind === 'folder') {
                files[entry.path] = { type: 'folder' };
            } else if (entry.kind === 'text' && entry.size <= this.MAX_TEXT_SIZE) {
                textEntries.push(entry);
            } else {
                files[entry.path] = { type: 'binary', content: null, size: entry.size };
            }
        }

        await Promise.all(textEntries.map(async (entry) => {
            const content = await this._invoke('read_text_file', { path: entry.path });
            files[entry.path] = {
                type: entry.path === info.mainFile ? 'main' : 'auxiliary',
                content,
                modified: entry.modified,
            };
        }));

        return files;
    },

    // ---------------------------------------------------------------
    // Operações de arquivo (caminhos relativos ao projeto aberto)
    // ---------------------------------------------------------------

    /**
     * Grava texto e devolve o novo horário de modificação. Com `expectedModified`,
     * falha com "CONFLITO: ..." se o arquivo mudou no disco desde a leitura.
     */
    writeText(path, content, expectedModified = null) {
        return this._invoke('write_text_file', { path, content, expectedModified });
    },

    readText(path) {
        return this._invoke('read_text_file', { path });
    },

    /** Listagem atual da pasta: [{ path, kind, size, modified }]. */
    listFiles() {
        return this._invoke('list_project_files');
    },

    /** Imagem do projeto como data URL (para pré-visualização). */
    async readImageDataUrl(path) {
        const base64 = await this._invoke('read_binary_file', { path });
        const ext = path.split('.').pop().toLowerCase();
        const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/png';
        return `data:${mime};base64,${base64}`;
    },

    writeBinary(path, base64) {
        return this._invoke('write_binary_file', { path, base64 });
    },

    createFolder(path) {
        return this._invoke('create_folder', { path });
    },

    rename(from, to) {
        return this._invoke('rename_path', { from, to });
    },

    /** Move para a Lixeira. */
    remove(path) {
        return this._invoke('delete_path', { path });
    },

    saveConfig(mainFile, engine) {
        return this._invoke('save_project_config', { mainFile, engine });
    },

    async revealInExplorer(root, relPath) {
        const sep = root.includes('\\') ? '\\' : '/';
        const full = relPath ? root + sep + relPath.split('/').join(sep) : root;
        await revealItemInDir(full);
    },

    // ---------------------------------------------------------------
    // Criar projeto
    // ---------------------------------------------------------------

    /**
     * Cria `parent/name` com os arquivos dados ({ caminho: conteúdo }) e abre o projeto.
     */
    async createProject(parent, name, files) {
        const root = await this._invoke('create_project_folder', { parent, name, files: files || {} });
        return this.openProject(root);
    },

    /**
     * Extrai um .zip de projeto LaTeX para dentro do projeto aberto.
     * Retorna { added, skipped }.
     */
    async importZip(file) {
        const TEXT_EXTS = ['tex', 'bib', 'cls', 'sty', 'bst', 'bbx', 'cbx', 'def', 'cfg', 'txt', 'md', 'csv', 'dat', 'json'];
        const AUX = /\.(aux|log|out|toc|lof|lot|bbl|blg|bcf|run\.xml|synctex\.gz|fdb_latexmk|fls|nav|snm)$/i;

        const zip = await JSZip.loadAsync(file);
        const paths = Object.keys(zip.files);

        // Projetos exportados em .zip às vezes vêm dentro de uma única pasta raiz.
        const topLevel = new Set(paths.map(p => p.split('/')[0]).filter(Boolean));
        let rootPrefix = '';
        if (topLevel.size === 1) {
            const single = [...topLevel][0];
            if (paths.some(p => p.startsWith(single + '/') && !zip.files[p].dir)) {
                rootPrefix = single + '/';
            }
        }

        let added = 0;
        let skipped = 0;
        for (const relativePath of paths) {
            const entry = zip.files[relativePath];
            if (entry.dir) continue;

            const finalPath = rootPrefix && relativePath.startsWith(rootPrefix)
                ? relativePath.substring(rootPrefix.length)
                : relativePath;
            const name = finalPath.split('/').pop();
            if (!finalPath || name.startsWith('.') || finalPath.startsWith('__MACOSX') || AUX.test(name)) {
                skipped++;
                continue;
            }

            const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
            try {
                if (TEXT_EXTS.includes(ext)) {
                    await this.writeText(finalPath, await entry.async('string'));
                } else {
                    await this.writeBinary(finalPath, await entry.async('base64'));
                }
                added++;
            } catch (err) {
                console.error(`Erro ao extrair ${finalPath}:`, err);
                skipped++;
            }
        }
        return { added, skipped };
    },

    // ---------------------------------------------------------------
    // LaTeX
    // ---------------------------------------------------------------

    /**
     * Prepara a distribuição LaTeX (extrai o TinyTeX embutido na 1ª vez).
     * @param {(done: number, total: number) => void} [onProgress]
     * @returns {Promise<{source, binDir, hasLatexmk} | null>}
     */
    async prepareTex(onProgress) {
        let unlisten = null;
        if (onProgress) {
            unlisten = await listen('tex-setup-progress', (event) => {
                onProgress(event.payload.done, event.payload.total);
            });
        }
        try {
            return await this._invoke('prepare_tex', { customBinDir: null });
        } finally {
            if (unlisten) unlisten();
        }
    },

    /**
     * @returns {Promise<{ok, pdfFile, synctexFile, log, output, engine, texSource, durationMs, cancelled, timedOut}>}
     */
    compile(mainFile, engine) {
        return this._invoke('compile_project', { mainFile, engine, timeoutSecs: null });
    },

    /** Bytes de um arquivo da pasta de build (PDF ou .synctex.gz). */
    async readBuildFile(name) {
        const buffer = await this._invoke('read_build_file', { name });
        return new Uint8Array(buffer);
    },

    /** Saída do texcount para o arquivo principal (contagem detalhada). */
    wordCount(mainFile) {
        return this._invoke('word_count', { mainFile });
    },

    /**
     * Pacotes do LaTeX: instalados (offline) ou todos os do repositório
     * (remote = true, precisa de internet). [{ name, installed, description }]
     */
    listTexPackages(remote = false) {
        return this._invoke('list_tex_packages', { remote });
    },

    installTexPackage(name) {
        return this._invoke('install_tex_package', { name });
    },

    /** Dos arquivos pedidos (ex.: "booktabs.sty"), devolve os que existem. */
    checkTexFiles(files) {
        return this._invoke('check_tex_files', { files });
    },

    /** Palavras (da lista) que o corretor pt-BR não conhece. */
    spellCheck(words) {
        return this._invoke('spell_check', { words });
    },

    spellSuggest(word) {
        return this._invoke('spell_suggest', { word });
    },

    spellAdd(word) {
        return this._invoke('spell_add', { word });
    },

    cancelCompile() {
        return this._invoke('cancel_compile');
    },

    /** Instala (pela internet) o pacote que contém `file`. Retorna o nome do pacote. */
    installMissingFile(file) {
        return this._invoke('install_missing_file', { file });
    },

    /** Pergunta onde salvar e copia o PDF compilado. Retorna o caminho ou null. */
    async exportPdf(mainFile) {
        const baseName = mainFile.split('/').pop().replace(/\.tex$/i, '');
        const dest = await saveDialog({
            title: 'Salvar PDF',
            defaultPath: `${baseName}.pdf`,
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (!dest) return null;
        await this._invoke('export_pdf', { mainFile, dest });
        return dest;
    },
};

export default StorageService;
