@echo off
chcp 65001 > nul
setlocal

echo ===================================================
echo   🎮 RTAイベント用 Discordサーバー自動構築ツール
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/2] 必要なPythonライブラリをチェック・インストール中...
pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo [ERROR] Pythonまたはpipの実行に失敗しました。
    echo Pythonがインストールされているか確認してください。
    pause
    exit /b 1
)

echo.
echo [2/2] Discordサーバー構築スクリプトを実行します...
echo.
python setup_discord_server.py

echo.
echo 処理が完了しました。
pause
