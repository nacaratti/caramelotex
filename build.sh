#!/bin/bash
# Build script for Vercel - generates config.js from environment variables

cat > js/config.js << EOF
const SUPABASE_CONFIG = {
    url: '${SUPABASE_URL}',
    anonKey: '${SUPABASE_ANON_KEY}'
};

// URL do servidor LaTeX (Railway/Docker)
// Se não definida, usa localhost para desenvolvimento local
const LATEX_API_URL = '${LATEX_API_URL}' || null;
EOF

echo "config.js generated successfully"
echo "LATEX_API_URL: ${LATEX_API_URL:-'not set (will use localhost)'}"
