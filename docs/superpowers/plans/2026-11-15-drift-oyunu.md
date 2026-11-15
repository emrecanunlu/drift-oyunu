# Drift Oyunu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tarayıcıda çalışan, iPhone'un direksiyon olarak kullanıldığı, sonsuz yollu, kombolu, rahatlatıcı bir arcade drift oyunu.

**Architecture:** npm workspaces monorepo. `shared/` saf TS (protokol + direksiyon matematiği), `server/` Node HTTP + `ws` aktarıcı (derlenmiş oyunu da sunar), `game/` Vite + Three.js (oyun mantığı saf modüllerde, render ayrı), `controller/` Expo uygulaması. Oyun mantığı (yol, fizik, skor, reset) render'dan bağımsız saf fonksiyonlar/sınıflar olarak yazılır ve Vitest ile test edilir.

**Tech Stack:** Node 26, TypeScript, Vitest, ws, Vite, Three.js, qrcode, Expo (son SDK, Expo Go), expo-sensors, expo-haptics, expo-camera, expo-keep-awake, expo-screen-orientation, @react-native-async-storage/async-storage.

**Spec:** `docs/superpowers/specs/2026-11-15-drift-oyunu-design.md`

## Global Constraints

- Tek dil TypeScript; kontrolcü yalnızca Expo Go'da bulunan modülleri kullanır.
- Telefon ve PC aynı Wi-Fi; oyun masaüstü Chrome'da çalışır; PC Windows 10.
- Game over yok; yoldan çıkma = blur + yanıp sönme (~0,6 sn) ve devam.
- Seyir hızı ~110 km/s (30.56 m/s); fren alt sınırı ~40 km/s (11.11 m/s); nitro = seyir × 1.3, sınırsız.
- Yol genişliği ~14 m (yarı genişlik 7); yoldan çıkma eşiği yarı genişlik + 2 m = 9 m.
- Önde ~600 m yol hazır; ~150 m'den gerideki parçalar silinir.
- Kombo penceresi 1,5 sn; çarpan x1..x10; yoldan çıkma birikmekte olan komboyu siler.
- Direksiyon: ±45° → steer -1..1, ölü bölge 3°.
- Input 500 ms gelmezse direksiyon yavaşça ortaya döner ve "kontrolcü bağlantısı koptu" uyarısı gösterilir.
- Tüm fizik/his sabitleri `game/src/sim/tuning.ts` içinde.
- Sunucu portu: 8080. Tek oyun ekranı + tek kontrolcü bağlantısı.
- Arayüz metinleri Türkçe.

## Review Focus

- Kontrolcü bağlantısı oyun sırasında kopup geri gelirse oyun donmamalı, yeniden bağlanınca devam etmeli → Task 3 (yeni bağlantı eskisinin yerini alır) ve Task 4 (stale input) testleri.
- Telefon dik tutulursa / yatay çevrilip ters dönerse açı ±180° sınırında atlamamalı → Task 2 `angleDelta` sarma testi.
- Bozuk/eksik JSON mesaj sunucuyu ya da oyunu çökertmemeli → Task 1 `parseMessage` ve Task 3 testleri.
- Uzun süre oynayınca bellek/mesh sayısı artmamalı → Task 5 `trimBehind` testi (nokta sayısı sınırlı kalır).
- Çok yavaşken (fren) drift sayılıp puan yazılmamalı → Task 6 düşük hız testi.

---

### Task 1: Monorepo iskeleti + ortak protokol

**Files:**
- Create: `package.json` (workspaces: `shared`, `server`, `game`, `controller`), `tsconfig.base.json`, `.gitignore`, `vitest.config.ts`
- Create: `shared/package.json` (name `@drift/shared`), `shared/src/protocol.ts`, `shared/src/index.ts`
- Test: `shared/test/protocol.test.ts`

