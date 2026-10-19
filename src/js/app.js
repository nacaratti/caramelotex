/**
 * app.js - Editor do CarameloTeX (página index.html)
 */
import './theme.js';
import pako from 'pako';
import { StorageService } from './storage.js';
import { SyncTexParser } from './synctex-parser.js';
import { createEditor } from './editor.js';
import { createPdfViewer } from './pdf-viewer.js';
import { createToolbar } from './toolbar.js';
import { openFigureDialog, openTableDialog, openWordCountDialog, parseTexcount } from './dialogs.js';
import { createCompletionSources } from './completions.js';
import { buildOutline, countWords } from './outline.js';
import { spellChecker, spellTheme } from './spell.js';
import { escapeHtml, showToast } from './ui.js';
import { cycleTheme, themeLabel } from './theme.js';

// Estado do editor
let editor;
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
            el.className = 'status-saving';
            break;
        case 'saved':
            el.textContent = 'Salvo';
            el.className = 'status-saved';
            _saveStatusTimer = setTimeout(() => {
                el.textContent = 'Pronto';
                el.className = '';
            }, 3000);
            break;
        case 'error':
            el.textContent = 'Erro ao salvar';
            el.className = 'status-error';
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
    initWritingTools();
    initSpellcheck();
    window.addEventListener('focus', checkExternalChanges);

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
        const filesPanel = document.getElementById('filesPanel');
        const sidebarWidth = filesPanel.classList.contains('hidden') ? 0 : filesPanel.offsetWidth;
        const containerWidth = container.offsetWidth - sidebarWidth;
        const x = e.clientX - sidebarWidth;

        // Constraints (min 10% max 90%)
        let newEditorWidthPercent = (x / containerWidth) * 100;
        if (newEditorWidthPercent < 15) newEditorWidthPercent = 15;
        if (newEditorWidthPercent > 85) newEditorWidthPercent = 85;

        const newViewerWidthPercent = 100 - newEditorWidthPercent;

        editorPanel.style.width = `${newEditorWidthPercent}%`;
        viewerPanel.style.width = `${newViewerWidthPercent}%`;

        // Refresh editor layout
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.classList.remove('cursor-col-resize', 'select-none');
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
            try {
                file.modified = await StorageService.writeText(path, file.content, file.modified);
            } catch (e) {
                if (!String(e).startsWith('CONFLITO:')) throw e;
                await resolveConflict(path);
            }
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
    editor = createEditor(document.getElementById('editor'), {
        onChange() {
            updateLineCount();
            scheduleStats();

            // Debounce para auto-compile e auto-save
            clearTimeout(debounceTimer);
            if (autoCompileEnabled) {
                debounceTimer = setTimeout(() => compile(), 1000); // compile() grava antes
            } else {
                debounceTimer = setTimeout(() => saveCurrentProject(), 2000);
            }
        },
        // Forward sync: duplo clique no código -> posição no PDF
        onDoubleClick(line) {
            if (currentSynctexData) forwardSyncToPdf(line);
        },
        onPasteImage: (file) => pasteImage(file),
        keys: [
            { key: 'Mod-b', run: () => { formatting.bold(); return true; } },
            { key: 'Mod-i', run: () => { formatting.italic(); return true; } },
        ],
    });

    updateLineCount();
}

