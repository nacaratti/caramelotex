/**
 * app.js - Aplicação LaTeX Editor (SEM ES6 Modules)
 */

// ========== UTILIDADES ==========
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Variáveis globais
let editor;
let compiler;
let viewer;
let currentPdfData = null;
let currentSynctexData = null; // Dados SyncTeX parseados para sincronização
let autoCompileEnabled = false;
let debounceTimer = null;

// Sistema de arquivos do projeto
let projectFiles = {
    'main.tex': {
        content: '', // Será preenchido com o template
        type: 'main'
    }
};
let currentFile = 'main.tex';
let actionMenuTarget = null; // Armazena o alvo do menu de ação
let _projectName = 'Projeto Sem Nome'; // Cache do nome do projeto (evita query async no save)
let _isSaving = false; // Previne saves concorrentes
let _dirtyFiles = new Set();   // paths modificados desde ultimo save
let _deletedFiles = new Set(); // paths deletados desde ultimo save
let _offlineSavePending = false; // true se um save falhou por rede
let _saveStatusTimer = null;

// Template padrão LaTeX
const defaultTemplate = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{Meu Documento LaTeX}
\\author{Autor}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introdução}

Este é um exemplo de documento \\LaTeX{} online.

\\subsection{Fórmulas Matemáticas}

A famosa equação de Einstein:
\\[
E = mc^2
\\]

Integral definida:
\\[
\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
\\]

\\section{Conclusão}

Compile este documento para visualizar o PDF!

