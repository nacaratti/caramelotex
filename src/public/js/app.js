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

// Sistema de arquivos do projeto (espelho da pasta aberta; caminhos relativos com "/")
let projectFiles = {};
let currentFile = null;
let mainFile = null;          // Arquivo principal (o que é compilado)
let projectEngine = 'pdflatex';
let projectRoot = null;       // Caminho absoluto da pasta do projeto
let actionMenuTarget = null; // Armazena o alvo do menu de ação
let _projectName = 'Projeto';
let _isSaving = false; // Previne saves concorrentes
let _dirtyFiles = new Set();   // arquivos de texto editados e ainda não gravados no disco
let _saveStatusTimer = null;

function isTextFile(file) {
    return file && (file.type === 'main' || file.type === 'auxiliary');
}

/** Pasta do arquivo principal ('' se estiver na raiz); o LaTeX resolve caminhos a partir dela. */
function mainDir() {
    return mainFile && mainFile.includes('/') ? mainFile.substring(0, mainFile.lastIndexOf('/')) : '';
}

/** Junta caminhos relativos resolvendo "." e "..". */
function joinPath(base, rel) {
    const parts = [];
    (base ? base + '/' + rel : rel).split('/').forEach(part => {
        if (part === '..') parts.pop();
        else if (part && part !== '.') parts.push(part);
    });
    return parts.join('/');
}

/**
 * Converte um caminho citado no log do LaTeX (relativo à pasta do arquivo
 * principal ou absoluto) para o caminho do arquivo no projeto, se existir.
 */
function logPathToProjectFile(path) {
    if (!path) return null;
    let p = path.replace(/\\/g, '/').replace(/\/\.\//g, '/');
    const root = (projectRoot || '').replace(/\\/g, '/').toLowerCase();
    if (/^[a-zA-Z]:\//.test(p) || p.startsWith('/')) {
        if (!root || !p.toLowerCase().startsWith(root + '/')) return null;
        p = p.substring(root.length + 1);
    } else {
        p = joinPath(mainDir(), p);
    }
    return projectFiles[p] ? p : null;
}

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
        default:
            el.textContent = 'Pronto';
            el.className = '';
    }
}

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', async function () {
    console.log('Inicializando CarameloTeX...');

    // Sem projeto selecionado: volta para a tela inicial
    const projectPath = StorageService.getCurrentProjectPath();
    if (!projectPath) {
        window.location.href = 'projects.html';
        return;
    }

    initEditor();
    initViewer();
    try {
        await initFileSystem(projectPath);
    } catch (e) {
        console.error('Erro ao abrir o projeto:', e);
        alert(`Não foi possível abrir o projeto:\n${e}`);
        window.location.href = 'projects.html';
        return;
    }

    // Hide loading overlay
    const overlay = document.getElementById('editorLoadingOverlay');
    if (overlay) overlay.classList.add('hidden');

    setupEventListeners();

    // Rede de segurança: grava o que estiver pendente a cada 30s
    setInterval(() => {
        saveCurrentProject();
    }, 30000);

    // beforeunload não pode await – o debounce de 2s garante que a maioria das edições já está salva
    window.addEventListener('beforeunload', () => {
        saveCurrentProject();
    });

    // Setup Resizer
    initResizer();

    // Compila ao abrir, se houver arquivo principal
    if (mainFile) {
        setTimeout(() => {
            compile();
        }, 100);
    } else {
        showToast('Nenhum arquivo com \\documentclass encontrado. Use "Definir como principal" no menu de um .tex.', 'warning');
    }
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

/** Copia o conteúdo do editor para o arquivo atual, marcando-o como alterado. */
function syncEditorToCurrentFile() {
    const file = projectFiles[currentFile];
    if (!isTextFile(file)) return;
    const editorContent = getEditorContent();
    if (file.content !== editorContent) {
        file.content = editorContent;
        _dirtyFiles.add(currentFile);
    }
}

