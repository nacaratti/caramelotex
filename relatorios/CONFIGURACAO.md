# 🔧 Guia de Configuração - Sistema LaTeX PDF MVP

Este documento explica como configurar as variáveis de ambiente do sistema.

## 📋 Visão Geral

O sistema utiliza variáveis de ambiente para configuração, garantindo que credenciais sensíveis não sejam commitadas no repositório. As configurações são carregadas em dois momentos:

1. **Build time**: O script `build.sh` gera `js/config.js` a partir das variáveis de ambiente
2. **Runtime**: O código JavaScript lê as configurações de `js/config.js`

## 🚀 Configuração Rápida

### Desenvolvimento Local

1. **Copie o arquivo de exemplo:**
   ```bash
   cp .env.example .env
   ```

2. **Edite o arquivo `.env`** com suas credenciais:
   ```bash
   # Use seu editor preferido
   nano .env
   # ou
   code .env
   ```

3. **Gere o arquivo de configuração:**
   ```bash
   bash build.sh
   ```

4. **Ou use o script helper:**
   ```bash
   bash scripts/setup-env.sh
   ```

### Produção (Vercel)

1. Acesse o painel do Vercel
2. Vá em **Settings** → **Environment Variables**
3. Adicione as seguintes variáveis:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `API_URL_LOCAL` (opcional)
   - `API_URL_PUBLIC`
   - `NODE_ENV` (geralmente `production`)
   - `COMPILATION_TIMEOUT` (opcional)
   - `DEBUG` (opcional, `false` em produção)

4. O Vercel executará `build.sh` automaticamente durante o deploy

## 📝 Variáveis Disponíveis

### Supabase

| Variável | Descrição | Obrigatória | Padrão |
|----------|-----------|-------------|--------|
| `SUPABASE_URL` | URL do projeto Supabase | ✅ Sim | - |
| `SUPABASE_ANON_KEY` | Chave pública (anon key) do Supabase | ✅ Sim | - |

**⚠️ Importante:** A chave `anon` pode ser exposta no frontend, mas certifique-se de que as políticas RLS (Row Level Security) estão configuradas corretamente no Supabase.

### API de Compilação

| Variável | Descrição | Obrigatória | Padrão |
|----------|-----------|-------------|--------|
| `API_URL_LOCAL` | URL do servidor local (desenvolvimento) | ❌ Não | `http://localhost:8080` |
| `API_URL_PUBLIC` | URL do servidor público (fallback) | ✅ Sim | `https://latex.ytotech.com` |

### Ambiente

| Variável | Descrição | Obrigatória | Padrão |
|----------|-----------|-------------|--------|
| `NODE_ENV` | Ambiente: `development`, `staging`, `production` | ❌ Não | `development` |
| `COMPILATION_TIMEOUT` | Timeout para compilações (segundos) | ❌ Não | `100` |
| `DEBUG` | Habilita logs detalhados (`true`/`false`) | ❌ Não | `false` |

## 🔒 Segurança

### ⚠️ IMPORTANTE: Chaves Expostas no Frontend

**Sim, as chaves estão expostas no código JavaScript!** Mas isso é **seguro** quando feito corretamente:

1. **Chave `anon` é projetada para ser pública** - É diferente da `service_role`
2. **Segurança vem das Políticas RLS** - Configure no Supabase Dashboard
3. **Sem RLS = Sem Segurança** - Qualquer pessoa pode acessar seus dados!

📖 **Leia mais:** Consulte `SEGURANCA_SUPABASE.md` para detalhes completos.

### ✅ Boas Práticas

1. **NUNCA** commite o arquivo `.env` no git
2. **NUNCA** commite o arquivo `js/config.js` no git
3. **SEMPRE** use variáveis de ambiente em produção
4. **VERIFIQUE** que o `.gitignore` inclui `.env` e `js/config.js`
5. **CONFIGURE** políticas RLS no Supabase adequadamente ⚠️ **CRÍTICO**
6. **USE** apenas a chave `anon` no frontend, nunca a `service_role`
7. **MONITORE** logs do Supabase para acesso suspeito

### ⚠️ Checklist de Segurança

- [ ] Arquivo `.env` está no `.gitignore` ✅
- [ ] Arquivo `js/config.js` está no `.gitignore` ✅
- [ ] **Políticas RLS configuradas no Supabase** ⚠️ **VERIFICAR**
- [ ] Variáveis de ambiente configuradas no Vercel (produção)
- [ ] Nenhuma credencial hardcoded no código (exceto valores padrão)
- [ ] Rate limiting configurado no Supabase
- [ ] Testado acesso não autenticado retorna vazio/erro

## 🧪 Testando a Configuração

Após configurar as variáveis, você pode testar:

1. **Verificar se o config.js foi gerado:**
   ```bash
   cat js/config.js
   ```

2. **Verificar se as configurações estão sendo carregadas:**
   - Abra o navegador
   - Abra o Console do Desenvolvedor (F12)
   - Procure por mensagens de validação de configuração
   - Se `DEBUG=true`, você verá logs detalhados

3. **Testar conexão com Supabase:**
   - Tente fazer login na aplicação
   - Verifique se os projetos são carregados

4. **Testar API de compilação:**
   - Tente compilar um documento LaTeX
   - Verifique se o fallback funciona (servidor local → público)

## 🐛 Troubleshooting

### Problema: Configurações não estão sendo aplicadas

**Solução:**
1. Verifique se o arquivo `.env` existe
2. Execute `bash build.sh` novamente
3. Limpe o cache do navegador
4. Verifique se `js/config.js` foi atualizado

### Problema: Erro ao conectar com Supabase

**Solução:**
1. Verifique se `SUPABASE_URL` está correto
2. Verifique se `SUPABASE_ANON_KEY` está correto
3. Verifique se as políticas RLS estão configuradas
4. Verifique o console do navegador para erros específicos

### Problema: API de compilação não funciona

**Solução:**
1. Verifique se `API_URL_LOCAL` está correto (se usando servidor local)
2. Verifique se o servidor local está rodando (se aplicável)
3. Verifique se `API_URL_PUBLIC` está acessível
4. Verifique o console do navegador para erros de CORS

## 📚 Arquivos Relacionados

- `.env.example` - Template de variáveis de ambiente
- `.env` - Arquivo de configuração local (não commitado)
- `build.sh` - Script que gera `js/config.js`
- `js/config.js` - Arquivo de configuração gerado (não commitado)
- `scripts/setup-env.sh` - Script helper para configuração

## 🔄 Fluxo de Configuração

```
┌─────────────┐
│ .env.example│
└──────┬──────┘
       │
       │ (cópia manual ou script)
       ▼
┌─────────────┐
│    .env     │
└──────┬──────┘
       │
       │ (build.sh lê variáveis)
       ▼
┌─────────────┐
│ build.sh   │
└──────┬──────┘
       │
       │ (gera)
       ▼
┌─────────────┐
│js/config.js │
└──────┬──────┘
       │
       │ (carregado pelo HTML)
       ▼
┌─────────────┐
│  Aplicação  │
└─────────────┘
```

## 📞 Suporte

Se encontrar problemas:

1. Verifique este guia
2. Consulte os logs do console do navegador
3. Verifique os logs do servidor (se aplicável)
4. Abra uma issue no repositório

---

**Última atualização:** 6 de Fevereiro de 2026