/** Mostra um arquivo de texto no editor. */
function showInEditor(path) {
    const file = path ? projectFiles[path] : null;
    editor.setDoc(path, file && isTextFile(file) ? file.content : '');
    updateLineCount();
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

        if (result.pdfFile) {
            const [pdfBytes, synctexBytes] = await Promise.all([
                StorageService.readBuildFile(result.pdfFile),
                result.synctexFile ? StorageService.readBuildFile(result.synctexFile).catch(() => null) : null,
            ]);
            if (requestId !== compileRequestId) return;

            currentPdfData = pdfBytes;
            currentSynctexData = null;
            if (synctexBytes) {
                try {
                    currentSynctexData = SyncTexParser.parse(pako.inflate(synctexBytes, { to: 'string' }), projectRoot);
                } catch (syncErr) {
                    console.warn('Erro ao ler SyncTeX:', syncErr);
                }
            }
            // O pdf.js transfere o buffer para o worker; passa uma cópia
            await pdfViewer.load(currentPdfData.slice());
            updateStats();
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
                toggleBtn.dataset.status = 'warning';
                toggleBtn.title = warnings.length + ' aviso(s) — ver detalhes';
            } else {
                delete toggleBtn.dataset.status;
                toggleBtn.title = 'Ver erros e avisos';
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
        toggleBtn.dataset.status = 'error';
        toggleBtn.title = 'Erros na compilação — ver detalhes';
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

    if (entries.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-muted text-center mt-10';
        empty.textContent = 'Nenhum erro ou aviso.';
        logsContent.appendChild(empty);
        return;
    }

    const errorCount = entries.filter(e => e.type === 'error').length;
    const warningCount = entries.length - errorCount;
    const summary = document.createElement('p');
    summary.className = 'log-summary';
    summary.textContent = `${errorCount} ${errorCount === 1 ? 'erro' : 'erros'}, ${warningCount} ${warningCount === 1 ? 'aviso' : 'avisos'}`;
    logsContent.appendChild(summary);

    entries.forEach((entry) => {
        const isError = entry.type === 'error';
        // Com linha conhecida o cartão é um botão que leva até ela
        const card = document.createElement(entry.line ? 'button' : 'div');
        card.className = `log-card${isError ? ' is-error' : ''}`;
        if (entry.line) {
            card.type = 'button';
            card.addEventListener('click', () => goToLine(entry.line, entry.file));
        }

        const top = document.createElement('div');
        top.className = 'log-card-top';
        const kind = document.createElement('span');
        kind.className = 'log-card-kind';
        kind.textContent = isError ? 'Erro' : 'Aviso';
        top.appendChild(kind);
        if (entry.line) {
            const where = document.createElement('span');
            where.className = 'log-card-where';
            where.textContent = `${entry.file || mainFile}:${entry.line}`;
            top.appendChild(where);
        }

        const message = document.createElement('p');
        message.className = 'log-card-message';
        message.textContent = entry.message;

        card.appendChild(top);
        card.appendChild(message);
        logsContent.appendChild(card);
    });
}

const LOGS_ICON = '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v4m0 4h.01"/><circle cx="12" cy="12" r="9"/></svg>';
const PDF_ICON = '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6"/></svg>';

function switchViewerMode(mode) {
    const pdfContainer = document.getElementById('pdfViewerContainer');
    const logsContainer = document.getElementById('logsContainer');
    const toggleBtn = document.getElementById('toggleLogsBtn');
    const showPdf = mode === 'pdf';

    pdfContainer.classList.toggle('hidden', !showPdf);
    logsContainer.classList.toggle('hidden', showPdf);
    // O botão mostra para onde vai: do PDF para os erros, ou de volta ao PDF
    toggleBtn.innerHTML = showPdf ? LOGS_ICON : PDF_ICON;
    toggleBtn.setAttribute('aria-pressed', String(!showPdf));
    if (!showPdf) toggleBtn.title = 'Voltar ao PDF';
}

let lastLogEntries = []; // Reaplicados ao trocar de arquivo no editor

/** Sublinha no código os erros e avisos que pertencem ao arquivo aberto. */
function highlightErrors(entries) {
    if (!editor) return;
    lastLogEntries = entries;
    editor.setDiagnostics(entries
        // Entradas sem arquivo identificado são do arquivo principal
        .filter(entry => entry.line && (entry.file || mainFile) === currentFile)
        .map(entry => ({
            line: entry.line,
            severity: entry.type === 'error' ? 'error' : 'warning',
            message: entry.message,
        })));
}

function goToLine(line, file) {
    if (!editor) return;
    const target = file || mainFile;
    if (target && target !== currentFile && isTextFile(projectFiles[target])) {
        selectFile(target);
    }
    editor.goToLine(line);
}

// ========== PDF VIEWER ==========
let pdfViewer = null;

function initViewer() {
    switchViewerMode('pdf');
    pdfViewer = createPdfViewer({
        container: document.getElementById('pdfViewerContainer'),
        pagesEl: document.getElementById('pdfPagesContainer'),
        placeholderEl: document.getElementById('pdfPlaceholder'),
        onZoomChange({ scale, fitWidth }) {
            document.getElementById('zoomLabel').textContent = `${Math.round(scale * 100)}%`;
            document.getElementById('zoomFitBtn').setAttribute('aria-pressed', String(fitWidth));
        },
        onPageClick(event, point) {
            // Ctrl+clique no PDF: vai para a linha do código (SyncTeX reverso)
            if (event.ctrlKey) reverseSyncToEditor(point);
        },
    });

    document.getElementById('zoomInBtn').addEventListener('click', () => pdfViewer.zoomIn());
    document.getElementById('zoomOutBtn').addEventListener('click', () => pdfViewer.zoomOut());
    document.getElementById('zoomFitBtn').addEventListener('click', () => pdfViewer.fitToWidth());

    // Cursor de mira com Ctrl pressionado sobre o PDF
    const container = document.getElementById('pdfViewerContainer');
    const updateCursor = (event) => {
        container.style.cursor = event.ctrlKey && currentSynctexData ? 'crosshair' : '';
    };
    container.addEventListener('mousemove', updateCursor);
    document.addEventListener('keyup', updateCursor);
}

// ========== SYNCTEX SYNC ==========

/**
 * Forward sync: vai da linha do editor para a posição correspondente no PDF
 * @param {number} lineNumber - Número da linha (1-indexed)
 */
function forwardSyncToPdf(lineNumber) {
    if (!currentSynctexData || !pdfViewer.numPages) return;

    const blocks = SyncTexParser.forwardSync(currentSynctexData, currentFile || mainFile, lineNumber);
    if (!blocks || blocks.length === 0) return;

    const block = blocks[0];
    const pageNum = block.page || 1;
    const coords = SyncTexParser.synctexToCanvas(currentSynctexData, block, 0, pdfViewer.scale);

    switchViewerMode('pdf');
    pdfViewer.scrollTo(pageNum, coords.y);
    pdfViewer.flash(pageNum, coords.y);
}

/**
 * Reverse sync: vai da posição clicada no PDF para a linha correspondente no editor
 * @param {{pageNum: number, x: number, y: number, height: number, scale: number}} point - em pixels CSS
 */
function reverseSyncToEditor(point) {
    if (!currentSynctexData) {
        showToast('Compile o documento para usar a sincronização', 'warning');
        return;
    }

    const synctexCoords = SyncTexParser.canvasToSynctex(currentSynctexData, point.x, point.y, point.height, point.scale);
    const result = SyncTexParser.reverseSync(currentSynctexData, point.pageNum, synctexCoords.x, synctexCoords.y);
    if (!result) {
        showToast('Posição não encontrada no código', 'info');
        return;
    }

    // Vai para a linha no editor (trocando de arquivo se for outro do projeto)
    goToLine(result.line, projectFiles[result.file] ? result.file : currentFile);
}

// ========== FERRAMENTAS DE ESCRITA ==========
// Barra de formatação, diálogos de figura e tabela, colar imagem e autocompletar.

const IMAGE_FILE = /\.(png|jpe?g|gif|svg|pdf|eps|webp)$/i;
const FIGURES_DIR = 'figuras';

const formatting = {
    bold: () => editor.wrapSelection('\\textbf{', '}', 'texto'),
    italic: () => editor.wrapSelection('\\textit{', '}', 'texto'),
    underline: () => editor.wrapSelection('\\underline{', '}', 'texto'),
    section: (command) => editor.insertSnippet('\\' + command + '{${título}}\n${}', { block: true }),
    bullets: () => editor.insertSnippet('\\begin{itemize}\n\t\\item ${}\n\\end{itemize}\n', { block: true }),
    numbers: () => editor.insertSnippet('\\begin{enumerate}\n\t\\item ${}\n\\end{enumerate}\n', { block: true }),
    mathInline: () => editor.wrapSelection('$', '$', 'x'),
    equation: () => editor.insertSnippet('\\begin{equation}\n\t${}\n\t\\label{eq:${rótulo}}\n\\end{equation}\n', { block: true }),
    figure: () => openFigure(),
    table: () => openTable(),
    cite: () => {
        editor.insertSnippet('\\cite{${}}');
        editor.startCompletion();
    },
    ref: () => {
        editor.insertSnippet('\\ref{${}}');
        editor.startCompletion();
    },
    footnote: () => editor.wrapSelection('\\footnote{', '}', 'texto da nota'),
};

/** Caminho de `path` (relativo ao projeto) visto da pasta do arquivo principal. */
function pathFromMainDir(path) {
    const base = mainDir();
    if (!base) return path;
    if (path.startsWith(base + '/')) return path.slice(base.length + 1);
    return '../'.repeat(base.split('/').length) + path;
}

/** Garante \usepackage{...} no preâmbulo do arquivo principal, perguntando antes. */
async function ensurePackages(packages) {
    if (!mainFile || !packages.length) return;
    const isOpen = mainFile === currentFile;
    const source = isOpen ? editor.getValue() : projectFiles[mainFile].content;
    const missing = packages.filter(pkg =>
        !new RegExp('\\\\(?:usepackage|RequirePackage)(?:\\[[^\\]]*\\])?\\{[^}]*\\b' + pkg + '\\b[^}]*\\}').test(source));
    if (!missing.length) return;

    const list = missing.map(p => `\\usepackage{${p}}`).join(', ');
    if (!confirm(`Para isso funcionar, o documento precisa de ${list}.\n\nAdicionar ao preâmbulo de ${mainFile}?`)) return;

    // Depois do último \usepackage (ou do \documentclass)
    const lines = [...source.matchAll(/^\\(?:usepackage|documentclass)\b.*$/gm)];
    const anchor = lines.length ? lines[lines.length - 1] : null;
    const offset = anchor ? anchor.index + anchor[0].length : 0;
    const text = missing.map(p => `\n\\usepackage{${p}}`).join('');

    if (isOpen) {
        editor.insertAt(offset, text);
    } else {
        projectFiles[mainFile].content = source.slice(0, offset) + text + source.slice(offset);
        _dirtyFiles.add(mainFile);
        saveCurrentProject();
    }
    showToast(`Pacote adicionado: ${missing.join(', ')}`, 'success');
}

/** Grava uma imagem (File do navegador) em figuras/ e devolve o caminho no projeto. */
async function saveImageToProject(file, name = file.name) {
    const safeName = name.replace(/[\\/:*?"<>|]/g, '-');
    let path = `${FIGURES_DIR}/${safeName}`;
    for (let i = 2; projectFiles[path]; i++) {
        path = `${FIGURES_DIR}/${safeName.replace(/(\.[^.]+)?$/, `-${i}$1`)}`;
    }
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
    await StorageService.writeBinary(path, dataUrl.split(',')[1] || '');
    if (!projectFiles[FIGURES_DIR]) projectFiles[FIGURES_DIR] = { type: 'folder' };
    projectFiles[path] = { type: 'binary', content: null };
    renderFileList();
    return path;
}

/** Pede uma imagem do computador e copia para figuras/. */
function pickImageFromComputer() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.pdf,.eps';
        input.addEventListener('change', async () => {
            const file = input.files[0];
            resolve(file ? await saveImageToProject(file).catch((e) => { showToast(String(e), 'error'); return null; }) : null);
        });
        input.click();
    });
}

