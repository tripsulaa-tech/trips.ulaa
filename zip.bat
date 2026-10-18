@echo off
setlocal

cd /d "%~dp0"

echo.
echo Creating Ulaa.zip (skipping src\assets)...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $source = (Get-Location).Path; $zip = Join-Path $source 'Ulaa.zip'; $temp = Join-Path $env:TEMP ('UlaaZip_' + [guid]::NewGuid().ToString()); New-Item -ItemType Directory -Path $temp | Out-Null; Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -notin @('dist','node_modules','public','.git','src','Ulaa.zip','zip.bat') } | Copy-Item -Destination $temp -Recurse -Force; $srcDir = Join-Path $source 'src'; if (Test-Path -LiteralPath $srcDir) { $tempSrc = Join-Path $temp 'src'; New-Item -ItemType Directory -Path $tempSrc | Out-Null; Get-ChildItem -LiteralPath $srcDir -Force | Where-Object { $_.Name -ne 'assets' } | Copy-Item -Destination $tempSrc -Recurse -Force }; if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }; Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $zip -CompressionLevel Optimal; Remove-Item $temp -Recurse -Force; Write-Host ''; Write-Host 'ZIP CREATED SUCCESSFULLY (src\assets skipped)' -ForegroundColor Green; Write-Host $zip"

if errorlevel 1 (
    echo.
    echo ERROR: Failed to create ZIP.
    pause
    exit /b 1
)

echo.
pause