\\end{document}`;

// StorageService is now imported from js/storage.js

// ========== SAVE STATUS ==========
function updateSaveStatus(status) {
    const el = document.getElementById('editorStatus');
    if (!el) return;

    clearTimeout(_saveStatusTimer);

    switch (status) {
        case 'saving':
            el.textContent = 'Salvando...';
            el.className = 'text-yellow-400';
            break;
        case 'saved':
            el.textContent = 'Salvo';
            el.className = 'text-green-400';
            _saveStatusTimer = setTimeout(() => {
                el.textContent = 'Pronto';
                el.className = '';
            }, 3000);
            break;
        case 'error':
            el.textContent = 'Erro ao salvar';
            el.className = 'text-red-400';
            _saveStatusTimer = setTimeout(() => {
                el.textContent = 'Pronto';
                el.className = '';
            }, 5000);
            break;
        case 'offline':
            el.textContent = 'Offline - salvo na fila';
            el.className = 'text-orange-400';
            break;
        default:
            el.textContent = 'Pronto';
            el.className = '';
    }
}

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', async function () {
    console.log('Inicializando LaTeX Editor...');

    // Auth guard: redireciona para login se não autenticado
    const session = await AuthService.requireAuth();
    if (!session) return;

    // Verifica se há um projeto selecionado
    const currentProjectId = StorageService.getCurrentProjectId();
    if (!currentProjectId) {
        const newId = await StorageService.createProject('Meu Projeto');
        StorageService.setCurrentProjectId(newId);
    }

    initEditor();
    initViewer();
    await initFileSystem();

    // Hide loading overlay
    const overlay = document.getElementById('editorLoadingOverlay');
    if (overlay) overlay.classList.add('hidden');

    setupEventListeners();

    // Setup Auto-save
    setInterval(() => {
        saveCurrentProject();
    }, 30000); // Auto-save every 30s

    // beforeunload não pode await – o debounce de 2s garante que a maioria das edições já está salva
    window.addEventListener('beforeunload', () => {
        // Fire-and-forget (browser pode cancelar a promise)
        saveCurrentProject();
    });

    // Setup Resizer
    initResizer();

    // Auto-compile on editor load - small delay to ensure everything is ready
    setTimeout(() => {
        compile();
    }, 100);
});

function initResizer() {
    const resizer = document.getElementById('resizer');
    const editorPanel = document.getElementById('editorPanel');
    const viewerPanel = document.getElementById('viewerPanel');
    const container = editorPanel.parentElement; // main tag

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.classList.add('cursor-col-resize', 'select-none'); // Prevent selection
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        // Calculate new width percentage
        // Offset by sidebar width if visible
        const sidebarWidth = document.getElementById('filesPanel').classList.contains('hidden') ? 0 : 256; // 64 * 4 = 256px (w-64)
        const containerWidth = container.offsetWidth;
        const x = e.clientX - sidebarWidth;

        // Constraints (min 10% max 90%)
        let newEditorWidthPercent = (x / containerWidth) * 100;
        if (newEditorWidthPercent < 15) newEditorWidthPercent = 15;
        if (newEditorWidthPercent > 85) newEditorWidthPercent = 85;

        const newViewerWidthPercent = 100 - newEditorWidthPercent;

        editorPanel.style.width = `${newEditorWidthPercent}%`;
        viewerPanel.style.width = `${newViewerWidthPercent}%`;

        // Refresh editor layout
        /* // CodeMirror might need refresh if layout changes drastically, but flex handles it well mostly.
           // However, calling editor.refresh() prevents cursor displacement issues.
           if (editor) editor.refresh();
        */
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.classList.remove('cursor-col-resize', 'select-none');
            if (editor) editor.refresh(); // Refresh CodeMirror to adjust to new size
        }
    });
}

async function saveCurrentProject() {
    const currentId = StorageService.getCurrentProjectId();
    if (!currentId || _isSaving) return;

    // Sync editor content - only mark dirty if content actually changed
    if (projectFiles[currentFile] && projectFiles[currentFile].type !== 'folder' && projectFiles[currentFile].type !== 'binary') {
        const editorContent = getEditorContent();
        if (projectFiles[currentFile].content !== editorContent) {
            projectFiles[currentFile].content = editorContent;
            _dirtyFiles.add(currentFile);
        }
    }

    // Skip save if nothing changed
    if (_dirtyFiles.size === 0 && _deletedFiles.size === 0 && !_offlineSavePending) {
        return;
    }

    // If offline, just mark pending
    if (!navigator.onLine) {
        _offlineSavePending = true;
        updateSaveStatus('offline');
        return;
    }

    _isSaving = true;
    updateSaveStatus('saving');

    try {
        // Build dirty files subset
        const dirtyFilesObj = {};
        for (const path of _dirtyFiles) {
            if (projectFiles[path]) {
                dirtyFilesObj[path] = projectFiles[path];
            }
        }
        const deletedPaths = [..._deletedFiles];

        const success = await StorageService.saveProjectDelta(
            currentId, _projectName, dirtyFilesObj, deletedPaths
        );

        if (success) {
            _dirtyFiles.clear();
            _deletedFiles.clear();
            _offlineSavePending = false;
            updateSaveStatus('saved');
        } else {
            _offlineSavePending = true;
            updateSaveStatus('error');
        }
    } catch (e) {
        console.error('Save failed:', e);
        _offlineSavePending = true;
        updateSaveStatus(!navigator.onLine ? 'offline' : 'error');
    } finally {
        _isSaving = false;
    }
}

// ========== EDITOR ==========
function initEditor() {
    const editorElement = document.getElementById('editor');

    editor = CodeMirror(editorElement, {
        value: defaultTemplate,
        mode: 'stex',
        theme: 'dracula',
        lineNumbers: true,
        lineWrapping: true,
        autofocus: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        styleActiveLine: true,
        matchBrackets: true,
    });

    // Listener para mudanças no editor
    editor.on('change', function () {
        updateLineCount();

        // Debounce para auto-compile e auto-save
        if (autoCompileEnabled) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                saveCurrentProject(); // Save before compile
                compile();
            }, 1000);
        } else {
            // Manual save debounce
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                saveCurrentProject();
            }, 2000);
        }
    });

    // Forward sync: duplo clique no editor -> vai para posição no PDF
    editor.on('dblclick', function (cm) {
        if (!currentSynctexData) return;

        setTimeout(() => {
            const cursor = cm.getCursor();
            forwardSyncToPdf(cursor.line + 1); // SyncTeX usa 1-indexed
        }, 50);
    });

    updateLineCount();
    console.log('✅ Editor inicializado');
}

function updateLineCount() {
    const lineCount = editor.lineCount();
    const lineCountElement = document.getElementById('lineCount');
    if (lineCountElement) {
        lineCountElement.textContent = `Linhas: ${lineCount}`;
    }
}

function getEditorContent() {
    return editor.getValue();
}

// ========== COMPILER ==========
// Prioridade: 1) LATEX_API_URL (produção/Render), 2) localhost, 3) API pública
const API_URL_CONFIGURED = (typeof LATEX_API_URL !== 'undefined' && LATEX_API_URL) ? LATEX_API_URL : null;
const API_URL_LOCAL = 'http://localhost:8080';
const API_URL_PUBLIC = 'https://latex.ytotech.com';

// Se temos URL configurada (Render), usa ela; senão tenta localhost
const API_URL_PRIMARY = API_URL_CONFIGURED || API_URL_LOCAL;
let isCompiling = false;
let compileAbortController = null;

async function compile() {
    // Cancela compilação anterior se ainda estiver em andamento
    if (compileAbortController) {
        compileAbortController.abort();
        compileAbortController = null;
    }

    if (isCompiling) {
        // A compilação anterior foi abortada, mas o finally ainda não executou.
        // Aguarda brevemente para o cleanup do ciclo anterior.
        isCompiling = false;
    }

    compileAbortController = new AbortController();

    const compileBtn = document.getElementById('compileBtn');
    const compileBtnText = document.getElementById('compileBtnText');
    const compileStatus = document.getElementById('compileStatus');
    const loadingSpinner = document.getElementById('loadingSpinner');
    // const errorConsole = document.getElementById('errorConsole'); // Removed
    // const errorText = document.getElementById('errorText'); // Removed

    isCompiling = true;
    compileBtn.disabled = true;
    compileBtnText.textContent = 'Compilando...';
    loadingSpinner.classList.remove('hidden');
    // errorConsole.classList.add('hidden'); // Removed

    try {
        compileStatus.textContent = 'Preparando código LaTeX... (20%)';

        // Salva o conteúdo atual do editor no arquivo atual
        const fileToSave = projectFiles[currentFile];
        if (fileToSave && fileToSave.type !== 'folder' && fileToSave.type !== 'binary') {
            fileToSave.content = getEditorContent();
        } else if (!fileToSave) {
            console.warn(`⚠️ Tentativa de salvar em arquivo inexistente: ${currentFile}`);
            // Tenta recuperar para main.tex se perder referência
            if (projectFiles['main.tex']) {
                currentFile = 'main.tex';
            }
        }

        compileStatus.textContent = 'Enviando para servidor... (40%)';

        // Prepara recursos: arquivo principal + arquivos auxiliares
        const resources = [];
        let mainContent = '';

        Object.keys(projectFiles).forEach(filename => {
            const file = projectFiles[filename];

            if (file.type === 'folder') return; // Ignora pastas

            if (file.type === 'main') {
                mainContent = file.content;
                resources.push({
                    main: true,
                    content: file.content
                });
            } else if (file.type === 'auxiliary') {
                resources.push({
                    path: filename,
                    content: file.content
                });
            } else if (file.type === 'binary') {
                const base64Content = file.content.split(',')[1];
                resources.push({
                    path: filename,
                    file: base64Content
                });
            }
        });

        // Detecta automaticamente se usa biblatex (requer biber) ou bibtex tradicional
        const usesBiblatex = /\\usepackage(\[.*?\])?\{biblatex\}/.test(mainContent);
        const bibCommand = usesBiblatex ? 'biber' : 'bibtex';

        // Log detalhado dos arquivos sendo enviados
        console.log(`📦 Enviando ${resources.length} arquivo(s) para compilação:`);
        resources.forEach((r, i) => {
            const name = r.main ? 'main.tex (principal)' : r.path;
            const type = r.file ? 'binary' : 'text';
            console.log(`   ${i + 1}. ${name} [${type}]`);
        });
        console.log(`📚 Bibliografia: usando ${bibCommand} (biblatex: ${usesBiblatex})`);

        // Detecta o nome do arquivo .bib usado no documento
        const bibMatch = mainContent.match(/\\bibliography\{([^}]+)\}/);
        const bibFileName = bibMatch ? bibMatch[1] : null;
        if (bibFileName) {
            console.log(`📄 Arquivo de bibliografia referenciado: ${bibFileName}.bib`);
            // Verifica se o arquivo existe nos resources
            const bibExists = resources.some(r => r.path === `${bibFileName}.bib` || r.path === bibFileName);
            if (!bibExists) {
                console.warn(`⚠️ Arquivo ${bibFileName}.bib não encontrado nos recursos enviados!`);
            }
        }

        const payload = {
            compiler: "pdflatex",
            resources: resources,
            options: {
                bibliography: {
                    command: bibCommand
                },
                response: {
                    log_files_on_failure: true
                }
            }
        };

        // Debug: mostra o payload sendo enviado
        console.log('📤 Payload enviado para API:', JSON.stringify(payload, null, 2).substring(0, 2000) + '...');

        compileStatus.textContent = 'Compilando LaTeX... (60%)';

        // Tenta servidor primário (Railway ou localhost), fallback para API pública
        let response;
        let usedServer = API_URL_PRIMARY;

        try {
            const serverType = API_URL_CONFIGURED ? 'remoto' : 'local';
            console.log(`🖥️ Tentando servidor ${serverType}: ${API_URL_PRIMARY}`);
            response = await fetch(API_URL_PRIMARY + '/builds/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: compileAbortController.signal
            });
        } catch (primaryError) {
            // Servidor primário não disponível, usa API pública (sem SyncTeX)
            console.log(`⚠️ Servidor primário indisponível, usando API pública: ${API_URL_PUBLIC}`);
            console.log(`⚠️ Nota: API pública não suporta SyncTeX`);
            usedServer = API_URL_PUBLIC;
            response = await fetch(API_URL_PUBLIC + '/builds/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: compileAbortController.signal
            });
        }

        console.log(`✅ Usando servidor: ${usedServer}`);

        compileStatus.textContent = 'Gerando PDF... (80%)';

        const contentType = response.headers.get('content-type') || '';

        // Servidor local retorna JSON com PDF + SyncTeX em base64
        if (response.ok && contentType.includes('json')) {
            const data = await response.json();

            if (data.pdf) {
                // Decodifica PDF de base64
                const pdfBytes = Uint8Array.from(atob(data.pdf), c => c.charCodeAt(0));
                currentPdfData = pdfBytes;

                // Decodifica e parseia SyncTeX se disponível
                if (data.synctex && typeof pako !== 'undefined' && typeof SyncTexParser !== 'undefined') {
                    try {
                        const synctexGz = Uint8Array.from(atob(data.synctex), c => c.charCodeAt(0));
                        const synctexText = pako.inflate(synctexGz, { to: 'string' });
                        currentSynctexData = SyncTexParser.parse(synctexText);
                        console.log('✅ SyncTeX carregado:', Object.keys(currentSynctexData.blockNumberLine));
                    } catch (syncErr) {
                        console.warn('⚠️ Erro ao parsear SyncTeX:', syncErr);
                        currentSynctexData = null;
                    }
                } else {
                    currentSynctexData = null;
                }

                compileStatus.textContent = 'PDF gerado com sucesso! (100%)';

                await loadPDF(pdfBytes);
                document.getElementById('downloadBtn').disabled = false;

                // Detecta warnings no código-fonte
                var sourceWarnings = detectSourceWarnings(projectFiles);
                if (sourceWarnings.length > 0) {
                    renderErrorLog(sourceWarnings);
                    showToast('PDF gerado com ' + sourceWarnings.length + ' aviso(s)', 'warning');
                    var toggleBtn = document.getElementById('toggleLogsBtn');
                    toggleBtn.classList.add('text-yellow-400');
                    toggleBtn.title = sourceWarnings.length + ' aviso(s) detectado(s)';
                } else {
                    const syncStatus = currentSynctexData ? ' (SyncTeX ativo)' : '';
                    showToast('Compilação concluída!' + syncStatus, 'success');
                    var toggleBtn = document.getElementById('toggleLogsBtn');
                    toggleBtn.classList.remove('text-yellow-400', 'text-red-400');
                    toggleBtn.title = 'Ver Logs';
                }

                // Switch to PDF view on success
                switchViewerMode('pdf');
            } else {
                // JSON de erro
                throw new Error(data.error || data.logs || JSON.stringify(data));
            }
        }
        // Fallback: API pública retorna PDF diretamente
        else if (response.ok && contentType.includes('pdf')) {
            const pdfData = await response.arrayBuffer();
            const pdfArray = new Uint8Array(pdfData);
            currentPdfData = new Uint8Array(pdfArray);
            currentSynctexData = null; // API pública não retorna SyncTeX

            compileStatus.textContent = 'PDF gerado com sucesso! (100%)';

            await loadPDF(new Uint8Array(pdfArray));
            document.getElementById('downloadBtn').disabled = false;

            // Detecta warnings no código-fonte (a API não retorna logs no sucesso)
            var sourceWarnings = detectSourceWarnings(projectFiles);
            if (sourceWarnings.length > 0) {
                renderErrorLog(sourceWarnings);
                showToast('PDF gerado com ' + sourceWarnings.length + ' aviso(s)', 'warning');
                // Mostra badge de aviso no botão de logs
                var toggleBtn = document.getElementById('toggleLogsBtn');
                toggleBtn.classList.add('text-yellow-400');
                toggleBtn.title = sourceWarnings.length + ' aviso(s) detectado(s)';
            } else {
                showToast('Compilação concluída! (sem SyncTeX)', 'success');
                var toggleBtn = document.getElementById('toggleLogsBtn');
                toggleBtn.classList.remove('text-yellow-400', 'text-red-400');
                toggleBtn.title = 'Ver Logs';
            }

            // Switch to PDF view on success
            switchViewerMode('pdf');
        } else {
            let logContent = '';

            // Verifica se a resposta é JSON antes de tentar parsear
            const errorContentType = response.headers.get('content-type') || '';
            if (errorContentType.includes('json')) {
                try {
                    const errorData = await response.json();
                    console.log('API error response:', errorData);

                    // Prefer full log file content if available, otherwise stdout logs
                    if (errorData.log_files) {
                        logContent = Object.values(errorData.log_files).join('\n');
                    }

                    if (!logContent && errorData.logs) {
                        logContent = typeof errorData.logs === 'string'
                            ? errorData.logs
                            : JSON.stringify(errorData.logs, null, 2);
                    }

                    if (!logContent && errorData.error) {
                        logContent = errorData.error;
                    }

                    if (!logContent) {
                        logContent = JSON.stringify(errorData, null, 2);
                    }
                } catch (jsonError) {
                    logContent = `Erro ao processar resposta do servidor (HTTP ${response.status})`;
                }
            } else {
                // Resposta não-JSON (ex: HTML de erro 502/503 do proxy)
                const textBody = await response.text();
                logContent = `Servidor retornou HTTP ${response.status}.\n${textBody.substring(0, 500)}`;
            }

            throw new Error(logContent);
        }

    } catch (error) {
        // Ignora erros de cancelamento (compilação substituída por uma nova)
        if (error.name === 'AbortError') {
            console.log('⏹️ Compilação anterior cancelada');
            return;
        }

        console.error('❌ Erro na compilação:', error);

        if (error.message.includes('Failed to fetch')) {
            compileStatus.textContent = 'Erro: Servidor LaTeX offline';
            renderErrorLog([{
                type: 'error',
                message: 'O servidor LaTeX não está rodando ou é inacessível.\n' + error.message,
                line: null
            }]);
        } else {
            compileStatus.textContent = 'Erro na compilação';

            const logEntries = parseLatexLog(error.message);
            renderErrorLog(logEntries);
            highlightErrors(logEntries);
        }

        // Sempre alterna para a aba de logs em caso de erro
        switchViewerMode('logs');
        var toggleBtn = document.getElementById('toggleLogsBtn');
        toggleBtn.classList.add('text-red-400');
        toggleBtn.classList.remove('text-yellow-400');
        toggleBtn.title = 'Erros na compilação';

        showToast('Erro na compilação', 'error');
    } finally {
        isCompiling = false;
        compileAbortController = null;
        compileBtn.disabled = false;
        compileBtnText.textContent = 'Compilar';
        loadingSpinner.classList.add('hidden');
    }
}

// ========== LOG PARSING & ERROR REPORTING ==========

function parseLatexLog(logText) {
    const entries = [];
    const lines = logText.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Detecta Erro LaTeX (! Error)
        if (line.startsWith('! ')) {
            const message = line.substring(2);
            let lineNum = null;

            // Tenta achar o número da linha nas linhas seguintes (padrão l.123)
            let j = i + 1;
            while (j < lines.length && j < i + 5) {
                const nextLine = lines[j];
                const lineMatch = nextLine.match(/^l\.(\d+)/);
                if (lineMatch) {
                    lineNum = parseInt(lineMatch[1]);
                    break;
                }
                j++;
            }

            entries.push({
                type: 'error',
                message: message,
                line: lineNum,
                raw: line
            });
        }
        // Detecta Package/Class errors: Ex: "Package biblatex Error: ..."
        else if (/^(Package|Class)\s+\S+\s+Error/.test(line)) {
            const lineMatch = line.match(/input line (\d+)/);
            const lineNum = lineMatch ? parseInt(lineMatch[1]) : null;
            entries.push({
                type: 'error',
                message: line,
                line: lineNum,
                raw: line
            });
        }
        // Detecta LaTeX Warning
        else if (line.includes('LaTeX Warning:')) {
            const lineMatch = line.match(/input line (\d+)\.?$/);
            const lineNum = lineMatch ? parseInt(lineMatch[1]) : null;
            entries.push({
                type: 'warning',
                message: line,
                line: lineNum,
                raw: line
            });
        }
        // Detecta Package warnings: Ex: "Package natbib Warning: ..."
        else if (/^Package\s+\S+\s+Warning/.test(line)) {
            const lineMatch = line.match(/input line (\d+)/);
            const lineNum = lineMatch ? parseInt(lineMatch[1]) : null;
            entries.push({
                type: 'warning',
                message: line,
                line: lineNum,
                raw: line
            });
        }
        // Detecta erros de arquivo não encontrado
        else if (/File .+ not found/i.test(line) || /No file .+\./i.test(line)) {
            entries.push({
                type: 'error',
                message: line.trim(),
                line: null,
                raw: line
            });
        }

        i++;
    }

    // Se nenhum erro parseado mas temos texto, retorna como erro genérico
    if (entries.length === 0 && logText.trim()) {
        entries.push({
            type: 'error',
            message: logText.substring(0, 500),
            line: null
        });
    }

    return entries;
}

/**
 * Detecta potenciais problemas no código-fonte LaTeX (análise client-side).
 * Útil porque a API não retorna logs quando a compilação gera PDF com sucesso.
 */
function detectSourceWarnings(files) {
    const warnings = [];
    const allLabels = new Set();
    const allRefs = [];
    const allIncludes = [];
    const allBibResources = [];
    const fileNames = new Set(Object.keys(files));

    // Primeira passagem: coleta labels, refs, includes de todos os arquivos
    Object.entries(files).forEach(function(entry) {
        var filename = entry[0];
        var file = entry[1];
        if (file.type === 'folder' || file.type === 'binary') return;
        var content = file.content || '';

        // Coleta \label{...}
        var labelRe = /\\label\{([^}]+)\}/g;
        var m;
        while ((m = labelRe.exec(content)) !== null) {
            allLabels.add(m[1]);
        }

        // Coleta \ref{...}, \pageref{...}, \eqref{...}, \autoref{...}, \cref{...}
        var refRe = /\\(?:ref|pageref|eqref|autoref|cref|Cref)\{([^}]+)\}/g;
        while ((m = refRe.exec(content)) !== null) {
            // Encontra a linha do match
            var beforeMatch = content.substring(0, m.index);
            var lineNum = (beforeMatch.match(/\n/g) || []).length + 1;
            allRefs.push({ label: m[1], file: filename, line: lineNum });
        }

        // Coleta \includegraphics{...}
        var imgRe = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g;
        while ((m = imgRe.exec(content)) !== null) {
            var beforeImg = content.substring(0, m.index);
            var imgLine = (beforeImg.match(/\n/g) || []).length + 1;
            allIncludes.push({ path: m[1], file: filename, line: imgLine });
        }

        // Coleta \bibliography{...} e \addbibresource{...}
        var bibRe = /\\(?:bibliography|addbibresource)\{([^}]+)\}/g;
        while ((m = bibRe.exec(content)) !== null) {
            allBibResources.push({ path: m[1], file: filename });
        }
    });

    // Verifica refs sem label correspondente
    allRefs.forEach(function(ref) {
        if (!allLabels.has(ref.label)) {
            warnings.push({
                type: 'warning',
                message: 'Referência \\ref{' + ref.label + '} sem \\label{' + ref.label + '} correspondente — vai aparecer como "??" no PDF',
                line: ref.file === 'main.tex' ? ref.line : null,
                raw: ref.file + ':' + ref.line
            });
        }
    });

    // Verifica imagens referenciadas que não existem nos arquivos do projeto
    allIncludes.forEach(function(inc) {
        var imgPath = inc.path;
        // Tenta variações comuns (com e sem extensão)
        var found = fileNames.has(imgPath);
        if (!found) {
            var extensions = ['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg'];
            for (var e = 0; e < extensions.length; e++) {
                if (fileNames.has(imgPath + extensions[e])) { found = true; break; }
            }
        }
        if (!found) {
            warnings.push({
                type: 'warning',
                message: 'Imagem "' + imgPath + '" não encontrada nos arquivos do projeto — pode gerar erro ou imagem ausente no PDF',
                line: inc.file === 'main.tex' ? inc.line : null,
                raw: '\\includegraphics{' + imgPath + '} em ' + inc.file
            });
        }
    });

    // Verifica arquivos .bib referenciados
    allBibResources.forEach(function(bib) {
        var bibPath = bib.path;
        if (!bibPath.endsWith('.bib')) bibPath += '.bib';
        if (!fileNames.has(bibPath)) {
            warnings.push({
                type: 'warning',
                message: 'Arquivo de bibliografia "' + bib.path + '" não encontrado nos arquivos do projeto',
                line: null,
                raw: bib.file
            });
        }
    });

    return warnings;
}

function renderErrorLog(entries) {
    const logsContent = document.getElementById('logsContent');
    logsContent.innerHTML = '';

    // Header
    if (entries.length > 0) {
        const errorCount = entries.filter(e => e.type === 'error').length;
        const warningCount = entries.filter(e => e.type === 'warning').length;
        const header = document.createElement('div');
        header.className = 'mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400';
        header.textContent = `${errorCount} Erros, ${warningCount} Avisos`;
        logsContent.appendChild(header);
    }

    const listContainer = document.createElement('div');
    listContainer.className = 'space-y-3';

    entries.forEach((entry) => {
        const iconInfo = entry.type === 'error'
            ? { color: 'text-red-400', border: 'border-red-900', label: 'Erro' }
            : { color: 'text-yellow-400', border: 'border-yellow-900', label: 'Aviso' };

        const clickableClass = entry.line ? 'cursor-pointer hover:bg-gray-800' : '';

        const card = document.createElement('div');
        card.className = `flex items-start p-3 rounded bg-gray-800 border-l-4 ${iconInfo.border} ${clickableClass}`;

        if (entry.line) {
            card.addEventListener('click', () => goToLine(entry.line));
        }

        const inner = document.createElement('div');
        inner.className = 'flex-1';

        const topRow = document.createElement('div');
        topRow.className = 'flex justify-between items-center mb-1';

        const labelSpan = document.createElement('span');
        labelSpan.className = `text-xs font-bold ${iconInfo.color} uppercase`;
        labelSpan.textContent = iconInfo.label;
        topRow.appendChild(labelSpan);

        if (entry.line) {
            const lineSpan = document.createElement('span');
            lineSpan.className = 'text-xs text-gray-500 font-mono';
            lineSpan.textContent = `Linha ${entry.line}`;
            topRow.appendChild(lineSpan);
        }

        const msgP = document.createElement('p');
        msgP.className = 'text-sm text-gray-300 font-mono whitespace-pre-wrap leading-relaxed';
        msgP.textContent = entry.message;

        const rawP = document.createElement('p');
        rawP.className = 'text-xs text-gray-600 mt-2 font-mono truncate';
        rawP.textContent = entry.raw || '';

        inner.appendChild(topRow);
        inner.appendChild(msgP);
        inner.appendChild(rawP);
        card.appendChild(inner);
        listContainer.appendChild(card);
    });

    logsContent.appendChild(listContainer);
}

function switchViewerMode(mode) {
    const pdfContainer = document.getElementById('pdfViewerContainer');
    const logsContainer = document.getElementById('logsContainer');
    const toggleBtn = document.getElementById('toggleLogsBtn');

    if (mode === 'pdf') {
        pdfContainer.classList.remove('hidden');
        logsContainer.classList.add('hidden');
        // Update icon to "Bug" (to go to logs)
        toggleBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
        toggleBtn.title = "Ver Logs";
        toggleBtn.classList.remove('text-red-400');
    } else {
        pdfContainer.classList.add('hidden');
        logsContainer.classList.remove('hidden');
        // Update icon to "Document" (to go to pdf)
        toggleBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>';
        toggleBtn.title = "Ver PDF";
        toggleBtn.classList.add('text-red-400'); // Highlight active
    }
}

// Markers handles
let errorMarkers = [];

function highlightErrors(entries) {
    if (!editor) return;

    // Limpa marcadores anteriores
    errorMarkers.forEach(marker => marker.clear());
    errorMarkers = [];
    editor.clearGutter('CodeMirror-linenumbers'); // Se usarmos gutters customizados

    entries.forEach(entry => {
        if (entry.line) {
            // CodeMirror é 0-indexed
            const lineIndex = entry.line - 1;

            // Adiciona classe na linha (background color)
            // Precisamos definir CSS para .line-error e .line-warning
            const className = entry.type === 'error' ? 'line-error' : 'line-warning';
            // editor.addLineClass(lineIndex, 'background', className);

            // Adiciona widget abaixo da linha (opcional) ou gutter marker
            // Vamos usar gutter marker se possível ou apenas TextMarker

            // Simples: MarkText para sublinhado ou background
            const marker = editor.markText(
                { line: lineIndex, ch: 0 },
                { line: lineIndex, ch: 1000 }, // Até o fim da linha
                { className: className, title: entry.message }
            );
            errorMarkers.push(marker);
        }
    });
}

function goToLine(line) {
    if (!editor) return;
    const lineIndex = line - 1;
    editor.setCursor(lineIndex, 0);
    editor.focus();
    // Centraliza
    const coords = editor.charCoords({ line: lineIndex, ch: 0 }, "local");
    editor.scrollTo(null, coords.top);
}

// ========== PDF VIEWER ==========
function initViewer() {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    console.log('✅ Visualizador PDF inicializado');
}

let pdfDoc = null;
let currentPage = 1;
let scale = 1.5;

async function loadPDF(pdfData) {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        pdfDoc = await loadingTask.promise;

        document.getElementById('pdfPlaceholder').classList.add('hidden');
        const pagesContainer = document.getElementById('pdfPagesContainer');
        pagesContainer.classList.remove('hidden');
        pagesContainer.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            await renderPage(pageNum, pagesContainer);
        }

        // Configura reverse sync (Ctrl+click no PDF)
        setupReverseSyncHandler();

        showToast(`PDF carregado: ${pdfDoc.numPages} página(s)`, 'success');
    } catch (error) {
        console.error('❌ Erro ao carregar PDF:', error);
        showToast('Erro ao carregar PDF', 'error');
    }
}

async function renderPage(pageNum, container) {
    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale });

        const canvas = document.createElement('canvas');
        canvas.className = 'mx-auto shadow-2xl rounded-lg';
        canvas.dataset.pageNum = pageNum;
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'relative pdf-page-wrapper';
        pageWrapper.dataset.pageNum = pageNum;

        pageWrapper.appendChild(canvas);
        container.appendChild(pageWrapper);

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;
        currentPage = pageNum;
    } catch (error) {
        console.error(`❌ Erro ao renderizar página ${pageNum}:`, error);
    }
}

// ========== SYNCTEX SYNC ==========

/**
 * Forward sync: vai da linha do editor para a posição correspondente no PDF
 * @param {number} lineNumber - Número da linha (1-indexed)
 */
function forwardSyncToPdf(lineNumber) {
    if (!currentSynctexData || !pdfDoc) {
        console.log('SyncTeX não disponível');
        return;
    }

    const fileName = currentFile || 'main.tex';
    const blocks = SyncTexParser.forwardSync(currentSynctexData, fileName, lineNumber);

    if (!blocks || blocks.length === 0) {
        return;
    }

    // Usa o primeiro bloco encontrado
    const block = blocks[0];
    const pageNum = block.page || 1;

    // Encontra o canvas da página
    const pagesContainer = document.getElementById('pdfPagesContainer');
    const pageWrapper = pagesContainer.querySelector(`[data-page-num="${pageNum}"]`);

    if (!pageWrapper) {
        console.log(`Página ${pageNum} não encontrada`);
        return;
    }

    const canvas = pageWrapper.querySelector('canvas');
    if (!canvas) return;

    // Converte coordenadas SyncTeX para canvas
    const coords = SyncTexParser.synctexToCanvas(currentSynctexData, block, canvas.height, scale);

    // Scroll para a posição
    const container = document.getElementById('pdfViewerContainer');
    const scrollY = pageWrapper.offsetTop + coords.y - container.clientHeight / 3;

    container.scrollTo({
        top: Math.max(0, scrollY),
        behavior: 'smooth'
    });

    // Garante que estamos vendo o PDF
    switchViewerMode('pdf');
}

/**
 * Reverse sync: vai da posição no PDF para a linha correspondente no editor
 * @param {number} pageNum - Número da página
 * @param {number} canvasX - Coordenada X no canvas
 * @param {number} canvasY - Coordenada Y no canvas
 * @param {HTMLCanvasElement} canvas - Elemento canvas
 */
function reverseSyncToEditor(pageNum, canvasX, canvasY, canvas) {
    if (!currentSynctexData) {
        showToast('SyncTeX não disponível', 'warning');
        return;
    }

    // Converte coordenadas do canvas para SyncTeX
    const synctexCoords = SyncTexParser.canvasToSynctex(
        currentSynctexData,
        canvasX,
        canvasY,
        canvas.height,
        scale
    );

    // Busca a linha correspondente
    const result = SyncTexParser.reverseSync(
        currentSynctexData,
        pageNum,
        synctexCoords.x,
        synctexCoords.y
    );

    if (!result) {
        showToast('Posição não mapeada', 'info');
        return;
    }

    // Se o arquivo é diferente do atual, troca
    if (result.file !== currentFile && projectFiles[result.file]) {
        selectFile(result.file);
    }

    // Vai para a linha no editor
    goToLine(result.line);

    console.log(`🔗 Reverse sync: página ${pageNum} (${Math.round(canvasX)}, ${Math.round(canvasY)}) → ${result.file}:${result.line}`);
}

/**
 * Configura o handler de reverse sync (Ctrl+click no PDF)
 */
function setupReverseSyncHandler() {
    const pdfContainer = document.getElementById('pdfViewerContainer');

    // Ctrl+click para reverse sync
    pdfContainer.addEventListener('click', function(event) {
        if (!event.ctrlKey) return;
        if (!currentSynctexData) {
            showToast('SyncTeX não disponível - compile com servidor local', 'warning');
            return;
        }

        // Encontra qual página foi clicada
        const pageWrapper = event.target.closest('.pdf-page-wrapper');
        if (!pageWrapper) return;

        const canvas = pageWrapper.querySelector('canvas');
        if (!canvas) return;

        const pageNum = parseInt(pageWrapper.dataset.pageNum);

        // Calcula posição do clique no canvas
        const rect = canvas.getBoundingClientRect();
        const canvasX = (event.clientX - rect.left) * (canvas.width / rect.width);
        const canvasY = (event.clientY - rect.top) * (canvas.height / rect.height);

        reverseSyncToEditor(pageNum, canvasX, canvasY, canvas);
    });

    // Muda cursor quando Ctrl pressionado sobre o PDF
    pdfContainer.addEventListener('mousemove', function(event) {
        const isOverCanvas = event.target.tagName === 'CANVAS' ||
                            event.target.closest('.pdf-page-wrapper');

        if (event.ctrlKey && currentSynctexData && isOverCanvas) {
            pdfContainer.style.cursor = 'crosshair';
        } else {
            pdfContainer.style.cursor = 'default';
        }
    });

    // Remove cursor especial quando Ctrl solta
    document.addEventListener('keyup', function(event) {
        if (event.key === 'Control') {
            pdfContainer.style.cursor = 'default';
        }
    });
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
    document.getElementById('compileBtn').addEventListener('click', compile);

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => AuthService.signOut());

    document.getElementById('toggleLogsBtn').addEventListener('click', function () {
        const logsContainer = document.getElementById('logsContainer');
        const isLogsVisible = !logsContainer.classList.contains('hidden');
        switchViewerMode(isLogsVisible ? 'pdf' : 'logs');
    });

    document.getElementById('autoCompile').addEventListener('change', function (e) {
        autoCompileEnabled = e.target.checked;
        showToast(`Auto-compilação ${autoCompileEnabled ? 'ativada' : 'desativada'}`, 'info');

        // Compile immediately when auto-compile is enabled
        if (autoCompileEnabled) {
            compile();
        }
    });

    document.getElementById('downloadBtn').addEventListener('click', downloadPDF);

    document.getElementById('toggleFilesBtn').addEventListener('click', toggleFilesPanel);

    document.getElementById('addFileBtn').addEventListener('click', function () {
        // Upload para raiz por padrão
        document.getElementById('fileUploadInput').dataset.targetPath = '';
        document.getElementById('fileUploadInput').click();
    });

    const addFolderBtn = document.getElementById('addFolderBtn');
    if (addFolderBtn) {
        addFolderBtn.addEventListener('click', () => createFolder());
    }

    document.getElementById('fileUploadInput').addEventListener('change', function (e) {
        if (e.target.files.length > 0) {
            // Pega o targetPath salvo (padrão é vazio/raiz)
            const targetPath = e.target.dataset.targetPath || '';
            handleFileUpload(e.target.files, targetPath);
            e.target.value = '';
            e.target.dataset.targetPath = ''; // Reset
        }
    });

    // ZIP Upload
    const uploadZipBtn = document.getElementById('uploadZipBtn');
    if (uploadZipBtn) {
        uploadZipBtn.addEventListener('click', function () {
            document.getElementById('zipUploadInput').click();
        });
    }

    document.getElementById('zipUploadInput').addEventListener('change', function (e) {
        if (e.target.files.length > 0) {
            handleZipUpload(e.target.files[0]);
            e.target.value = '';
        }
    });

    document.addEventListener('click', function (e) {
        // Fecha menu se clicar fora
        const menu = document.getElementById('actionMenu');
        if (!menu.contains(e.target) && !e.target.closest('.file-menu-btn')) {
            hideActionMenu();
        }
    });

    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            compile();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            toggleFilesPanel();
        }
    });

    // Offline/Online detection
    window.addEventListener('online', () => {
        console.log('Conexao restaurada. Verificando saves pendentes...');
        if (_offlineSavePending) {
            Object.keys(projectFiles).forEach(path => _dirtyFiles.add(path));
            saveCurrentProject();
        }
    });

    window.addEventListener('offline', () => {
        console.log('Conexao perdida.');
        updateSaveStatus('offline');
    });
}

// ========== DOWNLOAD PDF ==========
function downloadPDF() {
    if (!currentPdfData) {
        showToast('Nenhum PDF disponível', 'error');
        return;
    }
    try {
        const blob = new Blob([currentPdfData], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const a = document.createElement('a');
        a.href = url;
        a.download = `latex-document-${timestamp}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`PDF baixado`, 'success');
    } catch (error) {
        showToast('Erro ao baixar PDF', 'error');
    }
}

