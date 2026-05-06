@echo off
chcp 65001 >nul
echo.
echo  ============================================
echo   Iniciando CourseStack...
echo  ============================================
echo.
cd /d "%~dp0"

echo  Buscando actualizaciones en la nube...
git pull origin main >nul 2>&1

echo.
echo  Arrancando servidor...
python servidor.py
pause