function openFigure(initialProjectPath) {
    const images = Object.keys(projectFiles).filter(p => IMAGE_FILE.test(p)).sort().map(pathFromMainDir);
    openFigureDialog({
        images,
        initialImage: initialProjectPath ? pathFromMainDir(initialProjectPath) : undefined,
        preview: (path) => StorageService.readImageDataUrl(joinPath(mainDir(), path)),
        importImage: async () => {
            const saved = await pickImageFromComputer();
            return saved ? pathFromMainDir(saved) : null;
        },
        onInsert: async (code, packages) => {
            editor.insertText(code + '\n', { block: true });
            await ensurePackages(packages);
        },
    });
}

function openTable() {
    openTableDialog({
        onInsert: async (code, packages) => {
            editor.insertText(code + '\n', { block: true });
            await ensurePackages(packages);
        },
    });
}

/** Ctrl+V com imagem na área de transferência: salva em figuras/ e abre o diálogo. */
async function pasteImage(file) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    try {
        const path = await saveImageToProject(file, `colada-${stamp}.${ext}`);
        showToast(`Imagem salva em ${path}`, 'success');
        openFigure(path);
    } catch (e) {
        showToast(String(e), 'error');
    }
}

function initWritingTools() {
    createToolbar(document.getElementById('editorToolbar'), formatting);
    editor.setCompletionSources(createCompletionSources(() => ({ files: currentFiles(), mainDir: mainDir() })));
    document.getElementById('tabFiles').addEventListener('click', () => showSidebarTab('files'));
    document.getElementById('tabOutline').addEventListener('click', () => showSidebarTab('outline'));
    document.getElementById('wordCount').addEventListener('click', showDetailedWordCount);
    updateStats();
}

