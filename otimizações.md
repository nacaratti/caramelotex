✅O que está funcionando bem:

  - Interface moderna com dark mode
  - Editor LaTeX com syntax highlighting
  - Compilação via API + visualização PDF
  - Sistema de projetos com Supabase
  - Auto-save e delta save (salva apenas mudanças)
  - Upload de múltiplos arquivos
  - Detecção automática de erros no código

  ---
  🚨 Problemas Críticos a Resolver
  ┌────────────┬─────────────────────────────────────────┬────────────────┐
  │ Prioridade │                Problema                 │    Impacto     │
  ├────────────┼─────────────────────────────────────────┼────────────────┤
  │ P0         │ Credenciais Supabase expostas no código │ Segurança      │
  ├────────────┼─────────────────────────────────────────┼────────────────┤
  │ P0         │ BibTeX não funciona na API pública      │ Funcionalidade │
  ├────────────┼─────────────────────────────────────────┼────────────────┤
  │ P0         │ Sem limite de tamanho de arquivos       │ DoS/Custos     │
  ├────────────┼─────────────────────────────────────────┼────────────────┤
  │ P1         │ Conflito entre abas do navegador        │ Perda de dados │
  ├────────────┼─────────────────────────────────────────┼────────────────┤
  │ P1         │ Memory leak com arquivos grandes        │ Performance    │
  └────────────┴─────────────────────────────────────────┴────────────────┘
  ---
  📋 Plano de Próximos Passos

  Fase 1: Correções Urgentes (1-2 semanas)

  1. ~~Resolver problema do BibTeX~~ → Usar thebibliography ou servidor local
  2. Mover credenciais para variáveis de ambiente
  3. Implementar validação de tamanho de arquivo (máx 10MB)
  4. Configurar servidor Docker local corretamente
  5. Adicionar sincronização entre abas

  Fase 2: Melhorias Core (2-4 semanas)

  1. Modularizar app.js (1580 linhas → 5-6 módulos)
  2. Adicionar templates predefinidos (artigo, tese, IEEE, etc.)
  3. Implementar histórico de versões
  4. Melhorar parser de erros LaTeX
  5. Adicionar atalhos de teclado customizáveis

  Fase 3: Features Avançadas (4-6 semanas)

  1. Autocomplete LaTeX + snippets
  2. Colaboração em tempo real (WebSocket)
  3. Integração com GitHub
  4. Modo offline com Service Workers
  5. Design responsivo para mobile