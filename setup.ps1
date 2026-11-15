# Drift — one-shot setup for Windows (PowerShell).
# Usage:  powershell -ExecutionPolicy Bypass -File setup.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "== Drift kurulumu ==" -ForegroundColor Cyan

# 1. Node.js 22+
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js bulunamadi. https://nodejs.org adresinden 22 veya ustunu kurup tekrar calistir." -ForegroundColor Red
  exit 1
}
$major = [int]((node -v).TrimStart("v").Split(".")[0])
if ($major -lt 22) {
  Write-Host "Node.js $(node -v) eski. 22 veya ustu gerekli." -ForegroundColor Red
  exit 1
}
Write-Host "Node.js $(node -v) OK"

# 2. Dependencies (all workspaces: shared, server, game, controller)
Write-Host "Paketler kuruluyor..."
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Tests + build
Write-Host "Testler calisiyor..."
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Oyun derleniyor..."
npm -w game run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "== Kurulum tamam ==" -ForegroundColor Green
Write-Host "Oyunu baslat:         npm start          (Chrome'da konsoldaki adresi ac)"
Write-Host "Telefon kontrolcusu:  npm run controller (iPhone'da Expo Go ile QR'i okut)"
Write-Host "Telefonsuz:           ok tuslari, E = extreme mod, M = ses"
