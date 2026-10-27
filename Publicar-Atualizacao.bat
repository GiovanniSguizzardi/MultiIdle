@echo off
rem Publica uma versao nova do MultiIdle no GitHub Releases. Quem tem o app instalado recebe sozinho.
rem
rem Precisa (uma vez so):
rem   1. Um token do GitHub: github.com/settings/personal-access-tokens/new
rem      - Repository access: Only select repositories > MultiIdle
rem      - Permissions > Repository > Contents: Read and write
rem   2. Guardar o token no Windows (num terminal):  setx GH_TOKEN "cole_o_token_aqui"
rem      e abrir um terminal novo depois disso.
setlocal
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=

if "%GH_TOKEN%"=="" (
  echo [ERRO] Falta a variavel GH_TOKEN. Veja as instrucoes no topo deste arquivo.
  pause & exit /b 1
)

echo.
echo Que tipo de versao e esta?
echo   1 = correcao pequena   (1.0.0 -^> 1.0.1)
echo   2 = funcao nova        (1.0.0 -^> 1.1.0)
echo   3 = mudanca grande     (1.0.0 -^> 2.0.0)
set /p TIPO=Escolha 1, 2 ou 3:
set NIVEL=patch
if "%TIPO%"=="2" set NIVEL=minor
if "%TIPO%"=="3" set NIVEL=major

echo.
echo == Rodando os auto-testes ==
call npm run testes || (echo [ERRO] Teste falhou, nada foi publicado. & pause & exit /b 1)

echo == Subindo a versao (%NIVEL%) ==
call npm version %NIVEL% -m "v%%s" || (echo [ERRO] Nao consegui subir a versao. Tem alteracao sem commit? & pause & exit /b 1)

echo == Enviando o codigo pro GitHub ==
git push --follow-tags || (echo [ERRO] git push falhou. & pause & exit /b 1)

echo == Gerando o instalador e publicando o Release ==
call npm run release || (echo [ERRO] A publicacao falhou. & pause & exit /b 1)

echo.
echo Pronto! Versao publicada. Os MultiIdle instalados vao baixar sozinhos.
pause
