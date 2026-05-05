@echo off
echo.
echo  ============================================
echo   Seguimiento de Cursos Local
echo  ============================================
echo.
cd /d "%~dp0"
echo  Iniciando servidor en http://localhost:9999
echo  Presiona Ctrl+C para detener
echo.
start http://localhost:9999
python servidor.py
pause