// ========== SUMÁRIO E CONTAGENS ==========

/** projectFiles com o conteúdo atual do editor no arquivo aberto. */
function currentFiles() {
    const files = { ...projectFiles };
    if (isTextFile(files[currentFile])) files[currentFile] = { ...files[currentFile], content: editor.getValue() };
    return files;
}

const OUTLINE_ICONS = {
    figure: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m21 16-5-5-9 9"/></svg>',
    table: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
};

function renderOutline() {
    const list = document.getElementById('outlineList');
    if (list.classList.contains('hidden')) return;
    const items = buildOutline(currentFiles(), mainFile);

    if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'outline-empty';
        empty.textContent = mainFile
            ? 'Nenhuma seção ainda. Use \\section{...} (ou o menu "Título" da barra) para estruturar o documento.'
            : 'Defina o arquivo principal para ver o sumário.';
        list.replaceChildren(empty);
        return;
    }

    const minLevel = Math.min(...items.filter(i => i.kind === 'section').map(i => i.level), 9);
    list.replaceChildren(...items.map((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isFloat = item.kind !== 'section';
        btn.className = `outline-item${isFloat ? ' is-float' : ''}${!isFloat && item.level === minLevel ? ' is-major' : ''}`;
        const depth = isFloat ? 0 : item.level - minLevel;
        btn.style.paddingLeft = `${0.4 + depth * 0.85}rem`;
        btn.title = `${item.file}:${item.line}`;
        btn.innerHTML = (OUTLINE_ICONS[item.kind] || '') + `<span class="truncate">${escapeHtml(item.title)}</span>`;
        btn.addEventListener('click', () => goToLine(item.line, item.file));
        return btn;
    }));
}

