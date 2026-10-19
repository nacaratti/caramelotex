/**
 * outline.js - Sumário do documento e contagem de palavras.
 *
 * Percorre o arquivo principal na ordem em que o LaTeX lê, entrando em
 * \input, \include e \subfile (caminhos relativos à pasta do arquivo
 * principal, como o próprio LaTeX resolve).
 */

const SECTION_LEVELS = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5 };
const SECTION_RE = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/;
const INCLUDE_RE = /\\(?:input|include|subfile)\s*\{([^}]+)\}/g;
const FLOAT_BEGIN_RE = /\\begin\{(figure|table)\*?\}/;
const CAPTION_RE = /\\caption\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/;

/** Remove comentários (% não escapado até o fim da linha). */
function stripComment(line) {
    return line.replace(/(^|[^\\])%.*$/, '$1');
}

/** Texto legível de um título: tira comandos simples como \textbf{...} e \\. */
function cleanTitle(title) {
    return title
        .replace(/\\(?:textbf|textit|emph|texttt|underline|mbox)\{([^{}]*)\}/g, '$1')
        .replace(/\\\\/g, ' ')
        .replace(/\\[a-zA-Z]+\*?/g, '')
        .replace(/[{}$~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function joinPath(base, rel) {
    const parts = [];
    (base ? base + '/' + rel : rel).split('/').forEach(part => {
        if (part === '..') parts.pop();
        else if (part && part !== '.') parts.push(part);
    });
    return parts.join('/');
}

/**
 * Lista os arquivos na ordem de leitura do documento, a partir do principal.
 * @returns {string[]} caminhos de arquivos .tex existentes no projeto
 */
export function documentFiles(files, mainFile) {
    if (!mainFile || !files[mainFile]) return [];
    const mainDir = mainFile.includes('/') ? mainFile.slice(0, mainFile.lastIndexOf('/')) : '';
    const order = [];
    const seen = new Set();

    function visit(path) {
        if (seen.has(path) || typeof files[path]?.content !== 'string') return;
        seen.add(path);
        order.push(path);
        for (const line of files[path].content.split('\n')) {
            for (const match of stripComment(line).matchAll(INCLUDE_RE)) {
                let target = joinPath(mainDir, match[1].trim());
                if (!files[target] && files[target + '.tex']) target += '.tex';
                visit(target);
            }
        }
    }

    visit(mainFile);
    return order;
}

/**
 * @returns {Array<{kind: 'section'|'figure'|'table', level: number, title: string, file: string, line: number}>}
 */
export function buildOutline(files, mainFile) {
    const items = [];
    const mainDir = mainFile && mainFile.includes('/') ? mainFile.slice(0, mainFile.lastIndexOf('/')) : '';
    const seen = new Set();

    function visit(path) {
        if (seen.has(path) || typeof files[path]?.content !== 'string') return;
        seen.add(path);
        let openFloat = null; // { kind, line } esperando a \caption

        files[path].content.split('\n').forEach((rawLine, index) => {
            const line = stripComment(rawLine);
            const lineNumber = index + 1;

            const section = line.match(SECTION_RE);
            if (section) {
                items.push({
                    kind: 'section',
                    level: SECTION_LEVELS[section[1]],
                    title: cleanTitle(section[2]) || '(sem título)',
                    file: path,
                    line: lineNumber,
                });
            }

            const float = line.match(FLOAT_BEGIN_RE);
            if (float) openFloat = { kind: float[1], line: lineNumber };
            if (openFloat) {
                const caption = line.match(CAPTION_RE);
                if (caption) {
                    items.push({ kind: openFloat.kind, level: 9, title: cleanTitle(caption[1]), file: path, line: lineNumber });
                    openFloat = null;
                } else if (/\\end\{(figure|table)\*?\}/.test(line)) {
                    openFloat = null;
                }
            }

            // Entra nos arquivos incluídos no ponto em que aparecem
            for (const match of line.matchAll(INCLUDE_RE)) {
                let target = joinPath(mainDir, match[1].trim());
                if (!files[target] && files[target + '.tex']) target += '.tex';
                visit(target);
            }
        });
    }

    if (mainFile) visit(mainFile);
    return items;
}

/**
 * Conta as palavras do texto do documento (aproximado): ignora o preâmbulo,
 * comentários, matemática, nomes de comandos e argumentos que não são texto
 * (\label, \ref, \cite, \includegraphics, \usepackage...).
 */
export function countWords(files, mainFile) {
    let total = 0;
    for (const path of documentFiles(files, mainFile)) {
        let text = files[path].content;
        if (path === mainFile) {
            const begin = text.indexOf('\\begin{document}');
            if (begin >= 0) text = text.slice(begin);
        }
        text = text
            .split('\n').map(stripComment).join('\n')
            .replace(/\\begin\{(equation|align|gather|multline|eqnarray|displaymath|math|verbatim|lstlisting|tabular)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
            .replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g, ' ')
            .replace(/\\(?:label|ref|eqref|autoref|cref|Cref|pageref|cite[tp]?|citeauthor|citeyear|parencite|textcite|autocite|nocite|includegraphics|input|include|subfile|usepackage|documentclass|bibliography|bibliographystyle|addbibresource|begin|end|url|href|vspace|hspace|setlength|newcommand|renewcommand)\*?(?:\[[^\]]*\])*(?:\{[^{}]*\})?/g, ' ')
            .replace(/\\[a-zA-Z]+\*?/g, ' ');
        const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
        total += words ? words.length : 0;
    }
    return total;
}
