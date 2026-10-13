// Moteur sonore de Girigo : thème original synthétisé en direct (Web Audio)
// + effets (glitch, battements de cœur, carillon de notification…).
const GirigoAudio = (() => {
  let ctx, master, musicBus, sfxBus, reverb, timer, nextTime = 0, step = 0;
  let musicOn = false, sfxOn = true, volume = 0.7, customEl = null, customUrl = null;

  const BPM = 64, STEP = 60 / BPM / 2; // croches
  // Mélodie de boîte à musique (ré mineur) — 32 croches, 0 = silence
  const MEL = [
    'D5', 0, 'F5', 0, 'A5', 0, 'G5', 'F5', 'E5', 0, 'C#5', 0, 'D5', 0, 0, 0,
    'A4', 0, 'D5', 0, 'F5', 0, 'E5', 'D5', 'C#5', 0, 'A4', 0, 'Bb4', 0, 'A4', 0,
    'D5', 0, 'F5', 0, 'A5', 0, 'Bb5', 'A5', 'G5', 0, 'E5', 0, 'F5', 0, 0, 'E5',
    'D5', 0, 'C#5', 0, 'E5', 0, 'A4', 0, 'D5', 0, 0, 0, 0, 0, 0, 0,
  ];
  const BASS = ['D3', 'D3', 'Bb2', 'A2', 'D3', 'G2', 'A2', 'D3']; // une note par mesure de 8 croches

  function freq(n) {
    const m = /^([A-G])(#|b)?(\d)$/.exec(n);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 440 * Math.pow(2, (base + (m[3] - 4) * 12 - 9) / 12);
  }

  function impulse(sec, decay) {
    const len = ctx.sampleRate * sec, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function noiseBuf(sec) {
    const len = ctx.sampleRate * sec, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = impulse(4, 2.5);
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    reverb.connect(wet).connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0;
    musicBus.connect(master); musicBus.connect(reverb);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1;
    sfxBus.connect(master); sfxBus.connect(reverb);
    startDrone();
  }

  // ---- nappe grave inquiétante ----
  function startDrone() {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 4;
    const g = ctx.createGain(); g.gain.value = 0.16;
    [73.42, 73.9, 36.71, 110.3].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = f;
      o.connect(lp); o.start();
    });
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 140; lfo.connect(lg).connect(lp.frequency); lfo.start();
    lp.connect(g).connect(musicBus);
  }

  function bell(f, t, dur = 2.4, vol = 0.22, bus) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus || musicBus);
    [[1, 1], [2.01, 0.35], [3.98, 0.12], [5.43, 0.05]].forEach(([r, a]) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * r; og.gain.value = a;
      o.connect(og).connect(g); o.start(t); o.stop(t + dur + 0.05);
    });
  }

  function pad(f, t, dur) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 1.005;
    lp.type = 'lowpass'; lp.frequency.value = 600;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(musicBus);
    o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
  }

  function whisper(t) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf(3);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
    bp.frequency.setValueAtTime(900 + Math.random() * 1500, t);
    bp.frequency.linearRampToValueAtTime(400 + Math.random() * 2500, t + 2.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 1.6); g.gain.linearRampToValueAtTime(0, t + 2.8);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    let node = n.connect(bp).connect(g);
    if (pan) { pan.pan.value = Math.random() * 2 - 1; node = node.connect(pan); }
    node.connect(musicBus); n.start(t);
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.2) {
      const s = step % MEL.length;
      if (MEL[s]) bell(freq(MEL[s]), nextTime, 2.6, 0.14 + Math.random() * 0.04);
      if (s % 8 === 0) {
        const b = BASS[(s / 8) % BASS.length];
        pad(freq(b), nextTime, STEP * 8.5);
        bell(freq(b) * 2, nextTime, 3.5, 0.06);
      }
      if (s === 0 && Math.random() < 0.6) whisper(nextTime + Math.random() * 4);
      nextTime += STEP * (1 + (Math.random() - 0.5) * 0.06); // léger rubato, comme une boîte à musique fatiguée
      step++;
    }
  }

  function setMusic(on) {
    musicOn = on;
    if (!ctx) return;
    if (customEl) {
      musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      clearInterval(timer); timer = null;
      if (on) customEl.play().catch(() => {}); else customEl.pause();
      return;
    }
    musicBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.8);
    if (on && !timer) { nextTime = ctx.currentTime + 0.1; timer = setInterval(schedule, 50); }
    if (!on && timer) { clearInterval(timer); timer = null; }
  }

  function setCustomTrack(blob) {
    if (customEl) { customEl.pause(); customEl = null; }
    if (customUrl) { URL.revokeObjectURL(customUrl); customUrl = null; }
    if (blob) {
      customUrl = URL.createObjectURL(blob);
      customEl = new Audio(customUrl); customEl.loop = true; customEl.volume = volume;
    }
    setMusic(musicOn);
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
    if (customEl) customEl.volume = v;
  }

  // ---------- effets ----------
  const can = () => ctx && sfxOn;

  function glitch(dur = 0.35) {
    if (!can()) return;
    const t = ctx.currentTime, n = ctx.createBufferSource(); n.buffer = noiseBuf(dur);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0.0;
    for (let i = 0; i < 10; i++) {
      const ti = t + (dur / 10) * i;
      bp.frequency.setValueAtTime(200 + Math.random() * 6000, ti);
      g.gain.setValueAtTime(Math.random() < 0.7 ? 0.35 : 0, ti);
    }
    g.gain.setValueAtTime(0, t + dur);
    n.connect(bp).connect(g).connect(sfxBus); n.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'square';
    o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(1800, t + dur);
    og.gain.setValueAtTime(0.05, t); og.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(og).connect(sfxBus); o.start(t); o.stop(t + dur);
  }

  function blip(f = 1200, d = 0.05, v = 0.08) {
    if (!can()) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.02);
  }

  function heartbeat(intensity = 1) {
    if (!can()) return;
    const t = ctx.currentTime;
    [0, 0.22].forEach((dt, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
      g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime((i ? 0.4 : 0.6) * intensity, t + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.25);
      o.connect(g).connect(master); o.start(t + dt); o.stop(t + dt + 0.3);
    });
  }

  function chime() {
    if (!can()) return;
    const t = ctx.currentTime;
    bell(freq('A5'), t, 1.6, 0.25, sfxBus);
    bell(freq('D6'), t + 0.14, 2.2, 0.22, sfxBus);
  }

  function granted() {
    if (!can()) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = noiseBuf(2.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(8000, t + 2.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 2.2); g.gain.linearRampToValueAtTime(0, t + 2.3);
    n.connect(lp).connect(g).connect(sfxBus); n.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t + 2.3); o.frequency.exponentialRampToValueAtTime(30, t + 4.5);
    og.gain.setValueAtTime(0, t + 2.3); og.gain.linearRampToValueAtTime(0.9, t + 2.31); og.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    o.connect(og).connect(sfxBus); o.start(t + 2.3); o.stop(t + 5.1);
    ['D4', 'F4', 'A4', 'C#5'].forEach((nn, i) => bell(freq(nn), t + 2.3 + i * 0.02, 5, 0.12, sfxBus));
  }

  function end() {
    if (!can()) return;
    const t = ctx.currentTime, ws = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 8); }
    ws.curve = curve;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    [55, 58.3, 82.4].forEach(f => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.frequency.linearRampToValueAtTime(f * 0.5, t + 6); o.connect(ws); o.start(t); o.stop(t + 6);
    });
    ws.connect(g).connect(sfxBus);
    glitch(1.2);
  }

  return {
    init, setMusic, setCustomTrack, setVolume,
    setSfx: v => { sfxOn = v; },
    glitch, blip, heartbeat, chime, granted, end,
    get ready() { return !!ctx; },
  };
})();
