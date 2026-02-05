/**
 * templates.js - Biblioteca de Templates LaTeX
 */

// ========== TEMPLATES DATA ==========
const templates = [
    // ===== ACADEMICO =====
    {
        id: 'article-basic',
        name: 'Artigo Basico',
        description: 'Template simples para artigos academicos com estrutura padrao.',
        category: 'academic',
        tags: ['artigo', 'basico', 'academico'],
        icon: 'document',
        content: `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[portuguese]{babel}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{setspace}
\\usepackage{hyperref}

\\title{Titulo do Artigo}
\\author{Nome do Autor\\\\
\\small Instituicao\\\\
\\small \\texttt{email@exemplo.com}}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Resumo do artigo em um paragrafo. Descreva brevemente o objetivo, metodologia, resultados e conclusoes do trabalho.
\\end{abstract}

\\textbf{Palavras-chave:} palavra1, palavra2, palavra3.

\\section{Introducao}

Introducao ao tema do artigo. Contextualize o problema e apresente os objetivos do trabalho.

\\section{Revisao da Literatura}

Apresente os trabalhos relacionados e o estado da arte.

\\section{Metodologia}

Descreva a metodologia utilizada no trabalho.

\\section{Resultados}

Apresente os resultados obtidos.

\\subsection{Analise dos Dados}

Analise os dados coletados.

\\section{Conclusao}

Conclusoes do trabalho e sugestoes para trabalhos futuros.

\\bibliographystyle{plain}
% \\bibliography{referencias}

\\end{document}`
    },
    {
        id: 'ieee-conference',
        name: 'IEEE Conference',
        description: 'Template no formato IEEE para conferencias internacionais.',
        category: 'academic',
        tags: ['ieee', 'conferencia', 'internacional'],
        icon: 'academic',
        content: `\\documentclass[conference]{IEEEtran}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{cite}

\\begin{document}

\\title{Paper Title in IEEE Format}

\\author{
\\IEEEauthorblockN{First Author}
\\IEEEauthorblockA{\\textit{Department} \\\\
\\textit{University}\\\\
City, Country \\\\
email@example.com}
\\and
\\IEEEauthorblockN{Second Author}
\\IEEEauthorblockA{\\textit{Department} \\\\
\\textit{University}\\\\
City, Country \\\\
email@example.com}
}

\\maketitle

\\begin{abstract}
This document provides a template for IEEE conference papers. The abstract should be a brief summary of the paper's main contributions, typically 150-200 words.
\\end{abstract}

\\begin{IEEEkeywords}
keyword1, keyword2, keyword3, keyword4
\\end{IEEEkeywords}

\\section{Introduction}
The introduction should present the problem being addressed and provide context for the research.

\\section{Related Work}
Discuss previous research and how your work differs or builds upon it.

\\section{Methodology}
Describe your approach and methods.

\\section{Results}
Present your findings with supporting data, tables, and figures.

\\subsection{Experimental Setup}
Describe the experimental configuration.

\\subsection{Performance Analysis}
Analyze the results.

\\section{Conclusion}
Summarize the contributions and suggest future work.

\\section*{Acknowledgment}
The authors would like to thank...

\\bibliographystyle{IEEEtran}
% \\bibliography{references}

\\end{document}`
    },
    {
        id: 'abnt-article',
        name: 'Artigo ABNT',
        description: 'Artigo seguindo as normas da ABNT para trabalhos academicos no Brasil.',
        category: 'academic',
        tags: ['abnt', 'brasil', 'academico'],
        icon: 'document',
        content: `\\documentclass[12pt,a4paper,oneside]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazilian]{babel}
\\usepackage{indentfirst}
\\usepackage{graphicx}
\\usepackage{amsmath,amssymb}
\\usepackage[left=3cm,right=2cm,top=3cm,bottom=2cm]{geometry}
\\usepackage{setspace}
\\usepackage{hyperref}

% Configuracoes ABNT
\\setlength{\\parindent}{1.25cm}
\\onehalfspacing

\\begin{document}

% Capa
\\begin{center}
\\textbf{\\large TITULO DO ARTIGO EM CAIXA ALTA}

\\vspace{1cm}

Nome do Autor\\textsuperscript{1}

\\vspace{0.5cm}

\\textsuperscript{1}Instituicao, Cidade, Estado, Brasil. E-mail: autor@email.com

\\end{center}

\\vspace{1cm}

\\noindent\\textbf{RESUMO}

\\noindent
Texto do resumo contendo objetivo, metodologia, resultados e conclusoes. O resumo deve ter entre 150 e 500 palavras segundo as normas da ABNT NBR 6028.

\\vspace{0.5cm}
\\noindent\\textbf{Palavras-chave:} Palavra 1. Palavra 2. Palavra 3.

\\vspace{1cm}

\\noindent\\textbf{ABSTRACT}

\\noindent
Abstract text containing objective, methodology, results and conclusions.

\\vspace{0.5cm}
\\noindent\\textbf{Keywords:} Keyword 1. Keyword 2. Keyword 3.

\\section{INTRODUCAO}

Texto da introducao apresentando o tema, problema de pesquisa, objetivos e justificativa do trabalho.

\\section{REFERENCIAL TEORICO}

Apresentacao dos conceitos teoricos e revisao da literatura.

\\section{METODOLOGIA}

Descricao dos procedimentos metodologicos adotados na pesquisa.

\\section{RESULTADOS E DISCUSSAO}

Apresentacao e analise dos resultados obtidos.

\\section{CONSIDERACOES FINAIS}

Conclusoes do trabalho e sugestoes para pesquisas futuras.

\\section*{REFERENCIAS}

% Use o pacote abntex2cite para formatacao automatica
% Exemplo manual:
\\noindent SOBRENOME, Nome. \\textbf{Titulo da obra}. Cidade: Editora, Ano.

\\end{document}`
    },

    // ===== TESES =====
    {
        id: 'thesis-basic',
        name: 'Dissertacao/Tese',
        description: 'Estrutura completa para dissertacoes de mestrado e teses de doutorado.',
        category: 'thesis',
        tags: ['tese', 'dissertacao', 'mestrado', 'doutorado'],
        icon: 'book',
        content: `\\documentclass[12pt,a4paper,oneside]{book}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[portuguese]{babel}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage[left=3cm,right=2cm,top=3cm,bottom=2cm]{geometry}
\\usepackage{setspace}
\\usepackage{hyperref}
\\usepackage{fancyhdr}
\\usepackage{tocloft}

\\onehalfspacing

% Configuracao de cabecalho
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[R]{\\thepage}
\\renewcommand{\\headrulewidth}{0pt}

\\begin{document}

% ===== ELEMENTOS PRE-TEXTUAIS =====

% Capa
\\begin{titlepage}
\\begin{center}
\\textbf{\\large UNIVERSIDADE EXEMPLO}\\\\
\\textbf{PROGRAMA DE POS-GRADUACAO EM AREA}

\\vspace{4cm}

\\textbf{\\Large NOME DO AUTOR}

\\vspace{3cm}

\\textbf{\\LARGE TITULO DA DISSERTACAO OU TESE}

\\vfill

Cidade\\\\
Ano
\\end{center}
\\end{titlepage}

% Folha de Rosto
\\begin{titlepage}
\\begin{center}
\\textbf{\\Large NOME DO AUTOR}

\\vspace{3cm}

\\textbf{\\LARGE TITULO DA DISSERTACAO OU TESE}

\\vspace{2cm}

\\hfill
\\begin{minipage}{10cm}
Dissertacao/Tese apresentada ao Programa de Pos-Graduacao em Area da Universidade Exemplo, como requisito parcial para obtencao do titulo de Mestre/Doutor em Area.

\\vspace{1cm}

Orientador: Prof. Dr. Nome do Orientador
\\end{minipage}

\\vfill

Cidade\\\\
Ano
\\end{center}
\\end{titlepage}

% Dedicatoria (opcional)
\\newpage
\\thispagestyle{empty}
\\vspace*{\\fill}
\\begin{flushright}
\\textit{Dedicatoria opcional.}
\\end{flushright}

% Agradecimentos
\\chapter*{Agradecimentos}
\\addcontentsline{toc}{chapter}{Agradecimentos}
Agradecimentos aos que contribuiram para a realizacao deste trabalho.

% Resumo
\\chapter*{Resumo}
\\addcontentsline{toc}{chapter}{Resumo}
Texto do resumo em portugues.

\\textbf{Palavras-chave:} palavra1, palavra2, palavra3.

% Abstract
\\chapter*{Abstract}
\\addcontentsline{toc}{chapter}{Abstract}
Abstract text in English.

\\textbf{Keywords:} keyword1, keyword2, keyword3.

% Sumario
\\tableofcontents

% Lista de Figuras
\\listoffigures
\\addcontentsline{toc}{chapter}{Lista de Figuras}

% Lista de Tabelas
\\listoftables
\\addcontentsline{toc}{chapter}{Lista de Tabelas}

% ===== ELEMENTOS TEXTUAIS =====

\\chapter{Introducao}
\\pagenumbering{arabic}

Introducao ao tema da pesquisa.

\\section{Contextualizacao}
Contexto do problema.

\\section{Objetivos}
\\subsection{Objetivo Geral}
Objetivo geral da pesquisa.

\\subsection{Objetivos Especificos}
\\begin{itemize}
    \\item Objetivo especifico 1;
    \\item Objetivo especifico 2;
    \\item Objetivo especifico 3.
\\end{itemize}

\\section{Justificativa}
Justificativa do trabalho.

\\section{Estrutura do Trabalho}
Descricao da organizacao dos capitulos.

\\chapter{Revisao da Literatura}
Fundamentacao teorica e estado da arte.

\\chapter{Metodologia}
Descricao dos metodos e materiais utilizados.

\\chapter{Resultados e Discussao}
Apresentacao e analise dos resultados.

\\chapter{Conclusao}
Conclusoes e trabalhos futuros.

% ===== ELEMENTOS POS-TEXTUAIS =====

\\bibliographystyle{plain}
% \\bibliography{referencias}

\\appendix
\\chapter{Apendice A}
Material complementar elaborado pelo autor.

\\end{document}`
    },
    {
        id: 'tcc-template',
        name: 'TCC - Trabalho de Conclusao',
        description: 'Template para Trabalhos de Conclusao de Curso de graduacao.',
        category: 'thesis',
        tags: ['tcc', 'graduacao', 'monografia'],
        icon: 'book',
        content: `\\documentclass[12pt,a4paper]{report}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazilian]{babel}
\\usepackage{indentfirst}
\\usepackage{graphicx}
\\usepackage{amsmath}
\\usepackage[left=3cm,right=2cm,top=3cm,bottom=2cm]{geometry}
\\usepackage{setspace}
\\usepackage{hyperref}

\\onehalfspacing
\\setlength{\\parindent}{1.25cm}

\\begin{document}

% Capa
\\begin{titlepage}
\\begin{center}
\\textbf{\\large NOME DA INSTITUICAO}\\\\
\\textbf{CURSO DE GRADUACAO}

\\vspace{5cm}

\\textbf{\\Large NOME DO ALUNO}

\\vspace{3cm}

\\textbf{\\LARGE TITULO DO TRABALHO DE CONCLUSAO DE CURSO}

\\vfill

Cidade\\\\
Ano
\\end{center}
\\end{titlepage}

% Folha de Rosto
\\begin{titlepage}
\\begin{center}
\\textbf{\\Large NOME DO ALUNO}

\\vspace{4cm}

\\textbf{\\LARGE TITULO DO TRABALHO DE CONCLUSAO DE CURSO}

\\vspace{2cm}

\\hfill
\\begin{minipage}{10cm}
Trabalho de Conclusao de Curso apresentado ao Curso de Graduacao em Area da Instituicao, como requisito parcial para obtencao do grau de Bacharel/Licenciado em Area.

\\vspace{1cm}

Orientador: Prof. Nome do Orientador
\\end{minipage}

\\vfill

Cidade\\\\
Ano
\\end{center}
\\end{titlepage}

% Resumo
\\begin{abstract}
Resumo do trabalho em um unico paragrafo, contendo contexto, objetivo, metodologia, resultados e conclusao. Deve ter entre 150 e 500 palavras.

\\vspace{0.5cm}
\\noindent\\textbf{Palavras-chave:} Palavra 1. Palavra 2. Palavra 3.
\\end{abstract}

% Sumario
\\tableofcontents

% Capitulos
\\chapter{Introducao}

Apresentacao do tema, problema de pesquisa, objetivos e estrutura do trabalho.

\\section{Justificativa}
Importancia e relevancia do trabalho.

\\section{Objetivos}
\\subsection{Objetivo Geral}
Objetivo principal do trabalho.

\\subsection{Objetivos Especificos}
\\begin{enumerate}
    \\item Primeiro objetivo especifico;
    \\item Segundo objetivo especifico;
    \\item Terceiro objetivo especifico.
\\end{enumerate}

\\chapter{Fundamentacao Teorica}
Revisao bibliografica e conceitos fundamentais.

\\chapter{Metodologia}
Descricao dos procedimentos metodologicos.

\\chapter{Desenvolvimento}
Desenvolvimento do trabalho.

\\chapter{Resultados}
Apresentacao e discussao dos resultados.

\\chapter{Conclusao}
Conclusoes e sugestoes para trabalhos futuros.

% Referencias
\\bibliographystyle{plain}
% \\bibliography{referencias}

\\end{document}`
    },

    // ===== APRESENTACOES =====
    {
        id: 'beamer-basic',
        name: 'Apresentacao Beamer',
        description: 'Template basico para apresentacoes com Beamer.',
        category: 'presentation',
        tags: ['beamer', 'slides', 'apresentacao'],
        icon: 'presentation',
        content: `\\documentclass{beamer}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[portuguese]{babel}
\\usepackage{graphicx}
\\usepackage{amsmath}

% Tema do Beamer
\\usetheme{Madrid}
\\usecolortheme{default}

% Informacoes da apresentacao
\\title{Titulo da Apresentacao}
\\subtitle{Subtitulo Opcional}
\\author{Nome do Autor}
\\institute{Instituicao}
\\date{\\today}

\\begin{document}

% Slide de titulo
\\begin{frame}
\\titlepage
\\end{frame}

% Sumario
\\begin{frame}{Sumario}
\\tableofcontents
\\end{frame}

% ===== SECAO 1 =====
\\section{Introducao}

\\begin{frame}{Introducao}
\\begin{itemize}
    \\item Primeiro ponto importante
    \\item Segundo ponto importante
    \\item Terceiro ponto importante
\\end{itemize}
\\end{frame}

\\begin{frame}{Motivacao}
\\begin{block}{Problema}
Descricao do problema a ser abordado.
\\end{block}

\\begin{block}{Solucao Proposta}
Breve descricao da solucao.
\\end{block}
\\end{frame}

% ===== SECAO 2 =====
\\section{Metodologia}

\\begin{frame}{Metodologia}
\\begin{enumerate}
    \\item Etapa 1: Descricao
    \\item Etapa 2: Descricao
    \\item Etapa 3: Descricao
\\end{enumerate}
\\end{frame}

\\begin{frame}{Formulas Matematicas}
A equacao de Einstein:
\\begin{equation}
E = mc^2
\\end{equation}

Integral definida:
\\begin{equation}
\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
\\end{equation}
\\end{frame}

% ===== SECAO 3 =====
\\section{Resultados}

\\begin{frame}{Resultados}
\\begin{columns}
\\column{0.5\\textwidth}
\\textbf{Vantagens:}
\\begin{itemize}
    \\item Vantagem 1
    \\item Vantagem 2
\\end{itemize}

\\column{0.5\\textwidth}
\\textbf{Limitacoes:}
\\begin{itemize}
    \\item Limitacao 1
    \\item Limitacao 2
\\end{itemize}
\\end{columns}
\\end{frame}

% ===== SECAO 4 =====
\\section{Conclusao}

\\begin{frame}{Conclusao}
\\begin{itemize}
    \\item Resumo das contribuicoes
    \\item Trabalhos futuros
    \\item Consideracoes finais
\\end{itemize}

\\vspace{1cm}
\\centering
\\textbf{Obrigado!}

\\vspace{0.5cm}
\\small{email@exemplo.com}
\\end{frame}

% Slide de referencias
\\begin{frame}{Referencias}
\\begin{thebibliography}{9}
\\bibitem{ref1} Autor, \\textit{Titulo do Livro}, Editora, Ano.
\\bibitem{ref2} Autor, \\textit{Titulo do Artigo}, Journal, Ano.
\\end{thebibliography}
\\end{frame}

\\end{document}`
    },
    {
        id: 'beamer-modern',
        name: 'Beamer Moderno (Metropolis)',
        description: 'Apresentacao com tema moderno e minimalista Metropolis.',
        category: 'presentation',
        tags: ['beamer', 'moderno', 'metropolis'],
        icon: 'presentation',
        content: `\\documentclass{beamer}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{graphicx}
\\usepackage{amsmath}
\\usepackage{booktabs}

% Tema Metropolis (moderno e minimalista)
% Nota: Requer o pacote metropolis instalado
\\usetheme{metropolis}

% Cores personalizadas
\\definecolor{mDarkTeal}{HTML}{23373b}
\\definecolor{mLightBrown}{HTML}{EB811B}

\\title{Titulo da Apresentacao}
\\subtitle{Uma Abordagem Moderna}
\\author{Nome do Autor}
\\institute{Universidade / Empresa}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{frame}{Agenda}
\\setbeamertemplate{section in toc}[sections numbered]
\\tableofcontents[hideallsubsections]
\\end{frame}

\\section{Introducao}

\\begin{frame}{Contexto}
\\begin{itemize}[<+->]
    \\item Ponto revelado gradualmente
    \\item Segundo ponto
    \\item Terceiro ponto
\\end{itemize}
\\end{frame}

\\begin{frame}{Objetivos}
\\begin{alertblock}{Objetivo Principal}
Descrever o objetivo principal da pesquisa ou projeto.
\\end{alertblock}

\\begin{exampleblock}{Objetivos Especificos}
\\begin{enumerate}
    \\item Objetivo 1
    \\item Objetivo 2
    \\item Objetivo 3
\\end{enumerate}
\\end{exampleblock}
\\end{frame}

\\section{Desenvolvimento}

\\begin{frame}{Metodologia}
\\begin{columns}[T]
\\begin{column}{0.48\\textwidth}
\\textbf{Fase 1}
\\begin{itemize}
    \\item Coleta de dados
    \\item Analise inicial
\\end{itemize}
\\end{column}
\\begin{column}{0.48\\textwidth}
\\textbf{Fase 2}
\\begin{itemize}
    \\item Implementacao
    \\item Validacao
\\end{itemize}
\\end{column}
\\end{columns}
\\end{frame}

\\begin{frame}{Tabela de Resultados}
\\begin{table}
\\centering
\\begin{tabular}{@{}lcc@{}}
\\toprule
\\textbf{Metodo} & \\textbf{Precisao} & \\textbf{Tempo (s)} \\\\
\\midrule
Metodo A & 95.2\\% & 1.23 \\\\
Metodo B & 93.8\\% & 0.89 \\\\
Proposto & \\textbf{97.1\\%} & 1.05 \\\\
\\bottomrule
\\end{tabular}
\\caption{Comparacao de metodos}
\\end{table}
\\end{frame}

\\section{Conclusao}

\\begin{frame}{Conclusoes}
\\begin{itemize}
    \\item Contribuicao principal do trabalho
    \\item Resultados alcancados
    \\item Direcoes futuras
\\end{itemize}

\\vspace{1cm}
\\begin{center}
{\\Large Perguntas?}

\\vspace{0.5cm}
\\texttt{email@exemplo.com}
\\end{center}
\\end{frame}

\\begin{frame}[standout]
Obrigado!
\\end{frame}

\\end{document}`
    },

    // ===== PROFISSIONAL =====
    {
        id: 'cv-modern',
        name: 'Curriculo Moderno',
        description: 'Template de curriculo profissional com design moderno.',
        category: 'professional',
        tags: ['curriculo', 'cv', 'profissional'],
        icon: 'user',
        content: `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[portuguese]{babel}
\\usepackage{geometry}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\usepackage{fontawesome5}

\\geometry{left=1.5cm, right=1.5cm, top=1.5cm, bottom=1.5cm}

% Cores
\\definecolor{primary}{HTML}{2C3E50}
\\definecolor{secondary}{HTML}{7F8C8D}
\\definecolor{accent}{HTML}{3498DB}

% Formatacao de secoes
\\titleformat{\\section}{\\Large\\bfseries\\color{primary}}{}{0em}{}[\\titlerule]
\\titlespacing*{\\section}{0pt}{12pt}{8pt}

% Remover numeracao de pagina
\\pagestyle{empty}

\\begin{document}

% Cabecalho
\\begin{center}
{\\Huge\\bfseries\\color{primary} Nome Completo}

\\vspace{0.3cm}

{\\large\\color{secondary} Cargo / Titulo Profissional}

\\vspace{0.3cm}

\\faIcon{map-marker-alt} Cidade, Estado \\quad
\\faIcon{phone} (00) 00000-0000 \\quad
\\faIcon{envelope} \\href{mailto:email@exemplo.com}{email@exemplo.com}

\\faIcon{linkedin} \\href{https://linkedin.com/in/usuario}{linkedin.com/in/usuario} \\quad
\\faIcon{github} \\href{https://github.com/usuario}{github.com/usuario}
\\end{center}

\\vspace{0.5cm}

% Resumo
\\section{Resumo Profissional}
Profissional com X anos de experiencia em [area]. Especializado em [habilidades principais]. Busco oportunidades para [objetivo profissional].

% Experiencia
\\section{Experiencia Profissional}

\\textbf{\\large Cargo Atual} \\hfill \\textit{Jan 2022 -- Presente}\\\\
\\textit{Nome da Empresa} -- Cidade, Estado
\\begin{itemize}[leftmargin=*, nosep]
    \\item Realizacao ou responsabilidade principal
    \\item Projeto importante com resultados mensuráveis
    \\item Outra conquista relevante
\\end{itemize}

\\vspace{0.3cm}

\\textbf{\\large Cargo Anterior} \\hfill \\textit{Jun 2019 -- Dez 2021}\\\\
\\textit{Nome da Empresa} -- Cidade, Estado
\\begin{itemize}[leftmargin=*, nosep]
    \\item Descricao de atividade ou conquista
    \\item Resultado alcancado
\\end{itemize}

% Educacao
\\section{Formacao Academica}

\\textbf{\\large Mestrado/Bacharelado em Area} \\hfill \\textit{2015 -- 2019}\\\\
\\textit{Nome da Universidade} -- Cidade, Estado

\\vspace{0.2cm}

\\textbf{\\large Curso Complementar} \\hfill \\textit{2020}\\\\
\\textit{Instituicao} -- Online/Presencial

% Habilidades
\\section{Habilidades}

\\textbf{Tecnicas:} Habilidade 1, Habilidade 2, Habilidade 3, Habilidade 4

\\textbf{Ferramentas:} Ferramenta 1, Ferramenta 2, Ferramenta 3

\\textbf{Idiomas:} Portugues (Nativo), Ingles (Avancado), Espanhol (Intermediario)

% Certificacoes
\\section{Certificacoes}
\\begin{itemize}[leftmargin=*, nosep]
    \\item Certificacao 1 -- Instituicao (Ano)
    \\item Certificacao 2 -- Instituicao (Ano)
\\end{itemize}

\\end{document}`
    },
    {
        id: 'cover-letter',
        name: 'Carta de Apresentacao',
        description: 'Modelo de carta de apresentacao para candidatura a vagas.',
        category: 'professional',
        tags: ['carta', 'apresentacao', 'emprego'],
        icon: 'mail',
        content: `\\documentclass[11pt,a4paper]{letter}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[portuguese]{babel}
\\usepackage{geometry}
\\usepackage{hyperref}

\\geometry{left=2.5cm, right=2.5cm, top=2.5cm, bottom=2.5cm}

\\signature{Seu Nome Completo}
\\address{Seu Endereco Completo\\\\Cidade, Estado -- CEP\\\\Telefone: (00) 00000-0000\\\\Email: seu.email@exemplo.com}

\\begin{document}

\\begin{letter}{Nome da Empresa\\\\Departamento de Recursos Humanos\\\\Endereco da Empresa\\\\Cidade, Estado -- CEP}

\\opening{Prezado(a) Recrutador(a),}

Escrevo para expressar meu interesse na vaga de [Nome do Cargo] anunciada em [onde viu a vaga]. Com [X anos] de experiencia em [area], acredito que minhas habilidades e qualificacoes estao alinhadas com os requisitos da posicao.

Em minha experiencia mais recente na [Empresa Anterior], fui responsavel por [principais responsabilidades]. Durante esse periodo, alcancei [conquistas mensuráveis, como aumentar vendas em X\\%, reduzir custos em Y\\%, implementar projeto Z].

Sou particularmente atraido por esta oportunidade na [Nome da Empresa] devido a [razoes especificas -- valores da empresa, projetos interessantes, cultura organizacional]. Minha experiencia em [habilidades relevantes] me preparou para contribuir significativamente para [objetivo ou desafio da equipe].

Algumas das minhas principais qualificacoes incluem:
\\begin{itemize}
    \\item Habilidade ou experiencia relevante 1
    \\item Habilidade ou experiencia relevante 2
    \\item Habilidade ou experiencia relevante 3
\\end{itemize}

Estou entusiasmado com a possibilidade de contribuir para o sucesso da [Nome da Empresa] e gostaria de discutir como minhas habilidades podem beneficiar sua equipe. Estou disponivel para uma entrevista conforme sua conveniencia.

Agradeco a atencao dispensada e aguardo um retorno.

\\closing{Atenciosamente,}

\\end{letter}

\\end{document}`
    },
    {
        id: 'report-technical',
        name: 'Relatorio Tecnico',
        description: 'Template para relatorios tecnicos e documentacao.',
        category: 'professional',
        tags: ['relatorio', 'tecnico', 'documentacao'],
        icon: 'document',
        content: `\\documentclass[12pt,a4paper]{report}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[portuguese]{babel}
\\usepackage{graphicx}
\\usepackage{amsmath}
\\usepackage{geometry}
\\usepackage{fancyhdr}
\\usepackage{hyperref}
\\usepackage{listings}
\\usepackage{xcolor}
\\usepackage{booktabs}

\\geometry{left=2.5cm, right=2.5cm, top=3cm, bottom=2.5cm}

% Configuracao de cabecalho/rodape
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\leftmark}
\\fancyhead[R]{Nome da Empresa}
\\fancyfoot[C]{\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.4pt}

% Configuracao de codigo
\\lstset{
    basicstyle=\\ttfamily\\small,
    backgroundcolor=\\color{gray!10},
    frame=single,
    breaklines=true,
    numbers=left,
    numberstyle=\\tiny\\color{gray},
}

\\begin{document}

% Capa
\\begin{titlepage}
\\begin{center}
\\vspace*{1cm}

\\includegraphics[width=0.3\\textwidth]{logo}\\\\[1cm]

\\textbf{\\Large NOME DA EMPRESA / INSTITUICAO}

\\vspace{2cm}

\\textbf{\\LARGE RELATORIO TECNICO}

\\vspace{1cm}

\\textbf{\\huge Titulo do Relatorio}

\\vspace{2cm}

\\textbf{Versao 1.0}

\\vfill

\\begin{tabular}{ll}
\\textbf{Autor:} & Nome do Autor \\\\
\\textbf{Revisor:} & Nome do Revisor \\\\
\\textbf{Data:} & \\today \\\\
\\textbf{Documento:} & REL-2024-001 \\\\
\\end{tabular}

\\end{center}
\\end{titlepage}

% Controle de versoes
\\chapter*{Historico de Revisoes}
\\begin{tabular}{llll}
\\toprule
\\textbf{Versao} & \\textbf{Data} & \\textbf{Autor} & \\textbf{Descricao} \\\\
\\midrule
1.0 & \\today & Nome & Versao inicial \\\\
\\bottomrule
\\end{tabular}

% Sumario
\\tableofcontents
\\listoffigures
\\listoftables

% Conteudo
\\chapter{Introducao}

\\section{Objetivo}
Descrever o objetivo deste relatorio tecnico.

\\section{Escopo}
Definir o escopo e as limitacoes do documento.

\\section{Publico-Alvo}
Identificar o publico para quem este relatorio e destinado.

\\section{Referencias}
Listar documentos relacionados e referencias utilizadas.

\\chapter{Descricao do Sistema}

\\section{Visao Geral}
Apresentar uma visao geral do sistema ou projeto.

\\section{Arquitetura}
Descrever a arquitetura do sistema.

\\begin{figure}[h]
\\centering
% \\includegraphics[width=0.8\\textwidth]{arquitetura}
\\fbox{\\parbox{0.8\\textwidth}{\\centering [Diagrama de Arquitetura]}}
\\caption{Arquitetura do Sistema}
\\label{fig:arquitetura}
\\end{figure}

\\section{Componentes}
Detalhar os principais componentes.

\\chapter{Especificacoes Tecnicas}

\\section{Requisitos de Hardware}
\\begin{itemize}
    \\item Processador: Minimo X GHz
    \\item Memoria: Minimo X GB RAM
    \\item Armazenamento: Minimo X GB
\\end{itemize}

\\section{Requisitos de Software}
\\begin{itemize}
    \\item Sistema Operacional: Windows/Linux/macOS
    \\item Dependencias: Lista de dependencias
\\end{itemize}

\\section{Configuracao}
Exemplo de configuracao:

\\begin{lstlisting}[language=Python, caption=Exemplo de codigo]
def configurar_sistema():
    config = {
        'parametro1': 'valor1',
        'parametro2': 'valor2'
    }
    return config
\\end{lstlisting}

\\chapter{Resultados e Analise}

\\section{Metricas}
\\begin{table}[h]
\\centering
\\begin{tabular}{lcc}
\\toprule
\\textbf{Metrica} & \\textbf{Valor} & \\textbf{Meta} \\\\
\\midrule
Desempenho & 95\\% & 90\\% \\\\
Disponibilidade & 99.5\\% & 99\\% \\\\
Tempo de Resposta & 200ms & 500ms \\\\
\\bottomrule
\\end{tabular}
\\caption{Metricas do Sistema}
\\label{tab:metricas}
\\end{table}

\\section{Analise}
Analise dos resultados obtidos.

\\chapter{Conclusao}
Conclusoes e recomendacoes.

\\appendix
\\chapter{Anexos}
Material complementar.

\\end{document}`
    },
    {
        id: 'invoice',
        name: 'Fatura / Invoice',
        description: 'Template para faturas e notas de servico.',
        category: 'professional',
        tags: ['fatura', 'invoice', 'financeiro'],
        icon: 'currency',
        content: `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[portuguese]{babel}
\\usepackage{geometry}
\\usepackage{array}
\\usepackage{booktabs}
\\usepackage{xcolor}
\\usepackage{graphicx}
\\usepackage{fancyhdr}

\\geometry{left=2cm, right=2cm, top=2cm, bottom=2cm}
\\pagestyle{empty}

\\definecolor{headercolor}{HTML}{2C3E50}
\\definecolor{accentcolor}{HTML}{3498DB}

\\begin{document}

% Cabecalho
\\begin{minipage}[t]{0.5\\textwidth}
\\textbf{\\Large\\color{headercolor} SUA EMPRESA LTDA}\\\\[0.3cm]
Rua Exemplo, 123\\\\
Bairro - Cidade/UF\\\\
CEP: 00000-000\\\\
CNPJ: 00.000.000/0001-00\\\\
Tel: (00) 0000-0000\\\\
contato@suaempresa.com
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.4\\textwidth}
\\raggedleft
{\\Huge\\color{accentcolor}\\textbf{FATURA}}\\\\[0.5cm]
\\begin{tabular}{rl}
\\textbf{Numero:} & 2024-001 \\\\
\\textbf{Data:} & \\today \\\\
\\textbf{Vencimento:} & 15/02/2024 \\\\
\\end{tabular}
\\end{minipage}

\\vspace{1cm}
\\noindent\\rule{\\textwidth}{0.4pt}
\\vspace{0.5cm}

% Dados do Cliente
\\noindent\\textbf{\\large\\color{headercolor} FATURAR PARA:}\\\\[0.3cm]
\\begin{tabular}{@{}ll}
\\textbf{Cliente:} & Nome do Cliente \\\\
\\textbf{Endereco:} & Rua do Cliente, 456 - Cidade/UF \\\\
\\textbf{CNPJ/CPF:} & 00.000.000/0001-00 \\\\
\\textbf{Email:} & cliente@email.com \\\\
\\end{tabular}

\\vspace{1cm}

% Tabela de Itens
\\begin{center}
\\begin{tabular}{|p{8cm}|c|r|r|}
\\hline
\\rowcolor{headercolor}
\\textcolor{white}{\\textbf{Descricao}} &
\\textcolor{white}{\\textbf{Qtd}} &
\\textcolor{white}{\\textbf{Valor Unit.}} &
\\textcolor{white}{\\textbf{Total}} \\\\
\\hline
Servico de Consultoria - 40 horas & 40 & R\\$ 150,00 & R\\$ 6.000,00 \\\\
\\hline
Desenvolvimento de Sistema Web & 1 & R\\$ 8.000,00 & R\\$ 8.000,00 \\\\
\\hline
Suporte Tecnico Mensal & 1 & R\\$ 500,00 & R\\$ 500,00 \\\\
\\hline
Hospedagem Cloud (anual) & 1 & R\\$ 1.200,00 & R\\$ 1.200,00 \\\\
\\hline
\\end{tabular}
\\end{center}

\\vspace{0.5cm}

% Totais
\\begin{flushright}
\\begin{tabular}{|l|r|}
\\hline
Subtotal & R\\$ 15.700,00 \\\\
\\hline
Desconto (5\\%) & -R\\$ 785,00 \\\\
\\hline
\\rowcolor{accentcolor!20}
\\textbf{TOTAL} & \\textbf{R\\$ 14.915,00} \\\\
\\hline
\\end{tabular}
\\end{flushright}

\\vspace{1cm}

% Informacoes de Pagamento
\\noindent\\textbf{\\large\\color{headercolor} INFORMACOES DE PAGAMENTO:}\\\\[0.3cm]
\\begin{tabular}{@{}ll}
\\textbf{Banco:} & Banco Exemplo \\\\
\\textbf{Agencia:} & 0001 \\\\
\\textbf{Conta Corrente:} & 12345-6 \\\\
\\textbf{PIX (CNPJ):} & 00.000.000/0001-00 \\\\
\\end{tabular}

\\vspace{1cm}

% Observacoes
\\noindent\\textbf{\\large\\color{headercolor} OBSERVACOES:}\\\\[0.3cm]
\\begin{itemize}
    \\item Pagamento via boleto, transferencia ou PIX.
    \\item Juros de 2\\% ao mes para pagamentos em atraso.
    \\item Duvidas: contato@suaempresa.com
\\end{itemize}

\\vfill

\\begin{center}
\\textit{\\small Agradecemos a preferencia!}
\\end{center}

\\end{document}`
    }
];

