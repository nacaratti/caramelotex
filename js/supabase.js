/**
 * supabase.js - Supabase client initialization + AuthService
 * Depends on: config.js (loaded before this file)
 */

var supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

const AuthService = {
    /**
     * Returns the current session or null.
     */
    async getSession() {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
            console.error('AuthService.getSession error:', error.message);
            return null;
        }
        return session;
    },

    /**
     * Returns the current user id or null.
     */
    async getUserId() {
        const session = await this.getSession();
        return session?.user?.id ?? null;
    },

    /**
     * Sign in with email and password.
     * Returns { session, error }.
     */
    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        return { session: data?.session ?? null, error };
    },

    /**
     * Sign up with email and password.
     * Returns { session, user, error }.
     */
    async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        return { session: data?.session ?? null, user: data?.user ?? null, error };
    },

    /**
     * Sign out the current user.
     */
    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('AuthService.signOut error:', error.message);
        localStorage.removeItem('current_project_id');
        window.location.href = 'login.html';
    },

    /**
     * Redirect to login.html if there is no active session.
     * Returns the session if authenticated.
     */
    async requireAuth() {
        const session = await this.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return null;
        }
        return session;
    },

    /**
     * Verifica se o usuário atual é admin.
     * @returns {Promise<boolean>}
     */
    async isAdmin() {
        try {
            const { data, error } = await supabase.rpc('is_admin');
            if (error) {
                console.error('AuthService.isAdmin error:', error.message);
                return false;
            }
            return data === true;
        } catch (e) {
            console.error('AuthService.isAdmin exception:', e);
            return false;
        }
    },

    /**
     * Obtém o perfil do usuário atual (incluindo role).
     * @returns {Promise<Object|null>}
     */
    async getProfile() {
        try {
            const { data, error } = await supabase.rpc('get_my_profile');
            if (error) {
                console.error('AuthService.getProfile error:', error.message);
                return null;
            }
            return data?.[0] ?? null;
        } catch (e) {
            console.error('AuthService.getProfile exception:', e);
            return null;
        }
    }
};
