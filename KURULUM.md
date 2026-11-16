# Kurulum

Tek gereken: **Node.js 22+** (https://nodejs.org) ve iPhone'da **Expo Go** (App Store).

## Klonla ve oyna

```bash
git clone https://github.com/emrecanunlu/drift-oyunu.git
cd drift-oyunu
npm start
```

Ayrıca `npm install` çalıştırmana gerek yok. `npm start` ilk açılışta paketleri kendisi kurar.
`git pull` sonrası `package-lock.json` değiştiyse yeniden kurar. Sonra oyunu derleyip sunucuyu açar.

Konsolda `Oyun: http://192.168.x.x:8080` yazar. Bu adresi Chrome'da aç.
Windows Güvenlik Duvarı sorarsa **Özel ağlar** için izin ver.

## Telefon kontrolcüsü

İkinci bir terminalde:

```bash
npm run controller
```

Çıkan QR kodu iPhone kamerasıyla okut, uygulama Expo Go'da açılır. Kontrolcüde oyun ekranındaki
QR kodu okut (ya da bilgisayarın IP'sini elle gir). Telefon ve bilgisayar aynı Wi-Fi'da olmalı.

Telefon yoksa: ok tuşları sürer, **E** extreme mod, **M** ses.

## Tam kurulum ve kontrol (isteğe bağlı)

Paketleri kurup testleri çalıştırır ve oyunu derler:

```bash
npm run setup
# ya da
powershell -ExecutionPolicy Bypass -File setup.ps1   # Windows
bash setup.sh                                        # macOS / Linux
```

## Yapay zekâ aracıyla açarsan

Claude Code, Cursor veya Codex repoyu açtığında `AGENTS.md` sayesinde kurulumu kendisi başlatır.

## Neden klonlarken kendiliğinden kurulmuyor?

Git, güvenlik gereği `git clone` sırasında kod çalıştırmaz. Bu yüzden kurulum ilk `npm start` ile başlar.
