@echo off
chcp 65001 > nul
title RTAイベント配信システム - 初回セットアップ

echo ========================================================
echo   🎮 RTAイベント ワンオペ配信システム 初回セットアップ
echo ========================================================
echo.

echo [1/3] Node.js のインストール確認中...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 【エラー】Node.js が見つかりませんでした。
    echo 公式サイト (https://nodejs.org/) から LTS版 をインストールしてください。
    pause
    exit /b
)
echo Node.js は正常にインストールされています。
echo.

echo [2/3] 依存パッケージ (NodeCG等) をインストール中...
call npm install
if %errorlevel% neq 0 (
    echo 【エラー】npm install に失敗しました。ネットワーク接続を確認してください。
    pause
    exit /b
)
echo.

echo [3/3] NodeCG 初期設定を生成中...
call npx nodecg defaultconfig
echo.

echo ========================================================
echo  ✨ セットアップが正常に完了しました！
echo  次回からは [ start.bat ] をダブルクリックして起動できます。
echo ========================================================
echo.
pause
