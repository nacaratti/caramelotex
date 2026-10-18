/**
 * admin.js - Serviços de Administração
 *
 * Depende de: supabase.js (global `supabase` e `AuthService`)
 */

// =====================================================
// AdminService - Verificação de permissões
// =====================================================
const AdminService = {
    /**
     * Verifica se o usuário atual é admin
     * @returns {Promise<boolean>}
     */
    async isAdmin() {
        try {
            const { data, error } = await supabase.rpc('is_admin');
            if (error) {
                console.error('AdminService.isAdmin error:', error.message);
                return false;
            }
            return data === true;
        } catch (e) {
            console.error('AdminService.isAdmin exception:', e);
            return false;
        }
    },

    /**
     * Requer que o usuário seja admin, redireciona se não for
     * @returns {Promise<boolean>} true se é admin
     */
    async requireAdmin() {
        const session = await AuthService.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return false;
        }

        const isAdmin = await this.isAdmin();
        if (!isAdmin) {
            window.location.href = 'index.html';
            return false;
        }

        return true;
    },

    /**
     * Obtém o perfil do usuário atual
     * @returns {Promise<Object|null>}
     */
    async getMyProfile() {
        try {
            const { data, error } = await supabase.rpc('get_my_profile');
            if (error) {
                console.error('AdminService.getMyProfile error:', error.message);
                return null;
            }
            return data?.[0] ?? null;
        } catch (e) {
            console.error('AdminService.getMyProfile exception:', e);
            return null;
        }
    }
};

// =====================================================
// TemplateService - CRUD de Templates
// =====================================================
const TemplateService = {
    /**
     * Lista todos os templates (ativos para usuários, todos para admins)
     * @param {Object} options - Opções de filtro
     * @param {string} options.category - Filtrar por categoria
     * @param {string} options.search - Busca por nome/descrição/tags
     * @param {boolean} options.includeInactive - Incluir inativos (só admin)
     * @returns {Promise<Array>}
     */
    async listTemplates(options = {}) {
        try {
            let query = supabase
                .from('templates')
                .select('*')
                .order('name', { ascending: true });

            // Filtro por categoria
            if (options.category && options.category !== 'all') {
                query = query.eq('category', options.category);
            }

            // Filtro de ativos (usuários normais só veem ativos via RLS)
            if (!options.includeInactive) {
                query = query.eq('is_active', true);
            }

            const { data, error } = await query;

            if (error) {
                console.error('TemplateService.listTemplates error:', error.message);
                return [];
            }

            // Filtro de busca (client-side para simplicidade)
            if (options.search) {
                const searchLower = options.search.toLowerCase();
                return data.filter(t =>
                    t.name.toLowerCase().includes(searchLower) ||
                    (t.description && t.description.toLowerCase().includes(searchLower)) ||
                    (t.tags && t.tags.some(tag => tag.toLowerCase().includes(searchLower)))
                );
            }

            return data;
        } catch (e) {
            console.error('TemplateService.listTemplates exception:', e);
            return [];
        }
    },

    /**
     * Obtém um template por ID
     * @param {string} id - UUID do template
     * @returns {Promise<Object|null>}
     */
    async getTemplate(id) {
        try {
            const { data, error } = await supabase
                .from('templates')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                console.error('TemplateService.getTemplate error:', error.message);
                return null;
            }

            return data;
        } catch (e) {
            console.error('TemplateService.getTemplate exception:', e);
            return null;
        }
    },

    /**
     * Cria um novo template (apenas admin)
     * @param {Object} template - Dados do template
     * @returns {Promise<Object|null>} Template criado ou null
     */
    async createTemplate(template) {
        try {
            const userId = await AuthService.getUserId();

            const { data, error } = await supabase
                .from('templates')
                .insert({
                    name: template.name,
                    description: template.description || '',
                    category: template.category,
                    tags: template.tags || [],
                    icon: template.icon || 'document',
                    content: template.content,
                    is_active: template.is_active !== false,
                    created_by: userId
                })
                .select()
                .single();

            if (error) {
                console.error('TemplateService.createTemplate error:', error.message);
                return null;
            }

            return data;
        } catch (e) {
            console.error('TemplateService.createTemplate exception:', e);
            return null;
        }
    },

    /**
     * Atualiza um template existente (apenas admin)
     * @param {string} id - UUID do template
     * @param {Object} updates - Campos a atualizar
     * @returns {Promise<Object|null>} Template atualizado ou null
     */
    async updateTemplate(id, updates) {
        try {
            const updateData = {};

            if (updates.name !== undefined) updateData.name = updates.name;
            if (updates.description !== undefined) updateData.description = updates.description;
            if (updates.category !== undefined) updateData.category = updates.category;
            if (updates.tags !== undefined) updateData.tags = updates.tags;
            if (updates.icon !== undefined) updateData.icon = updates.icon;
            if (updates.content !== undefined) updateData.content = updates.content;
            if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

            const { data, error } = await supabase
                .from('templates')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                console.error('TemplateService.updateTemplate error:', error.message);
                return null;
            }

            return data;
        } catch (e) {
            console.error('TemplateService.updateTemplate exception:', e);
            return null;
        }
    },

    /**
     * Deleta um template (apenas admin)
     * @param {string} id - UUID do template
     * @returns {Promise<boolean>}
     */
    async deleteTemplate(id) {
        try {
            const { error } = await supabase
                .from('templates')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('TemplateService.deleteTemplate error:', error.message);
                return false;
            }

            return true;
        } catch (e) {
            console.error('TemplateService.deleteTemplate exception:', e);
            return false;
        }
    },

    /**
     * Toggle ativo/inativo de um template
     * @param {string} id - UUID do template
     * @param {boolean} isActive - Novo estado
     * @returns {Promise<boolean>}
     */
    async toggleActive(id, isActive) {
        const result = await this.updateTemplate(id, { is_active: isActive });
        return result !== null;
    },

    /**
     * Obtém o template padrão (primeiro template ativo da categoria 'academic')
     * Para uso como fallback quando não há template no projeto
     * @returns {Promise<Object|null>}
     */
    async getDefaultTemplate() {
        try {
            const { data, error } = await supabase
                .from('templates')
                .select('*')
                .eq('is_active', true)
                .eq('category', 'academic')
                .order('name', { ascending: true })
                .limit(1)
                .single();

            if (error || !data) {
                // Fallback: qualquer template ativo
                const { data: fallback } = await supabase
                    .from('templates')
                    .select('*')
                    .eq('is_active', true)
                    .limit(1)
                    .single();

                return fallback || null;
            }

            return data;
        } catch (e) {
            console.error('TemplateService.getDefaultTemplate exception:', e);
            return null;
        }
    }
};

