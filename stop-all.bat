@echo off
echo ========================================
echo   Deteniendo Sofia AI Sales
echo ========================================
echo.

echo Cerrando procesos de Node.js...

REM Matar procesos de node que corren en los puertos 3002 y 5173
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /F /PID %%a 2>nul

echo.
echo Servidores detenidos!
echo.
pause
