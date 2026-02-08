# Deploy do LaTeX Backend no Railway

## Passo 1: Preparar o Repositório

O código já está configurado. Você precisa fazer commit das alterações:

```bash
git add .
git commit -m "Adicionar suporte a Railway para backend LaTeX"
git push origin main
```

## Passo 2: Deploy no Railway

### Opção A: Via Dashboard (Recomendado)

1. Acesse https://railway.app/dashboard
2. Clique em **"New Project"**
3. Selecione **"Deploy from GitHub repo"**
4. Conecte seu repositório GitHub
5. **IMPORTANTE**: Configure o Root Directory:
   - Vá em **Settings** do serviço
   - Em **Root Directory**, coloque: `latex-on-http-server`
6. O Railway vai detectar o `railway.json` e usar o `Dockerfile.railway`

### Opção B: Via CLI

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Linkar ao projeto existente
railway link a2f427e1-5507-4c36-a3c0-1aa75e005073

# Deploy (do diretório latex-on-http-server)
cd latex-on-http-server
railway up
```

## Passo 3: Configurar Variáveis de Ambiente no Railway

No dashboard do Railway, vá em **Variables** e adicione:

```
DEFAULT_COMPILE_TIMEOUT=60
LOGGING_LEVEL=INFO
```

## Passo 4: Obter a URL Pública

1. No dashboard do Railway, vá em **Settings** > **Networking**
2. Clique em **"Generate Domain"** para obter uma URL pública
3. A URL será algo como: `https://latex-api-production-xxxx.up.railway.app`

## Passo 5: Configurar o Vercel

1. Acesse o dashboard do Vercel
2. Vá no seu projeto > **Settings** > **Environment Variables**
3. Adicione:
   - **Name**: `LATEX_API_URL`
   - **Value**: `https://sua-url-do-railway.up.railway.app`
4. Faça um redeploy no Vercel

## Verificação

Após o deploy, teste os endpoints:

```bash
# Health check
curl https://sua-url-do-railway.up.railway.app/health

# Info da API
curl https://sua-url-do-railway.up.railway.app/
```

## Custos Estimados

- **Railway Free Tier**: 500 horas/mês (suficiente para uso leve)
- **Railway Hobby**: $5/mês (uso contínuo)

## Troubleshooting

### Build demora muito
O primeiro build pode demorar 10-15 minutos porque a imagem base `yoant/latexonhttp-python:debian` é grande (~3GB).

### Timeout na compilação
Aumente `DEFAULT_COMPILE_TIMEOUT` nas variáveis de ambiente.

### Erro de memória
O plano free do Railway tem limite de memória. Considere upgrade para Hobby se necessário.
