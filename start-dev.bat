@echo off
setlocal
title VitaTrack - Dev

REM ============================================================
REM  VitaTrack local dev launcher
REM  Starts the web app (frontend + Next.js API routes) and opens
REM  the site in your browser. Optionally starts a LOCAL Supabase
REM  stack (needs Docker Desktop).
REM ============================================================

REM ---- Config -------------------------------------------------
REM  Test the R1 client-direct vitals path (offline write queue)?
REM    1 = yes (new path)   0 = normal /api path
set "NEXT_PUBLIC_CLIENT_DIRECT=1"

REM  Also start a LOCAL Supabase stack (Docker)?
REM    0 = use the hosted backend in apps\web\.env.local (default)
REM    1 = start local Supabase too
set "START_SUPABASE=0"

set "WEB_URL=http://localhost:3002"
REM -------------------------------------------------------------

cd /d "%~dp0"

REM ---- Ensure pnpm --------------------------------------------
where pnpm >nul 2>&1
if errorlevel 1 (
  echo [!] pnpm not found on PATH - trying corepack...
  corepack enable >nul 2>&1
  where pnpm >nul 2>&1
  if errorlevel 1 (
    echo [x] Could not find pnpm. Install Node 20+ then run:  npm i -g pnpm@9
    pause
    exit /b 1
  )
)

REM ---- Install deps on first run ------------------------------
if not exist "node_modules" (
  echo [*] Installing dependencies ^(first run - can take a few minutes^)...
  call pnpm install
  if errorlevel 1 (
    echo [x] pnpm install failed.
    pause
    exit /b 1
  )
)

REM ---- Optional: local Supabase stack ------------------------
if "%START_SUPABASE%"=="1" (
  echo [*] Starting local Supabase stack ^(Docker^)...
  start "VitaTrack Supabase" cmd /k "supabase start"
)

REM ---- Start the web app (frontend + API) --------------------
echo [*] Starting web dev server on %WEB_URL%
echo     NEXT_PUBLIC_CLIENT_DIRECT=%NEXT_PUBLIC_CLIENT_DIRECT%  ^(vitals write path^)
start "VitaTrack Web" cmd /k "pnpm --filter @vitatrack/web dev"

REM ---- Wait for it to respond, then open the browser ---------
echo [*] Waiting for the site to come up...
set /a tries=0
:wait
set /a tries+=1
timeout /t 2 /nobreak >nul
curl -s -o NUL %WEB_URL%
if not errorlevel 1 goto ready
if %tries% geq 30 goto ready
goto wait

:ready
start "" "%WEB_URL%"
echo.
echo [ok] VitaTrack should be opening at %WEB_URL%
echo      The server runs in the "VitaTrack Web" window - close it to stop.
echo.
exit /b 0