// ========== FILE SYSTEM ==========
async function initFileSystem() {
    const currentId = StorageService.getCurrentProjectId();
    const projectData = currentId ? await StorageService.loadProject(currentId) : null;

    if (projectData) {
        projectFiles = projectData.files;
        currentFile = projectData.currentFile;
        if (projectFiles[currentFile] && projectFiles[currentFile].content) {
            editor.setValue(projectFiles[currentFile].content);
        }
    } else {
        projectFiles['main.tex'].content = defaultTemplate;
    }

    // Reset dirty tracking after load
    _dirtyFiles = new Set();
    _deletedFiles = new Set();
    _offlineSavePending = false;

    // Cache project name
    const projects = await StorageService.listProjects();
    const meta = projects.find(p => p.id === currentId);
    if (meta) _projectName = meta.name;

    renderFileList();
    console.log('Sistema de arquivos inicializado');
}

function toggleFilesPanel() {
    const panel = document.getElementById('filesPanel');
    panel.classList.toggle('hidden');
}

function createFolder(parentPath = '') {
    const folderName = prompt("Nome da nova pasta:", "Nova Pasta");
    if (!folderName) return;

    if (folderName.includes('/') || folderName.includes('\\')) {
        showToast('Nome inválido', 'error');
        return;
    }

    const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;

    if (projectFiles[fullPath]) {
        showToast('Pasta já existe', 'error');
        return;
    }

    projectFiles[fullPath] = { type: 'folder' };
    _dirtyFiles.add(fullPath);
    renderFileList();
    showToast(`Pasta '${folderName}' criada!`, 'success');
}

