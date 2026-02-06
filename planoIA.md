Plano: Agente IA Multi-Ferramenta com Workflows

 Resumo

 Transformar o assistente de IA atual (6 ações básicas de edição) em um agente poderoso com múltiplas ferramentas, workflows complexos e sistema de   
 permissões estilo Claude Code.

 ---
 Arquitetura Nova

 1. Tool Registry (Registro de Ferramentas)

 Novo arquivo js/ai-tools-registry.js:
 - Cada ferramenta tem: nome, descrição, categoria, nível de risco, parâmetros, função execute
 - Níveis de risco: safe (auto-executa), moderate (confirma primeira vez), destructive (sempre confirma)
 - System prompt gerado dinamicamente a partir das ferramentas registradas

 2. Sistema de Permissões

 Novo arquivo js/ai-permissions.js:
 - Permissões por sessão (não persistentes)
 - Opções: "Permitir uma vez", "Permitir sempre nesta sessão", "Negar"
 - Ações safe executam automaticamente
 - Ações destructive sempre pedem confirmação

 3. Preview de Ações

 Novo arquivo js/ai-preview.js:
 - Mostra diff antes de aplicar mudanças
 - Preview específico por tipo de ação

 4. Motor de Workflows

 Novo arquivo js/ai-workflows.js:
 - Executa sequências de ferramentas
 - Suporta condicionais e loops
 - Gerencia estado entre etapas

 ---
 Ferramentas a Implementar

 Categoria: Edição (moderate)
 ┌─────────────────────┬──────────────────────────────────────────────────┐
 │     Ferramenta      │                    Descrição                     │
 ├─────────────────────┼──────────────────────────────────────────────────┤
 │ replace_command     │ Substituir conteúdo de comando LaTeX (existente) │
 ├─────────────────────┼──────────────────────────────────────────────────┤
 │ replace_environment │ Substituir ambiente (existente)                  │
 ├─────────────────────┼──────────────────────────────────────────────────┤
 │ replace_lines       │ Substituir linhas (existente)                    │
 ├─────────────────────┼──────────────────────────────────────────────────┤
 │ insert_after        │ Inserir após padrão (existente)                  │
 ├─────────────────────┼──────────────────────────────────────────────────┤
 │ insert_before       │ Inserir antes de padrão (existente)              │
 ├─────────────────────┼──────────────────────────────────────────────────┤
 │ add_package         │ Adicionar pacote (existente)                     │
 ├─────────────────────┼──────────────────────────────────────────────────┤
 │ search_replace      │ Buscar e substituir em todo documento            │
 ├─────────────────────┼──────────────────────────────────────────────────┤
 │ format_section      │ Auto-formatar seção                              │
 └─────────────────────┴──────────────────────────────────────────────────┘
 Categoria: Arquivos
 ┌─────────────┬─────────────┬─────────────────────────────────────┐
 │ Ferramenta  │    Risco    │              Descrição              │
 ├─────────────┼─────────────┼─────────────────────────────────────┤
 │ create_file │ moderate    │ Criar novo arquivo .tex, .bib, .sty │
 ├─────────────┼─────────────┼─────────────────────────────────────┤
 │ delete_file │ destructive │ Deletar arquivo do projeto          │
 ├─────────────┼─────────────┼─────────────────────────────────────┤
 │ rename_file │ moderate    │ Renomear arquivo                    │
 ├─────────────┼─────────────┼─────────────────────────────────────┤
 │ switch_file │ safe        │ Abrir outro arquivo no editor       │
 └─────────────┴─────────────┴─────────────────────────────────────┘
 Categoria: Compilação (safe)
 ┌────────────┬────────────────────────────────────┐
 │ Ferramenta │             Descrição              │
 ├────────────┼────────────────────────────────────┤
 │ compile    │ Disparar compilação do documento   │
 ├────────────┼────────────────────────────────────┤
 │ fix_errors │ Analisar erros e aplicar correções │
 └────────────┴────────────────────────────────────┘
 Categoria: Inserção (moderate)
 ┌─────────────────────┬──────────────────────────────────┐
 │     Ferramenta      │            Descrição             │
 ├─────────────────────┼──────────────────────────────────┤
 │ insert_template     │ Inserir template pré-definido    │
 ├─────────────────────┼──────────────────────────────────┤
 │ add_figure          │ Inserir ambiente figure          │
 ├─────────────────────┼──────────────────────────────────┤
 │ add_table           │ Inserir ambiente table           │
 ├─────────────────────┼──────────────────────────────────┤
 │ add_citation        │ Adicionar citação à bibliografia │
 ├─────────────────────┼──────────────────────────────────┤
 │ create_bibliography │ Criar arquivo .bib               │
 └─────────────────────┴──────────────────────────────────┘
 ---
 Workflows a Implementar
 ┌─────────────────┬────────────────────────────────────────────────────────────┐
 │    Workflow     │                         Descrição                          │
 ├─────────────────┼────────────────────────────────────────────────────────────┤
 │ fix_all_errors  │ Compilar → detectar erros → corrigir → repetir até sucesso │
 ├─────────────────┼────────────────────────────────────────────────────────────┤
 │ setup_document  │ Criar estrutura completa de documento                      │
 ├─────────────────┼────────────────────────────────────────────────────────────┤
 │ full_review     │ Revisar documento inteiro e sugerir melhorias              │
 ├─────────────────┼────────────────────────────────────────────────────────────┤
 │ academic_format │ Aplicar formatação acadêmica padrão                        │
 └─────────────────┴────────────────────────────────────────────────────────────┘
 ---
 Mudanças na UI

 Modal de Permissão

 ┌─────────────────────────────────────┐
 │ Confirmar Ação                      │
 ├─────────────────────────────────────┤
 │ Ferramenta: delete_file             │
 │ Risco: destructive                  │
 │                                     │
 │ Preview:                            │
 │ ┌─────────────────────────────────┐ │
 │ │ Deletar: chapter2.tex           │ │
 │ │ ⚠️ Esta ação não pode ser desfeita│ │
 │ └─────────────────────────────────┘ │
 │                                     │
 │ ☐ Permitir sempre nesta sessão      │
 │                                     │
 │        [Negar]  [Permitir]          │
 └─────────────────────────────────────┘

 Painel de Ações Pendentes

 - Lista de ações aguardando aprovação
 - Botões "Aprovar Todas" / "Rejeitar Todas"
 - Preview inline de cada ação

 ---
 Novo Formato de Tool Call

 ```tool
 {"tool": "create_file", "params": {"path": "chapter1.tex", "content": "\\chapter{Introdução}..."}}

 Múltiplas ferramentas em sequência:
 {"tool": "add_package", "params": {"package": "graphicx"}}
 {"tool": "add_figure", "params": {"caption": "Diagrama", "label": "fig1"}}

 ---

 ## Arquivos a Criar/Modificar

 | Arquivo | Ação |
 |---------|------|
 | `js/ai-tools-registry.js` | CRIAR - Sistema de registro de ferramentas |
 | `js/ai-permissions.js` | CRIAR - Gerenciador de permissões |
 | `js/ai-preview.js` | CRIAR - Gerador de previews/diffs |
 | `js/ai-workflows.js` | CRIAR - Motor de workflows |
 | `js/ai-assistant.js` | MODIFICAR - Usar registry, novo parser |
 | `js/ai-chat.js` | MODIFICAR - UI de permissões e previews |
 | `index.html` | MODIFICAR - Adicionar modal de permissão |

 ---

 ## Fases de Implementação

 ### Fase 1: Infraestrutura Core
 1. Criar `ai-tools-registry.js` com sistema de registro
 2. Refatorar 6 ações existentes para formato de ferramenta
 3. Atualizar parser para suportar bloco `tool` (manter compatibilidade com `action`)
 4. Criar `ai-permissions.js` básico

 ### Fase 2: Sistema de Permissões e UI
 1. Adicionar modal de permissão no HTML
 2. Implementar verificação de permissão antes de executar
 3. Adicionar painel de ações pendentes no chat
 4. Implementar "permitir sempre nesta sessão"

 ### Fase 3: Ferramentas de Arquivo
 1. Implementar `compile`, `switch_file` (safe)
 2. Implementar `create_file`, `rename_file` (moderate)
 3. Implementar `delete_file` (destructive)
 4. Integrar com `projectFiles` existente

 ### Fase 4: Ferramentas de Inserção
 1. Implementar `insert_template` (usar templates.js)
 2. Implementar `add_figure`, `add_table`
 3. Implementar `add_citation`, `create_bibliography`
 4. Implementar `search_replace`, `format_section`

 ### Fase 5: Motor de Workflows
 1. Criar `ai-workflows.js`
 2. Implementar `fix_errors` com parsing de log
 3. Implementar workflows: `fix_all_errors`, `setup_document`
 4. Implementar `full_review`, `academic_format`

 ### Fase 6: Polimento
 1. Melhorar system prompt com todas ferramentas
 2. Tratamento de erros robusto
 3. Testes e ajustes

 ---

 ## Verificação

 1. Testar cada ferramenta individualmente
 2. Verificar que permissões funcionam corretamente
 3. Testar "permitir sempre" persiste na sessão
 4. Testar workflows multi-etapa
 5. Verificar compatibilidade com formato antigo `action`
 6. Testar com OpenAI e Gemini

 ---

 ## Exemplo de Uso

 **Usuário:** "Crie um arquivo chapter1.tex com a introdução e adicione uma figura"

 **Agente:**
 Vou criar o arquivo e adicionar a figura.

 {"tool": "create_file", "params": {"path": "chapter1.tex", "content": "\\chapter{Introdução}\n\nTexto da introdução..."}}

 {"tool": "add_figure", "params": {"caption": "Figura ilustrativa", "label": "fig:intro"}}

 **Sistema:** Mostra diálogo de permissão para `create_file` (primeira vez)
 **Usuário:** Clica "Permitir" com "sempre nesta sessão" marcado
 **Sistema:** Executa ambas ferramentas, mostra resultado