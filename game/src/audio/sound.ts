import { engineState, dingPitch, chordAt, midiToHz } from "./params";
import { tireMix, type Surface } from "./tires";

const BPM = 92;
const EIGHTH = 60 / BPM / 2;
const LOOKAHEAD = 0.15;

function noiseBuffer(ctx: AudioContext, secs: number): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * secs, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** All game audio, synthesized with Web Audio. Call start() from a user gesture. */
export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  /** [multiple of firing freq, oscillator] */
  private harmonics: [number, OscillatorNode][] = [];
  private rumble!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  private engGain!: GainNode;
  private intake!: GainNode;
  private lastGear = 1;
  private dipUntil = 0;
  private screechBands: BiquadFilterNode[] = [];
  private screech!: GainNode;
  private flutter!: GainNode;
  private scrubFilter!: BiquadFilterNode;
  private scrub!: GainNode;
  private crunchFilter!: BiquadFilterNode;
  private crunch!: GainNode;
  private music!: GainNode;
  private nextNote = 0;
  private step = 0;
  muted = false;

  get started(): boolean {
    return this.ctx !== null;
  }

  start(): void {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 2);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // Engine: harmonics of the firing frequency → soft saturation → lowpass,
    // amplitude-modulated at half the firing rate for a pulsing rumble.
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = "lowpass";
    this.engFilter.Q.value = 0.7;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 512 - 1) * 2.2);
    shaper.curve = curve;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    const spec: [number, OscillatorType, number][] = [
      [0.5, "sine", 0.7], [1, "sine", 1], [2, "triangle", 0.35], [3, "sine", 0.15], [4, "triangle", 0.06],
    ];
    for (const [mult, type, amp] of spec) {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g).connect(mix);
      o.start();
      this.harmonics.push([mult, o]);
    }
    const am = ctx.createGain();
    am.gain.value = 0.75;
    this.rumble = ctx.createOscillator();
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    this.rumble.connect(depth).connect(am.gain);
    this.rumble.start();
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    mix.connect(shaper).connect(this.engFilter).connect(am).connect(this.engGain).connect(this.master);

    // Intake/exhaust hiss under load.
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const hissF = ctx.createBiquadFilter();
    hissF.type = "bandpass";
    hissF.frequency.value = 450;
    hissF.Q.value = 0.8;
    this.intake = ctx.createGain();
    this.intake.gain.value = 0;
    hiss.connect(hissF).connect(this.intake).connect(this.master);
    hiss.start();

    // Tires. Screech: noise through two sharp resonances (rubber stick-slip tone + overtone),
    // with a fast flutter on the level. Scrub: broadband hiss. Crunch: grainy lowish noise.
    const noiseSrc = () => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start(0, Math.random() * 2);
      return s;
    };
    const tone = noiseSrc();
    this.screechBands = [900, 1780].map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = "bandpass";
      b.frequency.value = f;
      b.Q.value = i ? 22 : 16;
      tone.connect(b);
      return b;
    });
    this.screech = ctx.createGain();
    this.screech.gain.value = 0;
    const flutter = ctx.createGain(); // modulated per update for stick-slip chatter
    this.flutter = flutter;
    const boost = ctx.createGain();
    boost.gain.value = 6; // narrow bands are quiet; bring them up
    for (const b of this.screechBands) b.connect(boost);
    boost.connect(flutter).connect(this.screech).connect(this.master);

    this.scrubFilter = ctx.createBiquadFilter();
    this.scrubFilter.type = "lowpass";
    this.scrub = ctx.createGain();
    this.scrub.gain.value = 0;
    noiseSrc().connect(this.scrubFilter).connect(this.scrub).connect(this.master);

    this.crunchFilter = ctx.createBiquadFilter();
    this.crunchFilter.type = "bandpass";
    this.crunchFilter.Q.value = 0.9;
    this.crunch = ctx.createGain();
    this.crunch.gain.value = 0;
    noiseSrc().connect(this.crunchFilter).connect(this.crunch).connect(this.master);

    // Music bus.
    this.music = ctx.createGain();
    this.music.gain.value = 0.55;
    this.music.connect(this.master);
    this.nextNote = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 25);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  update(speed: number, accelerating: boolean, nitro: boolean, drifting: boolean, slip: number, running: boolean, surface: Surface): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const e = engineState(speed, accelerating, nitro);
    const hz = e.fireHz * (t < this.blipUntil ? 1.45 : 1); // throttle blip
    for (const [mult, o] of this.harmonics) o.frequency.setTargetAtTime(hz * mult, t, t < this.blipUntil ? 0.03 : 0.06);
    this.rumble.frequency.setTargetAtTime(e.fireHz / 2, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(e.cutoff, t, 0.12);
    const gain = running ? e.gain : 0;
    if (e.gear !== this.lastGear && running) {
      // Gear change: brief lift-off.
      this.engGain.gain.cancelScheduledValues(t);
      this.engGain.gain.setTargetAtTime(gain * 0.35, t, 0.02);
      this.engGain.gain.setTargetAtTime(gain, t + 0.12, 0.05);
      this.dipUntil = t + 0.14;
    } else if (t >= this.dipUntil) {
      this.engGain.gain.setTargetAtTime(gain, t, 0.15);
    }
    this.lastGear = e.gear;
    this.intake.gain.setTargetAtTime(running ? 0.012 + e.load * 0.03 * (e.rpm / 7000) : 0, t, 0.15);
    const m = tireMix(surface, running && drifting, slip, running ? speed : 0);
    // Pitch rises a little with slip and wanders randomly (no two screeches alike).
    const pitch = 1 + Math.abs(slip) * 0.25 + (Math.random() - 0.5) * 0.08;
    this.screechBands[0].frequency.setTargetAtTime(820 * pitch, t, 0.04);
    this.screechBands[1].frequency.setTargetAtTime(1640 * pitch, t, 0.04);
    this.flutter.gain.setTargetAtTime(0.55 + Math.random() * 0.45, t, 0.01);
    this.screech.gain.setTargetAtTime(m.screech, t, 0.05);
    this.scrubFilter.frequency.setTargetAtTime(m.scrubHz, t, 0.1);
    this.scrub.gain.setTargetAtTime(m.scrub, t, 0.08);
    this.crunchFilter.frequency.setTargetAtTime(m.crunchHz * (0.8 + Math.random() * 0.4) || 400, t, 0.02);
    this.crunch.gain.setTargetAtTime(m.crunch * (0.4 + Math.random() * 0.9), t, 0.015);
  }

  ding(multiplier: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const f = dingPitch(multiplier);
    [0, 0.07].forEach((delay, i) => {
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = i ? f * 1.5 : f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.4);
    });
  }

  whoosh(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3500, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.7);
  }

  private blipUntil = 0;
  private roar: GainNode | null = null;
  private nextWoo = 0;

  /** Rev-matching throttle blip on a downshift. */
  blip(): void {
    if (this.ctx) this.blipUntil = this.ctx.currentTime + 0.18;
  }

  /** One exhaust backfire: sharp crack + low thump. */
  pop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 250 + Math.random() * 350;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07 + Math.random() * 0.05);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.15);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.12);
  }

  /** Hitting spectators: body thump, crunch and a short scream. */
  crash(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(110, t);
    thump.frequency.exponentialRampToValueAtTime(35, t + 0.25);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    thump.connect(tg).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.35);
    // Scream: a few detuned voices through a vowel-ish formant, gliding down.
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = 1100;
    formant.Q.value = 3;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t + 0.05);
    sg.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    formant.connect(sg).connect(this.master);
    for (let i = 0; i < 3; i++) {
      const v = ctx.createOscillator();
      v.type = "sawtooth";
      const f0 = 520 + Math.random() * 260;
      v.frequency.setValueAtTime(f0, t + 0.05);
      v.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.9);
      const vib = ctx.createOscillator();
      vib.frequency.value = 6 + Math.random() * 3;
      const vd = ctx.createGain();
      vd.gain.value = 18;
      vib.connect(vd).connect(v.frequency);
      v.connect(formant);
      v.start(t + 0.05);
      vib.start(t + 0.05);
      v.stop(t + 0.95);
      vib.stop(t + 0.95);
    }
  }

  /** Crowd roar level 0..1 (spectators cheering near the car); occasional "woo!". */
  crowd(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.roar) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 0.6;
      this.roar = ctx.createGain();
      this.roar.gain.value = 0;
      src.connect(bp).connect(this.roar).connect(this.master);
      src.start();
    }
    const t = ctx.currentTime;
    this.roar.gain.setTargetAtTime(level * (0.07 + Math.random() * 0.05), t, 0.08);
    if (level > 0.2 && t > this.nextWoo) {
      this.nextWoo = t + 0.25 + Math.random() * 0.6;
      const o = ctx.createOscillator();
      o.type = "triangle";
      const f = 500 + Math.random() * 400;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 * level, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.6);
    }
  }

  private schedule(): void {
    const ctx = this.ctx!;
    while (this.nextNote < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextNote);
      this.nextNote += EIGHTH;
      this.step++;
    }
  }

  /** One eighth-note of the synthwave loop: pad per bar, bass + arp per eighth, kick, hat. */
  private playStep(step: number, t: number): void {
    const ctx = this.ctx!;
    const bar = Math.floor(step / 8);
    const pos = step % 8;
    const chord = chordAt(bar);
    const env = (g: GainNode, peak: number, attack: number, len: number) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    };
    const voice = (type: OscillatorType, freq: number, peak: number, attack: number, len: number, cutoff: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = cutoff;
      const g = ctx.createGain();
      env(g, peak, attack, len);
      o.connect(f).connect(g).connect(this.music);
      o.start(t);
      o.stop(t + len + 0.05);
    };

    if (pos === 0) {
      for (const n of chord) for (const d of [-7, 7]) voice("sawtooth", midiToHz(n), 0.022, 0.6, EIGHTH * 8, 1100, d);
    }
    voice("square", midiToHz(chord[0] - 12), 0.05, 0.01, EIGHTH * 0.9, 380);
    voice("triangle", midiToHz(chord[pos % 3] + 12), 0.025, 0.005, EIGHTH * 0.8, 2400);

    if (pos === 0 || pos === 4) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      const g = ctx.createGain();
      env(g, 0.22, 0.005, 0.25);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + 0.3);
    }
    if (pos % 2 === 1) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 7000;
      const g = ctx.createGain();
      env(g, 0.03, 0.002, 0.05);
      src.connect(f).connect(g).connect(this.music);
      src.start(t, Math.random());
      src.stop(t + 0.06);
    }
  }
}
