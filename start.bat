@echo off
cd /d "%~dp0web"
echo Starting LeetGeek dev server on http://localhost:3000
npx next dev
pause
