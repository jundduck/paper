@echo off
cd /d "%~dp0"
echo Papertrail is starting at http://127.0.0.1:3000
echo Keep this window open for automatic updates.
node scripts/launch.mjs
pause
