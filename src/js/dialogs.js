/**
 * dialogs.js - Janelas de inserir figura e inserir tabela.
 * Geram o código LaTeX e o entregam via onInsert(código, pacotesNecessários).
 */

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
        if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
}

function field(label, control, hint) {
    return el('label', { class: 'block' }, [
        el('span', { class: 'block text-sm font-medium mb-1', text: label }),
        control,
        hint ? el('span', { class: 'block text-xs text-muted mt-1', text: hint }) : null,
    ]);
}

const INPUT_CLASS = 'w-full h-9 px-3 rounded-lg bg-bg border border-line text-sm focus:outline-none focus:border-accent';

/** Janela modal genérica. Retorna a função que fecha. */
export function openDialog({ title, body, confirmLabel, onConfirm = () => true, wide = false, cancelLabel = 'Cancelar' }) {
    const previousFocus = document.activeElement;
    const overlay = el('div', { class: 'fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4' });
    const titleId = `dialog-title-${Date.now()}`;
    const cancelBtn = cancelLabel ? el('button', { class: 'btn', type: 'button', text: cancelLabel }) : null;
    const confirmBtn = el('button', { class: 'btn btn-primary', type: 'button', text: confirmLabel });
    const panel = el('div', {
        class: `bg-panel border border-line rounded-lg shadow-soft w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} max-h-[90vh] flex flex-col`,
        role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId,
    }, [
        el('div', { class: 'px-5 py-3 border-b border-line' }, el('h2', { id: titleId, class: 'font-semibold', text: title })),
        el('div', { class: 'p-5 overflow-y-auto space-y-4' }, body),
        el('div', { class: 'px-5 py-3 border-t border-line flex justify-end gap-2' }, [cancelBtn, confirmBtn]),
    ]);
    overlay.appendChild(panel);

    function close() {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        if (previousFocus && previousFocus.focus) previousFocus.focus();
    }
    function onKey(event) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            close();
        }
    }

    if (cancelBtn) cancelBtn.addEventListener('click', close);
    overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) close();
    });
    confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        try {
            if ((await onConfirm()) !== false) close();
        } finally {
            confirmBtn.disabled = false;
        }
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    (panel.querySelector('input, select, textarea') || confirmBtn).focus();
    return close;
}

/** Transforma um nome de arquivo ou legenda em rótulo: "Mapa Térmico.png" -> "mapa-termico". */
export function slugify(text) {
    return text
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
}