// ========== RENDER FUNCTIONS ==========

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getIconSvg(iconType) {
    const icons = {
        document: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>',
        academic: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"></path>',
        book: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>',
        presentation: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>',
        user: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>',
        mail: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>',
        currency: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
    };
    return icons[iconType] || icons.document;
}

function getCategoryLabel(category) {
    const labels = {
        academic: 'Academico',
        thesis: 'Teses',
        presentation: 'Apresentacoes',
        professional: 'Profissional'
    };
    return labels[category] || category;
}

function getCategoryColor(category) {
    const colors = {
        academic: 'bg-blue-500',
        thesis: 'bg-purple-500',
        presentation: 'bg-orange-500',
        professional: 'bg-green-500'
    };
    return colors[category] || 'bg-gray-500';
}

function renderTemplates(filteredTemplates) {
    const grid = document.getElementById('templatesGrid');
    const emptyState = document.getElementById('emptyState');

    grid.innerHTML = '';

    if (filteredTemplates.length === 0) {
        grid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    grid.classList.remove('hidden');
    emptyState.classList.add('hidden');

    filteredTemplates.forEach(template => {
        const card = document.createElement('div');
        card.className = 'template-card bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-latex-green cursor-pointer';
        card.dataset.templateId = template.id;

        card.innerHTML = `
            <div class="flex items-start justify-between mb-4">
                <div class="p-3 bg-latex-gray rounded-lg">
                    <svg class="w-8 h-8 text-latex-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        ${getIconSvg(template.icon)}
                    </svg>
                </div>
                <span class="text-xs px-2 py-1 rounded ${getCategoryColor(template.category)} text-white">
                    ${escapeHtml(getCategoryLabel(template.category))}
                </span>
            </div>
            <h3 class="text-lg font-bold text-gray-200 mb-2">${escapeHtml(template.name)}</h3>
            <p class="text-sm text-gray-400 mb-4 line-clamp-2">${escapeHtml(template.description)}</p>
            <div class="flex flex-wrap gap-1 mb-4">
                ${template.tags.slice(0, 3).map(tag =>
                    `<span class="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded">${escapeHtml(tag)}</span>`
                ).join('')}
            </div>
            <div class="flex gap-2">
                <button class="preview-btn flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm font-medium transition-colors">
                    Visualizar
                </button>
                <button class="use-btn flex-1 bg-latex-green hover:bg-teal-600 text-white py-2 rounded text-sm font-medium transition-colors">
                    Usar
                </button>
            </div>
        `;

        // Event listeners
        card.querySelector('.preview-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showPreview(template);
        });

        card.querySelector('.use-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            useTemplate(template);
        });

        card.addEventListener('click', () => showPreview(template));

        grid.appendChild(card);
    });
}