function addFile(filename, content, type = 'auxiliary') {
    if (projectFiles[filename]) {
        // Se já existe, pergunta se quer sobrescrever (exceto main se for protegido)
        if (filename === 'main.tex') {
            // Ignora silenciosamente se for inicialização, mas alerta upload
            // Por simplificação: sobrescreve
        }
        // showToast(`Substituindo ${filename}...`, 'info');
    }

    projectFiles[filename] = {
        content: content,
        type: type
    };
    _dirtyFiles.add(filename);

    renderFileList();
    showToast(`Arquivo salvo: ${filename.split('/').pop()}`, 'success');
}

function removeItem(path) {
    if (path === 'main.tex') {
        showToast('Não é possível remover o arquivo principal!', 'error');
        return;
    }

    const msg = projectFiles[path].type === 'folder'
        ? `Excluir pasta '${path}' e todo o conteúdo?`
        : `Excluir arquivo '${path}'?`;

    if (!confirm(msg)) return;

    if (projectFiles[path].type === 'folder') {
        const prefix = path + '/';
        Object.keys(projectFiles).forEach(key => {
            if (key.startsWith(prefix) || key === path) {
                _deletedFiles.add(key);
                _dirtyFiles.delete(key);
                delete projectFiles[key];
            }
        });
    } else {
        _deletedFiles.add(path);
        _dirtyFiles.delete(path);
        delete projectFiles[path];
    }

    // Reset editor se o arquivo atual sumiu
    if (currentFile === path || currentFile.startsWith(path + '/')) {
        currentFile = 'main.tex';
        editor.setValue(projectFiles['main.tex'].content);
    }

    renderFileList();
    showToast('Removido com sucesso', 'success');
}

