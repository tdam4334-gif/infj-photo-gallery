@echo off
chcp 65001 >nul
cd /d %~dp0
echo 正在启动心隅共享相册...
echo 启动后请把窗口里打印的 https://....lhr.life 发给朋友。
echo 关闭本窗口或关机后，链接会失效。
python data\run_shared.py
pause