/** Escapa caracteres especiais do LaTeX no texto de uma célula ou legenda. */
export function escapeLatex(text) {
    return text
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/([&%$#_{}])/g, '\\$1')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}');
}

const PLACEMENTS = [
    ['htbp', 'Onde o LaTeX achar melhor', null],
    ['H', 'Exatamente aqui no texto', 'float'],
    ['t', 'No topo da página', null],
];

// ---------------------------------------------------------------------------
// Figura
// ---------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {string[]} options.images - imagens do projeto (caminhos relativos à pasta do arquivo principal)
 * @param {string} [options.initialImage]
 * @param {(path: string) => Promise<string|null>} options.preview - dataURL para pré-visualizar
 * @param {() => Promise<string|null>} options.importImage - copia uma imagem do PC; retorna o caminho
 * @param {(code: string, packages: string[]) => void} options.onInsert
 */
export function openFigureDialog({ images, initialImage, preview, importImage, onInsert }) {
    const imageSelect = el('select', { class: `${INPUT_CLASS} select` });
    const importBtn = el('button', { class: 'btn flex-shrink-0', type: 'button', text: 'Importar do computador...' });
    const previewImg = el('img', { class: 'max-h-40 mx-auto hidden', alt: 'Prévia da imagem' });
    const previewNote = el('p', { class: 'text-xs text-muted text-center' });
    const width = el('input', { type: 'range', min: '10', max: '100', step: '5', value: '80', class: 'w-full accent-[var(--accent)]' });
    const widthLabel = el('span', { class: 'text-sm tabular-nums w-12 text-right', text: '80%' });
    const caption = el('input', { class: INPUT_CLASS, type: 'text', placeholder: 'Ex.: Perfil de temperatura ao longo da fibra' });
    const label = el('input', { class: INPUT_CLASS, type: 'text' });
    const placement = el('select', { class: `${INPUT_CLASS} select` },
        PLACEMENTS.map(([value, text]) => el('option', { value, text })));
    const code = el('pre', { class: 'font-mono text-xs bg-bg border border-line rounded p-3 whitespace-pre-wrap' });
    let labelEdited = false;

    function fillImages(selected) {
        imageSelect.replaceChildren(...(images.length
            ? images.map(path => el('option', { value: path, text: path }))
            : [el('option', { value: '', text: 'Nenhuma imagem no projeto' })]));
        if (selected) imageSelect.value = selected;
    }

    async function updatePreview() {
        const path = imageSelect.value;
        previewImg.classList.add('hidden');
        previewNote.textContent = '';
        if (!path) return;
        const url = /\.(png|jpe?g|gif|svg|webp)$/i.test(path) ? await preview(path).catch(() => null) : null;
        if (url) {
            previewImg.src = url;
            previewImg.classList.remove('hidden');
        } else {
            previewNote.textContent = 'Sem prévia para este formato (aparece no PDF ao compilar).';
        }
    }

    function build() {
        const path = imageSelect.value || 'arquivo';
        const lines = [
            `\\begin{figure}[${placement.value}]`,
            '    \\centering',
            `    \\includegraphics[width=${(width.value / 100).toFixed(2).replace(/0$/, '')}\\linewidth]{${path}}`,
        ];
        if (caption.value.trim()) lines.push(`    \\caption{${escapeLatex(caption.value.trim())}}`);
        if (label.value.trim()) lines.push(`    \\label{fig:${label.value.trim()}}`);
        lines.push('\\end{figure}');
        return lines.join('\n');
    }

    function refresh() {
        if (!labelEdited) label.value = slugify(caption.value || imageSelect.value.split('/').pop() || '');
        widthLabel.textContent = `${width.value}%`;
        code.textContent = build();
    }

    fillImages(initialImage || images[0]);
    imageSelect.addEventListener('change', () => { updatePreview(); refresh(); });
    importBtn.addEventListener('click', async () => {
        const path = await importImage();
        if (!path) return;
        if (!images.includes(path)) images.push(path);
        fillImages(path);
        updatePreview();
        refresh();
    });
    [width, caption, placement].forEach(input => input.addEventListener('input', refresh));
    label.addEventListener('input', () => { labelEdited = true; refresh(); });
    updatePreview();
    refresh();

    openDialog({
        title: 'Inserir figura',
        confirmLabel: 'Inserir figura',
        body: [
            field('Imagem', el('div', { class: 'flex gap-2' }, [imageSelect, importBtn])),
            el('div', { class: 'rounded-lg bg-bg border border-line p-3' }, [previewImg, previewNote]),
            field('Largura', el('div', { class: 'flex items-center gap-3' }, [width, widthLabel]), 'Em relação à largura do texto.'),
            field('Legenda', caption),
            field('Rótulo', label, 'Use \\ref{fig:rótulo} no texto para citar a figura.'),
            field('Posição', placement),
            el('div', {}, [el('span', { class: 'block text-sm font-medium mb-1', text: 'Código gerado' }), code]),
        ],
        onConfirm() {
            if (!imageSelect.value) return false;
            const packages = ['graphicx'];
            const extra = PLACEMENTS.find(([value]) => value === placement.value)[2];
            if (extra) packages.push(extra);
            onInsert(build(), packages);
        },
    });
}

// ---------------------------------------------------------------------------
// Contagem de palavras
// ---------------------------------------------------------------------------

/** Lê a saída do texcount (-merge -sub=section -nc). */
export function parseTexcount(output) {
    const number = (label) => {
        const match = output.match(new RegExp(`${label}: (\\d+)`));
        return match ? Number(match[1]) : 0;
    };
    // Os totais aparecem por último (depois de "Sum count"/"File(s) total")
    const tail = output.slice(Math.max(0, output.lastIndexOf('Sum count:')));
    const total = (label) => {
        const match = tail.match(new RegExp(`${label}: (\\d+)`));
        return match ? Number(match[1]) : number(label);
    };
    const subMarker = output.lastIndexOf('Subcounts:');
    const sections = [];
    if (subMarker >= 0) {
        for (const line of output.slice(subMarker).split(/\r?\n/)) {
            const m = line.match(/^\s*(\d+)\+(\d+)\+(\d+) \((\d+)\/(\d+)\/(\d+)\/(\d+)\) (.+)$/);
            if (!m) continue;
            const title = m[8].trim() === '_top_'
                ? 'Antes da primeira seção'
                : m[8].replace(/^(Part|Chapter|Section|Subsection|Subsubsection|Paragraph): /, '').trim();
            sections.push({ title, text: Number(m[1]), headers: Number(m[2]), captions: Number(m[3]) });
        }
    }
    return {
        text: total('Words in text'),
        headers: total('Words in headers'),
        captions: total('Words outside text \\(captions, etc\\.\\)'),
        floats: total('Number of floats/tables/figures'),
        equations: total('Number of math displayed'),
        sections,
    };
}

export function openWordCountDialog(stats, pages) {
    const cell = (text, cls = '') => el('td', { class: `py-1.5 px-2 ${cls}`, text: String(text) });
    const fmt = (n) => n.toLocaleString('pt-BR');
    const rows = stats.sections.map(s => el('tr', { class: 'border-t border-line' }, [
        cell(s.title),
        cell(fmt(s.text), 'text-right tabular-nums'),
        cell(fmt(s.captions), 'text-right tabular-nums text-muted'),
    ]));
    const summary = el('div', { class: 'grid grid-cols-2 sm:grid-cols-4 gap-3' }, [
        ['Palavras no texto', stats.text],
        ['Em títulos', stats.headers],
        ['Em legendas', stats.captions],
        ['Páginas', pages || '—'],
    ].map(([label, value]) => el('div', { class: 'card p-3' }, [
        el('span', { class: 'block text-xs text-muted', text: label }),
        el('span', { class: 'block text-xl font-semibold tabular-nums', text: typeof value === 'number' ? fmt(value) : value }),
    ])));
    openDialog({
        title: 'Contagem de palavras',
        confirmLabel: 'Fechar',
        cancelLabel: null,
        body: [
            summary,
            el('p', { class: 'text-sm text-muted', text: `${stats.floats} figuras/tabelas e ${stats.equations} equações em destaque.` }),
            stats.sections.length
                ? el('table', { class: 'w-full text-sm' }, [
                    el('thead', {}, el('tr', { class: 'text-muted text-xs text-left' }, [
                        el('th', { class: 'py-1 px-2 font-medium', text: 'Seção' }),
                        el('th', { class: 'py-1 px-2 font-medium text-right', text: 'Palavras' }),
                        el('th', { class: 'py-1 px-2 font-medium text-right', text: 'Legendas' }),
                    ])),
                    el('tbody', {}, rows),
                ])
                : null,
            el('p', { class: 'text-xs text-muted', text: 'Contagem do texcount: considera o texto dos arquivos incluídos e ignora comandos, matemática e o preâmbulo.' }),
        ],
    });
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------

/** @param {{onInsert: (code: string, packages: string[]) => void}} options */
export function openTableDialog({ onInsert }) {
    let rows = 3;
    let cols = 3;
    let data = [];       // matriz de strings
    let aligns = [];     // 'l' | 'c' | 'r'

    const rowsInput = el('input', { class: INPUT_CLASS, type: 'number', min: '1', max: '60', value: String(rows) });
    const colsInput = el('input', { class: INPUT_CLASS, type: 'number', min: '1', max: '15', value: String(cols) });
    const header = el('input', { type: 'checkbox', checked: '' });
    const style = el('select', { class: `${INPUT_CLASS} select` }, [
        el('option', { value: 'booktabs', text: 'Acadêmica (linhas só no topo, cabeçalho e base)' }),
        el('option', { value: 'grid', text: 'Com todas as linhas de grade' }),
    ]);
    const caption = el('input', { class: INPUT_CLASS, type: 'text', placeholder: 'Ex.: Parâmetros do processo' });
    const label = el('input', { class: INPUT_CLASS, type: 'text' });
    const gridWrap = el('div', { class: 'overflow-x-auto' });
    const code = el('pre', { class: 'font-mono text-xs bg-bg border border-line rounded p-3 whitespace-pre-wrap max-h-48 overflow-y-auto' });
    let labelEdited = false;

    function resize(newRows, newCols) {
        rows = Math.min(60, Math.max(1, newRows));
        cols = Math.min(15, Math.max(1, newCols));
        data = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (data[r] && data[r][c]) || ''));
        aligns = Array.from({ length: cols }, (_, c) => aligns[c] || (c === 0 ? 'l' : 'c'));
        rowsInput.value = String(rows);
        colsInput.value = String(cols);
        renderGrid();
    }

    /** Cola uma faixa copiada do Excel/Google Sheets (separada por tabs). */
    function pasteAt(text, startRow, startCol) {
        const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
        const needRows = startRow + lines.length;
        const needCols = startCol + Math.max(...lines.map(l => l.length));
        resize(Math.max(rows, needRows), Math.max(cols, needCols));
        lines.forEach((line, r) => line.forEach((value, c) => { data[startRow + r][startCol + c] = value.trim(); }));
        renderGrid();
        refresh();
    }

    function renderGrid() {
        const alignRow = el('tr', {}, aligns.map((align, c) => {
            const select = el('select', { class: 'w-full h-7 px-1 rounded bg-bg border border-line text-xs', 'aria-label': `Alinhamento da coluna ${c + 1}` }, [
                el('option', { value: 'l', text: 'Esquerda' }),
                el('option', { value: 'c', text: 'Centro' }),
                el('option', { value: 'r', text: 'Direita' }),
            ]);
            select.value = align;
            select.addEventListener('change', () => { aligns[c] = select.value; refresh(); });
            return el('th', { class: 'p-0.5' }, select);
        }));
        const body = data.map((row, r) => el('tr', {}, row.map((value, c) => {
            const input = el('input', {
                type: 'text',
                class: `w-full min-w-[7rem] h-8 px-2 border border-line bg-panel text-sm focus:outline-none focus:border-accent ${r === 0 && header.checked ? 'font-semibold' : ''}`,
                'aria-label': `Linha ${r + 1}, coluna ${c + 1}`,
            });
            input.value = value;
            input.addEventListener('input', () => { data[r][c] = input.value; refresh(); });
            input.addEventListener('paste', (event) => {
                const text = event.clipboardData.getData('text/plain');
                if (!text.includes('\t') && !text.includes('\n')) return;
                event.preventDefault();
                pasteAt(text, r, c);
            });
            return el('td', { class: 'p-0' }, input);
        })));
        gridWrap.replaceChildren(el('table', { class: 'border-collapse w-full' }, [el('thead', {}, alignRow), el('tbody', {}, body)]));
    }

    function build() {
        const booktabs = style.value === 'booktabs';
        const spec = booktabs ? aligns.join('') : `|${aligns.join('|')}|`;
        const rowLine = (row) => `        ${row.map(cell => escapeLatex(cell)).join(' & ')} \\\\`;
        const lines = ['\\begin{table}[htbp]', '    \\centering'];
        if (caption.value.trim()) lines.push(`    \\caption{${escapeLatex(caption.value.trim())}}`);
        if (label.value.trim()) lines.push(`    \\label{tab:${label.value.trim()}}`);
        lines.push(`    \\begin{tabular}{${spec}}`);
        lines.push(booktabs ? '        \\toprule' : '        \\hline');
        data.forEach((row, r) => {
            lines.push(rowLine(row));
            if (booktabs && r === 0 && header.checked && rows > 1) lines.push('        \\midrule');
            if (!booktabs) lines.push('        \\hline');
        });
        if (booktabs) lines.push('        \\bottomrule');
        lines.push('    \\end{tabular}', '\\end{table}');
        return lines.join('\n');
    }

    function refresh() {
        if (!labelEdited) label.value = slugify(caption.value);
        code.textContent = build();
    }

    rowsInput.addEventListener('change', () => { resize(Number(rowsInput.value), cols); refresh(); });
    colsInput.addEventListener('change', () => { resize(rows, Number(colsInput.value)); refresh(); });
    header.addEventListener('change', () => { renderGrid(); refresh(); });
    [style, caption].forEach(input => input.addEventListener('input', refresh));
    label.addEventListener('input', () => { labelEdited = true; refresh(); });
    resize(rows, cols);
    refresh();

    openDialog({
        title: 'Inserir tabela',
        confirmLabel: 'Inserir tabela',
        wide: true,
        body: [
            el('div', { class: 'grid grid-cols-2 sm:grid-cols-4 gap-3 items-end' }, [
                field('Linhas', rowsInput),
                field('Colunas', colsInput),
                el('label', { class: 'flex items-center gap-2 text-sm h-9 col-span-2' }, [header, 'Primeira linha é cabeçalho']),
            ]),
            el('div', {}, [
                el('span', { class: 'block text-sm font-medium mb-1', text: 'Conteúdo' }),
                gridWrap,
                el('span', { class: 'block text-xs text-muted mt-1', text: 'Dica: copie células no Excel ou no Google Planilhas e cole numa célula daqui.' }),
            ]),
            field('Estilo', style),
            el('div', { class: 'grid sm:grid-cols-2 gap-3' }, [
                field('Legenda', caption),
                field('Rótulo', label, 'Use \\ref{tab:rótulo} no texto.'),
            ]),
            el('div', {}, [el('span', { class: 'block text-sm font-medium mb-1', text: 'Código gerado' }), code]),
        ],
        onConfirm() {
            onInsert(build(), style.value === 'booktabs' ? ['booktabs'] : []);
        },
    });
}
