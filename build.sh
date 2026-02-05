#!/bin/bash
# Build script for Vercel - generates config.js from environment variables

cat > js/config.js << EOF
const SUPABASE_CONFIG = {
    url: '${SUPABASE_URL}',
    anonKey: '${SUPABASE_ANON_KEY}'
};
EOF

echo "config.js generated successfully"
