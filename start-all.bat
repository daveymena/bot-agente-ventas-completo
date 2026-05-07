@echo off
echo ========================================
echo   Iniciando Sofia AI Sales
echo ========================================
echo.

REM Verificar que estamos en el directorio correcto
if not exist "artifacts\api-server" (
    echo ERROR: No se encuentra el directorio artifacts\api-server
    echo Por favor ejecuta este script desde la raiz del proyecto
    pause
    exit /b 1
)

echo [1/2] Iniciando Backend (Puerto 3002)...
start "Backend - Sofia AI" cmd /k "cd artifacts\api-server && npm run dev"

echo.
echo Esperando 3 segundos para que el backend inicie...
timeout /t 3 /nobreak > nul

echo.
echo [2/2] Iniciando Frontend (Puerto 5173)...
start "Frontend - Sofia AI" cmd /k "cd artifacts\ventas-pro && npm run dev"

echo.
echo ========================================
echo   Servidores Iniciados!
echo ========================================
echo.
echo Backend:  http://localhost:3002
echo Frontend: http://localhost:5173
echo.
echo Presiona cualquier tecla para cerrar esta ventana
echo (Los servidores seguiran corriendo en sus propias ventanas)
pause > nul