/** Grava no disco os arquivos de texto alterados. */
async function saveCurrentProject() {
    if (!projectRoot) return;
    // Outra gravação em andamento: espera e tenta de novo (o compile depende disso)
    while (_isSaving) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    syncEditorToCurrentFile();
    if (_dirtyFiles.size === 0) return;

    _isSaving = true;
    updateSaveStatus('saving');

    const pending = [..._dirtyFiles];
    _dirtyFiles.clear();
    const failed = [];
    for (const path of pending) {
        const file = projectFiles[path];
        if (!isTextFile(file)) continue;
        try {
            await StorageService.writeText(path, file.content);
        } catch (e) {
            console.error(`Erro ao salvar ${path}:`, e);
            failed.push(path);
        }
    }

    // O que falhou volta para a fila da próxima tentativa
    failed.forEach(path => _dirtyFiles.add(path));
    updateSaveStatus(failed.length ? 'error' : 'saved');
    _isSaving = false;
}

// ========== EDITOR ==========
function initEditor() {
    const editorElement = document.getElementById('editor');

    editor = CodeMirror(editorElement, {
        value: '', // Será preenchido após carregar o template
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
                compile(); // compile() grava os arquivos antes
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
// Compila localmente pelo backend (latexmk + TinyTeX/TeX do sistema), lendo os arquivos do disco.
let isCompiling = false;
let compileRequestId = 0;

function base64ToBytes(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/** Arquivo .sty/.cls faltando no log ("LaTeX Error: File `x.sty' not found"), ou null. */
function findMissingFile(log) {
    const match = log.match(/File `([^']+\.(?:sty|cls|bst|def|cfg|clo|fd|bbx|cbx|lbx))' not found/);
    return match ? match[1] : null;
}

async function offerMissingPackage(file) {
    const install = confirm(
        `O pacote que fornece "${file}" não está instalado.\n\n` +
        'Instalar agora? (precisa de internet)'
    );
    if (!install) return;
    showToast(`Instalando o pacote de ${file}...`, 'info');
    try {
        const pkg = await StorageService.installMissingFile(file);
        showToast(`Pacote "${pkg}" instalado. Recompilando...`, 'success');
        compile();
    } catch (e) {
        console.error(e);
        showToast(String(e), 'error');
    }
}

async function compile() {
    if (!mainFile) {
        showToast('Defina o arquivo principal (menu do arquivo .tex > "Definir como principal")', 'warning');
        return;
    }

    // Uma nova compilação substitui a anterior (o backend cancela o processo antigo)
    const requestId = ++compileRequestId;

    const compileBtn = document.getElementById('compileBtn');
    const compileBtnText = document.getElementById('compileBtnText');
    const compileStatus = document.getElementById('compileStatus');
    const loadingSpinner = document.getElementById('loadingSpinner');

    isCompiling = true;
    compileBtn.disabled = true;
    compileBtnText.textContent = 'Compilando...';
    loadingSpinner.classList.remove('hidden');

    try {
        compileStatus.textContent = 'Salvando arquivos...';
        await saveCurrentProject();

        compileStatus.textContent = `Compilando ${mainFile} (${projectEngine})...`;
        const result = await StorageService.compile(mainFile, projectEngine);

        // Resultado de uma compilação que já foi substituída por outra
        if (requestId !== compileRequestId || result.cancelled) return;

        console.log(`Compilação: ok=${result.ok} em ${result.durationMs}ms (${result.texSource})`);

        if (result.pdf) {
            currentPdfData = base64ToBytes(result.pdf);
            currentSynctexData = null;
            if (result.synctex && typeof pako !== 'undefined' && typeof SyncTexParser !== 'undefined') {
                try {
                    const synctexText = pako.inflate(base64ToBytes(result.synctex), { to: 'string' });
                    currentSynctexData = SyncTexParser.parse(synctexText, projectRoot);
                } catch (syncErr) {
                    console.warn('Erro ao ler SyncTeX:', syncErr);
                }
            }
            await loadPDF(currentPdfData.slice());
            document.getElementById('downloadBtn').disabled = false;
        }

        const toggleBtn = document.getElementById('toggleLogsBtn');
        const logEntries = parseLatexLog(result.log);

        if (result.ok) {
            const warnings = logEntries.filter(e => e.type === 'warning').concat(detectSourceWarnings(projectFiles));
            renderErrorLog(warnings);
            highlightErrors(warnings);
            compileStatus.textContent = `PDF gerado (${(result.durationMs / 1000).toFixed(1)}s)`;
            if (warnings.length > 0) {
                showToast('PDF gerado com ' + warnings.length + ' aviso(s)', 'warning');
                toggleBtn.classList.add('text-yellow-400');
                toggleBtn.title = warnings.length + ' aviso(s) detectado(s)';
            } else {
                toggleBtn.classList.remove('text-yellow-400', 'text-red-400');
                toggleBtn.title = 'Ver Logs';
            }
            switchViewerMode('pdf');
            return;
        }

        // Falhou: mostra os erros (o PDF parcial, se houver, continua carregado)
        if (result.timedOut) {
            logEntries.unshift({
                type: 'error',
                message: 'A compilação passou do tempo limite e foi interrompida. Verifique laços infinitos ou documentos muito pesados.',
                line: null,
            });
        }
        compileStatus.textContent = 'Erro na compilação';
        renderErrorLog(logEntries);
        highlightErrors(logEntries);
        switchViewerMode('logs');
        toggleBtn.classList.add('text-red-400');
        toggleBtn.classList.remove('text-yellow-400');
        toggleBtn.title = 'Erros na compilação';
        showToast('Erro na compilação', 'error');

        const missing = findMissingFile(result.log);
        if (missing) offerMissingPackage(missing);
    } catch (error) {
        if (requestId !== compileRequestId) return;
        console.error('Erro na compilação:', error);
        compileStatus.textContent = 'Erro na compilação';
        renderErrorLog([{ type: 'error', message: String(error), line: null }]);
        switchViewerMode('logs');
        showToast('Erro na compilação', 'error');
    } finally {
        if (requestId === compileRequestId) {
            isCompiling = false;
            compileBtn.disabled = false;
            compileBtnText.textContent = 'Compilar';
            loadingSpinner.classList.add('hidden');
        }
    }
}

// ========== LOG PARSING & ERROR REPORTING ==========

function parseLatexLog(logText) {
    const entries = [];
    const lines = logText.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Formato -file-line-error: "./capitulo.tex:12: Undefined control sequence."
        const fileLine = line.match(/^(.+?\.(?:tex|ltx|sty|cls|bib|def|cfg|bbl)):(\d+): (.*)$/);
        if (fileLine) {
            entries.push({
                type: 'error',
                message: fileLine[3],
                line: parseInt(fileLine[2]),
                file: logPathToProjectFile(fileLine[1]),
                raw: line
            });
            i++;
            continue;
        }

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
                line: ref.line,
                file: ref.file,
                raw: ref.file + ':' + ref.line
            });
        }
    });

    // Verifica imagens referenciadas que não existem nos arquivos do projeto
    // (caminhos do LaTeX são relativos à pasta do arquivo principal)
    allIncludes.forEach(function(inc) {
        var imgPath = joinPath(mainDir(), inc.path);
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
                message: 'Imagem "' + inc.path + '" não encontrada nos arquivos do projeto — pode gerar erro ou imagem ausente no PDF',
                line: inc.line,
                file: inc.file,
                raw: '\\includegraphics{' + inc.path + '} em ' + inc.file
            });
        }
    });

    // Verifica arquivos .bib referenciados
    allBibResources.forEach(function(bib) {
        var bibPath = joinPath(mainDir(), bib.path);
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
            card.addEventListener('click', () => goToLine(entry.line, entry.file));
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
            lineSpan.textContent = entry.file ? `${entry.file}:${entry.line}` : `Linha ${entry.line}`;
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
let lastLogEntries = []; // Reaplicados ao trocar de arquivo no editor

function highlightErrors(entries) {
    if (!editor) return;
    lastLogEntries = entries;

    // Limpa marcadores anteriores
    errorMarkers.forEach(marker => marker.clear());
    errorMarkers = [];
    editor.clearGutter('CodeMirror-linenumbers'); // Se usarmos gutters customizados

    entries.forEach(entry => {
        // Entradas sem arquivo identificado são do arquivo principal
        if (entry.line && (entry.file || mainFile) === currentFile) {
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

function goToLine(line, file) {
    if (!editor) return;
    const target = file || mainFile;
    if (target && target !== currentFile && isTextFile(projectFiles[target])) {
        selectFile(target);
    }
    const lineIndex = line - 1;
    editor.setCursor(lineIndex, 0);
    editor.focus();
    // Centraliza
    const coords = editor.charCoords({ line: lineIndex, ch: 0 }, "local");
    editor.scrollTo(null, coords.top);
}

// ========== PDF VIEWER ==========
function initViewer() {
    console.log('✅ Visualizador PDF inicializado');
}

let pdfDoc = null;
let currentPage = 1;
let scale = 1.5;

async function loadPDF(pdfData) {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfData, isEvalSupported: false });
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

    const fileName = currentFile || mainFile;
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

    // Vai para a linha no editor (trocando de arquivo se for outro do projeto)
    goToLine(result.line, projectFiles[result.file] ? result.file : currentFile);

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
            showToast('SyncTeX não disponível - compile o documento primeiro', 'warning');
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

    // Compilador (pdflatex/xelatex/lualatex), salvo no .caramelotex.json do projeto
    const engineSelect = document.getElementById('engineSelect');
    engineSelect.value = projectEngine;
    engineSelect.addEventListener('change', async function () {
        projectEngine = engineSelect.value;
        try {
            await StorageService.saveConfig(mainFile, projectEngine);
        } catch (e) {
            console.error(e);
        }
        compile();
    });

    document.getElementById('revealProjectBtn').addEventListener('click', () => {
        StorageService.revealInExplorer(projectRoot, '').catch(e => showToast(String(e), 'error'));
    });

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
        // Ctrl+S salva e compila
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            compile();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            toggleFilesPanel();
        }
    });
}

// ========== EXPORTAR PDF ==========
async function downloadPDF() {
    if (!currentPdfData || !mainFile) {
        showToast('Nenhum PDF disponível', 'error');
        return;
    }
    try {
        const dest = await StorageService.exportPdf(mainFile);
        if (dest) showToast('PDF salvo', 'success');
    } catch (error) {
        console.error(error);
        showToast(String(error), 'error');
    }
}

// ========== FILE SYSTEM ==========
// Toda alteração de arquivo vai direto para o disco; só as edições de texto
// passam pela fila _dirtyFiles (gravadas com debounce por saveCurrentProject).

async function initFileSystem(projectPath) {
    const info = await StorageService.openProject(projectPath);
    projectRoot = info.root;
    _projectName = info.name;
    mainFile = info.mainFile;
    projectEngine = info.engine || 'pdflatex';
    projectFiles = await StorageService.loadProjectFiles(info);
    _dirtyFiles = new Set();

    document.title = `${_projectName} - CarameloTeX`;
    const nameEl = document.getElementById('projectName');
    if (nameEl) {
        nameEl.textContent = _projectName;
        nameEl.title = projectRoot;
    }

    // Abre o arquivo principal (ou o primeiro .tex) no editor
    const firstText = Object.keys(projectFiles).sort().find(p => isTextFile(projectFiles[p]));
    currentFile = mainFile && projectFiles[mainFile] ? mainFile : firstText || null;
    editor.setValue(currentFile ? projectFiles[currentFile].content : '');
    editor.clearHistory();

    renderFileList();
    console.log(`Projeto aberto: ${projectRoot} (principal: ${mainFile || 'nenhum'})`);
}

/** Relê a pasta do disco (após importar arquivos), mantendo o arquivo aberto. */
async function reloadProject() {
    await saveCurrentProject();
    const previous = currentFile;
    await initFileSystem(projectRoot);
    if (previous && previous !== currentFile && isTextFile(projectFiles[previous])) {
        selectFile(previous);
    }
}

function toggleFilesPanel() {
    const panel = document.getElementById('filesPanel');
    panel.classList.toggle('hidden');
}

function isValidName(name) {
    return name && !/[\\/:*?"<>|]/.test(name) && name !== '.' && name !== '..';
}

async function createFolder(parentPath = '') {
    const folderName = prompt("Nome da nova pasta:", "Nova Pasta");
    if (!folderName) return;

    if (!isValidName(folderName)) {
        showToast('Nome inválido', 'error');
        return;
    }

    const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;

    if (projectFiles[fullPath]) {
        showToast('Pasta já existe', 'error');
        return;
    }

    try {
        await StorageService.createFolder(fullPath);
        projectFiles[fullPath] = { type: 'folder' };
        renderFileList();
        showToast(`Pasta '${folderName}' criada!`, 'success');
    } catch (e) {
        showToast(String(e), 'error');
    }
}

/**
 * Grava um arquivo novo (ou substitui um existente) no disco.
 * @param {string} type - 'auxiliary' (texto) ou 'binary' (content = base64)
 */
async function addFile(filename, content, type = 'auxiliary') {
    try {
        if (type === 'binary') {
            await StorageService.writeBinary(filename, content);
            projectFiles[filename] = { type: 'binary', content: null };
        } else {
            await StorageService.writeText(filename, content);
            projectFiles[filename] = { type: filename === mainFile ? 'main' : 'auxiliary', content };
            if (filename === currentFile) editor.setValue(content);
        }
        renderFileList();
        showToast(`Arquivo salvo: ${filename.split('/').pop()}`, 'success');
    } catch (e) {
        showToast(String(e), 'error');
    }
}

async function removeItem(path) {
    if (path === mainFile) {
        showToast('Não é possível remover o arquivo principal!', 'error');
        return;
    }

    const isFolder = projectFiles[path].type === 'folder';
    const msg = isFolder
        ? `Mover a pasta '${path}' e todo o conteúdo para a Lixeira?`
        : `Mover '${path}' para a Lixeira?`;
    if (!confirm(msg)) return;

    if (isFolder && mainFile && mainFile.startsWith(path + '/')) {
        showToast('A pasta contém o arquivo principal', 'error');
        return;
    }

    try {
        await StorageService.remove(path);
    } catch (e) {
        showToast(String(e), 'error');
        return;
    }

    Object.keys(projectFiles).forEach(key => {
        if (key === path || key.startsWith(path + '/')) {
            _dirtyFiles.delete(key);
            delete projectFiles[key];
        }
    });

    // Volta para o principal se o arquivo aberto sumiu
    if (currentFile && (currentFile === path || currentFile.startsWith(path + '/'))) {
        currentFile = mainFile;
        editor.setValue(mainFile ? projectFiles[mainFile].content : '');
    }

    renderFileList();
    showToast('Movido para a Lixeira', 'success');
}

async function renameItem(path) {
    const currentName = path.split('/').pop();
    const newName = prompt("Novo nome:", currentName);

    if (!newName || newName === currentName) return;
    if (!isValidName(newName)) {
        showToast('Nome inválido', 'error');
        return;
    }

    const parentPath = path.substring(0, path.lastIndexOf('/'));
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    if (projectFiles[newPath]) {
        showToast('Já existe um arquivo/pasta com este nome', 'error');
        return;
    }

    // Grava edições pendentes antes de mover o arquivo no disco
    await saveCurrentProject();
    try {
        await StorageService.rename(path, newPath);
    } catch (e) {
        showToast(String(e), 'error');
        return;
    }

    const movePath = (oldKey) => newPath + oldKey.substring(path.length);
    Object.keys(projectFiles).forEach(key => {
        if (key === path || key.startsWith(path + '/')) {
            projectFiles[movePath(key)] = projectFiles[key];
            delete projectFiles[key];
        }
    });
    if (currentFile && (currentFile === path || currentFile.startsWith(path + '/'))) {
        currentFile = movePath(currentFile);
    }
    if (mainFile && (mainFile === path || mainFile.startsWith(path + '/'))) {
        mainFile = movePath(mainFile);
        await StorageService.saveConfig(mainFile, projectEngine).catch(console.error);
    }

    renderFileList();
    showToast('Renomeado com sucesso', 'success');
}

async function setMainFile(path) {
    if (mainFile && projectFiles[mainFile]) projectFiles[mainFile].type = 'auxiliary';
    mainFile = path;
    projectFiles[path].type = 'main';
    try {
        await StorageService.saveConfig(mainFile, projectEngine);
    } catch (e) {
        showToast(String(e), 'error');
    }
    renderFileList();
    showToast(`Arquivo principal: ${path}`, 'success');
    compile();
}

function revealItem(path) {
    StorageService.revealInExplorer(projectRoot, path).catch(e => showToast(String(e), 'error'));
}

function selectFile(filename) {
    const file = projectFiles[filename];
    if (!file || file.type === 'folder') return;

    if (!isTextFile(file)) {
        showToast('Arquivo binário (não editável) — use "Mostrar no Explorer"', 'info');
        return;
    }

    // Guarda o conteúdo do arquivo anterior
    syncEditorToCurrentFile();

    currentFile = filename;
    editor.setValue(file.content);
    editor.clearHistory();
    highlightErrors(lastLogEntries);
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
            const isMain = child.path === mainFile;

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
    const isMain = path === mainFile;

    let optionsInfo = [];

    // Define options
    if (isFolder) {
        optionsInfo.push({ label: 'Nova Pasta', icon: 'M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z', action: 'CREATE_FOLDER' });
        optionsInfo.push({ label: 'Adicionar Arquivo', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12', action: 'UPLOAD' });
        optionsInfo.push({ separator: true });
    } else if (!isMain && /\.tex$/i.test(path) && isTextFile(file)) {
        optionsInfo.push({ label: 'Definir como principal', icon: 'M5 13l4 4L19 7', action: 'SET_MAIN' });
    }
    optionsInfo.push({ label: 'Mostrar no Explorer', icon: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14', action: 'REVEAL' });

    // Common
    optionsInfo.push({ label: 'Renomear', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', action: 'RENAME' });
    if (!isMain) {
        optionsInfo.push({ label: 'Mover para a Lixeira', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', action: 'DELETE', color: 'text-red-400' });
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
        case 'REVEAL':
            revealItem(path);
            break;
        case 'SET_MAIN':
            setMainFile(path);
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

const UPLOAD_TEXT_EXTS = /\.(tex|bib|sty|cls|bst|bbx|cbx|def|cfg|txt|md|csv|dat|json)$/i;

function handleFileUpload(files, targetPath = '') {
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        const fullPath = targetPath ? `${targetPath}/${file.name}` : file.name;
        const isText = UPLOAD_TEXT_EXTS.test(file.name);

        reader.onload = function (e) {
            if (isText) {
                addFile(fullPath, e.target.result, 'auxiliary');
            } else {
                // dataURL -> só o base64
                addFile(fullPath, e.target.result.split(',')[1] || '', 'binary');
            }
        };

        if (isText) {
            reader.readAsText(file);
        } else {
            reader.readAsDataURL(file);
        }
    });
}

// ========== ZIP UPLOAD ==========
async function handleZipUpload(file) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
        showToast('Por favor, selecione um arquivo .zip', 'error');
        return;
    }
    if (!confirm(`Extrair "${file.name}" para dentro da pasta do projeto?\nArquivos com o mesmo nome serão substituídos.`)) {
        return;
    }

    showToast('Extraindo arquivos do ZIP...', 'info');
    try {
        await saveCurrentProject();
        const result = await StorageService.importZip(file);
        await reloadProject();
        showToast(`ZIP importado: ${result.added} arquivo(s)${result.skipped > 0 ? `, ${result.skipped} ignorado(s)` : ''}`, 'success');
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
