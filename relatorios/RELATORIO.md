# Relatório Técnico do Sistema LaTeX PDF MVP

Este relatório apresenta uma análise detalhada da arquitetura, funcionamento e componentes da aplicação LaTeX PDF MVP.

## 1. Visão Geral da Arquitetura

O sistema é uma aplicação web para edição e compilação de documentos LaTeX em tempo real. A arquitetura segue o modelo **Client-Server** desacoplado:

*   **Frontend (Client):** Single Page Application (SPA) construída com Vanilla JavaScript, HTML5 e CSS (Tailwind). Responsável pela interface do editor, gerenciamento de estado local e comunicação com APIs.
*   **Backend de Dados (BaaS):** Utiliza o **Supabase** para autenticação de usuários, banco de dados (metadados de projetos) e armazenamento de arquivos (Storage).
*   **Backend de Compilação (Server):** Uma aplicação Python (Flask) isolada em container Docker, responsável exclusivamente por receber o código LaTeX e retornar o PDF compilado.
*   **Serviços de IA:** Integração direta do client com APIs de LLMs (OpenAI e Google Gemini).

## 2. Detalhamento dos Componentes

### 2.1. Frontend (`/js`)

O frontend é modularizado em serviços específicos:

*   **`app.js` (Core Application):**
    *   Orquestra a inicialização da aplicação.
    *   Gerencia a instância do editor de código (CodeMirror).
    *   Controla a árvore de arquivos do projeto.
    *   Envia requisições de compilação para o backend Python.
    *   Gerencia o visualizador de PDF (provavelmente PDF.js).

*   **`supabase.js` (Autenticação):**
    *   Wrapper em torno da biblioteca cliente do Supabase (`@supabase/supabase-js`).
    *   Gerencia sessões de usuário (login, logout, recuperação de senha).
    *   Fornece métodos utilitários como `requireAuth()` para proteção de rotas.

*   **`storage.js` (Persistência):**
    *   Camada de abstração de dados.
    *   Sincroniza o estado local do projeto com o banco de dados PostgreSQL do Supabase.
    *   Gerencia o upload e download de arquivos binários (imagens, bibliografias) para o Supabase Storage.
    *   Implementa lógica de *auto-save* para prevenir perda de dados.

*   **`templates.js` (Biblioteca de Projetos):**
    *   Contém um catálogo *hardcoded* de templates LaTeX (artigos acadêmicos, teses, apresentações Beamer, currículos).
    *   Permite instanciar novos projetos pré-populados com estruturas de arquivos complexas.

### 2.2. Módulo de IA (`/js/ai-*.js`)

Um diferencial importante da aplicação é o assistente de IA integrado, capaz de editar o código ativamente.

*   **`ai-assistant.js` (Service Layer):**
    *   Define a lógica de comunicação com as APIs da **OpenAI (GPT-4o)** e **Google Gemini (Flash 1.5)**.
    *   **System Prompt Dinâmico:** Constrói um prompt de sistema robusto que ensina o modelo a retornar "Ações Estruturadas" em JSON (ex: `replace_command`, `insert_after`) em vez de apenas texto.
    *   Gerencia chaves de API armazenadas no `localStorage`.

*   **`ai-chat.js` (Interface & Execution):**
    *   Gerencia a UI do chat flutuante.
    *   Recebe as respostas da IA, renderiza o texto explicativo e **executa as ações de edição** diretamente no editor CodeMirror.
    *   Possui tratamento de erros e feedbacks visuais (toasts) para o sucesso/falha das edições automáticas.

### 2.3. Backend de Compilação (`latex-on-http-server`)

Uma aplicação Python robusta projetada para rodar em container.

*   **Tecnologia:** Python com Flask.
*   **Função:** Recebe um payload contendo a estrutura de arquivos do projeto (main.tex, imagens, etc.), reconstrói esse ambiente em um diretório temporário, executa o compilador LaTeX (provavelmente `latexmk` ou `pdflatex`) e retorna o PDF binário ou o log de erro.
*   **Docker:** O uso de Docker é crucial aqui para garantir que todas as dependências do TeX Live estejam presentes sem poluir o sistema hospedeiro.

## 3. APIs Externas Utilizadas

1.  **Supabase Auth:** Gerenciamento de identidade.
2.  **Supabase Database (PostgreSQL):** Metadados dos projetos (ID, nome, data de criação).
3.  **Supabase Storage:** Armazenamento de arquivos persistentes.
4.  **OpenAI API:** Chatbot inteligente (modelo `gpt-4o-mini`).
5.  **Google Gemini API:** Chatbot inteligente alternativo (modelo `gemini-1.5-flash`).
6.  **Backend Próprio (HTTP):** API de compilação (ex: `POST /build`).

## 4. Fluxo de Dados Crítico

1.  **Carregamento:** O usuário acessa a aplicação -> `supabase.js` verifica sessão -> `storage.js` baixa lista de arquivos do Supabase.
2.  **Edição:** Usuário digita no editor -> `app.js` detecta mudança -> `storage.js` salva o delta no Supabase (debounce).
3.  **Compilação:** Usuário clica em "Compilar" -> `app.js` empacota todos os arquivos do projeto em um JSON -> Envia POST para o Backend Python -> Backend compila e retorna PDF -> `app.js` exibe o PDF no iframe/viewer.
4.  **IA:** Usuário pede "Mude o título" -> `ai-chat.js` envia contexto para OpenAI/Gemini -> LLM retorna JSON `{action: "replace_command", ...}` -> Frontend aplica a mudança no editor.

