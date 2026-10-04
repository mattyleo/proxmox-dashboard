@echo off
chcp 65001 >nul
echo ==================================================================
echo  ML-ProxVision - INSTALLER E AVVIO RAPIDO WINDOWS
echo  Ideato da Mattia Leoni - Via Citta di Pemba, 21 Reggio Emilia
echo  Tel: (377)093-3621 - Mail: info@leonimattia.it
echo ==================================================================
echo.

cd /d "%~dp0"

echo [1/3] Controllo container MySQL su Docker...
docker compose up -d 2>nul

echo [2/3] Verifica dipendenze Node.js...
if not exist "node_modules\mysql2" (
    call npm install
)

echo [3/3] Avvio ML-ProxVision su http://localhost:3000 ...
start "" "http://localhost:3000"
call npm run dev
pause