**Interfaces:**
- Produces (`@drift/shared`):
  - `type Role = "game" | "controller"`
  - `type HelloMsg = { t: "hello"; role: Role }`
  - `type InputMsg = { t: "input"; steer: number; brake: boolean; nitro: boolean; seq: number }`
  - `type CalibrateMsg = { t: "calibrate" }`
  - `type HapticKind = "comboUp" | "comboEnd" | "reset"`
  - `type HapticMsg = { t: "haptic"; kind: HapticKind }`
  - `type StatusMsg = { t: "status"; score: number; combo: number; multiplier: number }`
  - `type PeerMsg = { t: "peer"; role: Role; connected: boolean }` (sunucudan gelen bağlantı bildirimi)
  - `type Message = HelloMsg | InputMsg | CalibrateMsg | HapticMsg | StatusMsg | PeerMsg`
  - `parseMessage(raw: string): Message | null`
  - `encode(msg: Message): string`
  - `const SERVER_PORT = 8080`

- [ ] **Step 1:** `git init`, kök `package.json` (workspaces, `"test": "vitest run"`), `vitest` devDependency, `.gitignore` (`node_modules`, `dist`, `.expo`). `controller` klasörü Task 10'da oluşacak; workspaces listesinde şimdiden olabilir.
- [ ] **Step 2: Write failing tests** `shared/test/protocol.test.ts`:
  - `parseMessage('{"t":"input","steer":0.5,"brake":false,"nitro":true,"seq":3}')` → aynı obje
  - `steer: 2` → `steer` 1'e clamp; `steer: -5` → -1; `steer: "x"` → `null`
  - `parseMessage("not json")` → `null`; `parseMessage('{"t":"nope"}')` → `null`; `parseMessage('{"t":"hello","role":"admin"}')` → `null`
  - `parseMessage(encode(m))` her mesaj tipi için `m`'e eşit
- [ ] **Step 3:** `npx vitest run shared` → FAIL (modül yok)
- [ ] **Step 4:** `protocol.ts` implement et: `JSON.parse` try/catch, `t` alanına göre alan tiplerini doğrula, eksik/yanlışsa `null`.
- [ ] **Step 5:** `npx vitest run shared` → PASS
- [ ] **Step 6:** Commit `feat: monorepo skeleton and shared protocol`

### Task 2: Direksiyon matematiği (shared)

