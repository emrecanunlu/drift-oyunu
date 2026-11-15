# Drift Oyunu — Tasarım Dokümanı

Tarih: 2026-11-15

## Amaç ve neden

Tek kişilik, **stres atmak için** oynanan rahatlatıcı bir drift oyunu. Oyun
bilgisayarın tarayıcısında açılıyor; iPhone yatay tutulup **direksiyon gibi**
çevrilerek araba sürülüyor. Önünde hiç bitmeyen bir yol var. Amaç kazanmak
değil, akışa girip drift atmanın keyfini çıkarmak.

## Hedefler

- iPhone'u yatayda sağa/sola çevirmek arabayı o yöne döndürür; hızlıyken sert
  çevirmek drift'e sokar.
- Yol sonsuz: araba ilerledikçe önde yeni yol üretilir, geride kalan silinir.
  Her oyun farklı.
- Yoldan çıkınca oyun bitmez: NFS tarzı kısa bir blur + yanıp sönme efektiyle
  araba çıktığı yere en yakın noktada yola geri konur ve devam eder.
- Drift skoru: drift attıkça puan birikir, art arda drift'ler kombo oluşturur ve
  **x çarpanı** yükselir.
- Telefon, oyundaki olaylarda (kombo artışı, kombo bitişi, yola geri konma)
  titreşimle geri bildirim verir.

## Hedef olmayanlar

- Çok oyunculu, online skor tablosu, hesap sistemi.
- Trafik, rakip araçlar, polis vb.
- Gerçekçi simülasyon fiziği (hedef arcade/NFS hissi).
- App Store'da yayınlamak (Expo Go ile kendi telefonunda çalışması yeterli).
- Araba seçme, garaj, yükseltme gibi menü sistemleri.

## Anti-hedefler (çalışsa bile başarısızlık sayılır)

- Cezalandırıcı zorluk: ezber gerektiren, uyarısız virajlar. (Kullanıcı isteğiyle 2026-11-15: virajlar keskin — min. yarıçap 25 m — ve yolun başından itibaren sık.)
- "Game over" ekranı ya da oyunu baştan başlatmak.
- Direksiyonun gecikmeli, titrek ya da kayan hissettirmesi.
- Ekranı dolduran, dikkat dağıtan arayüz; skor köşede sakin durmalı.

## Kısıtlar

- Telefon ve bilgisayar **aynı Wi-Fi ağında**.
- Bilgisayar Windows 10; oyun masaüstü Chrome'da çalışmalı.
- Kontrolcü **Expo Go** içinde çalışmalı: yalnızca Expo Go'da bulunan modüller
  (`expo-sensors`, `expo-haptics`, `expo-camera`, `expo-keep-awake`,
  `expo-screen-orientation`). Özel native modül yok.
- Tek dil: TypeScript (oyun, sunucu, kontrolcü).

## Yaklaşımlar

1. **Three.js oyun + Node WebSocket sunucu + Expo kontrolcü** — SEÇİLDİ.
   Tek dil, hafif, hızlı açılır; drift fiziğini kendimiz yazdığımız için his
   tamamen ayarlanabilir. Ev Wi-Fi'ında gecikme hissedilmez.
2. **Godot (web export) + Expo kontrolcü.** Görsel editör avantajı var ama iki
   dil/iki araç, daha ağır web çıktısı ve yavaş açılış. Elendi.
3. **Yaklaşım 1 + WebRTC (sunucusuz).** Teorik olarak birkaç ms daha az
   gecikme, ama eşleştirme yine gerekli ve kurulum belirgin şekilde karmaşık;
   ev ağında fark hissedilmez. Elendi.

Seçim: Kullanıcı önerilen yaklaşım 1 ile ilerlemeyi onayladı.

## Kullanıcının kararları

