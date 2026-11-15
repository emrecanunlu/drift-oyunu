import { engineState, dingPitch, chordAt, midiToHz } from "./params";
import { tireMix, type Surface } from "./tires";
import { musicLayers } from "./intensity";

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
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = musicLayers(0).cutoff;
    this.music.connect(this.musicFilter).connect(this.master);
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

  // ---- Crowd: formant-based voices (babble, shouts), claps and whistles ----
  private babble: { f1: BiquadFilterNode; f2: BiquadFilterNode; amp: GainNode; next: number }[] = [];
  private crowdBus: GainNode | null = null;
  private nextShout = 0;
  private nextClap = 0;
  private nextWhistle = 0;

  /** Vowel formants (F1, F2, F3) in Hz. */
  private static VOWELS: [number, number, number][] = [
    [800, 1200, 2500], // a
    [500, 1800, 2500], // e
    [500, 900, 2400], // o
    [320, 2300, 3000], // i
    [350, 800, 2300], // u
  ];

  /** Crowd level 0..1 (cheering spectators near the car). */
  crowd(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (!this.crowdBus) {
      this.crowdBus = ctx.createGain();
      this.crowdBus.gain.value = 0;
      const warm = ctx.createBiquadFilter();
      warm.type = "lowpass";
      warm.frequency.value = 4500;
      this.crowdBus.connect(warm).connect(this.master);
      // Four "clusters" of people talking/cheering: noise through moving vowel formants.
      for (let i = 0; i < 4; i++) {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        const f1 = ctx.createBiquadFilter();
        f1.type = "bandpass";
        f1.Q.value = 7;
        const f2 = ctx.createBiquadFilter();
        f2.type = "bandpass";
        f2.Q.value = 9;
        const amp = ctx.createGain();
        amp.gain.value = 0;
        const mix = ctx.createGain();
        mix.gain.value = 3;
        src.connect(f1).connect(mix);
        src.connect(f2).connect(mix);
        mix.connect(amp).connect(this.crowdBus);
        src.start(0, Math.random() * 2);
        this.babble.push({ f1, f2, amp, next: 0 });
      }
    }
    this.crowdBus.gain.setTargetAtTime(level * 0.5, t, 0.25);
    if (level < 0.02) return;

    // Babble: each cluster changes vowel and loudness at a syllable-ish rate.
    for (const b of this.babble) {
      if (t < b.next) continue;
      b.next = t + 0.12 + Math.random() * 0.25;
      const [a1, a2] = Sound.VOWELS[Math.floor(Math.random() * Sound.VOWELS.length)];
      const k = 0.85 + Math.random() * 0.3;
      b.f1.frequency.setTargetAtTime(a1 * k, t, 0.05);
      b.f2.frequency.setTargetAtTime(a2 * k, t, 0.05);
      b.amp.gain.setTargetAtTime(0.08 + Math.random() * 0.14, t, 0.04);
    }

    // Shouts: a real voiced "hey!" / "woo!" from someone in the crowd.
    if (t > this.nextShout) {
      this.nextShout = t + (0.35 + Math.random() * 1.1) / (0.4 + level);
      this.shout(Math.random() < 0.5 ? "hey" : "woo", level);
    }
    // Claps: more people → denser clapping.
    if (t > this.nextClap) {
      this.nextClap = t + (0.03 + Math.random() * 0.12) / (0.3 + level);
      this.clap(level);
    }
    if (level > 0.4 && t > this.nextWhistle) {
      this.nextWhistle = t + 2 + Math.random() * 4;
      this.whistle();
    }
  }

  /** A voiced shout: sawtooth "vocal folds" with vibrato, through three vowel formants. */
  private shout(kind: "hey" | "woo", level: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + Math.random() * 0.05;
    const male = Math.random() < 0.55;
    const f0 = (male ? 120 : 210) * (0.9 + Math.random() * 0.35);
    const dur = kind === "hey" ? 0.28 + Math.random() * 0.12 : 0.55 + Math.random() * 0.3;
    const glottis = ctx.createOscillator();
    glottis.type = "sawtooth";
    if (kind === "hey") {
      glottis.frequency.setValueAtTime(f0 * 1.35, t);
      glottis.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + dur);
    } else {
      glottis.frequency.setValueAtTime(f0, t);
      glottis.frequency.exponentialRampToValueAtTime(f0 * 1.9, t + dur * 0.55);
      glottis.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + dur);
    }
    const vib = ctx.createOscillator();
    vib.frequency.value = 5 + Math.random() * 2;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = f0 * 0.03;
    vib.connect(vibDepth).connect(glottis.frequency);
    // "hey" = e → i, "woo" = u → o
    const [from, to] = kind === "hey" ? [Sound.VOWELS[1], Sound.VOWELS[3]] : [Sound.VOWELS[4], Sound.VOWELS[2]];
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.06 + level * 0.06, t + 0.04);
    out.gain.setValueAtTime(0.06 + level * 0.06, t + dur * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // Breath noise mixed in for realism.
    const breath = ctx.createBufferSource();
    breath.buffer = this.noise;
    const bg = ctx.createGain();
    bg.gain.value = 0.15;
    breath.connect(bg);
    from.forEach((f, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = [6, 9, 11][i];
      bp.frequency.setValueAtTime(f, t);
      bp.frequency.linearRampToValueAtTime(to[i], t + dur * 0.8);
      const g = ctx.createGain();
      g.gain.value = [1, 0.6, 0.25][i] * 4;
      glottis.connect(bp);
      bg.connect(bp);
      bp.connect(g).connect(out);
    });
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    out.connect(pan).connect(this.crowdBus!);
    glottis.start(t);
    vib.start(t);
    breath.start(t, Math.random());
    glottis.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
    breath.stop(t + dur + 0.05);
  }

  private clap(level: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1100 + Math.random() * 1400;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 + level * 0.06, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.03);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    src.connect(bp).connect(g).connect(pan).connect(this.crowdBus!);
    src.start(t, Math.random() * 1.9);
    src.stop(t + 0.08);
  }

  private whistle() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const f = 1900 + Math.random() * 700;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.25);
    o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    o.connect(g).connect(this.crowdBus!);
    o.start(t);
    o.stop(t + 0.8);
  }


  private sirenOscs: OscillatorNode[] = [];
  private sirenGain: GainNode | null = null;

  /**
   * Police siren ("wail"). The rise/fall is a slow LFO inside the audio graph, so it is perfectly
   * smooth regardless of frame rate; doppler is applied as detune. level 0..1, doppler = pitch ratio.
   */
  siren(level: number, doppler: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.sirenGain) {
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 1 / 3.6; // one wail every 3.6 s
      const depth = ctx.createGain();
      depth.gain.value = 330; // ±330 Hz around the centre
      lfo.connect(depth);
      const tone = ctx.createGain();
      tone.gain.value = 0.5;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0;
      for (const [type, amp] of [["triangle", 1], ["square", 0.18]] as [OscillatorType, number][]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = 980;
        depth.connect(o.frequency);
        const g = ctx.createGain();
        g.gain.value = amp;
        o.connect(g).connect(tone);
        o.start();
        this.sirenOscs.push(o);
      }
      tone.connect(lp).connect(this.sirenGain).connect(this.master);
      lfo.start();
    }
    const t = ctx.currentTime;
    const cents = 1200 * Math.log2(Math.max(0.92, Math.min(1.08, doppler)));
    for (const o of this.sirenOscs) o.detune.setTargetAtTime(cents, t, 0.25);
    this.sirenGain.gain.setTargetAtTime(level * level * 0.09, t, 0.3);
  }

  private layers = musicLayers(0);
  private musicFilter: BiquadFilterNode | null = null;

  /** Music builds up with the combo multiplier (0 = no combo); combo-ups get a riser. */
  setCombo(multiplier: number, rising = false): void {
    this.layers = musicLayers(multiplier);
    const ctx = this.ctx;
    if (!ctx || !this.musicFilter) return;
    this.musicFilter.frequency.setTargetAtTime(this.layers.cutoff, ctx.currentTime, 0.3);
    if (rising && multiplier >= 2) {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 2;
      f.frequency.setValueAtTime(600, t);
      f.frequency.exponentialRampToValueAtTime(5000 + multiplier * 400, t + 0.35);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 + multiplier * 0.012, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      src.connect(f).connect(g).connect(this.master);
      src.start(t, Math.random());
      src.stop(t + 0.5);
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
    voice("triangle", midiToHz(chord[pos % 3] + (this.layers.arpUp ? 24 : 12)), this.layers.arpUp ? 0.035 : 0.025, 0.005, EIGHTH * 0.8, 3200);

    if (pos === 0 || pos === 4 || (this.layers.kickEveryBeat && pos % 2 === 0)) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      const g = ctx.createGain();
      env(g, 0.22, 0.005, 0.25);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + 0.3);
    }
    if (pos % 2 === 1 || this.layers.hat16) {
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
