/**
 * completions.js - Autocompletar do editor (CodeMirror 6).
 *
 * Fontes: comandos LaTeX comuns, ambientes (\begin{...} já fecha o \end),
 * rótulos do projeto para \ref, chaves dos .bib para \cite, imagens para
 * \includegraphics e arquivos .tex para \input/\include.
 */
import { snippetCompletion } from '@codemirror/autocomplete';

// [comando, snippet (sem a barra inicial), descrição]
const COMMANDS = [
    ['section', 'section{${título}}', 'Seção'],
    ['subsection', 'subsection{${título}}', 'Subseção'],
    ['subsubsection', 'subsubsection{${título}}', 'Subsubseção'],
    ['chapter', 'chapter{${título}}', 'Capítulo (book/report)'],
    ['paragraph', 'paragraph{${título}}', 'Parágrafo com título'],
    ['textbf', 'textbf{${texto}}', 'Negrito'],
    ['textit', 'textit{${texto}}', 'Itálico'],
    ['emph', 'emph{${texto}}', 'Ênfase'],
    ['underline', 'underline{${texto}}', 'Sublinhado'],
    ['texttt', 'texttt{${texto}}', 'Fonte monoespaçada'],
    ['footnote', 'footnote{${texto}}', 'Nota de rodapé'],
    ['cite', 'cite{${chave}}', 'Citação'],
    ['citep', 'citep{${chave}}', 'Citação entre parênteses (natbib)'],
    ['citet', 'citet{${chave}}', 'Citação no texto (natbib)'],
    ['ref', 'ref{${rótulo}}', 'Referência a um rótulo'],
    ['eqref', 'eqref{${rótulo}}', 'Referência a equação'],
    ['label', 'label{${rótulo}}', 'Rótulo para referências'],
    ['caption', 'caption{${legenda}}', 'Legenda'],
    ['includegraphics', 'includegraphics[width=${0.8}\\linewidth]{${arquivo}}', 'Imagem'],
    ['item', 'item ${}', 'Item de lista'],
    ['usepackage', 'usepackage{${pacote}}', 'Carregar pacote'],
    ['input', 'input{${arquivo}}', 'Incluir arquivo .tex'],
    ['include', 'include{${arquivo}}', 'Incluir capítulo (com quebra de página)'],
    ['url', 'url{${endereço}}', 'Endereço web'],
    ['href', 'href{${endereço}}{${texto}}', 'Link com texto'],
    ['frac', 'frac{${a}}{${b}}', 'Fração'],
    ['sqrt', 'sqrt{${x}}', 'Raiz quadrada'],
    ['sum', 'sum_{${i=1}}^{${n}}', 'Somatório'],
    ['int', 'int_{${a}}^{${b}}', 'Integral'],
    ['lim', 'lim_{${x \\to 0}}', 'Limite'],
    ['mathbf', 'mathbf{${x}}', 'Negrito em matemática'],
    ['mathrm', 'mathrm{${x}}', 'Texto reto em matemática'],
    ['text', 'text{${texto}}', 'Texto dentro de matemática'],
    ['title', 'title{${título}}', 'Título do documento'],
    ['author', 'author{${autor}}', 'Autor'],
    ['date', 'date{${data}}', 'Data'],
    ['maketitle', 'maketitle', 'Gera o título'],
    ['tableofcontents', 'tableofcontents', 'Sumário'],
    ['listoffigures', 'listoffigures', 'Lista de figuras'],
    ['listoftables', 'listoftables', 'Lista de tabelas'],
    ['newpage', 'newpage', 'Nova página'],
    ['centering', 'centering', 'Centralizar'],
    ['noindent', 'noindent', 'Sem recuo de parágrafo'],
    ['vspace', 'vspace{${1em}}', 'Espaço vertical'],
    ['hspace', 'hspace{${1em}}', 'Espaço horizontal'],
    ['linewidth', 'linewidth', 'Largura da linha'],
    ['textwidth', 'textwidth', 'Largura do texto'],
    ['toprule', 'toprule', 'Linha superior (booktabs)'],
    ['midrule', 'midrule', 'Linha do meio (booktabs)'],
    ['bottomrule', 'bottomrule', 'Linha inferior (booktabs)'],
    ['hline', 'hline', 'Linha horizontal'],
    ['today', 'today', 'Data de hoje'],
    ['LaTeX', 'LaTeX{}', 'Logotipo do LaTeX'],
];

