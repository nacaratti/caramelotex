/**
 * ai-assistant.js - Servico de IA para assistencia em LaTeX
 * Suporta OpenAI (GPT-4) e Google Gemini
 * Com acoes estruturadas para edicao inteligente
 */

const AIAssistant = {
    STORAGE_KEY: 'latex_ai_config',

    // ========== CONFIGURACAO ==========

    getConfig() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    },

    saveConfig(provider, apiKey) {
        const config = { provider, apiKey };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
    },

    clearConfig() {
        localStorage.removeItem(this.STORAGE_KEY);
    },

    isConfigured() {
        const config = this.getConfig();
        return config && config.apiKey && config.apiKey.length > 10;
    },

    getProviderName() {
        const config = this.getConfig();
        if (!config) return null;
        return config.provider === 'openai' ? 'OpenAI' : 'Gemini';
    },

    // ========== SYSTEM PROMPT COM ACOES ==========

    buildSystemPrompt(latexCode, cursorLine) {
        // Adiciona numeros de linha ao codigo para referencia
        const numberedCode = latexCode.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n');

        return `Voce e um assistente especializado em LaTeX que pode EDITAR o documento do usuario.

## CAPACIDADES
Voce pode:
1. Responder perguntas sobre LaTeX
2. Sugerir codigo para o usuario copiar
3. **EDITAR DIRETAMENTE** o documento usando acoes estruturadas

## ACOES DE EDICAO
Quando o usuario pedir para ALTERAR, MODIFICAR, CORRIGIR, TROCAR, ou ATUALIZAR algo no documento, use blocos de acao JSON:

### Substituir um comando LaTeX (ex: \\title, \\author, \\date, etc):
\`\`\`action
{"action": "replace_command", "command": "title", "newContent": "Novo Titulo Aqui"}
\`\`\`

### Substituir o conteudo de um environment (ex: abstract, itemize, equation):
\`\`\`action
{"action": "replace_environment", "environment": "abstract", "newContent": "Novo texto do resumo aqui."}
\`\`\`

### Substituir linhas especificas (use os numeros de linha do documento):
\`\`\`action
{"action": "replace_lines", "startLine": 15, "endLine": 17, "newContent": "Novo conteudo\\nque substitui\\nas linhas"}
\`\`\`

### Inserir apos um padrao (regex):
\`\`\`action
{"action": "insert_after", "pattern": "\\\\maketitle", "content": "\\n\\\\tableofcontents"}
\`\`\`

### Inserir antes de um padrao:
\`\`\`action
{"action": "insert_before", "pattern": "\\\\begin\\{document\\}", "content": "\\\\usepackage{hyperref}\\n"}
\`\`\`

### Adicionar pacote (se ainda nao existir):
\`\`\`action
{"action": "add_package", "package": "graphicx", "options": "draft"}
\`\`\`

## REGRAS IMPORTANTES
1. Use acoes APENAS quando o usuario pedir explicitamente para modificar algo
2. Para perguntas ou sugestoes, responda normalmente com texto e blocos \`\`\`latex
3. Pode combinar texto explicativo + acoes na mesma resposta
4. Sempre explique brevemente o que a acao vai fazer
5. Use portugues brasileiro
6. Se nao tiver certeza de onde editar, pergunte ao usuario

## DOCUMENTO ATUAL (com numeros de linha):
\`\`\`latex
${numberedCode.substring(0, 12000)}
\`\`\`

${cursorLine ? `Cursor na linha ${cursorLine}.` : ''}`;
    },

    // ========== CHAMADAS API ==========

    async chat(messages, latexContext, cursorLine) {
        const config = this.getConfig();
        if (!config || !config.apiKey) {
            return { success: false, error: 'Chave de API nao configurada' };
        }

        try {
            let result;
            if (config.provider === 'openai') {
                result = await this.callOpenAI(messages, latexContext, cursorLine, config.apiKey);
            } else {
                result = await this.callGemini(messages, latexContext, cursorLine, config.apiKey);
            }

            // Parse acoes da resposta
            if (result.success && result.content) {
                result.actions = this.parseActions(result.content);
                result.cleanContent = this.removeActionBlocks(result.content);
            }

            return result;
        } catch (error) {
            console.error('AIAssistant.chat error:', error);
            return { success: false, error: error.message || 'Erro desconhecido' };
        }
    },

    async callOpenAI(messages, latexContext, cursorLine, apiKey) {
        const systemPrompt = this.buildSystemPrompt(latexContext, cursorLine);

        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: apiMessages,
                max_tokens: 2000,
                temperature: 0.3 // Menor temperatura para acoes mais precisas
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401) {
                return { success: false, error: 'Chave de API invalida' };
            }
            if (response.status === 429) {
                return { success: false, error: 'Limite de requisicoes excedido. Tente novamente.' };
            }
            return { success: false, error: errorData.error?.message || `Erro HTTP ${response.status}` };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return { success: false, error: 'Resposta vazia da API' };
        }

        return { success: true, content };
    },

    async callGemini(messages, latexContext, cursorLine, apiKey) {
        const systemPrompt = this.buildSystemPrompt(latexContext, cursorLine);

        const contents = [];
        for (const msg of messages) {
            contents.push({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: contents,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: 0.3, maxOutputTokens: 2000 }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 400 && errorData.error?.message?.includes('API key')) {
                return { success: false, error: 'Chave de API invalida' };
            }
            if (response.status === 429) {
                return { success: false, error: 'Limite de requisicoes excedido. Tente novamente.' };
            }
            return { success: false, error: errorData.error?.message || `Erro HTTP ${response.status}` };
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
            return { success: false, error: 'Resposta vazia da API' };
        }

        return { success: true, content };
    },

    // ========== PARSING DE ACOES ==========

    parseActions(content) {
        const actions = [];
        const actionBlockRegex = /```action\s*([\s\S]*?)```/g;

        let match;
        while ((match = actionBlockRegex.exec(content)) !== null) {
            try {
                const jsonStr = match[1].trim();
                const action = JSON.parse(jsonStr);
                if (action && action.action) {
                    actions.push(action);
                }
            } catch (e) {
                console.warn('Failed to parse action block:', e);
            }
        }

        return actions;
    },

    removeActionBlocks(content) {
        return content.replace(/```action\s*[\s\S]*?```/g, '').trim();
    },

    // ========== TESTE DE CONEXAO ==========

    async testConnection(provider, apiKey) {
        try {
            if (provider === 'openai') {
                const response = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (response.status === 401) {
                    return { success: false, error: 'Chave de API invalida' };
                }
                return { success: response.ok, error: response.ok ? null : `Erro HTTP ${response.status}` };
            } else {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: 'Hi' }] }],
                        generationConfig: { maxOutputTokens: 5 }
                    })
                });
                if (response.status === 400 || response.status === 403) {
                    return { success: false, error: 'Chave de API invalida' };
                }
                return { success: response.ok, error: response.ok ? null : `Erro HTTP ${response.status}` };
            }
        } catch (error) {
            return { success: false, error: 'Erro de conexao: ' + error.message };
        }
    }
};

