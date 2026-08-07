@echo off
setlocal

:: Compiled set up for quick start
echo =======================================
echo    Deployable Knowledge - quick start
echo =======================================
echo.

echo SEMANTIC_EMBED_ALLOW_REMOTE=1 > .env
call npm install
call npm run db:push

where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ------------------------------------------------------------------
    echo [:^(] Ollama, the recommended provider for default use, is not installed.
    echo       - If you are using Cloud Providers ^(GitHub, OpenAI^), you can ignore this.
    echo         Configure this in the UI, bottom right section "Assistant Settings".
    echo       - To run local and private, download Ollama here:
    echo         https://ollama.com/download
    echo ------------------------------------------------------------------
    echo.
    goto START_SERVER
)

ollama list 2>nul | findstr ":" >nul
if %errorlevel% neq 0 (
    echo [:O] No local models found. Pulling lightweight default ^(granite4:350m^).
    ollama pull granite4:350m
) else (
    echo [:^)] Local models detected. Ready to launch.
)

:START_SERVER
echo.
echo ---------------------------------------
echo Starting :D
echo ---------------------------------------
echo.
call npm run dev

endlocal