function renameItem(path) {
    if (path === 'main.tex') {
        showToast('Não é possível renomear o arquivo principal!', 'error');
        return;
    }

    const currentName = path.split('/').pop();
    const newName = prompt("Novo nome:", currentName);

    if (!newName || newName === currentName) return;
    if (newName.includes('/') || newName.includes('\\')) {
        showToast('Nome inválido', 'error');
        return;
    }

    // Calcula novo path base
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    if (projectFiles[newPath]) {
        showToast('Já existe um arquivo/pasta com este nome', 'error');
        return;
    }

    // Renomear
    if (projectFiles[path].type === 'folder') {
        const oldPrefix = path + '/';
        const newPrefix = newPath + '/';

        projectFiles[newPath] = projectFiles[path];
        _deletedFiles.add(path);
        _dirtyFiles.add(newPath);
        delete projectFiles[path];

        Object.keys(projectFiles).forEach(key => {
            if (key.startsWith(oldPrefix)) {
                const suffix = key.substring(oldPrefix.length);
                const childNewPath = newPrefix + suffix;
                projectFiles[childNewPath] = projectFiles[key];
                _deletedFiles.add(key);
                _dirtyFiles.add(childNewPath);
                delete projectFiles[key];
            }
        });
    } else {
        projectFiles[newPath] = projectFiles[path];
        _deletedFiles.add(path);
        _dirtyFiles.add(newPath);
        delete projectFiles[path];

        if (currentFile === path) {
            currentFile = newPath;
        }
    }

    renderFileList();
    showToast('Renomeado com sucesso', 'success');
}