let statsTimer = null;

/** Atualiza sumário e contagem de palavras (com espera, durante a digitação). */
function scheduleStats(delay = 800) {
    clearTimeout(statsTimer);
    statsTimer = setTimeout(updateStats, delay);
}

function updateStats() {
    const words = countWords(currentFiles(), mainFile);
    document.getElementById('wordCount').textContent = `${words.toLocaleString('pt-BR')} ${words === 1 ? 'palavra' : 'palavras'}`;
    const pages = pdfViewer ? pdfViewer.numPages : 0;
    document.getElementById('pageCount').textContent = pages ? `${pages} ${pages === 1 ? 'página' : 'páginas'}` : '';
    renderOutline();
}

async function showDetailedWordCount() {
    if (!mainFile) return;
    await saveCurrentProject();
    try {
        const output = await StorageService.wordCount(mainFile);
        openWordCountDialog(parseTexcount(output), pdfViewer ? pdfViewer.numPages : 0);
    } catch (e) {
        showToast(String(e), 'error');
    }
}

function showSidebarTab(tab) {
    const showOutline = tab === 'outline';
    document.getElementById('tabFiles').setAttribute('aria-selected', String(!showOutline));
    document.getElementById('tabOutline').setAttribute('aria-selected', String(showOutline));
    document.getElementById('fileList').classList.toggle('hidden', showOutline);
    document.getElementById('outlineList').classList.toggle('hidden', !showOutline);
    document.getElementById('fileActions').classList.toggle('hidden', showOutline);
    if (showOutline) renderOutline();
}

// ========== CORRETOR ORTOGRÁFICO ==========
const SPELL_PREF = 'caramelotex.spellcheck';
let spellExtensions = null;

/** Menu de sugestões, no mesmo componente do menu de arquivos. */
function showSpellMenu(event, items) {
    const menu = document.getElementById('actionMenu');
    menu.innerHTML = '';
    for (const item of items) {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'menu-separator';
            menu.appendChild(sep);
            continue;
        }
        const btn = document.createElement('button');
        btn.className = 'menu-item';
        btn.textContent = item.label;
        if (item.muted) {
            btn.disabled = true;
            btn.classList.add('text-muted');
        } else {
            btn.addEventListener('click', () => {
                hideActionMenu();
                item.action();
            });
        }
        menu.appendChild(btn);
    }
    let x = event.clientX;
    let y = event.clientY;
    if (x + 220 > window.innerWidth) x = window.innerWidth - 220;
    if (y + 260 > window.innerHeight) y = window.innerHeight - 260;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');
}

