# LaTeX-On-HTTP Docker container for Railway deployment.
# Simplified version without PostgreSQL dependencies.

FROM yoant/latexonhttp-python:debian
LABEL maintainer="Caramelotex"

# Set locales.
ENV LC_ALL C.UTF-8
ENV LANG C.UTF-8

# Create app directory.
RUN mkdir -p /app/latex-on-http
WORKDIR /app/latex-on-http/

# Copy application source code.
COPY app.py Makefile pyproject.toml poetry.lock /app/latex-on-http/
COPY ./latexonhttp/ /app/latex-on-http/latexonhttp/

# Install app dependencies.
RUN make install

# Copy entrypoint
COPY ./tools/entrypoint-railway.sh ./tools/

EXPOSE 8080

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["/bin/bash", "tools/entrypoint-railway.sh"]
