/**
 * storage.js - Serviço de armazenamento via Supabase (async)
 *
 * Depends on: supabase.js (global `supabase` and `AuthService`)
 *
 * Session-only helpers (getCurrentProjectId / setCurrentProjectId) still use
 * localStorage since they are per-tab state, not persisted data.
 */
const StorageService = {
    CURRENT_PROJECT_ID_KEY: 'current_project_id',

    // Keys used by the OLD localStorage-based storage (for migration)
    _OLD_PROJECTS_META_KEY: 'latex_projects_meta',
    _OLD_PROJECT_PREFIX: 'project_',

    // Fallback default template (usado quando Supabase não está disponível)
    _FALLBACK_TEMPLATE: `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{Meu Documento LaTeX}
\\author{Autor}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introducao}

Este e um exemplo de documento \\LaTeX{} online.

\\subsection{Formulas Matematicas}

A famosa equacao de Einstein:
\\[
E = mc^2
\\]

\\section{Conclusao}

Compile este documento para visualizar o PDF!

\\end{document}`,

    /**
     * Obtém o template padrão do Supabase ou retorna fallback local.
     * @returns {Promise<string>} Conteúdo do template
     */
    async getDefaultTemplate() {
        try {
            // Tenta buscar do TemplateService se disponível
            if (typeof TemplateService !== 'undefined') {
                const template = await TemplateService.getDefaultTemplate();
                if (template && template.content) {
                    return template.content;
                }
            }

            // Fallback: busca direto do Supabase
            const { data, error } = await supabase
                .from('templates')
                .select('content')
                .eq('is_active', true)
                .eq('category', 'academic')
                .order('name', { ascending: true })
                .limit(1)
                .single();

            if (!error && data && data.content) {
                return data.content;
            }
        } catch (e) {
            console.warn('Erro ao buscar template padrão:', e);
        }

        // Retorna fallback local
        return this._FALLBACK_TEMPLATE;
    },

    // ---------------------------------------------------------------
    // Session helpers (sync, localStorage – not user data)
    // ---------------------------------------------------------------

    setCurrentProjectId(id) {
        localStorage.setItem(this.CURRENT_PROJECT_ID_KEY, id);
    },

    getCurrentProjectId() {
        return localStorage.getItem(this.CURRENT_PROJECT_ID_KEY);
    },

    // ---------------------------------------------------------------
    // Projects CRUD (async, Supabase)
    // ---------------------------------------------------------------

    /**
     * List all projects for the current user.
     * Returns array of { id, name, lastModified }.
     */
    async listProjects() {
        const userId = await AuthService.getUserId();
        if (!userId) return [];

        const { data, error } = await supabase
            .from('projects')
            .select('id, name, last_modified')
            .eq('user_id', userId)
            .order('last_modified', { ascending: false });

        if (error) {
            console.error('StorageService.listProjects error:', error.message);
            return [];
        }

        return data.map(row => ({
            id: row.id,
            name: row.name,
            lastModified: row.last_modified
        }));
    },

    /**
     * Create a new project with a default main.tex.
     * Returns the new project id.
     */
    async createProject(name) {
        const userId = await AuthService.getUserId();
        if (!userId) throw new Error('Not authenticated');

        const id = 'proj_' + Date.now();

        const defaultContent = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\title{${name}}
\\author{Usuário}
\\date{\\today}
\\begin{document}
\\maketitle
\\section{Início}
Seu novo projeto LaTeX!
\\end{document}`;

        // Insert project row
        const { error: projError } = await supabase
            .from('projects')
            .insert({ id, user_id: userId, name, last_modified: Date.now() });

        if (projError) throw projError;

        // Insert initial main.tex
        const { error: fileError } = await supabase
            .from('project_files')
            .insert({
                project_id: id,
                user_id: userId,
                file_path: 'main.tex',
                file_type: 'main',
                content: defaultContent,
                storage_path: null
            });

        if (fileError) throw fileError;

        return id;
    },

    /**
     * Save the entire project (upsert files, upload binaries).
     * `files` is the in-memory projectFiles object: { [path]: { content, type } }
     */
    async saveProject(id, name, files, currentFile) {
        const userId = await AuthService.getUserId();
        if (!userId) return false;

        try {
            // 1. Update project metadata
            const { error: metaError } = await supabase
                .from('projects')
                .update({ name, last_modified: Date.now() })
                .eq('id', id)
                .eq('user_id', userId);

            if (metaError) throw metaError;

            // 2. Get existing file rows to detect deletions
            const { data: existingFiles } = await supabase
                .from('project_files')
                .select('file_path, storage_path')
                .eq('project_id', id)
                .eq('user_id', userId);

            const existingPaths = new Set((existingFiles || []).map(f => f.file_path));
            const currentPaths = new Set(Object.keys(files));

            // 3. Delete removed files
            const removedPaths = [...existingPaths].filter(p => !currentPaths.has(p));
            if (removedPaths.length > 0) {
                // Delete storage objects for removed binaries
                const removedStoragePaths = (existingFiles || [])
                    .filter(f => removedPaths.includes(f.file_path) && f.storage_path)
                    .map(f => f.storage_path);

                if (removedStoragePaths.length > 0) {
                    await supabase.storage.from('project-binaries').remove(removedStoragePaths);
                }

                await supabase
                    .from('project_files')
                    .delete()
                    .eq('project_id', id)
                    .eq('user_id', userId)
                    .in('file_path', removedPaths);
            }

            // 4. Upsert each file
            for (const [filePath, fileData] of Object.entries(files)) {
                if (fileData.type === 'binary') {
                    // Upload binary to Storage
                    const storagePath = `${userId}/${id}/${filePath}`;

                    // Convert data URI to Blob
                    const blob = dataURItoBlob(fileData.content);

                    const { error: uploadError } = await supabase.storage
                        .from('project-binaries')
                        .upload(storagePath, blob, { upsert: true });

                    if (uploadError) {
                        console.error(`Upload error for ${filePath}:`, uploadError.message);
                    }

                    // Upsert file row (no content, just storage_path)
                    const { error } = await supabase
                        .from('project_files')
                        .upsert({
                            project_id: id,
                            user_id: userId,
                            file_path: filePath,
                            file_type: 'binary',
                            content: null,
                            storage_path: storagePath,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'project_id,file_path' });

                    if (error) console.error(`Upsert error for ${filePath}:`, error.message);
                } else {
                    // Text file (main, auxiliary, folder)
                    const { error } = await supabase
                        .from('project_files')
                        .upsert({
                            project_id: id,
                            user_id: userId,
                            file_path: filePath,
                            file_type: fileData.type,
                            content: fileData.type === 'folder' ? null : fileData.content,
                            storage_path: null,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'project_id,file_path' });

                    if (error) console.error(`Upsert error for ${filePath}:`, error.message);
                }
            }

            console.log(`Projeto '${name}' (${id}) salvo.`);
            return true;
        } catch (e) {
            console.error('Erro ao salvar projeto:', e);
            return false;
        }
    },

    /**
     * Load a project by id.
     * Returns { files, currentFile } or null.
     */
    async loadProject(id) {
        const userId = await AuthService.getUserId();
        if (!userId) return null;

        const { data: rows, error } = await supabase
            .from('project_files')
            .select('*')
            .eq('project_id', id)
            .eq('user_id', userId);

        if (error || !rows || rows.length === 0) return null;

        const files = {};
        let mainFile = 'main.tex';

        for (const row of rows) {
            if (row.file_type === 'binary' && row.storage_path) {
                // Download binary from Storage
                const { data: blobData, error: dlError } = await supabase.storage
                    .from('project-binaries')
                    .download(row.storage_path);

                if (dlError) {
                    console.error(`Download error for ${row.file_path}:`, dlError.message);
                    continue;
                }

                // Convert blob to data URI for compatibility with compiler
                const dataURI = await blobToDataURI(blobData);
                files[row.file_path] = { content: dataURI, type: 'binary' };
            } else if (row.file_type === 'folder') {
                files[row.file_path] = { type: 'folder' };
            } else {
                files[row.file_path] = { content: row.content || '', type: row.file_type };
                if (row.file_type === 'main') mainFile = row.file_path;
            }
        }

        return { files, currentFile: mainFile };
    },

    /**
     * Delete a project and all its files/storage objects.
     */
    async deleteProject(id) {
        const userId = await AuthService.getUserId();
        if (!userId) return;

        // 1. Get storage paths for cleanup
        const { data: fileRows } = await supabase
            .from('project_files')
            .select('storage_path')
            .eq('project_id', id)
            .eq('user_id', userId);

        const storagePaths = (fileRows || [])
            .filter(f => f.storage_path)
            .map(f => f.storage_path);

        // 2. Remove storage objects
        if (storagePaths.length > 0) {
            await supabase.storage.from('project-binaries').remove(storagePaths);
        }

        // 3. Delete file rows (cascade would handle this, but be explicit)
        await supabase
            .from('project_files')
            .delete()
            .eq('project_id', id)
            .eq('user_id', userId);

        // 4. Delete project row
        await supabase
            .from('projects')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);
    },

    /**
     * Rename a project.
     */
    async renameProject(id, newName) {
        const userId = await AuthService.getUserId();
        if (!userId) return false;

        const { error } = await supabase
            .from('projects')
            .update({ name: newName, last_modified: Date.now() })
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            console.error('renameProject error:', error.message);
            return false;
        }
        return true;
    },

    // ---------------------------------------------------------------
    // Delta save (dirty tracking)
    // ---------------------------------------------------------------

    /**
     * Save only changed/deleted files instead of the full project.
     * @param {string} id - project id
     * @param {string} name - project name
     * @param {Object} dirtyFiles - { [path]: { content, type } } only modified files
     * @param {string[]} deletedPaths - file paths to delete
     * @returns {boolean} success
     */
    async saveProjectDelta(id, name, dirtyFiles, deletedPaths) {
        const userId = await AuthService.getUserId();
        if (!userId) return false;

        try {
            // 1. Update project metadata
            const { error: metaError } = await supabase
                .from('projects')
                .update({ name, last_modified: Date.now() })
                .eq('id', id)
                .eq('user_id', userId);

            if (metaError) throw metaError;

            // 2. Delete removed files
            if (deletedPaths.length > 0) {
                const { data: toDelete } = await supabase
                    .from('project_files')
                    .select('file_path, storage_path')
                    .eq('project_id', id)
                    .eq('user_id', userId)
                    .in('file_path', deletedPaths);

                const storagePaths = (toDelete || [])
                    .filter(f => f.storage_path)
                    .map(f => f.storage_path);

                if (storagePaths.length > 0) {
                    await supabase.storage.from('project-binaries').remove(storagePaths);
                }

                await supabase
                    .from('project_files')
                    .delete()
                    .eq('project_id', id)
                    .eq('user_id', userId)
                    .in('file_path', deletedPaths);
            }

            // 3. Upsert only dirty files
            for (const [filePath, fileData] of Object.entries(dirtyFiles)) {
                if (fileData.type === 'binary') {
                    const storagePath = `${userId}/${id}/${filePath}`;
                    const blob = dataURItoBlob(fileData.content);

                    const { error: uploadError } = await supabase.storage
                        .from('project-binaries')
                        .upload(storagePath, blob, { upsert: true });

                    if (uploadError) {
                        console.error(`Upload error for ${filePath}:`, uploadError.message);
                    }

                    const { error } = await supabase
                        .from('project_files')
                        .upsert({
                            project_id: id,
                            user_id: userId,
                            file_path: filePath,
                            file_type: 'binary',
                            content: null,
                            storage_path: storagePath,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'project_id,file_path' });

                    if (error) console.error(`Upsert error for ${filePath}:`, error.message);
                } else {
                    const { error } = await supabase
                        .from('project_files')
                        .upsert({
                            project_id: id,
                            user_id: userId,
                            file_path: filePath,
                            file_type: fileData.type,
                            content: fileData.type === 'folder' ? null : fileData.content,
                            storage_path: null,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'project_id,file_path' });

                    if (error) console.error(`Upsert error for ${filePath}:`, error.message);
                }
            }

            const fileCount = Object.keys(dirtyFiles).length;
            const delCount = deletedPaths.length;
            if (fileCount > 0 || delCount > 0) {
                console.log(`Delta save: ${fileCount} upsert(s), ${delCount} delete(s).`);
            }
            return true;
        } catch (e) {
            console.error('Erro ao salvar projeto (delta):', e);
            return false;
        }
    },

    // ---------------------------------------------------------------
    // Migration from localStorage → Supabase
    // ---------------------------------------------------------------

    /**
     * One-time migration: reads projects from localStorage, uploads to
     * Supabase, then clears the old keys.
     */
    async migrateFromLocalStorage() {
        const metaRaw = localStorage.getItem(this._OLD_PROJECTS_META_KEY);
        if (!metaRaw) return; // Nothing to migrate

        const userId = await AuthService.getUserId();
        if (!userId) return;

        try {
            const metaList = JSON.parse(metaRaw);
            if (!Array.isArray(metaList) || metaList.length === 0) {
                localStorage.removeItem(this._OLD_PROJECTS_META_KEY);
                return;
            }

            console.log(`Migrando ${metaList.length} projeto(s) do localStorage...`);

            for (const meta of metaList) {
                const raw = localStorage.getItem(this._OLD_PROJECT_PREFIX + meta.id);
                if (!raw) continue;

                let projectData;
                try {
                    projectData = JSON.parse(raw);
                } catch (_) {
                    continue;
                }

                const projectId = meta.id;
                const projectName = meta.name || projectData.name || 'Projeto Migrado';
                const files = projectData.files || {};

                // Insert project row (ignore conflict if already migrated)
                await supabase
                    .from('projects')
                    .upsert({
                        id: projectId,
                        user_id: userId,
                        name: projectName,
                        last_modified: meta.lastModified || Date.now()
                    }, { onConflict: 'id' });

                // Insert each file
                for (const [filePath, fileData] of Object.entries(files)) {
                    if (fileData.type === 'binary' && fileData.content) {
                        const storagePath = `${userId}/${projectId}/${filePath}`;
                        const blob = dataURItoBlob(fileData.content);

                        await supabase.storage
                            .from('project-binaries')
                            .upload(storagePath, blob, { upsert: true });

                        await supabase
                            .from('project_files')
                            .upsert({
                                project_id: projectId,
                                user_id: userId,
                                file_path: filePath,
                                file_type: 'binary',
                                content: null,
                                storage_path: storagePath
                            }, { onConflict: 'project_id,file_path' });
                    } else if (fileData.type === 'folder') {
                        await supabase
                            .from('project_files')
                            .upsert({
                                project_id: projectId,
                                user_id: userId,
                                file_path: filePath,
                                file_type: 'folder',
                                content: null,
                                storage_path: null
                            }, { onConflict: 'project_id,file_path' });
                    } else {
                        await supabase
                            .from('project_files')
                            .upsert({
                                project_id: projectId,
                                user_id: userId,
                                file_path: filePath,
                                file_type: fileData.type || 'auxiliary',
                                content: fileData.content || '',
                                storage_path: null
                            }, { onConflict: 'project_id,file_path' });
                    }
                }

                // Clean up localStorage entry
                localStorage.removeItem(this._OLD_PROJECT_PREFIX + meta.id);
            }

            // Remove old meta key
            localStorage.removeItem(this._OLD_PROJECTS_META_KEY);

            // Clean up legacy single-project key
            localStorage.removeItem('latex_editor_project');

            console.log('Migração do localStorage concluída.');
        } catch (e) {
            console.error('Erro na migração do localStorage:', e);
        }
    }
};

// ---------------------------------------------------------------
// Utility: data URI ↔ Blob conversions
// ---------------------------------------------------------------

function dataURItoBlob(dataURI) {
    if (!dataURI || !dataURI.includes(',')) {
        return new Blob([]);
    }
    const [header, base64] = dataURI.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
}

function blobToDataURI(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
