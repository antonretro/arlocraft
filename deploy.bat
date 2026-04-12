@echo off
setlocal enabledelayedexpansion

echo.
echo  ArloCraft Deploy
echo  ================
echo.

:: Stage and commit if there are changes
git status --short > tmp_status.txt
for /f %%i in ("tmp_status.txt") do set size=%%~zi
del tmp_status.txt

git diff --quiet HEAD 2>nul
git status --porcelain > nul 2>&1
for /f "delims=" %%a in ('git status --porcelain') do (
    set HAS_CHANGES=1
    goto :has_changes
)
goto :no_changes

:has_changes
echo  You have uncommitted changes:
echo.
git status --short
echo.
set /p MSG="  Commit message (leave blank to push as-is): "
if not "!MSG!"=="" (
    git add -A
    git commit -m "!MSG!"
    if !errorlevel! neq 0 (
        echo  [X] Commit failed.
        pause
        exit /b 1
    )
)

:no_changes
echo.
echo  Pushing to GitHub...
git push
if %errorlevel% neq 0 (
    echo.
    echo  [X] Push failed. Check your connection or run: git status
    pause
    exit /b 1
)

echo.
echo  Done! GitHub Actions will build and deploy automatically.
echo.
echo  Watch : https://github.com/antonretro/arlocraft/actions
echo  Play  : https://antonretro.github.io/arlocraft/
echo.
pause
