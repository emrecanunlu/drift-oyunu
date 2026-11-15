import { engineState, squealGain, dingPitch, chordAt, midiToHz } from "./params";

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
  private squealFilter!: BiquadFilterNode;
  private squeal!: GainNode;
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

    // Tire squeal: looping noise through a resonant bandpass.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.squealFilter = ctx.createBiquadFilter();
    this.squealFilter.type = "bandpass";
    this.squealFilter.frequency.value = 1100;
    this.squealFilter.Q.value = 2;
    this.squeal = ctx.createGain();
    this.squeal.gain.value = 0;
    src.connect(this.squealFilter).connect(this.squeal).connect(this.master);
    src.start();

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

  update(speed: number, accelerating: boolean, nitro: boolean, drifting: boolean, slip: number, running: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const e = engineState(speed, accelerating, nitro);
    for (const [mult, o] of this.harmonics) o.frequency.setTargetAtTime(e.fireHz * mult, t, 0.06);
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
    this.squeal.gain.setTargetAtTime(running ? squealGain(drifting, slip) : 0, t, 0.06);
    this.squealFilter.frequency.setTargetAtTime(900 + Math.abs(slip) * 500 + Math.random() * 80, t, 0.05);
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