// =====================================================
// UserService - Gerenciamento de Usuários
// =====================================================
const UserService = {
    /**
     * Lista todos os usuários (apenas admin)
     * @param {Object} options - Opções de filtro
     * @param {string} options.search - Busca por email
     * @param {string} options.role - Filtrar por role
     * @returns {Promise<Array>}
     */
    async listUsers(options = {}) {
        try {
            let query = supabase
                .from('user_profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (options.role && options.role !== 'all') {
                query = query.eq('role', options.role);
            }

            const { data, error } = await query;

            if (error) {
                console.error('UserService.listUsers error:', error.message);
                return [];
            }

            // Filtro de busca client-side
            if (options.search) {
                const searchLower = options.search.toLowerCase();
                return data.filter(u =>
                    u.email && u.email.toLowerCase().includes(searchLower)
                );
            }

            return data;
        } catch (e) {
            console.error('UserService.listUsers exception:', e);
            return [];
        }
    },

    /**
     * Obtém um perfil de usuário por ID
     * @param {string} userId - UUID do usuário
     * @returns {Promise<Object|null>}
     */
    async getUser(userId) {
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('UserService.getUser error:', error.message);
                return null;
            }

            return data;
        } catch (e) {
            console.error('UserService.getUser exception:', e);
            return null;
        }
    },

    /**
     * Atualiza a role de um usuário (apenas admin)
     * @param {string} userId - UUID do usuário
     * @param {string} role - Nova role ('user' ou 'admin')
     * @returns {Promise<boolean>}
     */
    async updateRole(userId, role) {
        try {
            if (!['user', 'admin'].includes(role)) {
                console.error('UserService.updateRole: role inválida');
                return false;
            }

            const { error } = await supabase
                .from('user_profiles')
                .update({ role })
                .eq('id', userId);

            if (error) {
                console.error('UserService.updateRole error:', error.message);
                return false;
            }

            return true;
        } catch (e) {
            console.error('UserService.updateRole exception:', e);
            return false;
        }
    },

    /**
     * Ativa/desativa um usuário (soft delete)
     * @param {string} userId - UUID do usuário
     * @param {boolean} isActive - Novo estado
     * @returns {Promise<boolean>}
     */
    async setUserActive(userId, isActive) {
        try {
            const { error } = await supabase
                .from('user_profiles')
                .update({ is_active: isActive })
                .eq('id', userId);

            if (error) {
                console.error('UserService.setUserActive error:', error.message);
                return false;
            }

            return true;
        } catch (e) {
            console.error('UserService.setUserActive exception:', e);
            return false;
        }
    },

    /**
     * Conta projetos de um usuário
     * @param {string} userId - UUID do usuário
     * @returns {Promise<number>}
     */
    async countUserProjects(userId) {
        try {
            const { count, error } = await supabase
                .from('projects')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);

            if (error) {
                console.error('UserService.countUserProjects error:', error.message);
                return 0;
            }

            return count || 0;
        } catch (e) {
            console.error('UserService.countUserProjects exception:', e);
            return 0;
        }
    },

    /**
     * Lista projetos de um usuário (apenas admin)
     * @param {string} userId - UUID do usuário
     * @returns {Promise<Array>}
     */
    async listUserProjects(userId) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('id, name, last_modified')
                .eq('user_id', userId)
                .order('last_modified', { ascending: false });

            if (error) {
                console.error('UserService.listUserProjects error:', error.message);
                return [];
            }

            return data;
        } catch (e) {
            console.error('UserService.listUserProjects exception:', e);
            return [];
        }
    },

    /**
     * Estatísticas gerais do sistema (apenas admin)
     * @returns {Promise<Object>}
     */
    async getStats() {
        try {
            // Contagem de usuários
            const { count: totalUsers } = await supabase
                .from('user_profiles')
                .select('*', { count: 'exact', head: true });

            // Contagem de admins
            const { count: totalAdmins } = await supabase
                .from('user_profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'admin');

            // Contagem de projetos
            const { count: totalProjects } = await supabase
                .from('projects')
                .select('*', { count: 'exact', head: true });

            // Contagem de templates ativos
            const { count: totalTemplates } = await supabase
                .from('templates')
                .select('*', { count: 'exact', head: true })
                .eq('is_active', true);

            return {
                totalUsers: totalUsers || 0,
                totalAdmins: totalAdmins || 0,
                totalProjects: totalProjects || 0,
                totalTemplates: totalTemplates || 0
            };
        } catch (e) {
            console.error('UserService.getStats exception:', e);
            return {
                totalUsers: 0,
                totalAdmins: 0,
                totalProjects: 0,
                totalTemplates: 0
            };
        }
    }
};