**Files:**
- Create: `shared/src/steering.ts` (index'ten export)
- Test: `shared/test/steering.test.ts`

**Interfaces:**
- Produces:
  - `rollFromGravity(gx: number, gy: number): number` — derece, ekran düzlemindeki dönüş, `atan2(gx, gy)` → derece
  - `angleDelta(a: number, b: number): number` — `a - b`, [-180, 180)'e sarılmış
  - `steerFromRoll(roll: number, center: number, opts?: { range?: number; deadzone?: number }): number` — varsayılan `range=45`, `deadzone=3`; ölü bölge içinde 0, dışında `(|d| - deadzone)/(range - deadzone)` işaretli, [-1,1]'e clamp
  - `lowPass(prev: number, next: number, alpha: number): number` — `prev + (next - prev) * alpha`

- [ ] **Step 1: Failing tests:**
  - `steerFromRoll(0, 0)` → 0; `(2, 0)` → 0 (ölü bölge); `(45, 0)` → 1; `(-45, 0)` → -1; `(90, 0)` → 1 (clamp); `(24, 0)` ≈ 0.5
  - kalibrasyon: `steerFromRoll(55, 10)` → 1
  - sarma: `angleDelta(179, -179)` → -2; `angleDelta(-179, 179)` → 2; `steerFromRoll(-179, 179)` → 0 (ölü bölge)
  - `rollFromGravity(0, 9.81)` ≈ 0; `rollFromGravity(9.81, 0)` ≈ 90
  - `lowPass(0, 1, 0.25)` → 0.25
- [ ] **Step 2:** `npx vitest run shared` → FAIL
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run shared` → PASS
- [ ] **Step 5:** Commit `feat: steering math`

### Task 3: Aktarıcı sunucu

**Files:**
- Create: `server/package.json` (deps: `ws`; devDeps: `tsx`, `@types/ws`), `server/src/relay.ts`, `server/src/lanIp.ts`, `server/src/main.ts`
- Test: `server/test/relay.test.ts`

**Interfaces:**
- Consumes: `parseMessage`, `encode`, `SERVER_PORT`, `Message` from `@drift/shared`
- Produces:
  - `createServer(opts: { port: number; staticDir?: string }): Promise<{ port: number; close(): Promise<void> }>` — `port: 0` verilirse rastgele port, gerçek port döner
  - `getLanIp(): string` — ilk IPv4, internal olmayan arayüz; yoksa `"127.0.0.1"`
  - HTTP `GET /config.json` → `{ "wsUrl": "ws://<lanIp>:<port>" }` (oyun QR'ı buradan üretir)
  - Davranış: istemci bağlanınca ilk mesajı `hello` olmalı; rolüne kaydedilir. Aynı rolde yeni bağlantı gelirse eskisi kapatılır. `controller` → `input`/`calibrate` oyuna; `game` → `haptic`/`status` kontrolcüye aktarılır. Rol bağlanınca/kopunca karşı tarafa `{t:"peer", role, connected}` gider. `parseMessage` `null` dönerse mesaj yok sayılır.
  - `main.ts`: `staticDir = ../game/dist`, port 8080, konsola `Oyun: http://<lanIp>:8080` yazar.

- [ ] **Step 1: Failing tests** (`ws` istemcileriyle, `port: 0`):
  - controller'ın gönderdiği `input` oyuna aynen ulaşır
  - game'in gönderdiği `haptic` kontrolcüye ulaşır
  - controller bağlanınca game `{t:"peer",role:"controller",connected:true}` alır; kapanınca `connected:false`
  - ikinci controller bağlanınca ilk controller soketi kapanır ve input'lar ikinciden gelir
  - `"çöp"` mesajı gönderilince sunucu çökmez, sonraki geçerli mesaj iletilir
  - `GET /config.json` `wsUrl` alanı içerir ve port ile biter
- [ ] **Step 2:** `npx vitest run server` → FAIL
- [ ] **Step 3:** Implement (`http.createServer` + statik dosya sunumu + `new WebSocketServer({ server })`).
- [ ] **Step 4:** `npx vitest run server` → PASS
- [ ] **Step 5:** Commit `feat: relay server`

### Task 4: Oyun iskeleti, ağ istemcisi, QR, input durumu

**Files:**
- Create: `game/package.json` (deps: `three`, `qrcode`; devDeps: `vite`, `@types/three`, `@types/qrcode`), `game/index.html`, `game/vite.config.ts` (dev'de `/config.json` ve ws'yi 8080'e proxy'le), `game/src/main.ts`
- Create: `game/src/net/inputState.ts`, `game/src/net/connection.ts`, `game/src/ui/pairing.ts`
- Test: `game/test/inputState.test.ts`

**Interfaces:**
- Consumes: protokol tipleri, `encode`, `parseMessage`
- Produces:
  - `class InputState { apply(msg: InputMsg, now: number): void; read(now: number, dt: number): { steer: number; brake: boolean; nitro: boolean; stale: boolean }; consumeCalibrate(): boolean }` — `now - lastInput > 500` ise `stale: true`, `brake/nitro` false, `steer` 0'a doğru `dt` başına `STALE_RETURN_RATE = 2` (birim/sn) ile döner
  - `class Connection { constructor(wsUrl: string); onMessage(cb: (m: Message) => void): void; send(m: Message): void; }` — açılınca `hello{role:"game"}`, kopunca 1 sn sonra yeniden bağlanır
  - `showPairing(wsUrl: string): void` / `hidePairing(): void` — köşede QR (`qrcode.toDataURL(wsUrl)`) + metin olarak URL
  - `main.ts`: `/config.json` al, bağlan, `peer` controller connected → QR gizle, kopunca göster
  - Klavye yedeği (geliştirme için, benim kararım): ←/→ steer ±1, ↓ fren, ↑ nitro; klavye kullanılırken stale sayılmaz

- [ ] **Step 1: Failing tests:**
  - input uygulandıktan sonra `read(now+100)` → `steer` aynen, `stale:false`
  - `read(now+600, 0.1)` → `stale:true`, `brake:false`, `nitro:false`, `steer` 0.8'den 0.6'ya
  - stale iken yeni input gelince `stale:false`
  - `calibrate` sonrası `consumeCalibrate()` bir kez true, sonra false
- [ ] **Step 2:** `npx vitest run game` → FAIL
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run game` → PASS
- [ ] **Step 5: Manual:** `npm -w game run build`, `npx tsx server/src/main.ts`, Chrome'da `http://localhost:8080` → QR ve URL görünür.
- [ ] **Step 6:** Commit `feat: game skeleton, connection and pairing`

### Task 5: Sonsuz yol üreticisi

**Files:**
- Create: `game/src/sim/rng.ts`, `game/src/sim/road.ts`
- Test: `game/test/road.test.ts`

**Interfaces:**
- Produces:
  - `mulberry32(seed: number): () => number`
  - `type RoadPoint = { s: number; x: number; z: number; heading: number }` (s = yol boyunca mesafe, m)
  - `class Road { constructor(seed: number); readonly halfWidth: number /*7*/; points: RoadPoint[]; ensureAhead(s: number): RoadPoint[] /* s+600'e kadar üretir, yeni noktaları döner */; trimBehind(s: number): number /* s-150 öncesini siler, silinen sayısı */; nearest(x: number, z: number): { point: RoadPoint; distance: number; tangentX: number; tangentZ: number } }`
  - Sabitler (`road.ts` içinde): `STEP = 2` m, `MAX_CURVATURE = 1/40` (1/m, min yarıçap 40 m), `MAX_HEADING_DEV = 60°` (ana yöne göre)
  - Algoritma: eğrilik hedefi, yumuşak gürültüyle değişir — her 40–120 m'de bir yeni hedef eğrilik seç (%30 olasılıkla 0 = düzlük, aksi halde ±[0.4..1]×MAX_CURVATURE, işaret çoğunlukla öncekinin tersi → S virajı); mevcut eğrilik hedefe doğru yumuşakça yaklaşır. Heading ana yönden `MAX_HEADING_DEV`'e yaklaşınca hedef eğrilik geri döndürecek işarete zorlanır. `nearest` son bulunan indeksten başlayarak yerel arama yapar.

- [ ] **Step 1: Failing tests:**
  - aynı seed → aynı noktalar; farklı seed → farklı
  - `ensureAhead(0)` sonrası son nokta `s >= 600`
  - ardışık noktalar arası mesafe ≈ 2; ardışık heading farkı / 2 ≤ `MAX_CURVATURE` + 1e-6
  - 20 km üretimde |heading - başlangıç| her zaman ≤ 60° + küçük tolerans (kendi üstünden geçmez)
  - 20 km boyunca `ensureAhead(s)` + `trimBehind(s)` → `points.length` hiçbir zaman (600+150)/2 + 50'yi geçmez
  - `nearest` bir noktanın tam üstünde → `distance≈0`; noktadan yol normaline 5 m kayınca `distance≈5`
  - 20 km'de en az bir ≥100 m düzlük (|eğrilik| < 0.001) ve en az bir işaret değiştiren S virajı var
- [ ] **Step 2:** `npx vitest run game` → FAIL
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run game` → PASS
- [ ] **Step 5:** Commit `feat: endless procedural road`

### Task 6: Arcade araba fiziği + otomatik gaz

**Files:**
- Create: `game/src/sim/tuning.ts`, `game/src/sim/car.ts`
- Test: `game/test/car.test.ts`

**Interfaces:**
- Produces:
  - `tuning.ts`: `export const TUNING = { cruiseSpeed: 30.56, minBrakeSpeed: 11.11, nitroFactor: 1.3, accel, brakeDecel, maxSteerRate /*rad/s*/, gripNormal, gripDrift, driftEnterSlip /*rad*/, driftExitSlip /*rad*/, driftMinSpeed: 15, driftSpeedLoss, ... }` — implementer başlangıç değerlerini seçer, testleri geçen ve iyi hissettiren değerler
  - `type CarState = { x: number; z: number; heading: number; vx: number; vz: number; yawRate: number; drifting: boolean }`
  - `type CarInput = { steer: number; brake: boolean; nitro: boolean }`
  - `createCar(x: number, z: number, heading: number, speed: number): CarState`
  - `stepCar(car: CarState, input: CarInput, dt: number, t?: typeof TUNING): CarState` (saf, yeni obje döner)
  - `speedOf(car: CarState): number`; `slipAngle(car: CarState): number` (rad, hız ile yön arası işaretli açı; hız < 1 ise 0)
  - Model: hız vektörü araba eksenine ayrılır; boyuna eksende hedef hıza (cruise / nitro / fren) doğru ivmelenme; yanal hız `grip` ile sönümlenir (drift'te `gripDrift` çok düşük); yawRate steer × hız ile orantılı hedefe yaklaşır, drift'te ek yaw; `drifting` histerezisli (`|slip| > driftEnterSlip` ve hız > `driftMinSpeed` ile girer, `< driftExitSlip` ile çıkar). Ayrıca karşı direksiyonda yaw sönümü artırılır → spin'e meyilli olmaz.

- [ ] **Step 1: Failing tests** (dt = 1/60):
  - 0'dan, steer 0, 15 sn → hız ∈ [29, 32] (cruise), `drifting` false
  - cruise'dan nitro 10 sn → hız ≈ 39.7 ± 1.5
  - cruise'dan fren 15 sn → hız ≈ 11.11 ± 0.5, asla < 10.5
  - cruise'da steer 1, 3 sn → bir noktada `drifting` true ve |slip| > `driftEnterSlip`
  - hız 8 m/s'de sabit tutulup (fren) steer 1, 3 sn → `drifting` hiç true olmaz
  - drift'teyken steer 0 → 3 sn içinde `drifting` false (toparlanır)
  - cruise'da steer 1, 5 sn → |yawRate| hiçbir zaman 4 rad/s'yi aşmaz (spin yok)
- [ ] **Step 2:** `npx vitest run game` → FAIL
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run game` → PASS
- [ ] **Step 5:** Commit `feat: arcade car physics with auto throttle`

### Task 7: Skor, kombo, çarpan

**Files:**
- Create: `game/src/sim/score.ts`
- Test: `game/test/score.test.ts`

**Interfaces:**
- Produces:
  - `type ScoreEvent = "comboUp" | "comboEnd"`
  - `class ScoreSystem { total: number; pending: number; multiplier: number; best: number; constructor(best?: number); update(dt: number, drifting: boolean, slip: number, speed: number): ScoreEvent[]; cancelCombo(): void }`
  - Sabitler: `COMBO_WINDOW = 1.5` sn, `MAX_MULT = 10`, `POINTS_RATE = 10` (puan = `POINTS_RATE × |slip|(rad) × speed(m/s) × dt`)
  - Kurallar: drift başladığında, eğer önceki drift'in bitişinden ≤ 1.5 sn geçtiyse (ve pending > 0) `multiplier = min(mult+1, 10)` ve `"comboUp"`; ilk drift'te multiplier 1. Drift bitince sayaç başlar; 1.5 sn yeni drift olmazsa `total += round(pending × multiplier)`, `pending=0`, `multiplier=1`, `"comboEnd"`, `best = max(best,total)`. `cancelCombo()` → `pending=0`, `multiplier=1`, olay yok.

- [ ] **Step 1: Failing tests:**
  - 2 sn drift (slip 0.5, speed 30) → `pending ≈ 300`, `total 0`, `multiplier 1`
  - sonra 1.6 sn düz → `total ≈ 300`, `pending 0`, olaylar içinde `"comboEnd"`
  - drift–1 sn ara–drift–1 sn ara–drift → `multiplier 3`, iki `"comboUp"`
  - 12 kez art arda drift → `multiplier 10`
  - drift sonra `cancelCombo()` sonra 2 sn düz → `total 0`, `"comboEnd"` yok
  - `best` toplamdan büyükse korunur; toplam geçerse güncellenir
- [ ] **Step 2:** `npx vitest run game` → FAIL
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run game` → PASS
- [ ] **Step 5:** Commit `feat: drift scoring with combo multiplier`

### Task 8: Yoldan çıkma ve geri gelme

**Files:**
- Create: `game/src/sim/recovery.ts`
- Test: `game/test/recovery.test.ts`

**Interfaces:**
- Consumes: `Road.nearest`, `Road.halfWidth`, `CarState`, `createCar`, `speedOf`
- Produces:
  - `const OFFROAD_MARGIN = 2`, `const EFFECT_DURATION = 0.6`
  - `class Recovery { active: boolean; progress: number /*0..1, efekt için*/; update(dt: number, car: CarState, road: Road): { car: CarState; started: boolean } }`
  - Davranış: aktif değilken `nearest().distance > halfWidth + 2` → efekt başlar (`started: true` döner bir kez). Efektin yarısında (0.3 sn) araba en yakın yol noktasına, tangent yönüne hizalı, `speedOf × 0.5` hızla, `drifting:false` olarak konur. 0.6 sn'de `active=false`. Efekt sırasında tekrar tetiklenmez.

- [ ] **Step 1: Failing tests:**
  - araba yol ortasında → `started` false
  - araba merkezden 10 m uzakta → `started` true, `active` true
  - 0.35 sn sonra araba konumu yol noktasıyla ≈ aynı, heading ≈ tangent, hız ≈ öncekinin yarısı
  - 0.65 sn sonra `active` false; efekt sırasında ikinci `started` yok
- [ ] **Step 2:** `npx vitest run game` → FAIL
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run game` → PASS
- [ ] **Step 5:** Commit `feat: off-road recovery`

### Task 9: Render, oyun döngüsü, HUD, efektler

**Files:**
- Create: `game/src/render/scene.ts` (renderer, gün batımı gökyüzü/ışık, sis), `game/src/render/roadMesh.ts`, `game/src/render/carMesh.ts`, `game/src/render/chaseCamera.ts`, `game/src/render/skidMarks.ts`, `game/src/render/smoke.ts`, `game/src/render/scenery.ts`, `game/src/ui/hud.ts`, `game/src/ui/recoveryFx.ts`, `game/src/loop.ts`
- Modify: `game/src/main.ts`

**Interfaces:**
- Consumes: `Road`, `stepCar`, `ScoreSystem`, `Recovery`, `InputState`, `Connection`, `TUNING`
- Produces (yalnızca bu task içinde kullanılır):
  - `RoadMesh`: `addPoints(points: RoadPoint[])`, `trim(beforeS: number)` — parça başına (ör. 50 m) ayrı mesh; silinen parçaların geometrisi `dispose()` edilir
  - `ChaseCamera.update(car, dt, nitro)`: arkadan takip, drift'te hafif yana kayma, FOV hız/nitro ile artar
  - `SkidMarks`/`Smoke`: drift sırasında arka tekerlek konumlarından; skid izleri yol parçalarıyla birlikte silinir; sabit havuz (sınırlı sayı)
  - `scenery`: yol kenarında (merkezden 12–60 m) seed'li low-poly ağaç/kaya, parçalarla birlikte silinir
  - `hud`: sağ üst toplam skor + en iyi; altında `pending × multiplier` (kombo yokken gizli); stale iken ortada "Kontrolcü bağlantısı koptu"
  - `recoveryFx.set(progress)`: canvas'a CSS `filter: blur()` (0→8px→0) + beyaz overlay opaklığı (0→0.8→0)
  - `loop.ts`: sabit adım 1/60 sim (accumulator), her karede: input oku → kalibrasyon mesajı (yoksay, kontrolcü tarafında) → `stepCar` → `recovery.update` (started ise `score.cancelCombo()` + `haptic reset`) → `score.update` (olaylar → `haptic`) → `road.ensureAhead/trimBehind` + mesh güncelle → render. `status` mesajı 5 Hz. `best` `localStorage["drift.best"]`'a combo bitişinde yazılır.

- [ ] **Step 1:** Implement modules and wire `main.ts`.
- [ ] **Step 2:** `npx vitest run` → tüm önceki testler PASS; `npm -w game run build` → hatasız (tsc dahil).
- [ ] **Step 3: Manual (klavye ile):** `npx tsx server/src/main.ts`, Chrome `http://localhost:8080`:
  - araba kendiliğinden ~110 km/s'ye çıkar; ↑ nitro, ↓ fren çalışır
  - ←/→ sert basınca drift, lastik izi + duman, HUD'da kombo ve çarpan görünür
  - yoldan çıkınca blur + flash, araba yola döner, kombo silinir
  - 5 dk sürüşte Chrome DevTools'ta `renderer.info.memory.geometries` sabit kalır (sınırlı)
- [ ] **Step 4:** Commit `feat: rendering, game loop, HUD and effects`

### Task 10: Expo kontrolcü

**Files:**
- Create: `controller/` (`npx create-expo-app@latest controller --template blank-typescript`), `controller/app.json` (orientation `landscape`), `controller/src/net.ts`, `controller/src/useSteering.ts`, `controller/src/screens/ConnectScreen.tsx`, `controller/src/screens/DriveScreen.tsx`, `controller/App.tsx`
- Modify: `controller/metro.config.js` gerekirse (workspace içindeki `@drift/shared` çözümü için)

**Interfaces:**
- Consumes: `encode`, `parseMessage`, `rollFromGravity`, `steerFromRoll`, `lowPass` from `@drift/shared`
- Produces:
  - `useControllerSocket(url: string | null): { connected: boolean; send(m: Message): void; status: StatusMsg | null; onHaptic(cb) }` — açılınca `hello{role:"controller"}`, kopunca 1 sn sonra yeniden dener
  - `useSteering(): { steer: number; calibrate(): void }` — `DeviceMotion.setUpdateInterval(16)`, `accelerationIncludingGravity` → `rollFromGravity` → `lowPass(alpha 0.35)` → `steerFromRoll(roll, center)`. `STEER_SIGN` sabiti (1 veya -1) telefonla manuel doğrulanır. `ScreenOrientation.addOrientationChangeListener` ile landscape-left/right değişiminde işaret çevrilir.
  - ConnectScreen: `expo-camera` `CameraView` ile QR (`ws://` ile başlayan) okur; elle IP girişi (`ws://<ip>:8080`'e tamamlanır); son URL AsyncStorage `drift.lastUrl`; varsa "Son bağlantıya bağlan" butonu
  - DriveScreen: `useKeepAwake()`, `lockAsync(LANDSCAPE)`; tam ekran iki dokunma alanı (sol = fren, sağ = nitro, basılıyken true); üst ortada "Kalibre et" butonu (kalibrasyon telefon tarafında `center` günceller; `calibrate` mesajı da gönderilir); ortada steer göstergesi (dönen direksiyon ikonu), skor/çarpan; bağlantı durumu noktası. 60 Hz `input` gönderimi `setInterval(16)`.
  - Haptics: `comboUp` → `ImpactFeedbackStyle.Light`, `comboEnd` → `Medium`, `reset` → `Heavy`

- [ ] **Step 1:** Scaffold, bağımlılıkları `npx expo install` ile ekle, `@drift/shared`'ı import edebildiğini `npx expo start` ile doğrula.
- [ ] **Step 2:** Implement hooks and screens.
- [ ] **Step 3:** `npx tsc --noEmit -p controller` → hatasız.
- [ ] **Step 4: Manual (iPhone + Expo Go):** sunucu çalışırken QR'ı okut:
  - oyundaki QR kaybolur; telefonu sağa çevirince araba sağa döner (değilse `STEER_SIGN`'ı çevir)
  - ölü bölge: telefon hafif oynarken araba düz gider; "Kalibre et" yeni merkezi alır
  - sol basılı = fren, sağ basılı = nitro
  - kombo artışında hafif, bitişinde orta, yoldan çıkışta ağır titreşim
  - Wi-Fi'ı kapat/aç → oyunda uyarı, geri bağlanınca devam
- [ ] **Step 5:** Commit `feat: expo steering-wheel controller`

### Task 11: Tek komutla çalıştırma + README

**Files:**
- Modify: kök `package.json` scripts: `"start": "npm -w game run build && tsx server/src/main.ts"`, `"controller": "npm -w controller run start"`, `"test": "vitest run"`
- Create: `README.md` (Türkçe: kurulum, `npm install`, `npm start`, Windows Güvenlik Duvarı'nda Node'a özel ağ izni verme, Expo Go ile `npm run controller`, QR eşleşme, sorun giderme: aynı Wi-Fi, IP elle girme)

- [ ] **Step 1:** Scripts ve README.
- [ ] **Step 2:** Temiz terminalde `npm install && npm test && npm start` → testler PASS, konsolda `Oyun: http://<lanIp>:8080`.
- [ ] **Step 3:** Commit `chore: start scripts and README`
