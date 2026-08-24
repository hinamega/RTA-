@echo off
chcp 65001 > nul
title RTAイベント配信システム - 起動中

echo ========================================================
echo   🎮 RTAイベント ワンオペ配信システムを起動中...
echo ========================================================
echo.
echo  管理ダッシュボード: http://localhost:9090/
echo  OBS用オーバーレイ:  http://localhost:9090/bundles/rta-single-track/graphics/index.html
echo.
echo  ※ 終了するときはこのウィンドウを閉じるか [Ctrl+C] を押してください。
echo ========================================================
echo.

:: 2秒後に自動でブラウザのダッシュボードを開く
start "" http://localhost:9090/

:: NodeCG サーバーを起動
call npx nodecg start
pause
