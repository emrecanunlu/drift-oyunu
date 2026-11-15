import { engineTone, squealGain, dingPitch, chordAt, midiToHz } from "./params";

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
  private eng1!: OscillatorNode;
  private eng2!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  private engGain!: GainNode;
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

    // Engine: saw + square sub through a lowpass.
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = "lowpass";
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.eng1 = ctx.createOscillator();
    this.eng1.type = "sawtooth";
    this.eng2 = ctx.createOscillator();
    this.eng2.type = "square";
    const sub = ctx.createGain();
    sub.gain.value = 0.5;
    this.eng1.connect(this.engFilter);
    this.eng2.connect(sub).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.eng1.start();
    this.eng2.start();

    // Tire squeal: looping noise through a resonant bandpass.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.squealFilter = ctx.createBiquadFilter();
    this.squealFilter.type = "bandpass";
    this.squealFilter.frequency.value = 1800;
    this.squealFilter.Q.value = 4;
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

  update(speed: number, nitro: boolean, drifting: boolean, slip: number, running: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const e = engineTone(speed, nitro);
    this.eng1.frequency.setTargetAtTime(e.freq, t, 0.05);
    this.eng2.frequency.setTargetAtTime(e.freq / 2, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(500 + e.freq * (nitro ? 6 : 4), t, 0.08);
    this.engGain.gain.setTargetAtTime(running ? e.gain : 0, t, 0.1);
    this.squeal.gain.setTargetAtTime(running ? squealGain(drifting, slip) : 0, t, 0.06);
    this.squealFilter.frequency.setTargetAtTime(1500 + Math.abs(slip) * 900, t, 0.1);
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
