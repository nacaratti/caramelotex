#!/bin/bash

set -o nounset # Exit on undeclared vars
set -o errexit # Exit on command error

echo 'Starting LaTeX-On-HTTP server (Railway)...'
echo 'Skipping PostgreSQL migrations (not needed for sync builds)'

# Start server in production mode
make start
