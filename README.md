# LaTeX Editor Online - MVP

Editor LaTeX com interface web moderna e compilação server-side usando latex-on-http via Docker.

## Características

- **Editor de código** com syntax highlighting para LaTeX (CodeMirror 5)
- **Compilação server-side** usando latex-on-http (Docker local)
- **Visualização de PDF** integrada (PDF.js)
- **Auto-compilação** opcional
- **Download de PDFs** gerados
- **Interface moderna** com Tailwind CSS
- **Funciona offline** após iniciar o Docker

## Estrutura do Projeto

```
latex-pdf-mvp/
├── index.html          # Página principal
├── docker-compose.yml  # Configuração do servidor LaTeX
├── styles/
│   └── main.css       # Estilos customizados
└── js/
    └── app.js         # Aplicação completa (Editor + Viewer + API Client)
```

## Pré-requisitos

- **Docker** e **Docker Compose** instalados ([Guia de instalação](https://docs.docker.com/get-docker/))
- Navegador moderno (Chrome, Firefox, Edge, Safari)

## Como Executar

### Passo 1: Iniciar o Servidor LaTeX (Docker)

Na raiz do projeto, execute:

```bash
docker-compose up -d
```

Isso vai:
- Baixar a imagem `yoant/latexonhttp-python` (~500MB na primeira vez)
- Iniciar o servidor LaTeX na porta 2345
- Aguarde alguns segundos até o container estar pronto

Verifique se está rodando:
```bash
docker-compose ps
```

### Passo 2: Iniciar o Frontend

Escolha uma das opções abaixo:

#### Opção A: Servidor Local Simples

```bash
# Usando Python 3
python -m http.server 8000

# Usando Node.js (http-server)
npx http-server -p 8000

# Usando PHP
php -S localhost:8000
```

Depois acesse: `http://localhost:8000`

#### Opção B: Live Server (VS Code)

1. Instale a extensão "Live Server" no VS Code
2. Clique com botão direito em `index.html`
3. Selecione "Open with Live Server"

### Parar o Servidor LaTeX

Quando terminar de usar:
```bash
docker-compose down
```

## Uso

1. **Certifique-se** de que o Docker está rodando (`docker-compose ps`)
2. **Escrever código LaTeX** no painel esquerdo
3. **Clicar em "Compilar"** ou usar `Ctrl+S` / `Cmd+S`
4. **Aguardar a compilação** (primeira compilação pode demorar ~10s)
5. **Visualizar o PDF** no painel direito
6. **Ativar "Auto"** para compilação automática ao digitar
7. **Download** do PDF usando o botão de download

## Atalhos de Teclado

- `Ctrl+S` / `Cmd+S` - Compilar documento

## Notas Importantes

- A **primeira compilação** pode demorar ~10s enquanto o TeXLive inicializa
- Após a primeira compilação, as compilações subsequentes são mais rápidas
- O aplicativo funciona **offline** após o Docker estar rodando
- Requer navegador moderno (Chrome, Firefox, Edge, Safari)
- O servidor Docker usa ~500MB de espaço em disco

## Dependências

**Frontend (CDN):**
- **Tailwind CSS** - Framework CSS
- **CodeMirror 5** - Editor de código
- **PDF.js** - Renderização de PDF

**Backend (Docker):**
- **latex-on-http** - API de compilação LaTeX
- **TeXLive** - Distribuição LaTeX completa

## Limitações do MVP

- Requer Docker instalado e rodando
- Primeira compilação pode demorar ~10s
- Suporte a pacotes LaTeX padrão incluídos no TeXLive
- Não suporta upload de imagens personalizadas (ainda)
- Sem sistema de salvamento/persistência local
- Compilação requer conexão com servidor local (Docker)

## Troubleshooting

### Erro: "Servidor LaTeX offline"

Se você ver este erro ao compilar:

1. Verifique se o Docker está rodando:
   ```bash
   docker-compose ps
   ```

2. Se não estiver rodando, inicie:
   ```bash
   docker-compose up -d
   ```

3. Aguarde alguns segundos e tente compilar novamente

### Docker não inicia

- Verifique se o Docker Desktop está rodando
- Verifique se a porta 2345 não está sendo usada:
  ```bash
  # Windows
  netstat -ano | findstr :2345

  # Linux/Mac
  lsof -i :2345
  ```

### Compilação muito lenta

- A primeira compilação é mais lenta (~10s)
- Compilações subsequentes são mais rápidas (~2-3s)
- Se continuar lento, reinicie o container:
  ```bash
  docker-compose restart
  ```

### Ver logs do servidor LaTeX

```bash
docker-compose logs -f latex-compiler
```

## Próximos Passos

- [ ] Sistema de templates predefinidos
- [ ] Upload de imagens e recursos
- [ ] Salvamento local (LocalStorage)
- [ ] Mais pacotes LaTeX
- [ ] Modo colaborativo

## Tecnologias Utilizadas

**Frontend:**
- HTML5
- CSS3 (Tailwind CSS)
- JavaScript (Vanilla JS)
- CodeMirror 5
- PDF.js

**Backend:**
- Docker & Docker Compose
- latex-on-http (API Python)
- TeXLive (pdflatex)

## Licença

MIT

## Autor

Desenvolvido com Claude AI