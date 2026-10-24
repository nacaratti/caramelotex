# CarameloTeX

Editor LaTeX para Windows que funciona **offline**: instala o LaTeX
(TinyTeX) sozinho na primeira abertura, abre as pastas do seu computador como
projetos e gera o PDF localmente.

**Baixar:** [CarameloTeX-setup-x64.exe](https://github.com/nacaratti/caramelotex/releases/latest/download/CarameloTeX-setup-x64.exe)
(Windows 10 e 11, 64 bits) · [Página de versões](https://github.com/nacaratti/caramelotex/releases)

## Funcionalidades

- **Offline:** na primeira abertura o app baixa o LaTeX (cerca de 210 MB) uma
  única vez; depois, escrever e compilar funcionam sem internet.
- **Aviso de versão nova:** ao abrir, o app consulta a release mais recente no
  GitHub e, se houver versão nova, mostra um aviso com o link de download (dá para
  desligar no botão *Atualizações*).
- **Seus arquivos, suas pastas:** sem conta nem nuvem; o editor salva direto
  na pasta. Arquivos excluídos vão para a Lixeira. Se um arquivo muda fora do
  app (Git, outro editor), ele é recarregado ou o app pergunta qual versão manter.
- **Editor moderno (CodeMirror 6):** autocompletar de comandos, ambientes,
  `\ref`, `\cite` (lendo os `.bib`) e arquivos; buscar e substituir; erros
  sublinhados no código.
- **Barra de formatação:** negrito, itálico, títulos, listas, equações, citação,
  referência e nota de rodapé (Ctrl+B, Ctrl+I).
- **Editor visual de equações (Ctrl+Shift+E):** monte a fórmula vendo o
  resultado, com botões de estruturas (fração, raiz, integral, matriz...) e
  símbolos; o LaTeX é gerado e pode ser editado. Feito com MathLive, offline.
- **Inserir figura e tabela:** diálogos que geram o código, com legenda e
  rótulo; cole uma imagem (Ctrl+V) ou células do Excel/Google Planilhas. Os
  pacotes necessários são adicionados ao preâmbulo.
- **Compilação:** pdfLaTeX, XeLaTeX ou LuaLaTeX com latexmk (BibTeX e biber
  automáticos). Pacotes que o documento usa e não estão instalados são
  baixados sozinhos (com internet).
- **Pacotes LaTeX (ícone da caixa):** veja os pacotes que o documento usa e
  quais faltam, a lista dos instalados e busque entre os ~8 mil do TeX Live
  para instalar com um clique (via `tlmgr`; busca e instalação precisam de internet).
- **PDF rápido:** só as páginas visíveis são desenhadas, a posição de leitura é
  mantida ao recompilar, zoom e ajuste à largura.
- **SyncTeX:** duplo clique no código mostra o trecho no PDF; Ctrl+clique no
  PDF leva à linha.
- **Sumário e contagem de palavras:** seções, figuras e tabelas de todos os
  arquivos; contagem por seção com o texcount.
- **Corretor ortográfico em português e inglês** offline (dicionários VERO e
  SCOWL), com sugestões e dicionário pessoal; o idioma é detectado pelo
  documento e pode ser trocado na barra de status.
- **Tema claro e escuro**, seguindo o Windows por padrão.
- **11 modelos:** artigo ABNT, IEEE, TCC, dissertação/tese, Beamer, currículo e outros.

## Desenvolvimento

O app é feito com [Tauri 2](https://tauri.app) (Rust) e um frontend em
JavaScript empacotado pelo Vite.

```
src/                 frontend (index.html = editor, projects.html, templates.html)
  js/                módulos: app, editor (CodeMirror 6), pdf-viewer, toolbar,
                     dialogs, completions, outline, spell, storage, theme
  styles/            theme.css (tokens claro/escuro) e main.css (componentes)
  templates/         modelos de projeto (JSON)
src-tauri/           backend Rust
  src/               fs_commands (arquivos), compile (latexmk), tex (TinyTeX),
                     spell (corretor), paths (segurança de caminhos)
  resources/         dict/ (dicionários pt-BR e en-US)
scripts/             build-tinytex.ps1
site/                landing page (publicada no Vercel)
tests/fixtures/      documentos usados nos testes de compilação
```

### Pré-requisitos

- Node.js LTS
- Rust (`rustup`) e Visual Studio Build Tools com "Desenvolvimento para desktop com C++"

### Comandos

```bash
npm install
npm run tauri dev     # app em modo de desenvolvimento
npm run tauri build   # instalador em target/release/bundle/nsis/
```

O LaTeX não vai no instalador: na primeira execução o app baixa o zip da release
[`tinytex-2026.10-r2`](https://github.com/nacaratti/caramelotex/releases/tag/tinytex-2026.10-r2)
e confere o SHA-256 (constantes `TINYTEX_*` em `src-tauri/src/tex.rs`). Para usar
um zip local, defina `CARAMELOTEX_TINYTEX_ZIP` com o caminho dele.

Para mudar a lista de pacotes do TinyTeX: aumente `$BundleRevision` em
`scripts/build-tinytex.ps1`, rode o workflow [`tinytex.yml`](.github/workflows/tinytex.yml)
(aba Actions) e copie para `tex.rs` a versão, o link, o tamanho e o SHA-256 que ele
mostra no fim. O app compara a versão e baixa o LaTeX novo para quem tem o anterior.

### Testes

```bash
cargo test --manifest-path src-tauri/Cargo.toml
# Compilação real (modelos, bibliografia, XeLaTeX, erros, timeout):
CARAMELOTEX_TEX_BIN=".../TinyTeX/bin/windows" cargo test --manifest-path src-tauri/Cargo.toml -- --ignored
```

### Publicar uma versão

1. Atualize a versão em `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`
   e o histórico em `site/sobre.html`.
2. Faça o commit e envie uma tag com a mesma versão: `git tag v0.4.0 && git push origin v0.4.0`.
3. O workflow [`release.yml`](.github/workflows/release.yml) gera o instalador no GitHub
   Actions (sem nenhum secret) e cria a release como rascunho com o arquivo
   **`CarameloTeX-setup-x64.exe`** (nome fixo: a landing aponta para
   `releases/latest/download/CarameloTeX-setup-x64.exe`). Revise e publique o rascunho: a
   partir daí, os apps instalados mostram o aviso de versão nova.

Opcional: a assinatura do Windows pela SignPath usa o secret `SIGNPATH_API_TOKEN` e as
variáveis `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` e
`SIGNPATH_SIGNING_POLICY_SLUG`; sem eles, o instalador sai sem essa assinatura. A configuração de artefato da SignPath está em
[`.signpath/artifact-configuration.xml`](.signpath/artifact-configuration.xml), e a política
de assinatura em `site/assinatura.html` (publicada em `/assinatura`).

## Licença

O CarameloTeX é distribuído sob a [licença MIT](LICENSE).

## Licenças de terceiros

TinyTeX/TeX Live (licenças livres dos respectivos pacotes), dicionário VERO
pt-BR (LGPLv3/MPL), dicionário en-US do SCOWL/LibreOffice (licença do SCOWL, tipo BSD), MathLive (MIT), fontes IBM Plex Sans e JetBrains Mono (OFL), KaTeX (MIT), Latin Modern
(GUST Font License).
