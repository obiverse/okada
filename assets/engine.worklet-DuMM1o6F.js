// From artlab/labs/garage (the KẸ̀KẸ́ ÀṢẸ engine lab), unchanged: the combustion-pulse engine.
// The engine's voice, sample by sample (an AudioWorklet: plain JS, it runs on the audio thread).
//
// Not an oscillator. A real engine is a train of combustions: each cylinder fires once every 720°
// of crank, at its own angle (a V-twin's 0° and 270° give the uneven, loping beat). Each firing here
// is a soft, resonant THUMP (an impulse through a low body resonance) plus a short breath of air
// (combustion noise, low-passed). The rhythm and the body are what you hear, not a buzzing note.
//
//   params (k-rate): rpm · load (throttle as the engine sees it, 0..1) · cut (1 = ignition cut / limiter)
//   port message:     { layout: [deg…], body, bodyQ, breath, burble }
//
// Off-throttle at speed, some firings misfire and pop later in the pipe: the burble.
class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 1000, minValue: 0, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'cut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.layout = [0, 270];
    this.body = 88; this.bodyQ = 2.2; this.breath = 0.25; this.burble = 0.6;
    this.phase = 0; // crank angle, degrees in a 720° cycle
    this.rpm = 1000; this.load = 0;
    // body resonator (state-variable filter) and breath lowpass state
    this.lp = 0; this.bp = 0; this.air = 0; this.airEnv = 0;
    this.kick = 0; // impulse to inject into the body this sample
    this.pops = []; // pending pops: samples until they go off
    this.popEnv = 0; this.popLp = 0;
    this.seed = 12345;
    this.port.onmessage = (e) => Object.assign(this, e.data);
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  process(_in, outputs, params) {
    const out = outputs[0][0];
    const rpmT = params.rpm[0], loadT = params.load[0], cut = params.cut[0] > 0.5;
    const sr = sampleRate, n = out.length;
    for (let i = 0; i < n; i++) {
      // Glide the controls inside the block: no zipper noise.
      this.rpm += (rpmT - this.rpm) * 0.0015;
      this.load += (loadT - this.load) * 0.002;
      const prev = this.phase;
      this.phase = (this.phase + (this.rpm / 60) * 720 / sr) % 720;
      for (const a of this.layout) {
        const crossed = prev <= a ? this.phase > a || this.phase < prev : this.phase > a && this.phase < prev;
        if (!crossed) continue;
        const coasting = this.load < 0.08 && this.rpm > 2600;
        if (cut || (coasting && this.rnd() < 0.35 * this.burble)) {
          // No combustion now. Coasting: the unburnt charge pops a moment later in the pipe.
          if (coasting && !cut && this.rnd() < 0.6) this.pops.push(Math.floor(sr * (0.01 + this.rnd() * 0.05)));
          this.kick += 0.08; // compression alone: a faint push
          continue;
        }
        const strength = (0.32 + 0.68 * this.load) * (0.9 + this.rnd() * 0.2); // no two firings alike
        this.kick += strength;
        this.airEnv = Math.max(this.airEnv, strength);
      }
      // Pops: a soft, low crack (filtered noise with a fast decay).
      for (let k = this.pops.length - 1; k >= 0; k--) if (--this.pops[k] <= 0) { this.popEnv = Math.min(1.2, this.popEnv + 0.6 + this.rnd() * 0.4); this.pops.splice(k, 1); }

      // The body: an impulse through a resonant state-variable filter (a struck drum, not a beep).
      const f = 2 * Math.sin(Math.PI * Math.min(this.body * (1 + this.rpm / 26000), sr / 6) / sr), q = 1 / this.bodyQ;
      const x = this.kick * 40; this.kick = 0;
      this.lp += f * this.bp;
      const hp = x - this.lp - q * this.bp;
      this.bp += f * hp;
      // Breath: noise shaped by each firing's envelope, low-passed (combustion and intake air).
      this.airEnv *= 1 - 60 / sr;
      const noise = this.rnd() * 2 - 1;
      this.air += (noise * this.airEnv - this.air) * 0.08;
      // Pop: brighter noise, fast decay, still low-passed.
      this.popEnv *= 1 - 40 / sr;
      this.popLp += ((this.rnd() * 2 - 1) * this.popEnv - this.popLp) * 0.18;
      out[i] = this.bp * 0.11 + this.lp * 0.035 + this.air * this.breath * 0.9 + this.popLp * 0.5 * this.burble;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('engine', EngineProcessor);
