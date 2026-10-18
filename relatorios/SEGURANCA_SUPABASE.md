# 🔒 Segurança: Chaves do Supabase no Frontend

## ⚠️ Entendendo a Exposição

Você está correto em se preocupar! As chaves **estão expostas** no código JavaScript que é enviado para o navegador. Porém, isso é **intencional e seguro** quando feito corretamente.

## ✅ Por que a Chave `anon` é Segura?

### 1. Design do Supabase

A chave `anon` (anon key) do Supabase é **projetada para ser pública**. Ela é diferente da chave `service_role` que **NUNCA** deve ser exposta.

### 2. Proteção via RLS (Row Level Security)

A segurança real vem das **Políticas RLS** configuradas no banco de dados:

```sql
-- Exemplo: Usuário só pode ver seus próprios projetos
CREATE POLICY "Users can only see their own projects"
ON projects FOR SELECT
USING (auth.uid() = user_id);
```

Sem políticas RLS adequadas, qualquer pessoa com a chave `anon` pode acessar todos os dados!

## 🛡️ Checklist de Segurança

### ✅ O que está CORRETO no nosso código:

- [x] Arquivo `js/config.js` está no `.gitignore` (não será commitado)
- [x] Arquivo `.env` está no `.gitignore` (não será commitado)
- [x] Usamos apenas a chave `anon`, nunca `service_role`
- [x] Configuração via variáveis de ambiente em produção

### ⚠️ O que você DEVE VERIFICAR:

- [ ] **Políticas RLS configuradas no Supabase**
- [ ] **Chave `anon` não permite operações administrativas**
- [ ] **Limites de rate limiting configurados**
- [ ] **Validação de dados no backend quando necessário**

## 🔍 Como Verificar suas Políticas RLS

1. Acesse o Supabase Dashboard
2. Vá em **Authentication** → **Policies**
3. Verifique se há políticas para as tabelas:
   - `projects`
   - `project_files`

### Exemplo de Política Segura:

```sql
-- Política para SELECT (ler projetos)
CREATE POLICY "Users can only read their own projects"
ON projects FOR SELECT
USING (auth.uid() = user_id);

-- Política para INSERT (criar projetos)
CREATE POLICY "Users can only create their own projects"
ON projects FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Política para UPDATE (atualizar projetos)
CREATE POLICY "Users can only update their own projects"
ON projects FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Política para DELETE (deletar projetos)
CREATE POLICY "Users can only delete their own projects"
ON projects FOR DELETE
USING (auth.uid() = user_id);
```

## 🚨 O que NUNCA fazer

### ❌ NUNCA exponha a chave `service_role`:

```javascript
// ❌ ERRADO - NUNCA FAÇA ISSO!
const SUPABASE_CONFIG = {
    serviceRoleKey: 'eyJ...' // Esta chave tem acesso TOTAL!
};
```

### ❌ NUNCA commite `js/config.js` com credenciais:

```bash
# ❌ ERRADO
git add js/config.js
git commit -m "Add config"
```

### ❌ NUNCA desabilite RLS sem políticas:

```sql
-- ❌ PERIGOSO - permite acesso total!
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
```

## 🔐 Alternativas Mais Seguras (Opcional)

Se você ainda se sentir desconfortável, existem alternativas:

### Opção 1: Backend Proxy (Mais Seguro)

Criar um backend intermediário que usa a chave `service_role`:

```javascript
// Frontend chama sua API
fetch('/api/projects', {
    headers: {
        'Authorization': `Bearer ${userToken}`
    }
});

// Backend usa service_role (nunca exposta)
const supabase = createClient(url, SERVICE_ROLE_KEY);
```

**Vantagens:**
- Chave `service_role` nunca exposta
- Controle total sobre validações
- Pode adicionar rate limiting customizado

**Desvantagens:**
- Mais complexo
- Requer servidor backend
- Mais custos

### Opção 2: Rotação de Chaves (Recomendado)

Rotacionar a chave `anon` periodicamente:

1. Gere nova chave no Supabase Dashboard
2. Atualize variáveis de ambiente
3. Redeploy da aplicação

## 📊 Comparação de Segurança

| Abordagem | Segurança | Complexidade | Custo |
|-----------|-----------|--------------|-------|
| **Chave `anon` + RLS** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐ |
| **Backend Proxy** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Sem RLS** | ⭐ | ⭐ | ⭐ |

## ✅ Recomendação

Para a maioria dos casos, **chave `anon` + RLS adequado** é suficiente e é a abordagem recomendada pelo Supabase.

### Passos para Garantir Segurança:

1. ✅ Configure políticas RLS no Supabase
2. ✅ Teste as políticas com diferentes usuários
3. ✅ Monitore logs do Supabase para acesso suspeito
4. ✅ Configure rate limiting no Supabase
5. ✅ Rotacione chaves periodicamente (opcional)

## 🔍 Como Testar se está Seguro

### Teste 1: Acesso Não Autenticado

```javascript
// Tente acessar sem autenticação
const { data } = await supabase
    .from('projects')
    .select('*');
    
// Deve retornar vazio ou erro se RLS estiver configurado
```

### Teste 2: Acesso de Outro Usuário

```javascript
// Faça login como usuário A
// Tente acessar projetos do usuário B
// Deve retornar apenas projetos do usuário A
```

### Teste 3: Operações Não Permitidas

```javascript
// Tente deletar projeto de outro usuário
// Deve falhar se RLS estiver configurado
```

## 📚 Recursos Adicionais

- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)
- [Supabase API Keys Explained](https://supabase.com/docs/guides/api/api-keys)

---

**Conclusão:** A chave `anon` exposta no frontend é **segura** quando combinada com políticas RLS adequadas. O importante é garantir que as políticas estejam configuradas corretamente!