## 4. Deep Dive: Backend de Compilação

Esta seção detalha o funcionamento interno do processo de compilação, respondendo a questões específicas sobre redundância e tratamento de erros.

### 4.1. Estratégia de Fallback (Redundância)
A aplicação possui um sistema de redundância robusto implementado no **Client-Side (Frontend)**, especificamente no arquivo `js/app.js`.

1.  **Tentativa Local:** A função `compile()` tenta inicialmente enviar a requisição para `http://localhost:8080/builds/sync` (o container Docker local).
2.  **Detecção de Falha:** Se essa requisição falhar (ex: rede indisponível, container parado), o bloco `try/catch` captura o erro.
3.  **Fallback Automático:** O código então redireciona a requisição para uma API pública de backup: `https://latex.ytotech.com/builds/sync`.

```javascript
// Trecho simplificado de js/app.js
try {
    response = await fetch(API_URL_LOCAL + '/builds/sync', ...);
} catch (localError) {
    console.log("Fallback para API pública...");
    response = await fetch(API_URL_PUBLIC + '/builds/sync', ...);
}
```

O **Backend Python**, por sua vez, **não** possui lógica de fallback para outras APIs. Ele é projetado para ser autossuficiente: ou compila usando o TeX Live instalado no container, ou retorna erro.

### 4.2. Sistema de Logs e Tratamento de Erros

O ciclo de vida de um erro de compilação percorre três estágios:

#### A. Captura no Backend (`compiler.py`)
O servidor Python executa o comando `latexmk` (ou `pdflatex`) em um subprocesso.
*   **Monitoramento:** O servidor captura todo o `STDOUT` e `STDERR` do processo.
*   **Logs de Arquivo:** Após a tentativa de compilação, ele lê todos os arquivos `*.log` gerados no diretório temporário.
*   **Resposta:** Se o código de saída do processo for diferente de zero (erro), a API retorna um HTTP 400 contendo um JSON com:
    *   `logs`: A saída bruta do terminal.
    *   `log_files`: O conteúdo completo dos arquivos de log (ex: `main.log`).

#### B. Processamento no Frontend (`app.js`)
O navegador recebe o JSON de erro e o processa através da função `parseLatexLog(logText)`. Esta função aplica Expressões Regulares (Regex) para identificar padrões conhecidos:
*   **Erros Críticos:** Linhas começando com `! ` (ex: `! Undefined control sequence`).
*   **Erros de Pacote:** Padrões como `Package babel Error: ...`.
*   **Warnings:** Padrões como `LaTeX Warning: Reference ... undefined`.

#### C. Análise Estática Client-Side
Um recurso interessante é que, se a compilação **tiver sucesso** (gerar PDF), a API padrão geralmente não retorna os logs para economizar banda. Para compensar isso, o frontend executa uma função `detectSourceWarnings(files)` que varre o código fonte em busca de problemas comuns antes mesmo de o usuário perceber:
*   Verifica se todas as tags `\ref{...}` possuem um `\label{...}` correspondente.
*   Verifica se as imagens incluídas via `\includegraphics{...}` existem na árvore de arquivos do projeto.

## 5. Sugestões de Melhorias e Otimizações

Com base na análise do código, sugerem-se as seguintes melhorias:

### 5.1. Arquitetura e Código
*   **Externalizar Templates:** Mover os templates de `templates.js` (atualmente *hardcoded*) para uma tabela no banco de dados do Supabase. Isso permite adicionar novos templates sem precisar redeployar o frontend e diminui o tamanho do bundle inicial.
*   **Modularização do Frontend:** O arquivo `app.js` tende a crescer muito. Migrar para um bundler (Vite/Webpack) e usar módulos ES6 reais facilitaria a manutenção e o *tree-shaking*.
*   **Tipagem:** Adotar TypeScript traria mais segurança, especialmente para as estruturas de dados complexas de projeto e as respostas da API de IA.

### 5.2. Performance e UX
*   **Compilação Incremental:** O backend parece recompilar tudo do zero a cada request. Implementar um sistema de cache de compilação baseada em hash dos arquivos no servidor Python aceleraria drasticamente as recompilações subsequentes.
*   **Web Workers:** Mover a lógica de parseamento de sintaxe ou preparação de payload para Web Workers para evitar travar a UI em projetos grandes.
*   **Streaming de Resposta da IA:** Implementar leitura de *stream* para as respostas da OpenAI/Gemini, melhorando a percepção de velocidade do chat.

### 5.3. Backend
*   **Fila de Compilação:** Para escalar, o backend não deve processar compilações de forma síncrona na thread HTTP. Usar uma fila (Redis/Celery) evitaria timeouts em documentos grandes.
*   **Segurança:** Reforçar a sanitização dos inputs no servidor Python para evitar injeção de comandos via shell escapes do LaTeX (ex: `\write18`).

### 5.4. Novos Recursos
*   **Colaboração em Tempo Real:** Utilizar o Supabase Realtime para permitir que dois usuários editem o mesmo documento simultaneamente (semelhante ao Overleaf).
*   **Histórico de Versões:** Implementar um sistema de "snapshots" no `storage.js` para permitir reverter o projeto para estados anteriores.