- Yol: **bitmeyen, prosedürel** yol (kapalı pist değil).
- Kullanım: tek kişilik, stres atmak için.
- Yoldan çıkınca: blur + yanıp sönme, çıktığı yerden devam.
- Drift skoru, kombo ve x çarpanı olacak.
- Kontrolcü Expo mobil uygulaması, oyun tarayıcıda.
- Teknik yaklaşım: yaklaşım 1.
- Gaz: **otomatik gaz**. Sol başparmak basılı → fren, sağ başparmak basılı → nitro.

## Tasarım

### Proje yapısı

```
drift-oyunu/
  game/        Vite + Three.js + TypeScript (tarayıcıdaki oyun)
  server/      Node.js + ws (oyunu sunar, mesajları aktarır)
  controller/  Expo (React Native + TypeScript) kontrolcü uygulaması
  shared/      ortak mesaj tipleri (protocol.ts)
```

### Bağlantı ve eşleştirme

- `server` bilgisayarda çalışır, derlenmiş oyunu HTTP ile sunar ve aynı porttan
  WebSocket kabul eder. Açılışta bilgisayarın LAN IP adresini bulur.
- Oyun ekranı açılınca köşede bir **QR kod** gösterir: `ws://<LAN-IP>:<port>`.
  Kontrolcü bağlanınca QR kod kaybolur.
- Kontrolcü `expo-camera` ile QR'ı okur. Yedek olarak IP elle girilebilir.
  Son bağlantı adresi telefonda hatırlanır.
- Sunucu tek bir oyun ekranı ve tek bir kontrolcü bağlantısı tutar (tek kişilik).

### Mesaj protokolü (JSON)

- Kontrolcü → oyun: `{ t: "input", steer: -1..1, brake: bool, nitro: bool, seq }`
  yaklaşık 60 Hz.
- Kontrolcü → oyun: `{ t: "calibrate" }`.
- Oyun → kontrolcü: `{ t: "haptic", kind: "comboUp" | "comboEnd" | "reset" }`,
  `{ t: "status", score, combo, multiplier }` (kontrolcü ekranında küçük gösterim
  için, düşük frekans).
- Oyun 500 ms boyunca input almazsa direksiyonu yavaşça ortaya getirir ve
  ekranda "kontrolcü bağlantısı koptu" uyarısı gösterir; bağlanınca devam eder.

### Kontrolcü (Expo)

- Ekran **yatay kilitli** (`expo-screen-orientation`), ekran kapanması engelli
  (`expo-keep-awake`).
- Direksiyon açısı: telefon yatay ve ekran kullanıcıya dönük tutulurken,
  ekran düzlemindeki dönüş, yerçekimi vektöründen hesaplanır
  (`DeviceMotion.accelerationIncludingGravity`, `atan2` ile). Bu yöntem
  jiroskop kaymasından etkilenmez.
- ±45° dönüş → `steer` -1..1. Merkezde ~3° ölü bölge. Hafif yumuşatma
  (low-pass) ile titreme alınır.
- **Kalibre et** butonu: basıldığı anki açı yeni merkez olur.
- Ekranın sol yarısı basılı tutulunca **fren**, sağ yarısı basılı tutulunca
  **nitro** (kalibre butonu bu alanların dışında, üst ortada).

### Gaz (otomatik)

- Gaz her zaman açık: araba rahat bir seyir hızına (~110 km/s; kullanıcı isteğiyle 150 km/s) kendiliğinden
  çıkar ve orada kalır. Drift sırasında hız hafifçe düşer, drift bitince tekrar
  seyir hızına toparlanır.
- Fren: basılı tutuldukça yavaşlar (alt sınır ~40 km/s, durmaz). Bırakınca
  tekrar seyir hızına döner.
- Nitro: basılı tutuldukça seyir hızının ~%30 üstüne çıkar (kullanıcı isteğiyle %40 → 210 km/s). Sınırsız (stres
  atma oyunu, kaynak yönetimi yok); kamera FOV'u artar.
- Ekranda: bağlantı durumu, küçük bir direksiyon göstergesi, skor/kombo.
- Titreşim: `comboUp` → hafif, `comboEnd` → orta, `reset` → ağır.

### Araba fiziği (arcade)

