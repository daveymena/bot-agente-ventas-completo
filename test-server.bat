@echo off
REM Script para probar el acceso al servidor

echo.
echo ====================================
echo Testing API Health
echo ====================================
curl -s http://localhost:3002/api/health | findstr /R ".*" && echo OK || echo FAILED

echo.
echo ====================================
echo Testing Frontend Root
echo ====================================
curl -s http://localhost:3002/ | findstr /I "html" && echo Frontend is serving || echo Frontend NOT serving

echo.
echo ====================================
echo Server Info
echo ====================================
echo Server should be running at: http://localhost:3002
echo Open in browser: http://localhost:3002
echo.
