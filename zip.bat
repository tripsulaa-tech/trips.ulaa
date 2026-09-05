@echo off
setlocal

cd /d "%~dp0"

echo.
echo Creating Ulaa.zip...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $source = (Get-Location).Path; $zip = Join-Path $source 'Ulaa.zip'; $temp = Join-Path $env:TEMP ('UlaaZip_' + [guid]::NewGuid().ToString()); New-Item -ItemType Directory -Path $temp | Out-Null; Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -notin @('dist','node_modules','public','.git','Ulaa.zip','zip.bat') } | Copy-Item -Destination $temp -Recurse -Force; Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $zip -CompressionLevel Optimal; Remove-Item $temp -Recurse -Force; Write-Host ''; Write-Host 'ZIP CREATED SUCCESSFULLY' -ForegroundColor Green; Write-Host $zip"

if errorlevel 1 (
    echo.
    echo ERROR: Failed to create ZIP.
    pause
    exit /b 1
)

echo.
pause