#!/usr/bin/env bash
# Drift — one-shot setup for macOS / Linux.
# Usage:  bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "== Drift kurulumu =="

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js bulunamadı. https://nodejs.org adresinden 22 veya üstünü kurup tekrar çalıştır." >&2
  exit 1
fi
major=$(node -v | sed 's/^v//; s/\..*//')
if [ "$major" -lt 22 ]; then
  echo "Node.js $(node -v) eski. 22 veya üstü gerekli." >&2
  exit 1
fi
echo "Node.js $(node -v) OK"

echo "Paketler kuruluyor..."
npm install

echo "Testler çalışıyor..."
npm test

echo "Oyun derleniyor..."
npm -w game run build

cat <<'MSG'

== Kurulum tamam ==
Oyunu başlat:         npm start          (Chrome'da konsoldaki adresi aç)
Telefon kontrolcüsü:  npm run controller (iPhone'da Expo Go ile QR'ı okut)
Telefonsuz:           ok tuşları, E = extreme mod, M = ses
MSG