- 2D düzlemde basitleştirilmiş araç modeli (konum, yön, hız vektörü, açısal hız);
  görsel olarak 3D. Gerçekçilik değil his önemli.
- Normal sürüşte lastikler yanal kaymayı güçlü şekilde sönümler (yüksek tutuş).
- Yeterli hızda sert direksiyon → tutuş düşer, arka kayar, **drift durumu**.
  Drift = hız vektörü ile araba yönü arasındaki kayma açısı belirli eşiğin üstünde.
- Drift sırasında karşı direksiyonla açı tutulabilmeli; drift kolay başlamalı,
  kolay kontrol edilmeli, kendiliğinden spin atmaya meyilli olmamalı.
- Tüm sabitler tek bir ayar dosyasında (`tuning.ts`) toplanır, his oynayarak
  ayarlanacak.

### Sonsuz yol

- Yol, uç uca eklenen parçalardan oluşan bir merkez çizgisi (spline).
- Eğrilik, tohumlu (seed) gürültü ile üretilir; eğrilik üst sınırlı tutulur ki
  **keskin ve ani virajlar olmasın**. Akıcı, geniş virajlar ve ara sıra uzun
  düzlükler karışımı. S virajları drift kombosunu teşvik eder.
- Yol geniş (~14 m), kenarlarda alçak bariyer/çizgi yok; yolun dışı düz arazi.
- Önde ~600 m hazır tutulur; geride ~150 m'den eski parçalar silinir (bellek
  sabit kalır). Yol kendi üzerinden geçmeyecek şekilde yön sapması sınırlanır
  (zamanla genel bir ana yön etrafında kıvrılır).
- Yol mesh'i merkez çizgisi boyunca ekstrüde edilir. Lastik izleri yol yüzeyine
  çizilir ve parça silinince birlikte silinir.

### Yoldan çıkma ve geri gelme

- Arabanın merkez çizgisine uzaklığı `yarı genişlik + ~2 m` aşılırsa yoldan
  çıkmış sayılır.
- Efekt (~0,6 sn): ekran blur + beyaz yanıp sönme. Efektin ortasında araba
  merkez çizgisindeki en yakın noktaya, yol yönüne hizalı konur; hız yaklaşık
  yarıya düşürülür.
- O anda birikmekte olan (henüz kazanılmamış) kombo puanı kaybolur;
  daha önce kazanılmış skor korunur. Telefona `reset` titreşimi gider.

### Skor, kombo, çarpan

- Drift sırasında saniye başı puan = kayma açısı × hız ile orantılı.
- Bir drift bittikten sonra ~1,5 sn içinde yeni drift başlarsa kombo devam eder
  ve çarpan bir artar (x1 → x2 → … üst sınır x10).
- Kombo süresi dolunca birikmiş puan × çarpan toplam skora eklenir ("banked"),
  çarpan x1'e döner.
- Yoldan çıkmak birikmekte olan komboyu siler.
- Arayüz: sağ üst köşede toplam skor, onun altında aktif kombo puanı ve
  çarpan (kombo yokken gizli). En iyi skor `localStorage`'da saklanır.

### Görünüm ve his

- Low-poly, sade 3D; gün batımı renk paleti, sis ile ufuk yumuşatılır.
- Arkadan takip eden kamera; drift sırasında hafif yana kayar ve FOV hızla
  hafif artar.
- Drift'te lastik izi ve duman parçacıkları.
- Basit, sakin çevre: yol kenarında ara sıra low-poly ağaç/kaya, uzakta tepeler.

## Builder'a bırakılanlar

- Tam fizik sabitleri, kamera ayarları, puan formülü katsayıları (oynanarak).
- Gürültü fonksiyonu ve spline türü seçimi.
- Blur efektinin teknik uygulaması (post-processing yolu).
- Kontrolcü ekranının görsel düzeni.
- Çevre süslemelerinin miktarı ve dağılımı.
- Ses (motor/lastik sesi) ilk sürümde opsiyonel.