const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'lambda',
    'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'varphi', 'chi', 'psi', 'omega',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega'];

// [ambiente, conteúdo do corpo, descrição]
const ENVIRONMENTS = [
    ['itemize', '\\item ${}', 'Lista com marcadores'],
    ['enumerate', '\\item ${}', 'Lista numerada'],
    ['description', '\\item[${termo}] ${}', 'Lista de definições'],
    ['equation', '${}', 'Equação numerada'],
    ['equation*', '${}', 'Equação sem número'],
    ['align', '${} &= ${} \\\\', 'Equações alinhadas'],
    ['align*', '${} &= ${} \\\\', 'Equações alinhadas sem número'],
    ['gather', '${}', 'Equações centralizadas'],
    ['cases', '${} & ${} \\\\', 'Casos (dentro de matemática)'],
    ['pmatrix', '${} & ${} \\\\', 'Matriz com parênteses'],
    ['bmatrix', '${} & ${} \\\\', 'Matriz com colchetes'],
    ['figure', '\\centering\n\t\\includegraphics[width=0.8\\linewidth]{${arquivo}}\n\t\\caption{${legenda}}\n\t\\label{fig:${rótulo}}', 'Figura'],
    ['table', '\\centering\n\t\\caption{${legenda}}\n\t\\label{tab:${rótulo}}\n\t${}', 'Tabela'],
    ['tabular', '${}', 'Grade de tabela'],
    ['center', '${}', 'Centralizado'],
    ['quote', '${}', 'Citação recuada'],
    ['abstract', '${}', 'Resumo'],
    ['minipage', '${}', 'Minipágina'],
    ['verbatim', '${}', 'Texto literal'],
    ['lstlisting', '${}', 'Código-fonte (listings)'],
    ['frame', '\\frametitle{${título}}\n\t${}', 'Slide (beamer)'],
    ['theorem', '${}', 'Teorema'],
    ['proof', '${}', 'Demonstração'],
];

const ENV_ARGS = { tabular: '{${lcr}}', minipage: '{${0.5}\\linewidth}', figure: '[htbp]', table: '[htbp]' };

const IMAGE_EXT = /\.(png|jpe?g|pdf|eps|svg|gif)$/i;

const commandOptions = [
    ...COMMANDS.map(([name, body, info]) => snippetCompletion('\\' + body, { label: '\\' + name, detail: info, type: 'keyword' })),
    ...GREEK.map(name => ({ label: '\\' + name, detail: 'Letra grega', type: 'constant' })),
];

const environmentOptions = ENVIRONMENTS.map(([name, body, info]) => {
    const args = ENV_ARGS[name] || '';
    return snippetCompletion(`\\begin{${name}}${args}\n\t${body}\n\\end{${name}}`, { label: name, detail: info, type: 'type' });
});

/** Rótulos (\label) de todos os arquivos de texto do projeto. */
function collectLabels(files) {
    const labels = new Map();
    for (const [path, file] of Object.entries(files)) {
        if (typeof file.content !== 'string') continue;
        for (const match of file.content.matchAll(/\\label\{([^}]+)\}/g)) {
            if (!labels.has(match[1])) labels.set(match[1], path);
        }
    }
    return labels;
}

