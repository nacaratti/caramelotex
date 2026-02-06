/**
 * ai-chat.js - Componente de Chat para o Assistente de IA
 * Com suporte a acoes estruturadas de edicao
 */

const AIChat = {
    messages: [],
    isExpanded: false,
    isLoading: false,

    // ========== INICIALIZACAO ==========

    init() {
        this.bindEvents();
        this.updateUI();
    },

    bindEvents() {
        // Toggle do painel
        const toggleBtn = document.getElementById('aiChatToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggle());
        }

        // Enviar mensagem
        const sendBtn = document.getElementById('aiChatSend');
        const input = document.getElementById('aiChatInput');

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.handleSend());
        }

        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSend();
                }
            });
        }

        // Botao de configuracao
        const configBtn = document.getElementById('aiConfigBtn');
        if (configBtn) {
            configBtn.addEventListener('click', () => this.openConfigModal());
        }

        // Modal de configuracao
        const closeModalBtn = document.getElementById('closeAiConfigModal');
        const saveConfigBtn = document.getElementById('saveAiConfig');
        const testConfigBtn = document.getElementById('testAiConfig');
        const clearConfigBtn = document.getElementById('clearAiConfig');
        const modal = document.getElementById('aiConfigModal');

        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeConfigModal());
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeConfigModal();
            });
        }

        if (saveConfigBtn) {
            saveConfigBtn.addEventListener('click', () => this.saveConfig());
        }

        if (testConfigBtn) {
            testConfigBtn.addEventListener('click', () => this.testConfig());
        }

        if (clearConfigBtn) {
            clearConfigBtn.addEventListener('click', () => this.clearConfig());
        }

        // Limpar chat
        const clearChatBtn = document.getElementById('aiChatClear');
        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', () => this.clearChat());
        }

        // Atalho de teclado
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                this.toggle();
            }
        });
    },

    // ========== UI STATE ==========

    updateUI() {
        const panel = document.getElementById('aiChatPanel');
        const configuredState = document.getElementById('aiChatConfigured');
        const unconfiguredState = document.getElementById('aiChatUnconfigured');
        const providerBadge = document.getElementById('aiProviderBadge');

        if (!panel) return;

        const isConfigured = AIAssistant.isConfigured();

        if (configuredState) {
            configuredState.classList.toggle('hidden', !isConfigured);
        }
        if (unconfiguredState) {
            unconfiguredState.classList.toggle('hidden', isConfigured);
        }

        if (providerBadge && isConfigured) {
            providerBadge.textContent = AIAssistant.getProviderName();
            providerBadge.classList.remove('hidden');
        } else if (providerBadge) {
            providerBadge.classList.add('hidden');
        }

        this.updatePanelState();
    },

    updatePanelState() {
        const panel = document.getElementById('aiChatPanel');
        const content = document.getElementById('aiChatContent');
        const toggleIcon = document.getElementById('aiChatToggleIcon');

        if (!panel || !content) return;

        if (this.isExpanded) {
            content.classList.remove('hidden');
            panel.style.height = '280px';
            if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
        } else {
            content.classList.add('hidden');
            panel.style.height = '40px';
            if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
        }
    },

    toggle() {
        this.isExpanded = !this.isExpanded;
        this.updatePanelState();

        if (this.isExpanded && AIAssistant.isConfigured()) {
            setTimeout(() => {
                const input = document.getElementById('aiChatInput');
                if (input) input.focus();
            }, 300);
        }
    },

    // ========== CHAT ==========

    async handleSend() {
        const input = document.getElementById('aiChatInput');
        if (!input) return;

        const text = input.value.trim();
        if (!text || this.isLoading) return;

        // Adiciona mensagem do usuario
        this.addMessage('user', text);
        input.value = '';

        // Mostra loading
        this.setLoading(true);

        // Obtem contexto do editor
        const latexCode = typeof getEditorContent === 'function' ? getEditorContent() : '';
        const cursorLine = typeof editor !== 'undefined' ? editor.getCursor().line + 1 : null;

        // Prepara mensagens para a API (sem as acoes executadas para historico limpo)
        const apiMessages = this.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        // Chama a IA
        const result = await AIAssistant.chat(apiMessages, latexCode, cursorLine);

        this.setLoading(false);

        if (result.success) {
            // Verifica se ha acoes para executar
            if (result.actions && result.actions.length > 0) {
                // Renderiza a resposta (texto limpo + acoes)
                this.addMessageWithActions(result.cleanContent, result.actions);

                // Executa as acoes automaticamente
                this.executeActions(result.actions);
            } else {
                // Resposta normal sem acoes
                this.addMessage('assistant', result.content);
            }
        } else {
            this.addMessage('error', result.error || 'Erro ao processar mensagem');
        }
    },

    /**
     * Executa uma lista de acoes no editor
     */
    executeActions(actions) {
        if (!actions || actions.length === 0) return;

        const editorInstance = typeof editor !== 'undefined' ? editor : null;
        if (!editorInstance) {
            showToast('Editor nao disponivel', 'error');
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const action of actions) {
            const result = AIEditorActions.execute(action, editorInstance);
            if (result.success) {
                successCount++;
                console.log(`Action executed: ${result.message}`);
            } else {
                failCount++;
                console.warn(`Action failed: ${result.message}`);
            }
        }

        // Feedback para o usuario
        if (successCount > 0 && failCount === 0) {
            showToast(`${successCount} edicao(es) aplicada(s)`, 'success');
        } else if (successCount > 0 && failCount > 0) {
            showToast(`${successCount} aplicada(s), ${failCount} falhou(aram)`, 'warning');
        } else if (failCount > 0) {
            showToast(`Falha ao aplicar edicoes`, 'error');
        }
    },

    addMessage(role, content) {
        if (role !== 'error') {
            this.messages.push({ role, content });
        }

        this.renderMessage(role, content);

        const messagesContainer = document.getElementById('aiChatMessages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    },

    /**
     * Adiciona mensagem com indicadores de acoes executadas
     */
    addMessageWithActions(textContent, actions) {
        // Armazena apenas o texto limpo no historico
        this.messages.push({ role: 'assistant', content: textContent || 'Edicoes aplicadas.' });

        const container = document.getElementById('aiChatMessages');
        if (!container) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'ai-chat-message ai-chat-message-assistant';

        // Conteudo da mensagem
        let htmlContent = '';

        if (textContent && textContent.trim()) {
            const processedContent = this.processCodeBlocks(textContent);
            htmlContent += `<div class="text-sm text-gray-300 ai-message-content mb-2">${processedContent}</div>`;
        }

        // Indicadores de acoes
        if (actions && actions.length > 0) {
            htmlContent += `<div class="ai-actions-indicator mt-2 pt-2 border-t border-gray-700">`;
            htmlContent += `<div class="text-xs text-latex-green font-medium mb-1 flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
                Acoes executadas:
            </div>`;

            for (const action of actions) {
                const actionLabel = this.getActionLabel(action);
                htmlContent += `<div class="text-xs text-gray-400 flex items-center gap-1 ml-4">
                    <svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    ${this.escapeHtml(actionLabel)}
                </div>`;
            }
            htmlContent += `</div>`;
        }

        msgDiv.innerHTML = `
            <div class="flex justify-start">
                <div class="bg-gray-800 rounded-lg px-3 py-2 max-w-[90%] border border-gray-700">
                    ${htmlContent}
                </div>
            </div>
        `;

        // Bind eventos dos botoes de codigo
        setTimeout(() => {
            msgDiv.querySelectorAll('.ai-code-insert').forEach(btn => {
                btn.addEventListener('click', () => {
                    const code = btn.dataset.code;
                    this.insertCode(code);
                });
            });
            msgDiv.querySelectorAll('.ai-code-copy').forEach(btn => {
                btn.addEventListener('click', () => {
                    const code = btn.dataset.code;
                    this.copyCode(code, btn);
                });
            });
        }, 0);

        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    },

    /**
     * Retorna um label legivel para uma acao
     */
    getActionLabel(action) {
        switch (action.action) {
            case 'replace_command':
                return `Atualizou \\${action.command}{}`;
            case 'replace_environment':
                return `Atualizou ambiente ${action.environment}`;
            case 'replace_lines':
                return `Substituiu linhas ${action.startLine}-${action.endLine}`;
            case 'insert_after':
                return `Inseriu conteudo apos padrao`;
            case 'insert_before':
                return `Inseriu conteudo antes de padrao`;
            case 'add_package':
                return `Adicionou pacote ${action.package}`;
            default:
                return `Executou ${action.action}`;
        }
    },

    renderMessage(role, content) {
        const container = document.getElementById('aiChatMessages');
        if (!container) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-chat-message ai-chat-message-${role}`;

        if (role === 'user') {
            msgDiv.innerHTML = `
                <div class="flex justify-end">
                    <div class="bg-gray-700 rounded-lg px-3 py-2 max-w-[85%]">
                        <p class="text-sm text-gray-200 whitespace-pre-wrap">${this.escapeHtml(content)}</p>
                    </div>
                </div>
            `;
        } else if (role === 'assistant') {
            const processedContent = this.processCodeBlocks(content);
            msgDiv.innerHTML = `
                <div class="flex justify-start">
                    <div class="bg-gray-800 rounded-lg px-3 py-2 max-w-[90%] border border-gray-700">
                        <div class="text-sm text-gray-300 ai-message-content">${processedContent}</div>
                    </div>
                </div>
            `;

            setTimeout(() => {
                msgDiv.querySelectorAll('.ai-code-insert').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const code = btn.dataset.code;
                        this.insertCode(code);
                    });
                });
                msgDiv.querySelectorAll('.ai-code-copy').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const code = btn.dataset.code;
                        this.copyCode(code, btn);
                    });
                });
            }, 0);
        } else if (role === 'error') {
            msgDiv.innerHTML = `
                <div class="flex justify-center">
                    <div class="bg-red-900/50 border border-red-700 rounded-lg px-3 py-2 max-w-[90%]">
                        <p class="text-sm text-red-300">${this.escapeHtml(content)}</p>
                    </div>
                </div>
            `;
        }

        container.appendChild(msgDiv);
    },

    processCodeBlocks(content) {
        // Remove blocos action (ja processados)
        content = content.replace(/```action\s*[\s\S]*?```/g, '');

        const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;

        let result = content.replace(codeBlockRegex, (match, lang, code) => {
            const trimmedCode = code.trim();
            const escapedCode = this.escapeHtml(trimmedCode);
            const dataCode = trimmedCode.replace(/"/g, '&quot;');

            return `
                <div class="ai-code-block bg-gray-900 rounded-lg mt-2 mb-2 overflow-hidden">
                    <div class="flex justify-between items-center px-2 py-1 bg-gray-950 border-b border-gray-700">
                        <span class="text-xs text-gray-500">${lang || 'latex'}</span>
                        <div class="flex gap-1">
                            <button class="ai-code-insert text-xs px-2 py-0.5 bg-latex-green hover:bg-teal-600 rounded text-white transition-colors" data-code="${dataCode}">
                                Inserir
                            </button>
                            <button class="ai-code-copy text-xs px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors" data-code="${dataCode}">
                                Copiar
                            </button>
                        </div>
                    </div>
                    <pre class="p-2 text-xs text-gray-300 overflow-x-auto"><code>${escapedCode}</code></pre>
                </div>
            `;
        });

        result = result.replace(/\n/g, '<br>');

        return result;
    },

    insertCode(code) {
        if (typeof editor === 'undefined') return;

        const decodedCode = this.decodeHtml(code);
        const cursor = editor.getCursor();
        editor.replaceRange(decodedCode + '\n', cursor);
        editor.focus();

        showToast('Codigo inserido no editor', 'success');
    },

    copyCode(code, button) {
        const decodedCode = this.decodeHtml(code);

        navigator.clipboard.writeText(decodedCode).then(() => {
            const originalText = button.textContent;
            button.textContent = 'Copiado!';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        });
    },

    clearChat() {
        this.messages = [];
        const container = document.getElementById('aiChatMessages');
        if (container) {
            container.innerHTML = `
                <div class="text-center text-gray-500 text-xs py-4">
                    Pergunte sobre LaTeX, peca sugestoes ou ajuda com erros.
                </div>
            `;
        }
    },

    setLoading(loading) {
        this.isLoading = loading;

        const sendBtn = document.getElementById('aiChatSend');
        const input = document.getElementById('aiChatInput');

        if (sendBtn) sendBtn.disabled = loading;
        if (input) input.disabled = loading;

        if (loading) {
            const container = document.getElementById('aiChatMessages');
            if (container) {
                const typingDiv = document.createElement('div');
                typingDiv.id = 'aiTypingIndicator';
                typingDiv.className = 'flex justify-start';
                typingDiv.innerHTML = `
                    <div class="bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
                        <div class="flex gap-1">
                            <span class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                            <span class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                            <span class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
                        </div>
                    </div>
                `;
                container.appendChild(typingDiv);
                container.scrollTop = container.scrollHeight;
            }
        } else {
            const typingDiv = document.getElementById('aiTypingIndicator');
            if (typingDiv) typingDiv.remove();
        }
    },

    // ========== CONFIGURACAO ==========

    openConfigModal() {
        const modal = document.getElementById('aiConfigModal');
        if (!modal) return;

        const config = AIAssistant.getConfig();
        const providerSelect = document.getElementById('aiProvider');
        const apiKeyInput = document.getElementById('aiApiKey');
        const testStatus = document.getElementById('aiConfigTestStatus');

        if (config) {
            if (providerSelect) providerSelect.value = config.provider || 'openai';
            if (apiKeyInput) apiKeyInput.value = config.apiKey || '';
        } else {
            if (providerSelect) providerSelect.value = 'openai';
            if (apiKeyInput) apiKeyInput.value = '';
        }

        if (testStatus) {
            testStatus.textContent = '';
            testStatus.className = 'text-sm mt-2';
        }

        modal.classList.remove('hidden');
    },

    closeConfigModal() {
        const modal = document.getElementById('aiConfigModal');
        if (modal) modal.classList.add('hidden');
    },

    async testConfig() {
        const providerSelect = document.getElementById('aiProvider');
        const apiKeyInput = document.getElementById('aiApiKey');
        const testStatus = document.getElementById('aiConfigTestStatus');
        const testBtn = document.getElementById('testAiConfig');

        if (!providerSelect || !apiKeyInput || !testStatus) return;

        const provider = providerSelect.value;
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            testStatus.textContent = 'Insira uma chave de API';
            testStatus.className = 'text-sm mt-2 text-yellow-400';
            return;
        }

        testBtn.disabled = true;
        testStatus.textContent = 'Testando conexao...';
        testStatus.className = 'text-sm mt-2 text-gray-400';

        const result = await AIAssistant.testConnection(provider, apiKey);

        testBtn.disabled = false;

        if (result.success) {
            testStatus.textContent = 'Conexao bem-sucedida!';
            testStatus.className = 'text-sm mt-2 text-green-400';
        } else {
            testStatus.textContent = result.error || 'Falha na conexao';
            testStatus.className = 'text-sm mt-2 text-red-400';
        }
    },

    saveConfig() {
        const providerSelect = document.getElementById('aiProvider');
        const apiKeyInput = document.getElementById('aiApiKey');

        if (!providerSelect || !apiKeyInput) return;

        const provider = providerSelect.value;
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showToast('Insira uma chave de API', 'warning');
            return;
        }

        AIAssistant.saveConfig(provider, apiKey);
        this.closeConfigModal();
        this.updateUI();
        this.clearChat();

        showToast(`Assistente IA configurado (${provider === 'openai' ? 'OpenAI' : 'Gemini'})`, 'success');

        if (!this.isExpanded) {
            this.toggle();
        }
    },

    clearConfig() {
        if (!confirm('Remover a chave de API configurada?')) return;

        AIAssistant.clearConfig();
        this.closeConfigModal();
        this.updateUI();
        this.clearChat();

        showToast('Configuracao de IA removida', 'info');
    },

    // ========== UTILS ==========

    escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    decodeHtml(str) {
        const txt = document.createElement('textarea');
        txt.innerHTML = str;
        return txt.value;
    }
};

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        AIChat.init();
    }, 100);
});