function setSpellcheck(enabled) {
    if (!spellExtensions) {
        spellExtensions = [
            spellChecker({
                check: (words) => StorageService.spellCheck(words),
                suggest: (word) => StorageService.spellSuggest(word),
                add: (word) => StorageService.spellAdd(word),
                showMenu: showSpellMenu,
            }),
            spellTheme,
        ];
    }
    editor.setExtras(enabled ? spellExtensions : []);
    const btn = document.getElementById('spellBtn');
    btn.setAttribute('aria-pressed', String(enabled));
    btn.title = enabled ? 'Corretor ortográfico ligado (clique para desligar)' : 'Corretor ortográfico desligado (clique para ligar)';
    try {
        localStorage.setItem(SPELL_PREF, enabled ? 'on' : 'off');
    } catch { /* sem storage */ }
}

function initSpellcheck() {
    let enabled = true;
    try {
        enabled = localStorage.getItem(SPELL_PREF) !== 'off';
    } catch { /* sem storage */ }
    setSpellcheck(enabled);
    document.getElementById('spellBtn').addEventListener('click', (event) => {
        setSpellcheck(event.currentTarget.getAttribute('aria-pressed') !== 'true');
    });
}

// ========== MUDANÇAS FEITAS FORA DO APP ==========

/** O arquivo tem edições no app que ainda não foram gravadas? */
function hasUnsavedEdits(path) {
    if (_dirtyFiles.has(path)) return true;
    return path === currentFile && isTextFile(projectFiles[path]) && editor.getValue() !== projectFiles[path].content;
}

/**
 * Recarrega um arquivo de texto do disco (descarta a versão do app).
 * Com `onlyIfClean`, desiste se o usuário editou o arquivo durante a leitura:
 * nesse caso o conflito é tratado na próxima gravação.
 */
async function reloadFromDisk(path, modified, { onlyIfClean = false } = {}) {
    const content = await StorageService.readText(path);
    const file = projectFiles[path];
    if (!file || (onlyIfClean && hasUnsavedEdits(path))) return false;
    file.content = content;
    file.modified = modified;
    _dirtyFiles.delete(path);
    editor.forgetDoc(path);
    if (path === currentFile) showInEditor(path);
    return true;
}

/** O arquivo mudou no disco desde que foi lido: pergunta qual versão fica. */
async function resolveConflict(path) {
    const reload = confirm(
        `"${path}" foi alterado fora do CarameloTeX (outro editor, Git ou sincronização).\n\n` +
        'OK: usar a versão do disco (descarta suas alterações neste arquivo).\n' +
        'Cancelar: manter a sua versão e gravar por cima.'
    );
    const file = projectFiles[path];
    if (reload) {
        const entry = (await StorageService.listFiles()).find(e => e.path === path);
        await reloadFromDisk(path, entry ? entry.modified : 0);
        showToast(`${path} recarregado do disco`, 'info');
    } else {
        file.modified = await StorageService.writeText(path, file.content);
    }
}

let checkingExternal = false;

/**
 * Ao voltar para a janela: recarrega arquivos alterados fora do app que não
 * têm edições pendentes e acompanha arquivos criados ou apagados na pasta.
 */
