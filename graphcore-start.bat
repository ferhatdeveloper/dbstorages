@echo off
setlocal
cd /d "%~dp0"

set NODE_PORT=4000
set GO_PORT=8080
set FRONTEND_ORIGIN=http://localhost:5173,http://localhost:5174
set VITE_WEB_URL=http://localhost:5173
set VITE_CONSOLE_URL=http://localhost:5174

echo [GO BACKEND] :8080 baslatiliyor...
start "Go Backend" cmd /k "cd /d "%~dp0backend\go" && go run main.go"

echo [NODE BACKEND] :4000 baslatiliyor...
if not exist "%~dp0backend\node\node_modules\" (
  echo Bagimliliklar yukleniyor...
  pushd "%~dp0backend\node"
  call npm install
  popd
)
start "Node Backend" cmd /k "cd /d "%~dp0backend\node" && set NODE_PORT=4000 && set FRONTEND_ORIGIN=http://localhost:5173,http://localhost:5174 && node app.js"

echo [WEB] Marketing :5173 ...
if not exist "%~dp0node_modules\" (
  echo Kok bagimliliklar yukleniyor...
  call npm install
)
start "GraphCore Web" cmd /k "cd /d "%~dp0" && npm run dev:web"

echo [CONSOLE] Panel :5174 ...
start "GraphCore Console" cmd /k "cd /d "%~dp0" && npm run dev:console"

echo.
echo Servisler ayri pencerelerde acildi.
echo   Marketing: http://localhost:5173
echo   Console:   http://localhost:5174
echo   Node:      http://localhost:4000/health
echo   Go:        http://localhost:8080
echo.
pause