function downloadItem(path) {
    const file = projectFiles[path];
    if (!file || file.type === 'folder') return;

    let blob;
    if (file.type === 'binary') {
        // Base64 to Blob
        const byteCharacters = atob(file.content.split(',')[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        blob = new Blob([byteArray]);
    } else {
        blob = new Blob([file.content], { type: 'text/plain' });
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function selectFile(filename) {
    if (!projectFiles[filename]) return;
    if (projectFiles[filename].type === 'folder') return;

    if (projectFiles[filename].type === 'binary') {
        showToast('Arquivo binário (não editável)', 'info');
        currentFile = filename;
        renderFileList();
        return;
    }

    // Salva conteúdo anterior se era editável
    const prevFile = projectFiles[currentFile];
    if (prevFile && prevFile.type !== 'folder' && prevFile.type !== 'binary') {
        const editorContent = getEditorContent();
        if (prevFile.content !== editorContent) {
            prevFile.content = editorContent;
            _dirtyFiles.add(currentFile);
        }
    }

    currentFile = filename;
    editor.setValue(projectFiles[filename].content);
    renderFileList();
}

// ========== RENDERIZAÇÃO DA LISTA DE ARQUIVOS ==========
function renderFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    const tree = { name: "", type: "root", children: {} };

    Object.keys(projectFiles).sort().forEach(path => {
        const parts = path.split('/');
        let currentLevel = tree;
        parts.forEach((part, index) => {
            if (!currentLevel.children[part]) {
                if (index === parts.length - 1) {
                    currentLevel.children[part] = {
                        name: part,
                        path: path,
                        ...projectFiles[path],
                        children: {}
                    };
                } else {
                    currentLevel.children[part] = {
                        name: part,
                        path: parts.slice(0, index + 1).join('/'),
                        type: 'folder',
                        children: {}
                    };
                }
            }
            currentLevel = currentLevel.children[part];
        });
    });

    function renderNode(node, level = 0) {
        const childrenKeys = Object.keys(node.children).sort((a, b) => {
            const nodeA = node.children[a];
            const nodeB = node.children[b];
            if (nodeA.type === 'folder' && nodeB.type !== 'folder') return -1;
            if (nodeA.type !== 'folder' && nodeB.type === 'folder') return 1;
            return a.localeCompare(b);
        });

        childrenKeys.forEach(key => {
            const child = node.children[key];
            const isFolder = child.type === 'folder';
            const isActive = child.path === currentFile;
            const isMain = child.type === 'main';

            const itemDiv = document.createElement('div');
            const paddingLeft = level * 12 + 8;

            itemDiv.className = `file-item flex items-center space-x-2 p-2 rounded mb-1 cursor-pointer transition-colors ${isActive ? 'bg-gray-800' : 'hover:bg-gray-700'} text-gray-300 select-none group relative`;
            itemDiv.style.paddingLeft = `${paddingLeft}px`;
            itemDiv.dataset.path = child.path;

            let iconSvg = '';
            if (isFolder) {
                iconSvg = `<svg class="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                </svg>`;
            } else {
                const ext = child.name.split('.').pop();
                iconSvg = getFileIcon(ext);
            }

            itemDiv.innerHTML = `
                ${iconSvg}
                <span class="text-sm flex-1 truncate">${escapeHtml(child.name)}</span>
                ${isMain ? '<span class="text-xs text-latex-green mr-2">✓</span>' : ''}

                <!-- Menu Button (visible on hover or active) -->
                <button class="file-menu-btn opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-opacity">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path>
                    </svg>
                </button>
            `;

            // Menu button via addEventListener (avoids inline onclick with unsanitized path)
            const menuBtn = itemDiv.querySelector('.file-menu-btn');
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showActionMenu(e, child.path);
            });

            itemDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isFolder) selectFile(child.path);
            });

            // Right click fallback
            itemDiv.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showActionMenu(e, child.path);
            });

            fileList.appendChild(itemDiv);

            if (isFolder) {
                renderNode(child, level + 1);
            }
        });
    }

    renderNode(tree);
}

