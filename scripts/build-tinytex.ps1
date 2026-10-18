<#
.SYNOPSIS
    Monta o TinyTeX que vai embutido no instalador do CarameloTeX.

.DESCRIPTION
    Baixa o TinyTeX-1 (Windows) numa versão fixa, instala os pacotes usados
    pelos templates e pelos documentos mais comuns e gera
    src-tauri/resources/tinytex.zip (com a pasta TinyTeX/ no topo), que o app
    extrai para a pasta de dados do usuário na primeira execução.

    Precisa de internet. Rode na raiz do repositório:
        powershell -ExecutionPolicy Bypass -File scripts/build-tinytex.ps1

.PARAMETER Version
    Versão do TinyTeX (tag de https://github.com/rstudio/tinytex-releases).

.PARAMETER Reuse
    Reaproveita o TinyTeX já extraído em WorkDir (pula o download), útil
    para refazer só a instalação de pacotes e o zip.
#>
param(
    [string]$Version = '2026.10',
    [string]$WorkDir = (Join-Path $env:TEMP 'caramelotex-tinytex'),
    [string]$OutFile = (Join-Path $PSScriptRoot '..\src-tauri\resources\tinytex.zip'),
    [switch]$Reuse
)

$ErrorActionPreference = 'Stop'

# Pacotes do TeX Live além dos que já vêm no TinyTeX-1.
# Mantenha em sincronia com os templates (src/templates/templates.json).
$Packages = @(
    # Ferramentas
    'latexmk', 'biber', 'biblatex', 'natbib', 'cite', 'epstopdf', 'epstopdf-pkg',
    # Idioma e fontes
    'babel-portuges', 'hyphen-portuguese', 'babel-english', 'csquotes', 'cm-super', 'lm', 'lm-math',
    'fontspec', 'unicode-math', 'fontawesome5', 'microtype',
    # Classes
    'ieeetran', 'beamer', 'beamertheme-metropolis', 'pgfopts', 'abntex2', 'biblatex-abnt', 'moderncv', 'standalone',
    # Layout e estrutura
    # ('tools' traz indentfirst, tabularx, array, longtable...)
    'tools', 'geometry', 'setspace', 'titlesec', 'tocloft', 'fancyhdr', 'enumitem', 'appendix', 'lipsum',
    'caption', 'float', 'wrapfig', 'pdfpages', 'pdflscape', 'multirow', 'colortbl', 'booktabs', 'makecell',
    'xcolor', 'listings', 'fancyvrb', 'tcolorbox', 'environ', 'trimspaces', 'hyperref', 'cleveref', 'xurl', 'url',
    # Matemática e ciências
    'amsmath', 'amscls', 'mathtools', 'physics', 'siunitx', 'pgf', 'pgfplots', 'tikz-cd', 'circuitikz', 'chemfig', 'mhchem',
    'todonotes', 'algorithms', 'algorithmicx', 'algorithm2e'
)

$exeName = "TinyTeX-1-windows-v$Version.exe"
$url = "https://github.com/rstudio/tinytex-releases/releases/download/v$Version/$exeName"

$reusing = $Reuse -and (Test-Path (Join-Path $WorkDir 'TinyTeX'))
if (-not $reusing) {
    Write-Host "==> Preparando $WorkDir"
    if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
    New-Item -ItemType Directory -Force $WorkDir | Out-Null
}
Push-Location $WorkDir
try {
    if ($reusing) {
        Write-Host "==> Reaproveitando $WorkDir\TinyTeX"
    } else {
        Write-Host "==> Baixando $url"
        # -s: sem barra de progresso (no PowerShell 5.1 ela vira erro no stderr)
        curl.exe -fsSL --retry 5 --retry-delay 10 -o $exeName $url
        if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar o TinyTeX" }

        Write-Host '==> Extraindo'
        & ".\$exeName" -y | Out-Null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'TinyTeX')) { throw 'Falha ao extrair o TinyTeX' }
        Remove-Item $exeName
    }

    $tlmgr = Join-Path $WorkDir 'TinyTeX\bin\windows\tlmgr.bat'
    Write-Host '==> Atualizando o tlmgr'
    & $tlmgr update --self
    Write-Host "==> Instalando $($Packages.Count) pacotes"
    & $tlmgr install @Packages
    if ($LASTEXITCODE -ne 0) { throw 'O tlmgr falhou ao instalar pacotes (veja a saída acima)' }

    # Confere os programas e os arquivos usados pelos templates.
    $bin = Join-Path $WorkDir 'TinyTeX\bin\windows'
    $tools = 'pdflatex', 'xelatex', 'lualatex', 'latexmk', 'bibtex', 'biber'
    $missing = @($tools | Where-Object { -not (Test-Path (Join-Path $bin "$_.exe")) })
    $required = 'IEEEtran.cls', 'beamer.cls', 'beamerthememetropolis.sty', 'portuges.ldf', 'fontawesome5.sty',
        'titlesec.sty', 'tocloft.sty', 'indentfirst.sty', 'tabularx.sty', 'biblatex.sty', 'abntex2.cls'
    $missing += @($required | Where-Object { -not (& (Join-Path $bin 'kpsewhich.exe') $_) })
    if ($missing) { throw "Itens ausentes após a instalação: $($missing -join ', ')" }

    Write-Host '==> Compactando'
    $out = [IO.Path]::GetFullPath($OutFile)
    New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
    if (Test-Path $out) { Remove-Item $out }
    # bsdtar (vem no Windows 10+) gera zip com deflate, que o app sabe extrair.
    tar.exe -a -c -f $out TinyTeX
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar o zip' }

    $sizeMb = [math]::Round((Get-Item $out).Length / 1MB)
    Write-Host "==> Pronto: $out ($sizeMb MB)"
}
finally {
    Pop-Location
}
