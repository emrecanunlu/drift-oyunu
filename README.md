# Drift

Telefonu direksiyon gibi kullandığın, sonsuz yollu, rahatlatıcı bir drift oyunu.
Oyun bilgisayarın tarayıcısında açılır, iPhone kontrolcü olur.

## Kurulum

Gerekenler: Node.js 22+ ve iPhone'da **Expo Go** uygulaması (App Store).

```bash
npm install
```

## Oynamak

1. **Oyunu başlat** (bilgisayarda):
   ```bash
   npm start
   ```
   Konsolda `Oyun: http://192.168.x.x:8080` yazar. Bu adresi Chrome'da aç.
   İlk çalıştırmada Windows Güvenlik Duvarı sorarsa **Özel ağlar** için izin ver.

2. **Kontrolcüyü başlat** (ikinci bir terminalde):
   ```bash
   npm run controller
   ```
   Çıkan QR kodu iPhone kamerasıyla okut, uygulama Expo Go'da açılır.

3. Kontrolcüde oyun ekranının köşesindeki QR kodu okut (ya da IP'yi elle gir).

### Kontroller

| Telefonda | Ne yapar |
|---|---|
| Sağa/sola çevir | Direksiyon. Hızlıyken sert çevir, drift at |
| Sol yarıya basılı tut | Fren |
| Sağ yarıya basılı tut | Nitro |
| Kalibre et | O anki duruşu "düz" kabul eder |
| Yönü çevir | Araba ters yöne dönüyorsa bas |

Telefonsuz denemek için: ← → direksiyon, ↓ fren, ↑ nitro.

Art arda drift at, çarpan yükselsin (x10'a kadar). Yoldan çıkarsan birikmekte olan kombo silinir, oyun devam eder.

## Sorun giderme

- **Telefon bağlanmıyor:** telefon ve bilgisayar aynı Wi-Fi'da mı? Güvenlik duvarında Node.js'e izin verildi mi?
- **Direksiyon kayıyor:** telefonu düz tut, *Kalibre et*'e bas.
- **Sürüş hissi:** tüm ayarlar `game/src/sim/tuning.ts` içinde. Değiştirip `npm start` ile yeniden başlat.

## Geliştirme

```bash
npm test      # oyun mantığı testleri
```