async function checkExternalChanges() {
    // Durante uma gravação o horário dos arquivos está mudando: verifica depois
    if (!projectRoot || checkingExternal || _isSaving) return;
    checkingExternal = true;
    try {
        const entries = await StorageService.listFiles();
        const onDisk = new Map(entries.map(e => [e.path, e]));
        const updated = [];

        for (const entry of entries) {
            const file = projectFiles[entry.path];
            if (!file) {
                // Criado fora do app
                projectFiles[entry.path] = entry.kind === 'folder'
                    ? { type: 'folder' }
                    : entry.kind === 'text' && entry.size <= StorageService.MAX_TEXT_SIZE
                        ? { type: 'auxiliary', content: await StorageService.readText(entry.path), modified: entry.modified }
                        : { type: 'binary', content: null, size: entry.size };
                updated.push(entry.path);
            } else if (isTextFile(file) && file.modified && entry.modified !== file.modified && !hasUnsavedEdits(entry.path)) {
                if (await reloadFromDisk(entry.path, entry.modified, { onlyIfClean: true })) updated.push(entry.path);
            }
        }
        // Apagados fora do app (o arquivo principal fica, para não perder o projeto)
        for (const path of Object.keys(projectFiles)) {
            if (!onDisk.has(path) && path !== mainFile && !hasUnsavedEdits(path)) {
                editor.forgetDoc(path);
                delete projectFiles[path];
                updated.push(path);
            }
        }

        if (updated.length) {
            if (currentFile && !projectFiles[currentFile]) {
                currentFile = mainFile;
                showInEditor(mainFile);
            }
            renderFileList();
            scheduleStats(0);
            showToast(updated.length === 1 ? `${updated[0]} mudou fora do app e foi atualizado` : `${updated.length} arquivos mudaram fora do app e foram atualizados`, 'info');
        }
    } catch (e) {
        console.warn('Erro ao verificar mudanças externas:', e);
    } finally {
        checkingExternal = false;
    }
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

    const themeBtn = document.getElementById('themeBtn');
    themeBtn.title = themeLabel();
    themeBtn.addEventListener('click', () => {
        themeBtn.title = cycleTheme();
        showToast(themeBtn.title, 'info');
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
    showInEditor(currentFile);

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
            const modified = await StorageService.writeText(filename, content);
            projectFiles[filename] = { type: filename === mainFile ? 'main' : 'auxiliary', content, modified };
            editor.forgetDoc(filename);
            if (filename === currentFile) showInEditor(filename);
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
            editor.forgetDoc(key);
            delete projectFiles[key];
        }
    });

    // Volta para o principal se o arquivo aberto sumiu
    if (currentFile && (currentFile === path || currentFile.startsWith(path + '/'))) {
        currentFile = mainFile;
        showInEditor(mainFile);
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
            editor.renameDoc(key, movePath(key));
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
    showInEditor(filename);
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
            itemDiv.className = `file-item${isActive ? ' is-active' : ''}`;
            itemDiv.style.paddingLeft = `${level * 14 + 8}px`;
            itemDiv.dataset.path = child.path;

            itemDiv.innerHTML = `
                ${getFileIcon(isFolder ? null : child.name)}
                <span class="flex-1 truncate">${escapeHtml(child.name)}</span>
                ${isMain ? '<span class="file-main-badge" title="Arquivo principal (é o que é compilado)">principal</span>' : ''}
                <button class="file-menu-btn" title="Opções" aria-label="Opções de ${escapeHtml(child.name)}">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <circle cx="10" cy="4" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="10" cy="16" r="1.6"/>
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
        optionsInfo.push({ label: 'Mover para a Lixeira', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', action: 'DELETE', danger: true });
    }

    // Build menu DOM (avoid inline onclick)
    menu.innerHTML = '';
    optionsInfo.forEach(opt => {
        if (opt.separator) {
            const sep = document.createElement('div');
            sep.className = 'menu-separator';
            menu.appendChild(sep);
            return;
        }
        const btn = document.createElement('button');
        btn.className = `menu-item${opt.danger ? ' is-danger' : ''}`;
        btn.innerHTML = `
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="${opt.icon}"></path>
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

    // Mantém o menu dentro da janela
    if (x + 200 > window.innerWidth) x = window.innerWidth - 200;
    if (y + 220 > window.innerHeight) y = window.innerHeight - 220;

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

const FILE_ICONS = {
    folder: '<svg class="file-icon-folder" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4.2l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    tex: '<svg class="file-icon-tex" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4"/></svg>',
    bib: '<svg class="file-icon-bib" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19"/></svg>',
    image: '<svg class="file-icon-image" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/></svg>',
    other: '<svg class="file-icon-other" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5"/></svg>',
};

/** Ícone do item da árvore: pasta (name null) ou pelo tipo do arquivo. */
function getFileIcon(name) {
    if (name === null) return FILE_ICONS.folder;
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (['tex', 'sty', 'cls', 'ltx'].includes(ext)) return FILE_ICONS.tex;
    if (['bib', 'bst', 'bbx', 'cbx'].includes(ext)) return FILE_ICONS.bib;
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'pdf', 'eps', 'webp'].includes(ext)) return FILE_ICONS.image;
    return FILE_ICONS.other;
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
