/**
 * editor.js - Editor de código (CodeMirror 6) com uma API pequena para o app.
 *
 * Cada arquivo aberto tem seu próprio EditorState, então o desfazer/refazer
 * e a posição do cursor de cada arquivo são preservados ao trocar de arquivo.
 * As cores vêm de variáveis CSS (--ed-*), definidas pelo tema claro/escuro.
 */
import { EditorState, Compartment, EditorSelection, Prec } from '@codemirror/state';
import {
    EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
    highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from '@codemirror/search';
import {
    autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, snippet, startCompletion,
} from '@codemirror/autocomplete';
import { lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint';
import {
    StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching, foldGutter,
    foldKeymap, indentOnInput, indentUnit,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { stex } from '@codemirror/legacy-modes/mode/stex';

/** Traduções da interface do CodeMirror (busca, recolher, diagnósticos). */
const PHRASES = {
    'Find': 'Buscar',
    'Replace': 'Substituir',
    'next': 'próximo',
    'previous': 'anterior',
    'all': 'todos',
    'match case': 'maiúsc./minúsc.',
    'by word': 'palavra inteira',
    'regexp': 'expressão regular',
    'replace': 'substituir',
    'replace all': 'substituir todos',
    'close': 'fechar',
    'current match': 'resultado atual',
    'on line': 'na linha',
    'replaced match on line $': 'substituído na linha $',
    'replaced $ matches': '$ substituições',
    'Go to line': 'Ir para a linha',
    'go': 'ir',
    'Folded lines': 'Linhas recolhidas',
    'Unfolded lines': 'Linhas expandidas',
    'to': 'até',
    'folded code': 'código recolhido',
    'unfold': 'expandir',
    'Fold line': 'Recolher',
    'Unfold line': 'Expandir',
    'Diagnostics': 'Diagnósticos',
    'No diagnostics': 'Nenhum diagnóstico',
    'Control character': 'Caractere de controle',
    'Selection deleted': 'Seleção apagada',
};

const latexHighlight = HighlightStyle.define([
    { tag: tags.tagName, color: 'var(--ed-command)' },          // \comandos
    { tag: tags.keyword, color: 'var(--ed-keyword)' },          // \begin, \end
    { tag: tags.atom, color: 'var(--ed-argument)' },            // nomes de ambiente/argumentos
    { tag: tags.standard(tags.variableName), color: 'var(--ed-keyword)' },
    { tag: tags.bracket, color: 'var(--ed-bracket)' },
    { tag: tags.comment, color: 'var(--ed-comment)', fontStyle: 'italic' },
    { tag: tags.number, color: 'var(--ed-number)' },
    { tag: tags.string, color: 'var(--ed-math)' },              // matemática
    { tag: tags.invalid, color: 'var(--ed-error)' },
]);

const baseTheme = EditorView.theme({
    '&': {
        height: '100%',
        color: 'var(--ed-text)',
        backgroundColor: 'var(--ed-bg)',
        fontSize: '14px',
    },
    '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.65',
    },
    '.cm-content': { caretColor: 'var(--ed-cursor)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ed-cursor)', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'var(--ed-selection) !important',
    },
    '.cm-activeLine': { backgroundColor: 'var(--ed-active-line)' },
    '.cm-gutters': {
        backgroundColor: 'var(--ed-gutter-bg)',
        color: 'var(--ed-gutter-text)',
        border: 'none',
    },
    '.cm-activeLineGutter': { backgroundColor: 'var(--ed-active-line)', color: 'var(--ed-text)' },
    '.cm-selectionMatch': { backgroundColor: 'var(--ed-match)' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--ed-match)', outline: '1px solid var(--ed-cursor)' },
    '.cm-panels': { backgroundColor: 'var(--ed-gutter-bg)', color: 'var(--ed-text)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
    '.cm-tooltip': {
        backgroundColor: 'var(--panel)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--accent-soft)',
        color: 'var(--text)',
    },
});

export function createEditor(parent, { onChange, onDoubleClick, onPasteImage, keys = [] } = {}) {
    const states = new Map(); // caminho -> EditorState
    const language = new Compartment();
    const completion = new Compartment();
    const extras = new Compartment();    // extensões opcionais (corretor ortográfico)
    let extrasConfig = [];
    let currentPath = null;
    let completionConfig = autocompletion();

    const extensions = [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        EditorState.phrases.of(PHRASES),
        indentOnInput(),
        indentUnit.of('    '),
        syntaxHighlighting(latexHighlight),
        bracketMatching(),
        closeBrackets(),
        completion.of(completionConfig),
        extras.of(extrasConfig),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        lintGutter(),
        language.of(StreamLanguage.define(stex)),
        EditorView.lineWrapping,
        baseTheme,
        // Atalhos do app (Ctrl+B, Ctrl+I...) têm prioridade sobre os padrões
        Prec.high(keymap.of(keys)),
        keymap.of([
            { key: 'Mod-h', run: openSearchPanel },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            ...lintKeymap,
            indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
            if (update.docChanged && onChange) onChange();
        }),
        EditorView.domEventHandlers({
            paste: (event) => {
                const image = [...(event.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
                if (!image || !onPasteImage) return false;
                event.preventDefault();
                onPasteImage(image);
                return true;
            },
            dblclick: (event, view) => {
                if (!onDoubleClick) return false;
                // Espera a seleção da palavra para ler a linha do cursor
                setTimeout(() => onDoubleClick(cursorLine(view)), 0);
                return false;
            },
        }),
    ];

    const view = new EditorView({
        parent,
        state: EditorState.create({ doc: '', extensions }),
    });

    function cursorLine(v = view) {
        return v.state.doc.lineAt(v.state.selection.main.head).number;
    }

    return {
        view,

        getValue() {
            return view.state.doc.toString();
        },

        /**
         * Mostra `text` como conteúdo do arquivo `path`. Se o arquivo já foi
         * aberto com o mesmo conteúdo, recupera o estado (desfazer, cursor).
         */
        setDoc(path, text) {
            if (currentPath !== null) states.set(currentPath, view.state);
            const saved = path !== null ? states.get(path) : null;
            const state = saved && saved.doc.toString() === text
                ? saved
                : EditorState.create({ doc: text, extensions });
            view.setState(state);
            // Estados guardados podem ter configurações antigas
            view.dispatch({
                effects: [completion.reconfigure(completionConfig), extras.reconfigure(extrasConfig)],
            });
            currentPath = path;
        },

        /** Esquece o estado guardado de um arquivo (apagado ou renomeado). */
        forgetDoc(path) {
            states.delete(path);
            if (path === currentPath) currentPath = null;
        },

        renameDoc(oldPath, newPath) {
            if (states.has(oldPath)) {
                states.set(newPath, states.get(oldPath));
                states.delete(oldPath);
            }
            if (currentPath === oldPath) currentPath = newPath;
        },

        lineCount() {
            return view.state.doc.lines;
        },

        cursorLine() {
            return cursorLine();
        },

        goToLine(lineNumber) {
            const doc = view.state.doc;
            const line = doc.line(Math.min(Math.max(1, lineNumber), doc.lines));
            view.dispatch({
                selection: { anchor: line.from },
                effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
            });
            view.focus();
        },

        /**
         * Sublinha erros/avisos no código.
         * @param {Array<{line: number, severity: 'error'|'warning'|'info', message: string}>} items
         */
        setDiagnostics(items) {
            const doc = view.state.doc;
            const diagnostics = items
                .filter(d => d.line >= 1 && d.line <= doc.lines)
                .map(d => {
                    const line = doc.line(d.line);
                    return { from: line.from, to: line.to, severity: d.severity, message: d.message };
                });
            view.dispatch(setDiagnostics(view.state, diagnostics));
        },

        /** Liga/desliga extensões opcionais (ex.: corretor ortográfico). */
        setExtras(extensions) {
            extrasConfig = extensions;
            view.dispatch({ effects: extras.reconfigure(extrasConfig) });
        },

        /** Troca as fontes de autocompletar. */
        setCompletionSources(sources) {
            completionConfig = autocompletion({ override: sources });
            view.dispatch({ effects: completion.reconfigure(completionConfig) });
        },

        /**
         * Envolve a seleção com `before`/`after`. Sem seleção, insere
         * before + placeholder + after com o placeholder selecionado.
         */
        wrapSelection(before, after, placeholder = '') {
            const state = view.state;
            view.dispatch(state.changeByRange((range) => {
                const text = range.empty ? placeholder : state.sliceDoc(range.from, range.to);
                const insert = before + text + after;
                const start = range.from + before.length;
                return {
                    changes: { from: range.from, to: range.to, insert },
                    range: EditorSelection.range(start, start + text.length),
                };
            }));
            view.focus();
        },

        /**
         * Insere um snippet com campos (${nome}) navegáveis por Tab, no lugar
         * da seleção. Com `block`, começa numa linha nova.
         */
        insertSnippet(template, { block = false } = {}) {
            const { from, to } = view.state.selection.main;
            let text = template;
            if (block) {
                const line = view.state.doc.lineAt(from);
                const before = view.state.sliceDoc(line.from, from);
                if (before.trim() !== '') text = '\n' + text;
            }
            snippet(text)(view, null, from, to);
            view.focus();
        },

        /** Caractere imediatamente antes da posição (ou '' no início). */
        charBefore(pos) {
            return pos > 0 ? view.state.sliceDoc(pos - 1, pos) : '';
        },

        /** Seleção atual, para guardar antes de abrir uma janela. */
        getSelectionRange() {
            const { from, to } = view.state.selection.main;
            return { from, to };
        },

        /**
         * Insere texto puro no lugar da seleção (com `block`, numa linha nova).
         * `range` usa uma seleção guardada antes: janelas com campos próprios
         * (como o MathLive) podem mudar a seleção do editor ao devolver o foco.
         */
        insertText(text, { block = false, range = null } = {}) {
            const docLength = view.state.doc.length;
            const { from, to } = range
                ? { from: Math.min(range.from, docLength), to: Math.min(range.to, docLength) }
                : view.state.selection.main;
            let insert = text;
            if (block) {
                const line = view.state.doc.lineAt(from);
                if (view.state.sliceDoc(line.from, from).trim() !== '') insert = '\n' + insert;
            }
            view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + insert.length },
                scrollIntoView: true,
            });
            view.focus();
        },

        /** Insere texto numa posição do documento, sem mexer no cursor do usuário. */
        insertAt(offset, text) {
            view.dispatch({ changes: { from: offset, insert: text } });
        },

        /** Abre a lista de sugestões na posição do cursor. */
        startCompletion() {
            startCompletion(view);
        },

        selectedText() {
            const { from, to } = view.state.selection.main;
            return view.state.sliceDoc(from, to);
        },

        focus() {
            view.focus();
        },
    };
}
