/**
 * spell.js - Corretor ortográfico pt-BR no editor (CodeMirror 6).
 *
 * Verifica só o texto corrido das linhas visíveis: ignora comentários,
 * matemática, nomes de comandos e argumentos que não são texto (\ref, \cite,
 * \label, \includegraphics, \begin...). As palavras desconhecidas ganham um
 * sublinhado; o clique direito mostra sugestões e "Adicionar ao dicionário".
 */
import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin } from '@codemirror/view';

// Argumentos que não são texto e não devem ser verificados
const NON_TEXT_COMMANDS = 'label|ref|eqref|autoref|cref|Cref|pageref|nameref|cite[tp]?|citeauthor|citeyear|parencite|textcite|autocite|nocite|'
    + 'includegraphics|input|include|subfile|usepackage|RequirePackage|documentclass|bibliography|bibliographystyle|addbibresource|'
    + 'begin|end|url|href|hypersetup|setlength|setcounter|newcommand|renewcommand|newenvironment|definecolor|color|textcolor|'
    + 'pagestyle|thispagestyle|pagenumbering|geometry|lstset|graphicspath|fontsize|selectlanguage';

const MASKS = [
    /(^|[^\\])%.*$/gm,                                          // comentários
    /\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\\])*\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g,  // matemática
    /\\begin\{(equation|align|gather|multline|eqnarray|displaymath|math|verbatim|lstlisting|tikzpicture)\*?\}[\s\S]*?\\end\{\1\*?\}/g,
    // (?![a-zA-Z@]) evita casar só o começo de outro comando (\bibliography em \bibliographystyle)
    new RegExp(`\\\\(?:${NON_TEXT_COMMANDS})(?![a-zA-Z@])\\*?(?:\\[[^\\]]*\\])*(?:\\{[^{}]*\\})*(?:\\[[^\\]]*\\])?`, 'g'),
    /\\[a-zA-Z@]+\*?/g,                                          // demais nomes de comando
    /\[[^\]\n]*=[^\]\n]*\]/g,                                    // opções chave=valor
];

const WORD = /[\p{L}][\p{L}'’-]*[\p{L}]|[\p{L}]{2,}/gu;

/** Palavras de texto corrido no trecho, com a posição no documento. */
function proseWords(text, offset) {
    let masked = text;
    for (const re of MASKS) {
        masked = masked.replace(re, (m) => m.replace(/[^\n]/g, ' '));
    }
    const words = [];
    for (const match of masked.matchAll(WORD)) {
        const word = match[0].replace(/^['’-]+|['’-]+$/g, '');
        // Siglas (ABNT, MCVD) e palavras com letra única ficam de fora
        if (word.length < 2 || word === word.toUpperCase()) continue;
        words.push({ word, from: offset + match.index, to: offset + match.index + match[0].length });
    }
    return words;
}

const setMisspelled = StateEffect.define();

const misspelledField = StateField.define({
    create: () => Decoration.none,
    update(value, tr) {
        value = value.map(tr.changes);
        for (const effect of tr.effects) {
            if (effect.is(setMisspelled)) value = effect.value;
        }
        return value;
    },
    provide: (field) => EditorView.decorations.from(field),
});

const misspelledMark = Decoration.mark({ class: 'cm-misspelled' });

/**
 * @param {object} options
 * @param {(words: string[]) => Promise<string[]>} options.check - devolve as desconhecidas
 * @param {(word: string) => Promise<string[]>} options.suggest
 * @param {(word: string) => Promise<void>} options.add
 * @param {(event: MouseEvent, items: Array<{label: string, action: () => void, muted?: boolean}>) => void} options.showMenu
 */
export function spellChecker({ check, suggest, add, showMenu }) {
    const known = new Map();      // palavra -> true (correta) | false (desconhecida)
    const ignored = new Set();    // "Ignorar" vale só nesta sessão

    const isWrong = (word) => !ignored.has(word) && known.get(word) === false;

    const plugin = ViewPlugin.fromClass(class {
        constructor(view) {
            this.view = view;
            this.timer = null;
            this.schedule(50);
        }

        update(update) {
            if (update.docChanged || update.viewportChanged) this.schedule(400);
        }

        schedule(delay) {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.run(), delay);
        }

        async run() {
            const view = this.view;
            const found = [];
            for (const { from, to } of view.visibleRanges) {
                found.push(...proseWords(view.state.sliceDoc(from, to), from));
            }
            const unknown = [...new Set(found.map(f => f.word))].filter(w => !known.has(w));
            if (unknown.length) {
                try {
                    const wrong = new Set(await check(unknown));
                    unknown.forEach(w => known.set(w, !wrong.has(w)));
                } catch (err) {
                    console.warn('Corretor indisponível:', err);
                    return;
                }
            }
            if (this.view !== view || !view.dom.isConnected) return;
            this.apply(found);
        }

        apply(found) {
            const builder = new RangeSetBuilder();
            const docLength = this.view.state.doc.length;
            for (const f of found) {
                if (isWrong(f.word) && f.to <= docLength) builder.add(f.from, f.to, misspelledMark);
            }
            this.view.dispatch({ effects: setMisspelled.of(builder.finish()) });
        }

        destroy() {
            clearTimeout(this.timer);
        }
    });

    const contextMenu = EditorView.domEventHandlers({
        contextmenu(event, view) {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return false;
            const field = view.state.field(misspelledField, false);
            let hit = null;
            field?.between(pos, pos, (from, to) => { hit = { from, to }; });
            if (!hit) return false;
            event.preventDefault();
            const word = view.state.sliceDoc(hit.from, hit.to);

            const refresh = () => {
                const instance = view.plugin(plugin);
                if (instance) instance.schedule(0);
            };
            const replaceWith = (text) => view.dispatch({ changes: { from: hit.from, to: hit.to, insert: text } });

            showMenu(event, [{ label: 'Buscando sugestões...', muted: true, action: () => {} }]);
            suggest(word).then((suggestions) => {
                const items = suggestions.length
                    ? suggestions.map(s => ({ label: s, action: () => replaceWith(s) }))
                    : [{ label: 'Nenhuma sugestão', muted: true, action: () => {} }];
                items.push({ separator: true });
                items.push({
                    label: 'Adicionar ao dicionário',
                    action: async () => {
                        await add(word);
                        known.set(word, true);
                        refresh();
                    },
                });
                items.push({
                    label: 'Ignorar nesta sessão',
                    action: () => {
                        ignored.add(word);
                        refresh();
                    },
                });
                showMenu(event, items);
            }).catch(() => {});
            return true;
        },
    });

    return [misspelledField, plugin, contextMenu];
}

export const spellTheme = EditorView.baseTheme({
    '.cm-misspelled': {
        textDecoration: 'underline wavy var(--danger)',
        textDecorationSkipInk: 'none',
        textUnderlineOffset: '3px',
    },
});
