/**
 * toolbar.js - Barra de formatação acima do editor.
 * Cada botão chama uma ação recebida do app (envolver seleção, inserir snippet, abrir diálogo).
 */

const ICONS = {
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M14 5h-4m4 14h-4m3-14-2 14"/>',
    underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
    heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
    bullets: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
    numbers: '<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 13.5a1.5 1.5 0 1 1 2.6 1L3.5 18h3"/>',
    mathInline: '<path d="M5 18c2 0 2.5-3 3-6s1-6 3-6M5 11h6M14 9l5 7M19 9l-5 7"/>',
    equation: '<path d="M4 9h7M4 15h7M15 6l5 12M20 6l-5 12"/>',
    figure: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    cite: '<path d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6"/>',
    ref: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    footnote: '<path d="M4 7h10M4 12h10M4 17h6M18 4v6M16 6l2-2 2 2"/>',
};

function icon(name) {
    return `<svg fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

/**
 * @param {HTMLElement} container
 * @param {object} actions - funções chamadas pelos botões
 */
export function createToolbar(container, actions) {
    const groups = [
        [
            ['bold', 'Negrito (Ctrl+B)', actions.bold],
            ['italic', 'Itálico (Ctrl+I)', actions.italic],
            ['underline', 'Sublinhado', actions.underline],
        ],
        [
            ['heading', 'Seção, subseção ou capítulo', null, 'sections'],
        ],
        [
            ['bullets', 'Lista com marcadores', actions.bullets],
            ['numbers', 'Lista numerada', actions.numbers],
        ],
        [
            ['mathInline', 'Matemática no texto: envolve a seleção em $...$', actions.mathInline],
            ['equation', 'Inserir equação com editor visual (Ctrl+Shift+E)', actions.equation, null, 'Equação'],
        ],
        [
            ['figure', 'Inserir figura', actions.figure, null, 'Figura'],
            ['table', 'Inserir tabela', actions.table, null, 'Tabela'],
        ],
        [
            ['cite', 'Citação (\\cite)', actions.cite],
            ['ref', 'Referência a figura, tabela ou seção (\\ref)', actions.ref],
            ['footnote', 'Nota de rodapé', actions.footnote],
        ],
    ];

    container.replaceChildren();
    groups.forEach((group, index) => {
        if (index > 0) {
            const sep = document.createElement('span');
            sep.className = 'toolbar-sep';
            container.appendChild(sep);
        }
        for (const [name, title, handler, special, text] of group) {
            if (special === 'sections') {
                container.appendChild(sectionMenu(actions.section));
                continue;
            }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = text ? 'toolbar-btn toolbar-btn-text' : 'toolbar-btn';
            btn.title = title;
            btn.setAttribute('aria-label', title);
            btn.innerHTML = icon(name) + (text ? `<span>${text}</span>` : '');
            // mousedown sem foco: mantém a seleção do editor ao clicar
            btn.addEventListener('mousedown', (event) => event.preventDefault());
            btn.addEventListener('click', handler);
            container.appendChild(btn);
        }
    });
}

function sectionMenu(onPick) {
    const select = document.createElement('select');
    select.className = 'toolbar-select';
    select.title = 'Seção, subseção ou capítulo';
    select.setAttribute('aria-label', 'Inserir seção');
    const options = [
        ['', 'Título...'],
        ['chapter', 'Capítulo'],
        ['section', 'Seção'],
        ['subsection', 'Subseção'],
        ['subsubsection', 'Subsubseção'],
        ['paragraph', 'Parágrafo'],
    ];
    for (const [value, label] of options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    }
    select.addEventListener('change', () => {
        if (select.value) onPick(select.value);
        select.value = '';
    });
    return select;
}
