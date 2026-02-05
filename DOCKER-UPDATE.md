# Atualizacao da Imagem Docker - LaTeX Compiler

## Quando atualizar

- Quando o servidor LaTeX apresentar erros inesperados de compilacao
- Quando houver uma nova versao da imagem `yoant/latexonhttp-python:debian`
- Quando pacotes LaTeX estiverem faltando ou desatualizados
- Periodicamente (ex: a cada 1-2 meses) para manter seguranca e compatibilidade

## Procedimento

### 1. Parar o container atual

```bash
docker compose down
```

### 2. Baixar a versao mais recente da imagem

```bash
docker pull yoant/latexonhttp-python:debian
```

### 3. Subir o container com a nova imagem

```bash
docker compose up -d
```

### 4. Verificar se esta rodando

```bash
docker compose ps
```

O status deve mostrar `Up` na coluna STATUS.

### 5. Testar

Abra o editor e compile um documento para confirmar que tudo funciona.

## Comando unico (parar + atualizar + subir)

```bash
docker compose down && docker pull yoant/latexonhttp-python:debian && docker compose up -d
```

## Verificar versao/imagem atual

```bash
docker images yoant/latexonhttp-python:debian
```

## Ver logs do container

```bash
docker compose logs -f latex-compiler
```