// ========== MODAL FUNCTIONS ==========

let currentPreviewTemplate = null;

function showPreview(template) {
    currentPreviewTemplate = template;

    document.getElementById('modalTitle').textContent = template.name;
    document.getElementById('modalCode').textContent = template.content;
    document.getElementById('previewModal').classList.remove('hidden');
}

function hidePreview() {
    document.getElementById('previewModal').classList.add('hidden');
    currentPreviewTemplate = null;
}

async function useTemplate(template) {
    const name = prompt('Nome do novo projeto:', template.name);
    if (!name) return;

    try {
        // Create new project with template content
        const id = await StorageService.createProject(name);

        // Save template content as main.tex
        const files = {
            'main.tex': {
                content: template.content,
                type: 'main'
            }
        };

        await StorageService.saveProject(id, name, files, 'main.tex');

        // Set as current project and redirect to editor
        StorageService.setCurrentProjectId(id);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Erro ao criar projeto:', error);
        alert('Erro ao criar projeto. Tente novamente.');
    }
}

function copyCode() {
    if (!currentPreviewTemplate) return;

    navigator.clipboard.writeText(currentPreviewTemplate.content).then(() => {
        const btn = document.getElementById('copyCodeBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Copiado!';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    });
}

// ========== FILTER FUNCTIONS ==========

let currentCategory = 'all';
let searchQuery = '';

function filterTemplates() {
    let filtered = templates;

    // Filter by category
    if (currentCategory !== 'all') {
        filtered = filtered.filter(t => t.category === currentCategory);
    }

    // Filter by search query
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(t =>
            t.name.toLowerCase().includes(query) ||
            t.description.toLowerCase().includes(query) ||
            t.tags.some(tag => tag.toLowerCase().includes(query))
        );
    }

    renderTemplates(filtered);
}

// ========== INITIALIZATION ==========

document.addEventListener('DOMContentLoaded', async () => {
    // Auth guard
    const session = await AuthService.requireAuth();
    if (!session) return;

    // Render initial templates
    renderTemplates(templates);

    // Category buttons
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            filterTemplates();
        });
    });

    // Search input
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchQuery = e.target.value;
        filterTemplates();
    });

    // Modal events
    document.getElementById('closeModal').addEventListener('click', hidePreview);
    document.getElementById('previewModal').addEventListener('click', (e) => {
        if (e.target.id === 'previewModal') hidePreview();
    });
    document.getElementById('copyCodeBtn').addEventListener('click', copyCode);
    document.getElementById('useTemplateBtn').addEventListener('click', () => {
        if (currentPreviewTemplate) {
            hidePreview();
            useTemplate(currentPreviewTemplate);
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hidePreview();
    });
});
