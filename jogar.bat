@echo off
rem Inicia um servidor local e abre o jogo no navegador. Feche esta janela para parar.
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8765/
  python tools\serve.py 8765
  goto :eof
)
where npx >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8765/
  npx --yes http-server -p 8765 -a 127.0.0.1 -c-1
  goto :eof
)
echo Precisa do Python ou do Node.js instalado para rodar o servidor local.
pause
