/**
 * equation-dialog.js - Janela "Inserir equação" com editor visual (MathLive).
 *
 * O usuário monta a fórmula vendo o resultado (como no Word ou no LyX), com
 * botões de estruturas e símbolos; o LaTeX é gerado e pode ser editado.
 * Carregado sob demanda (import dinâmico) para não pesar na abertura do app.
 *
 * Tudo funciona offline: as fontes vêm de mathlive/fonts.css, empacotadas pelo
 * Vite, e fontsDirectory = null impede o MathLive de buscar fontes num CDN.
 */
import 'mathlive/fonts.css';
import 'mathlive/static.css';
import { MathfieldElement, convertLatexToMarkup } from 'mathlive';
import { el, field, openDialog, INPUT_CLASS } from './dialogs.js';

MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

// [o que inserir no campo, como desenhar o botão, dica]
// #0 = seleção atual do campo; #? = espaço a preencher
const PALETTES = [
    {
        name: 'Estruturas',
        items: [
            ['\\frac{#0}{#?}', '\\frac{\\square}{\\square}', 'Fração'],
            ['\\sqrt{#0}', '\\sqrt{\\square}', 'Raiz quadrada'],
            ['\\sqrt[#?]{#0}', '\\sqrt[\\square]{\\square}', 'Raiz de índice n'],
            ['#0^{#?}', '\\square^{\\square}', 'Potência'],
            ['#0_{#?}', '\\square_{\\square}', 'Índice'],
            ['#0_{#?}^{#?}', '\\square_{\\square}^{\\square}', 'Índice e potência'],
            ['\\left(#0\\right)', '\\left(\\square\\right)', 'Parênteses ajustáveis'],
            ['\\left[#0\\right]', '\\left[\\square\\right]', 'Colchetes ajustáveis'],
            ['\\left\\{#0\\right\\}', '\\left\\{\\square\\right\\}', 'Chaves ajustáveis'],
            ['\\left|#0\\right|', '\\left|\\square\\right|', 'Valor absoluto'],
            ['\\sum_{#?}^{#?}#0', '\\sum_{\\square}^{\\square}', 'Somatório'],
            ['\\prod_{#?}^{#?}#0', '\\prod_{\\square}^{\\square}', 'Produtório'],
            ['\\int #0\\,d#?', '\\int', 'Integral'],
            ['\\int_{#?}^{#?} #0\\,d#?', '\\int_{\\square}^{\\square}', 'Integral definida'],
            ['\\iint #0\\,dA', '\\iint', 'Integral dupla'],
            ['\\oint #0\\,d#?', '\\oint', 'Integral de linha fechada'],
            ['\\lim_{#?\\to #?} #0', '\\lim_{\\square\\to\\square}', 'Limite'],
            ['\\frac{d#0}{d#?}', '\\frac{d\\square}{d\\square}', 'Derivada'],
            ['\\frac{\\partial #0}{\\partial #?}', '\\frac{\\partial\\square}{\\partial\\square}', 'Derivada parcial'],
            // Acentos com uma letra no botão: sobre um quadradinho eles quase não aparecem
            ['\\vec{#0}', '\\vec{v}', 'Vetor'],
            ['\\hat{#0}', '\\hat{x}', 'Chapéu (versor)'],
            ['\\bar{#0}', '\\bar{x}', 'Barra (média)'],
            ['\\dot{#0}', '\\dot{x}', 'Ponto (derivada no tempo)'],
            // Os três últimos ocupam duas colunas na grade (wide)
            ['\\begin{pmatrix}#? & #?\\\\ #? & #?\\end{pmatrix}', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', 'Matriz 2×2', true],
            ['\\begin{bmatrix}#? & #? & #?\\\\ #? & #? & #?\\\\ #? & #? & #?\\end{bmatrix}', '\\begin{bmatrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{bmatrix}', 'Matriz 3×3', true],
            ['\\begin{cases}#? & #?\\\\ #? & #?\\end{cases}', '\\begin{cases}x+y=1\\\\x-y=0\\end{cases}', 'Casos (sistema)', true],
            ['\\text{#0}', '\\text{abc}', 'Texto dentro da equação'],
        ],
    },
    {
        name: 'Gregas',
        items: ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'lambda',
            'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'varphi', 'chi', 'psi', 'omega',
            'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega']
            .map(name => [`\\${name}`, `\\${name}`, name]),
    },
    {
        name: 'Operadores',
        items: [
            ['\\times', '\\times', 'Multiplicação (×)'],
            ['\\cdot', '\\cdot', 'Multiplicação (ponto)'],
            ['\\div', '\\div', 'Divisão'],
            ['\\pm', '\\pm', 'Mais ou menos'],
            ['\\mp', '\\mp', 'Menos ou mais'],
            ['\\neq', '\\neq', 'Diferente'],
            ['\\approx', '\\approx', 'Aproximadamente'],
            ['\\equiv', '\\equiv', 'Equivalente'],
            ['\\propto', '\\propto', 'Proporcional'],
            ['\\leq', '\\leq', 'Menor ou igual'],
            ['\\geq', '\\geq', 'Maior ou igual'],
            ['\\ll', '\\ll', 'Muito menor'],
            ['\\gg', '\\gg', 'Muito maior'],
            ['\\infty', '\\infty', 'Infinito'],
            ['\\partial', '\\partial', 'Derivada parcial (símbolo)'],
            ['\\nabla', '\\nabla', 'Nabla (gradiente)'],
            ['^\\circ', '30^\\circ', 'Grau'],
            ['\\in', '\\in', 'Pertence'],
            ['\\notin', '\\notin', 'Não pertence'],
            ['\\subset', '\\subset', 'Subconjunto'],
            ['\\cup', '\\cup', 'União'],
            ['\\cap', '\\cap', 'Interseção'],
            ['\\emptyset', '\\emptyset', 'Conjunto vazio'],
            ['\\forall', '\\forall', 'Para todo'],
            ['\\exists', '\\exists', 'Existe'],
            ['\\to', '\\to', 'Tende a / seta'],
            ['\\Rightarrow', '\\Rightarrow', 'Implica'],
            ['\\Leftrightarrow', '\\Leftrightarrow', 'Se e somente se'],
            ['\\cdots', '\\cdots', 'Reticências'],
        ],
    },
    {
        name: 'Funções',
        items: ['sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'log', 'ln', 'exp', 'max', 'min', 'det']
            .map(name => [`\\${name}\\left(#0\\right)`, `\\${name}`, `Função ${name}`]),
    },
];

const TYPES = [
    ['equation', 'Numerada (em destaque)'],
    ['equation*', 'Sem número (em destaque)'],
    ['inline', 'No meio do texto'],
];

/** Construções que exigem o pacote amsmath. */
const NEEDS_AMSMATH = /\\(?:text|iint|iiint|dfrac|tfrac)\b|\\begin\{(?:pmatrix|bmatrix|vmatrix|matrix|cases|aligned)\}/;

function markup(latex) {
    try {
        return convertLatexToMarkup(latex);
    } catch {
        return latex;
    }
}

/**
 * Abre a janela. `initialLatex` vem da seleção do editor (opcional).
 * @param {{initialLatex?: string, suggestedLabel?: string, onInsert: (code: string, opts: {block: boolean, packages: string[]}) => void}} options
 */
export function openEquationDialog({ initialLatex = '', suggestedLabel = '', onInsert }) {
    const mf = new MathfieldElement();
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.smartFence = true;
    mf.value = initialLatex;
    mf.setAttribute('aria-label', 'Equação');

    const code = el('textarea', {
        class: 'w-full font-mono text-sm rounded-lg bg-bg border border-line p-2.5 focus:outline-none focus:border-accent',
        rows: '3',
        spellcheck: 'false',
        'aria-label': 'Código LaTeX da equação',
    });
    code.value = initialLatex;

    // Código <-> campo visual, sem laço de atualização
    let syncing = false;
    mf.addEventListener('input', () => {
        if (syncing) return;
        syncing = true;
        code.value = mf.getValue('latex');
        syncing = false;

    });
    code.addEventListener('input', () => {
        if (syncing) return;
        syncing = true;
        mf.setValue(code.value, { silenceNotifications: true });
        syncing = false;

    });

    // Abas de botões
    const grid = el('div', { class: 'eq-palette', role: 'tabpanel' });
    const tabs = el('div', { class: 'tabs mb-2', role: 'tablist', 'aria-label': 'Grupos de símbolos' });
    function showPalette(index) {
        [...tabs.children].forEach((tab, i) => tab.setAttribute('aria-selected', String(i === index)));
        grid.replaceChildren(...PALETTES[index].items.map(([insert, label, title, wide]) => {
            const btn = el('button', { type: 'button', class: wide ? 'eq-btn eq-btn-wide' : 'eq-btn', title, 'aria-label': title });
            btn.innerHTML = markup(label);
            // mousedown sem foco: o cursor continua no campo da equação
            btn.addEventListener('mousedown', (event) => event.preventDefault());
            btn.addEventListener('click', () => {
                mf.insert(insert, { selectionMode: 'placeholder', focus: true });
                mf.dispatchEvent(new Event('input'));
            });
            return btn;
        }));
    }
    PALETTES.forEach((palette, index) => {
        const tab = el('button', { type: 'button', class: 'tab', role: 'tab', text: palette.name });
        tab.addEventListener('click', () => showPalette(index));
        tabs.appendChild(tab);
    });
    showPalette(0);

    // Tipo e rótulo
    let type = 'equation';
    const typeGroup = el('div', { class: 'flex flex-wrap gap-2', role: 'radiogroup', 'aria-label': 'Tipo de equação' });
    const label = el('input', { class: INPUT_CLASS, type: 'text', placeholder: 'ex.: segunda-lei' });
    label.value = suggestedLabel;
    const labelField = field('Rótulo', label, 'Use \\eqref{eq:rótulo} no texto para citar a equação. Pode trocar por um nome que lembre a fórmula.');

    TYPES.forEach(([value, text]) => {
        const option = el('button', { type: 'button', class: 'eq-type', role: 'radio', text });
        option.addEventListener('click', () => {
            type = value;
            [...typeGroup.children].forEach(o => o.setAttribute('aria-checked', String(o === option)));
            labelField.classList.toggle('hidden', type !== 'equation');
        });
        option.setAttribute('aria-checked', String(value === type));
        typeGroup.appendChild(option);
    });

    const error = el('p', { class: 'text-sm text-danger hidden', role: 'alert' });

    openDialog({
        title: 'Inserir equação',
        confirmLabel: 'Inserir equação',
        wide: true,
        body: [
            el('div', {}, [tabs, grid]),
            el('div', {}, [
                mf,
                el('p', { class: 'text-xs text-muted mt-2' }, [
                    'Dica: digite ', el('kbd', { text: '/' }), ' para fração, ', el('kbd', { text: '^' }),
                    ' para expoente, ', el('kbd', { text: '_' }), ' para índice e o nome da letra grega (ex.: ',
                    el('kbd', { text: 'alpha' }), '). Use Tab para ir ao próximo espaço.',
                ]),
            ]),
            field('Tipo', typeGroup),
            labelField,
            field('Código LaTeX', code, 'Gerado a partir da fórmula acima. Também pode ser editado aqui.'),
            error,
        ],
        onConfirm() {
            const latex = code.value.trim();
            if (!latex) {
                error.textContent = 'Monte a equação antes de inserir.';
                error.classList.remove('hidden');
                return false;
            }
            if (latex.includes('\\placeholder')) {
                error.textContent = 'Ainda há espaços vazios na equação (os quadradinhos). Preencha ou apague antes de inserir.';
                error.classList.remove('hidden');
                return false;
            }
            const packages = (type === 'equation*' || NEEDS_AMSMATH.test(latex)) ? ['amsmath'] : [];
            if (type === 'inline') {
                onInsert(`$${latex}$`, { block: false, packages });
            } else {
                const lines = [`\\begin{${type}}`, `    ${latex}`];
                if (type === 'equation' && label.value.trim()) lines.push(`    \\label{eq:${label.value.trim()}}`);
                lines.push(`\\end{${type}}`);
                onInsert(lines.join('\n') + '\n', { block: true, packages });
            }
        },
    });

    // Foco no campo depois que a janela estiver na tela
    setTimeout(() => mf.focus(), 50);
}