/** Entradas dos .bib: chave, autor e título. */
function collectBibEntries(files) {
    const entries = [];
    for (const [path, file] of Object.entries(files)) {
        if (!path.toLowerCase().endsWith('.bib') || typeof file.content !== 'string') continue;
        const blocks = file.content.split(/(?=@\w+\s*\{)/);
        for (const block of blocks) {
            const head = block.match(/^@(\w+)\s*\{\s*([^,\s]+)\s*,/);
            if (!head || /^(comment|string|preamble)$/i.test(head[1])) continue;
            const field = (name) => {
                const m = block.match(new RegExp(name + '\\s*=\\s*[{"]((?:[^{}"]|\\{[^{}]*\\})*)[}"]', 'i'));
                return m ? m[1].replace(/[{}]/g, '').replace(/\s+/g, ' ').trim() : '';
            };
            entries.push({ key: head[2], author: field('author'), title: field('title'), year: field('year') });
        }
    }
    return entries;
}

/** Caminho relativo a `base` (pasta do arquivo principal). */
function relativeTo(base, path) {
    return base && path.startsWith(base + '/') ? path.slice(base.length + 1) : path;
}

/**
 * @param {() => {files: object, mainDir: string}} getProject
 */
export function createCompletionSources(getProject) {
    function argumentSource(pattern, makeOptions) {
        return (context) => {
            const match = context.matchBefore(pattern);
            if (!match) return null;
            // Começa depois da última "{" ou "," (várias chaves em \cite{a,b})
            const text = match.text;
            const start = Math.max(text.lastIndexOf('{'), text.lastIndexOf(',')) + 1;
            return {
                from: match.from + start,
                options: makeOptions(getProject()),
                validFor: /^[^},]*$/,
            };
        };
    }

    const refSource = argumentSource(/\\(?:ref|eqref|autoref|cref|Cref|pageref|nameref)\{[^}]*$/, ({ files }) =>
        [...collectLabels(files)].map(([label, path]) => ({ label, detail: path, type: 'variable' })));

    const citeSource = argumentSource(
        /\\(?:cite[tp]?|citeauthor|citeyear|parencite|textcite|autocite|nocite)\*?(?:\[[^\]]*\])*\{[^}]*$/,
        ({ files }) => collectBibEntries(files).map(e => ({
            label: e.key,
            detail: [e.author.split(' and ')[0], e.year].filter(Boolean).join(', '),
            info: e.title || undefined,
            type: 'text',
        })));

    const graphicsSource = argumentSource(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*$/, ({ files, mainDir }) =>
        Object.keys(files).filter(p => IMAGE_EXT.test(p)).map(p => ({ label: relativeTo(mainDir, p), type: 'text' })));

    const inputSource = argumentSource(/\\(?:input|include|subfile)\{[^}]*$/, ({ files, mainDir }) =>
        Object.keys(files).filter(p => p.endsWith('.tex')).map(p => ({ label: relativeTo(mainDir, p).replace(/\.tex$/, ''), type: 'text' })));

    function commandSource(context) {
        const match = context.matchBefore(/\\[a-zA-Z]*$/);
        if (!match || (match.from === match.to && !context.explicit)) return null;
        // \begin{ é tratado pela fonte de ambientes
        if (context.matchBefore(/\\begin\{[\w*]*$/)) return null;
        return { from: match.from, options: commandOptions, validFor: /^\\[a-zA-Z]*$/ };
    }

    function environmentSource(context) {
        const match = context.matchBefore(/\\begin\{[\w*]*$/);
        if (!match) return null;
        // Substitui o "\begin{..." digitado pelo ambiente completo. O filtro é
        // manual porque o texto digitado inclui o "\begin{" e o rótulo não.
        const typed = match.text.replace(/^\\begin\{/, '');
        return {
            from: match.from,
            filter: false,
            options: environmentOptions.filter(o => o.label.startsWith(typed)),
        };
    }

    return [environmentSource, refSource, citeSource, graphicsSource, inputSource, commandSource];
}