// ========== EXECUTOR DE ACOES NO EDITOR ==========

const AIEditorActions = {
    /**
     * Executa uma acao no editor CodeMirror
     * @param {object} action - Acao parseada do JSON
     * @param {CodeMirror} editor - Instancia do CodeMirror
     * @returns {{success: boolean, message: string}}
     */
    execute(action, editorInstance) {
        if (!editorInstance) {
            return { success: false, message: 'Editor nao disponivel' };
        }

        try {
            switch (action.action) {
                case 'replace_command':
                    return this.replaceCommand(editorInstance, action.command, action.newContent);

                case 'replace_environment':
                    return this.replaceEnvironment(editorInstance, action.environment, action.newContent);

                case 'replace_lines':
                    return this.replaceLines(editorInstance, action.startLine, action.endLine, action.newContent);

                case 'insert_after':
                    return this.insertAfterPattern(editorInstance, action.pattern, action.content);

                case 'insert_before':
                    return this.insertBeforePattern(editorInstance, action.pattern, action.content);

                case 'add_package':
                    return this.addPackage(editorInstance, action.package, action.options);

                default:
                    return { success: false, message: `Acao desconhecida: ${action.action}` };
            }
        } catch (e) {
            console.error('Action execution error:', e);
            return { success: false, message: `Erro ao executar: ${e.message}` };
        }
    },

    /**
     * Substitui o conteudo de um comando LaTeX (ex: \title{...})
     */
    replaceCommand(editor, command, newContent) {
        const content = editor.getValue();
        // Regex para capturar \command{...} incluindo conteudo com chaves aninhadas
        const regex = new RegExp(`(\\\\${command})\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`, 'g');

        const match = regex.exec(content);
        if (!match) {
            return { success: false, message: `Comando \\${command}{} nao encontrado` };
        }

        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;

        // Converte indices para posicoes do CodeMirror
        const startPos = editor.posFromIndex(startIndex);
        const endPos = editor.posFromIndex(endIndex);

        // Substitui
        const newText = `\\${command}{${newContent}}`;
        editor.replaceRange(newText, startPos, endPos);

        return { success: true, message: `\\${command}{} atualizado` };
    },

    /**
     * Substitui o conteudo de um environment (ex: \begin{abstract}...\end{abstract})
     */
    replaceEnvironment(editor, envName, newContent) {
        const content = editor.getValue();
        const regex = new RegExp(
            `(\\\\begin\\{${envName}\\})(\\s*[\\s\\S]*?)(\\\\end\\{${envName}\\})`,
            'g'
        );

        const match = regex.exec(content);
        if (!match) {
            return { success: false, message: `Environment ${envName} nao encontrado` };
        }

        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;

        const startPos = editor.posFromIndex(startIndex);
        const endPos = editor.posFromIndex(endIndex);

        const newText = `\\begin{${envName}}\n${newContent}\n\\end{${envName}}`;
        editor.replaceRange(newText, startPos, endPos);

        return { success: true, message: `Environment ${envName} atualizado` };
    },

    /**
     * Substitui linhas especificas (1-indexed)
     */
    replaceLines(editor, startLine, endLine, newContent) {
        const lineCount = editor.lineCount();

        if (startLine < 1 || endLine > lineCount || startLine > endLine) {
            return { success: false, message: `Linhas invalidas (${startLine}-${endLine})` };
        }

        // CodeMirror e 0-indexed
        const startPos = { line: startLine - 1, ch: 0 };
        const endPos = { line: endLine - 1, ch: editor.getLine(endLine - 1).length };

        editor.replaceRange(newContent, startPos, endPos);

        return { success: true, message: `Linhas ${startLine}-${endLine} substituidas` };
    },

    /**
     * Insere conteudo apos um padrao (regex)
     */
    insertAfterPattern(editor, pattern, content) {
        const docContent = editor.getValue();
        const regex = new RegExp(pattern);
        const match = regex.exec(docContent);

        if (!match) {
            return { success: false, message: `Padrao nao encontrado: ${pattern}` };
        }

        const insertIndex = match.index + match[0].length;
        const insertPos = editor.posFromIndex(insertIndex);

        editor.replaceRange(content, insertPos);

        return { success: true, message: `Inserido apos ${pattern.substring(0, 20)}...` };
    },

    /**
     * Insere conteudo antes de um padrao (regex)
     */
    insertBeforePattern(editor, pattern, content) {
        const docContent = editor.getValue();
        const regex = new RegExp(pattern);
        const match = regex.exec(docContent);

        if (!match) {
            return { success: false, message: `Padrao nao encontrado: ${pattern}` };
        }

        const insertPos = editor.posFromIndex(match.index);
        editor.replaceRange(content, insertPos);

        return { success: true, message: `Inserido antes de ${pattern.substring(0, 20)}...` };
    },

    /**
     * Adiciona um pacote se ainda nao existir
     */
    addPackage(editor, packageName, options) {
        const content = editor.getValue();

        // Verifica se ja existe
        const existsRegex = new RegExp(`\\\\usepackage(\\[[^\\]]*\\])?\\{[^}]*\\b${packageName}\\b[^}]*\\}`);
        if (existsRegex.test(content)) {
            return { success: true, message: `Pacote ${packageName} ja existe` };
        }

        // Encontra o ultimo \usepackage ou \documentclass
        const lastUsepackage = /\\usepackage(\[[^\]]*\])?\{[^}]+\}/g;
        const documentclass = /\\documentclass(\[[^\]]*\])?\{[^}]+\}/;

        let insertIndex = 0;
        let match;

        // Encontra o ultimo usepackage
        while ((match = lastUsepackage.exec(content)) !== null) {
            insertIndex = match.index + match[0].length;
        }

        // Se nao achou usepackage, insere apos documentclass
        if (insertIndex === 0) {
            const dcMatch = documentclass.exec(content);
            if (dcMatch) {
                insertIndex = dcMatch.index + dcMatch[0].length;
            }
        }

        const insertPos = editor.posFromIndex(insertIndex);
        const optionsStr = options ? `[${options}]` : '';
        const newPackage = `\n\\usepackage${optionsStr}{${packageName}}`;

        editor.replaceRange(newPackage, insertPos);

        return { success: true, message: `Pacote ${packageName} adicionado` };
    }
};
