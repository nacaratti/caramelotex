-- =====================================================
-- CarameloTeX - Tabelas para Admin e Templates
-- Execute este script no Supabase SQL Editor
-- =====================================================

-- Habilitar extensão UUID se não existir
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Tabela: templates
-- Armazena todos os templates LaTeX disponíveis
-- =====================================================
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('academic', 'thesis', 'presentation', 'professional')),
    tags TEXT[] DEFAULT '{}',
    icon VARCHAR(50) DEFAULT 'document',
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para busca
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON templates(is_active);
CREATE INDEX IF NOT EXISTS idx_templates_tags ON templates USING GIN(tags);

-- =====================================================
-- Tabela: user_profiles
-- Perfis de usuário com roles (user, admin)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- =====================================================
-- Trigger: Atualizar updated_at automaticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para templates
DROP TRIGGER IF EXISTS templates_updated_at ON templates;
CREATE TRIGGER templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para user_profiles
DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Trigger: Criar perfil de usuário automaticamente
-- quando um novo usuário se registra
-- =====================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, role)
    VALUES (NEW.id, NEW.email, 'user')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Criar trigger para novos usuários
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- Row Level Security (RLS) - Templates
-- =====================================================
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Política: Leitura pública para templates ativos
DROP POLICY IF EXISTS "Templates ativos são públicos para leitura" ON templates;
CREATE POLICY "Templates ativos são públicos para leitura"
    ON templates
    FOR SELECT
    USING (is_active = true);

-- Política: Admins podem ver todos os templates (incluindo inativos)
DROP POLICY IF EXISTS "Admins podem ver todos templates" ON templates;
CREATE POLICY "Admins podem ver todos templates"
    ON templates
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Política: Admins podem inserir templates
DROP POLICY IF EXISTS "Admins podem inserir templates" ON templates;
CREATE POLICY "Admins podem inserir templates"
    ON templates
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Política: Admins podem atualizar templates
DROP POLICY IF EXISTS "Admins podem atualizar templates" ON templates;
CREATE POLICY "Admins podem atualizar templates"
    ON templates
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Política: Admins podem deletar templates
DROP POLICY IF EXISTS "Admins podem deletar templates" ON templates;
CREATE POLICY "Admins podem deletar templates"
    ON templates
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- =====================================================
-- Row Level Security (RLS) - User Profiles
-- =====================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver seu próprio perfil
DROP POLICY IF EXISTS "Usuários podem ver próprio perfil" ON user_profiles;
CREATE POLICY "Usuários podem ver próprio perfil"
    ON user_profiles
    FOR SELECT
    USING (id = auth.uid());

-- Política: Admins podem ver todos os perfis
DROP POLICY IF EXISTS "Admins podem ver todos perfis" ON user_profiles;
CREATE POLICY "Admins podem ver todos perfis"
    ON user_profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Política: Admins podem atualizar perfis
DROP POLICY IF EXISTS "Admins podem atualizar perfis" ON user_profiles;
CREATE POLICY "Admins podem atualizar perfis"
    ON user_profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- =====================================================
-- Função auxiliar: Verificar se usuário é admin
-- (pode ser chamada via RPC)
-- =====================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Função auxiliar: Obter perfil do usuário atual
-- =====================================================
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS TABLE (
    id UUID,
    email VARCHAR(255),
    role VARCHAR(20),
    is_active BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT up.id, up.email, up.role, up.is_active, up.created_at
    FROM user_profiles up
    WHERE up.id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- IMPORTANTE: Defina seu primeiro admin manualmente!
-- Substitua 'seu@email.com' pelo email do admin
-- =====================================================
-- UPDATE user_profiles
-- SET role = 'admin'
-- WHERE email = 'seu@email.com';

-- =====================================================
-- Comentários
-- =====================================================
COMMENT ON TABLE templates IS 'Templates LaTeX disponíveis para os usuários';
COMMENT ON TABLE user_profiles IS 'Perfis de usuário com roles e configurações';
COMMENT ON FUNCTION is_admin() IS 'Verifica se o usuário autenticado é admin';
COMMENT ON FUNCTION get_my_profile() IS 'Retorna o perfil do usuário autenticado';