// ========== ACTION MENU ==========
function showActionMenu(event, path) {
    const menu = document.getElementById('actionMenu');
    actionMenuTarget = path;
    const file = projectFiles[path];
    const isFolder = file.type === 'folder';
    const isMain = file.type === 'main';

    let optionsInfo = [];

    // Define options
    if (isFolder) {
        optionsInfo.push({ label: 'Nova Pasta', icon: 'M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z', action: 'CREATE_FOLDER' });
        optionsInfo.push({ label: 'Upload Arquivo', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12', action: 'UPLOAD' });
        optionsInfo.push({ separator: true });
    } else {
        optionsInfo.push({ label: 'Download', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4', action: 'DOWNLOAD' });
    }

    // Common
    if (!isMain) {
        optionsInfo.push({ label: 'Renomear', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', action: 'RENAME' });
        optionsInfo.push({ label: 'Excluir', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', action: 'DELETE', color: 'text-red-400' });
    }

    // Build menu DOM (avoid inline onclick)
    menu.innerHTML = '';
    optionsInfo.forEach(opt => {
        if (opt.separator) {
            const sep = document.createElement('div');
            sep.className = 'border-t border-gray-700 my-1';
            menu.appendChild(sep);
            return;
        }
        const btn = document.createElement('button');
        btn.className = `w-full text-left px-4 py-2 text-sm ${opt.color || 'text-gray-300'} hover:bg-gray-700 hover:text-white transition-colors flex items-center space-x-2`;
        btn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${opt.icon}"></path>
            </svg>
            <span>${escapeHtml(opt.label)}</span>
        `;
        btn.addEventListener('click', () => handleMenuAction(opt.action));
        menu.appendChild(btn);
    });

    // Trigger calculation
    const rect = event.target.getBoundingClientRect ? event.target.getBoundingClientRect() : { left: event.clientX, top: event.clientY, height: 0 };
    let x = rect.left + rect.width; // Right of button
    let y = rect.top;

    // Adjust if click (context menu) vs button
    if (event.clientX) {
        x = event.clientX;
        y = event.clientY;
    }

    // Boundary check (simple)
    if (x + 160 > window.innerWidth) x -= 160;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');
}

function hideActionMenu() {
    const menu = document.getElementById('actionMenu');
    menu.classList.add('hidden');
    actionMenuTarget = null;
}

function handleMenuAction(action) {
    const path = actionMenuTarget;
    hideActionMenu();

    switch (action) {
        case 'CREATE_FOLDER':
            createFolder(path);
            break;
        case 'UPLOAD':
            document.getElementById('fileUploadInput').dataset.targetPath = path;
            document.getElementById('fileUploadInput').click();
            break;
        case 'RENAME':
            renameItem(path);
            break;
        case 'DELETE':
            removeItem(path);
            break;
        case 'DOWNLOAD':
            downloadItem(path);
            break;
    }
}

function getFileIcon(extension) {
    const icons = {
        'tex': '<svg class="w-4 h-4 text-latex-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>',
        'pdf': '<svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>',
        'png': '<svg class="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>',
        'eps': '<svg class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>'
    };
    return icons[extension] || icons['tex'];
}

function handleFileUpload(files, targetPath = '') {
    Array.from(files).forEach(file => {
        const reader = new FileReader();

        reader.onload = function (e) {
            const content = e.target.result;
            const originalName = file.name;
            // Combina path se existir
            const fullPath = targetPath ? `${targetPath}/${originalName}` : originalName;

            if (originalName.match(/\.(tex|bib|sty|cls)$/)) {
                addFile(fullPath, content, 'auxiliary');
            }
            else if (originalName.match(/\.(png|jpg|jpeg|pdf|eps)$/)) {
                addFile(fullPath, content, 'binary');
            } else {
                showToast(`Tipo não suportado: ${originalName}`, 'error');
            }
        };

        if (file.name.match(/\.(tex|bib|sty|cls)$/)) {
            reader.readAsText(file);
        } else {
            reader.readAsDataURL(file);
        }
    });
}

// ========== ZIP UPLOAD ==========
async function handleZipUpload(file) {
    if (!file.name.endsWith('.zip')) {
        showToast('Por favor, selecione um arquivo .zip', 'error');
        return;
    }

    showToast('Extraindo arquivos do ZIP...', 'info');

    try {
        const zip = await JSZip.loadAsync(file);

        let filesAdded = 0;
        let filesSkipped = 0;
        let mainTexFound = false;

        // Detecta se há uma pasta raiz única no ZIP (comum em exports do Overleaf)
        const allPaths = Object.keys(zip.files);
        let rootPrefix = '';

        // Verifica se todos os arquivos estão dentro de uma única pasta
        const topLevelItems = new Set();
        allPaths.forEach(path => {
            const firstPart = path.split('/')[0];
            if (firstPart) topLevelItems.add(firstPart);
        });

        if (topLevelItems.size === 1) {
            const singleRoot = Array.from(topLevelItems)[0];
            // Verifica se é uma pasta (tem arquivos dentro)
            const hasFilesInside = allPaths.some(p => p.startsWith(singleRoot + '/') && !zip.files[p].dir);
            if (hasFilesInside) {
                rootPrefix = singleRoot + '/';
                console.log(`📦 Detectada pasta raiz: ${singleRoot}`);
            }
        }

        // Processa cada arquivo no ZIP
        const promises = [];

        zip.forEach((relativePath, zipEntry) => {
            // Ignora diretórios
            if (zipEntry.dir) return;

            // Remove o prefixo da pasta raiz se existir
            let finalPath = relativePath;
            if (rootPrefix && relativePath.startsWith(rootPrefix)) {
                finalPath = relativePath.substring(rootPrefix.length);
            }

            // Ignora arquivos ocultos e de sistema
            if (finalPath.startsWith('.') || finalPath.startsWith('__MACOSX')) {
                filesSkipped++;
                return;
            }

            // Ignora arquivos auxiliares de compilação
            if (finalPath.match(/\.(aux|log|out|toc|lof|lot|bbl|blg|synctex\.gz|fdb_latexmk|fls)$/)) {
                filesSkipped++;
                return;
            }

            const fileName = finalPath.split('/').pop().toLowerCase();
            const ext = fileName.split('.').pop();

            // Determina o tipo de arquivo
            const isText = ['tex', 'bib', 'sty', 'cls', 'txt', 'md', 'bst'].includes(ext);
            const isBinary = ['png', 'jpg', 'jpeg', 'pdf', 'eps', 'gif', 'svg'].includes(ext);

            if (!isText && !isBinary) {
                filesSkipped++;
                return;
            }

            const promise = (async () => {
                try {
                    if (isText) {
                        const content = await zipEntry.async('string');

                        // Detecta se é o arquivo principal
                        let fileType = 'auxiliary';
                        if (ext === 'tex') {
                            // Verifica se é um arquivo principal (tem \documentclass)
                            if (content.includes('\\documentclass') && !mainTexFound) {
                                // Se é main.tex ou é o primeiro com \documentclass
                                if (fileName === 'main.tex' || !mainTexFound) {
                                    fileType = 'main';
                                    mainTexFound = true;

                                    // Se não é main.tex, renomeia para main.tex
                                    if (fileName !== 'main.tex') {
                                        console.log(`📄 Arquivo principal detectado: ${finalPath}`);
                                        // Mantém o arquivo original também
                                        projectFiles[finalPath] = { content, type: 'auxiliary' };
                                        _dirtyFiles.add(finalPath);
                                    }

                                    // Salva como main.tex
                                    projectFiles['main.tex'] = { content, type: 'main' };
                                    _dirtyFiles.add('main.tex');
                                    filesAdded++;
                                    return;
                                }
                            }
                        }

                        projectFiles[finalPath] = { content, type: fileType };
                        _dirtyFiles.add(finalPath);
                        filesAdded++;
                    } else if (isBinary) {
                        const blob = await zipEntry.async('blob');
                        const reader = new FileReader();

                        await new Promise((resolve, reject) => {
                            reader.onload = () => {
                                projectFiles[finalPath] = {
                                    content: reader.result,
                                    type: 'binary'
                                };
                                _dirtyFiles.add(finalPath);
                                filesAdded++;
                                resolve();
                            };
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    }
                } catch (err) {
                    console.error(`Erro ao processar ${finalPath}:`, err);
                    filesSkipped++;
                }
            })();

            promises.push(promise);
        });

        await Promise.all(promises);

        // Atualiza a visualização
        renderFileList();

        // Se encontrou arquivo principal, carrega no editor
        if (mainTexFound && projectFiles['main.tex']) {
            currentFile = 'main.tex';
            editor.setValue(projectFiles['main.tex'].content);
        }

        // Salva o projeto
        await saveCurrentProject();

        showToast(`ZIP importado: ${filesAdded} arquivo(s) adicionado(s)${filesSkipped > 0 ? `, ${filesSkipped} ignorado(s)` : ''}`, 'success');

        console.log(`✅ ZIP importado: ${filesAdded} arquivos adicionados, ${filesSkipped} ignorados`);

    } catch (error) {
        console.error('Erro ao processar ZIP:', error);
        showToast('Erro ao processar arquivo ZIP', 'error');
    }
}

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} flex items-center space-x-3`;

    const icons = {
        success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
        error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
        warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>',
        info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
    };

    toast.innerHTML = `
        <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${icons[type]}
        </svg>
        <span class="text-sm font-medium">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'all 0.3s ease-out';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(400px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
