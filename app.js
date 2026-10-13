// 기리고 · Girigo — application de fan (fiction).
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad2 = n => String(n).padStart(2, '0');

/* =========================================================
   Stockage
   ========================================================= */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('girigo.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('girigo.' + k, JSON.stringify(v)); } catch {} },
  clear() { try { Object.keys(localStorage).filter(k => k.startsWith('girigo.')).forEach(k => localStorage.removeItem(k)); } catch {} },
};

// Vidéos et musique importée : IndexedDB
const DB = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('girigo', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('blobs', mode), st = t.objectStore('blobs'), req = fn(st);
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    put: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {}),
    get: k => tx('readonly', s => s.get(k)).catch(() => null),
    del: k => tx('readwrite', s => s.delete(k)).catch(() => {}),
    clear: () => tx('readwrite', s => s.clear()).catch(() => {}),
  };
})();

const DEFAULTS = { musicSource: 'serie', music: true, volume: 70, sfx: true, vibe: true, spirits: true, duration: 86400 };
const settings = Object.assign({}, DEFAULTS, LS.get('settings', {}));
const saveSettings = () => LS.set('settings', settings);

let wishes = LS.get('wishes', []);
const saveWishes = () => LS.set('wishes', wishes);
const activeWishes = () => wishes.filter(w => w.status === 'active').sort((a, b) => a.deadline - b.deadline);

/* =========================================================
   Main pixelisée (canvas 58 × 90)
   ========================================================= */
const FRAME_BITS = {};
for (const [k, rows] of Object.entries(HAND_FRAMES)) {
  const b = new Uint8Array(HAND_W * HAND_H);
  rows.forEach((r, y) => { for (let x = 0; x < HAND_W; x++) if (r[x] === '#') b[y * HAND_W + x] = 1; });
  FRAME_BITS[k] = b;
}
FRAME_BITS.blank = new Uint8Array(HAND_W * HAND_H);

const hands = [];
class Hand {
  constructor(canvas, frame = 'open') {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.img = this.ctx.createImageData(HAND_W, HAND_H);
    this.bits = FRAME_BITS[frame].slice();
    this.dissolve = 0; this.order = null; this.color = [255, 255, 255];
    this.flicker = true; this.noise = 0;
    hands.push(this);
  }
  set(frame) { this.bits = FRAME_BITS[frame].slice(); this.order = null; }
  morph(frame, ms = 300) {
    const target = FRAME_BITS[frame], diff = [];
    for (let i = 0; i < target.length; i++) if (target[i] !== this.bits[i]) diff.push(i);
    shuffle(diff);
    // les pixels changent en balayage vertical + hasard, comme sur l'appli
    diff.sort((a, b) => (Math.floor(a / HAND_W) + Math.random() * 30) - (Math.floor(b / HAND_W) + Math.random() * 30));
    this.order = null;
    return new Promise(res => {
      const t0 = performance.now();
      const stepFn = now => {
        const k = Math.min(1, (now - t0) / ms), n = Math.floor(diff.length * k);
        for (let j = this._done || 0; j < n; j++) this.bits[diff[j]] = target[diff[j]];
        this._done = n;
        if (k < 1) requestAnimationFrame(stepFn); else { this._done = 0; this.bits = target.slice(); res(); }
      };
      this._done = 0; requestAnimationFrame(stepFn);
    });
  }
  draw() {
    const d = this.img.data, [r, g, b] = this.color;
    if (this.dissolve > 0 && !this.order) {
      this.order = []; for (let i = 0; i < this.bits.length; i++) if (this.bits[i]) this.order.push(i);
      shuffle(this.order);
    }
    const hidden = new Set();
    if (this.dissolve > 0 && this.order) {
      const n = Math.floor(this.order.length * this.dissolve);
      for (let j = 0; j < n; j++) hidden.add(this.order[j]);
    }
    const flickRate = this.flicker ? 0.004 + this.noise * 0.05 : 0;
    for (let i = 0; i < this.bits.length; i++) {
      let on = this.bits[i] && !hidden.has(i);
      if (flickRate && Math.random() < flickRate) on = this.noise > 0.5 ? !on : false;
      const o = i * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = on ? 255 : 0;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

let lastDraw = 0;
(function loop(t) {
  if (t - lastDraw > 66) { // ~15 i/s : rendu « écran LCD »
    lastDraw = t;
    hands.forEach(h => { if (h.c.offsetParent !== null) h.draw(); });
  }
  requestAnimationFrame(loop);
})(0);

const H = {
  home: new Hand($('#home-hand'), 'open'),
  send: new Hand($('#send-hand'), 'pray'),
  cd: new Hand($('#cd-hand'), 'pray'),
};
// icône du bouton d'enregistrement (mains jointes)
(() => { const h = new Hand($('#rec-icon'), 'pray'); h.flicker = false; })();

/* =========================================================
   Navigation
   ========================================================= */
let current = 's-home';
function show(id) {
  if (id === current) return;
  const prev = current;
  $('#' + prev).classList.remove('active');
  $('#' + id).classList.add('active');
  current = id;
  onEnter(id, prev);
}
function onEnter(id, prev) {
  if (prev === 's-record') stopCamera();
  if (id === 's-home') { if (!wishing) H.home.set('open'); updateHome(); }
  if (id === 's-counter') renderCounter(true);
  if (id === 's-wishes') renderWishes();
  if (id === 's-stats') renderStats();
  if (id === 's-settings') renderSettings();
  if (id === 's-rules') { $('#rules-ok').checked = false; $('#rules-next').disabled = true; }
}
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) { GirigoAudio.blip(900, 0.04, 0.05); show(go.dataset.go); }
  const act = e.target.closest('[data-action="wish"]');
  if (act) startWish();
});

/* =========================================================
   Effets visuels
   ========================================================= */
function glitchEl(el, ms = 400) {
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), ms);
}
function flash(red) {
  const f = $('#flash'); f.classList.toggle('red', !!red);
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}
function shake() { document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); }
function vibrate(p) { if (settings.vibe && navigator.vibrate) try { navigator.vibrate(p); } catch {} }

// glitch aléatoire du logo sur l'accueil
setInterval(() => {
  if (current === 's-home' && Math.random() < 0.35) {
    glitchEl($('#home-logo'), 150 + Math.random() * 300);
    if (Math.random() < 0.4) GirigoAudio.glitch(0.12);
  }
}, 2600);

/* =========================================================
   Notifications
   ========================================================= */
// Dans l'APK (Capacitor), les notifications sont programmées par Android lui-même :
// elles arrivent même quand l'appli est fermée.
const NATIVE = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
  ? window.Capacitor.Plugins.LocalNotifications : null;
const nid = s => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000; };
if (NATIVE) {
  NATIVE.createChannel({ id: 'girigo-son', name: 'Girigo', description: 'Compte à rebours et vœux', importance: 5, visibility: 1, vibration: true, sound: 'girigo.wav' }).catch(() => {});
  NATIVE.requestPermissions().catch(() => {});
}

let swReg = null;
if (!NATIVE && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(() => {});
}
let toastTimer;
function toast(txt) {
  $('#toast-txt').textContent = txt;
  const t = $('#toast'); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4500);
}
$('#toast').addEventListener('click', () => { $('#toast').classList.remove('show'); show('s-counter'); });

async function notify(body, { tag, silent } = {}) {
  if (!silent) { GirigoAudio.chime(); vibrate([80, 60, 80]); }
  if (document.visibilityState === 'visible') toast(body);
  if (NATIVE) {
    if (document.visibilityState !== 'visible')
      NATIVE.schedule({ notifications: [{ id: nid((tag || 'girigo') + Date.now()), title: '기리고', body, channelId: 'girigo-son' }] }).catch(() => {});
    return;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // déjà affichée dans l'appli
  const opts = { body, icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: tag || 'girigo', renotify: true, vibrate: [100, 50, 100] };
  try {
    const reg = swReg || await navigator.serviceWorker?.ready;
    if (reg) reg.showNotification('기리고', opts); else new Notification('기리고', opts);
  } catch {}
}

// Programme les notifications à l'avance quand le navigateur le permet (Notification Triggers)
async function scheduleSystemNotifications(w) {
  if (NATIVE) {
    const end = new Date(w.deadline).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    const list = milestones(w).filter(m => m.at > Date.now()).map(m => ({
      id: nid(w.id + m.key), title: '기리고', body: m.text, channelId: 'girigo-son',
      schedule: { at: new Date(m.at), allowWhileIdle: true },
    }));
    // notification permanente, impossible à balayer, tant que le compte à rebours tourne
    list.push({ id: nid(w.id + 'ongoing'), title: '기리고 · compte à rebours en cours', channelId: 'girigo-son',
      body: `« ${w.text} » — fin ${end}. Il ne peut pas être arrêté.`, ongoing: true, autoCancel: false });
    try { await NATIVE.schedule({ notifications: list }); } catch {}
    return;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted' || typeof TimestampTrigger === 'undefined') return;
  const reg = swReg || await navigator.serviceWorker?.ready;
  if (!reg) return;
  for (const m of milestones(w)) {
    if (m.at <= Date.now()) continue;
    try {
      await reg.showNotification('기리고', { body: m.text, tag: w.id + m.key, icon: 'assets/icon-192.png', showTrigger: new TimestampTrigger(m.at) });
    } catch { return; }
  }
}
async function cancelSystemNotifications(w) {
  if (NATIVE) {
    const ids = milestones(w).map(m => ({ id: nid(w.id + m.key) })).concat({ id: nid(w.id + 'ongoing') });
    try { await NATIVE.cancel({ notifications: ids }); } catch {}
    return;
  }
  try {
    const reg = swReg || await navigator.serviceWorker?.ready;
    const list = await reg.getNotifications({ includeTriggered: true });
    list.filter(n => n.tag && n.tag.startsWith(w.id)).forEach(n => n.close());
  } catch {}
}

function fmtLeft(s) {
  if (s >= 86400) { const d = Math.floor(s / 86400); return d + (d > 1 ? ' jours' : ' jour'); }
  if (s >= 3600) { const h = Math.round(s / 3600); return h + (h > 1 ? ' heures' : ' heure'); }
  if (s >= 60) { const m = Math.round(s / 60); return m + (m > 1 ? ' minutes' : ' minute'); }
  return s + ' secondes';
}
function milestones(w) {
  const total = (w.deadline - w.created) / 1000;
  const marks = new Set([total * 0.5, total * 0.25, total * 0.1, 3600, 600, 60, 10].filter(s => s < total - 5).map(Math.round));
  const list = [...marks].sort((a, b) => b - a).map(s => ({
    key: 'm' + s, at: w.deadline - s * 1000,
    text: s <= 10 ? 'Il est trop tard.' : `Il te reste ${fmtLeft(s)}.`,
  }));
  list.push({ key: 'end', at: w.deadline, text: 'Le temps est écoulé.' });
  return list;
}

/* =========================================================
   Intro
   ========================================================= */
// L'appli s'ouvre directement sur l'accueil ; la main s'assemble pixel par pixel.
(async () => {
  H.home.set('blank'); H.home.noise = 0.6;
  await sleep(250);
  await H.home.morph('open', 1400);
  H.home.noise = 0;
})();
// Les navigateurs n'autorisent le son qu'après un premier toucher.
let started = false;
function start() {
  if (started) return;
  started = true;
  GirigoAudio.init();
  GirigoAudio.setVolume(settings.volume / 100);
  GirigoAudio.setSfx(settings.sfx);
  GirigoAudio.setSource(settings.musicSource);
  loadCustomTrack();
  GirigoAudio.setMusic(settings.music);
}
document.addEventListener('pointerdown', start, { capture: true });
setTimeout(checkUnseenEnd, 1200);
// reprogramme les rappels (après un redémarrage du téléphone, par exemple)
setTimeout(() => activeWishes().forEach(scheduleSystemNotifications), 800);

/* =========================================================
   Accueil
   ========================================================= */
function updateHome() {
  const a = activeWishes()[0];
  $('#home-timer').classList.toggle('hidden', !a);
}
$('#home-hand').addEventListener('click', () => { glitchEl($('#home-logo'), 300); GirigoAudio.glitch(0.2); H.home.noise = 1; setTimeout(() => H.home.noise = 0, 250); });
$('#wish-btn').addEventListener('click', startWish);

let wishing = false;
async function startWish() {
  if (wishing) return;
  wishing = true;
  if (current !== 's-home') show('s-home');
  const btn = $('#wish-btn');
  GirigoAudio.restartTheme(); vibrate(30);
  // séquence de l'appli : la main se tourne, les deux mains se rejoignent
  btn.style.visibility = 'hidden';
  await H.home.morph('turn', 280);
  await sleep(160);
  btn.style.visibility = ''; glitchEl(btn, 300);
  await H.home.morph('join', 320);
  await sleep(120);
  await H.home.morph('pray', 300);
  await sleep(900);
  wishing = false;
  if (!LS.get('seenRules', false)) show('s-rules');
  else openCamera();
}

/* =========================================================
   Règles
   ========================================================= */
$('#rules-ok').addEventListener('change', e => { $('#rules-next').disabled = !e.target.checked; vibrate(15); });
$('#rules-next').addEventListener('click', () => { LS.set('seenRules', true); openCamera(); });
const fmtBirth = b => b ? new Date(b + 'T12:00:00').toLocaleDateString('fr-FR') : '';

/* =========================================================
   Caméra + enregistrement — comme dans l'appli : l'image et un seul bouton
   ========================================================= */
let draft = null;
let stream = null, camVideo = null, facing = 'user', recorder = null, chunks = [], recStart = 0, rafId = 0, recTimer = 0;
const MAX_REC = 30, RING = 295.3;

async function openCamera() {
  draft = { video: null };
  show('s-record');
  const hint = $('#rec-hint'); hint.classList.remove('gone');
  setTimeout(() => hint.classList.add('gone'), 4500);
  $('#rec-ring').style.strokeDashoffset = RING;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true });
  } catch {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } }); }
    catch { toast('Caméra indisponible. Ton vœu sera écrit.'); openForm(); return; }
  }
  // le canevas prend exactement le format de l'écran : rien n'est rogné
  const cv = $('#rec-canvas');
  cv.width = 720; cv.height = Math.round(720 * Math.max(1.2, innerHeight / innerWidth));
  camVideo = document.createElement('video');
  camVideo.playsInline = true; camVideo.muted = true; camVideo.srcObject = stream;
  await camVideo.play().catch(() => {});
  drawCam();
}
function stopCamera() {
  cancelAnimationFrame(rafId);
  if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.stop(); }
  recorder = null; clearInterval(recTimer);
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  $('#rec-btn').classList.remove('on');
}
function drawCam() {
  const c = $('#rec-canvas'), x = c.getContext('2d'), W = c.width, Hh = c.height;
  const frame = () => {
    x.fillStyle = '#000'; x.fillRect(0, 0, W, Hh);
    if (camVideo && camVideo.videoWidth) {
      const vw = camVideo.videoWidth, vh = camVideo.videoHeight, s = Math.max(W / vw, Hh / vh);
      const dw = vw * s, dh = vh * s;
      x.save();
      if (facing === 'user') { x.translate(W, 0); x.scale(-1, 1); }
      x.filter = 'brightness(0.85) contrast(1.1)';
      x.drawImage(camVideo, (W - dw) / 2, (Hh - dh) / 2, dw, dh);
      x.restore();
    }
    // léger grain rouge, comme sur l'écran de l'appli
    for (let i = 0; i < 140; i++) {
      x.fillStyle = Math.random() < 0.7 ? 'rgba(255,30,40,.22)' : 'rgba(255,255,255,.1)';
      x.fillRect(Math.random() * W, Math.random() * Hh, 2, 2);
    }
    // horodatage discret dans la vidéo
    x.fillStyle = 'rgba(255,255,255,.55)'; x.textBaseline = 'bottom';
    x.font = '400 22px DotGothic16, monospace';
    x.fillText(new Date().toLocaleString('fr-FR'), 28, Hh - 24);
    rafId = requestAnimationFrame(frame);
  };
  frame();
}
// double-toucher l'image pour changer de caméra
let lastTap = 0;
$('#rec-canvas').addEventListener('pointerup', () => {
  const now = Date.now();
  if (now - lastTap < 350 && !recorder) { facing = facing === 'user' ? 'environment' : 'user'; stopCamera(); openCamera(); }
  lastTap = now;
});
$('#rec-cancel').addEventListener('click', () => { stopCamera(); show('s-home'); });
$('#rec-btn').addEventListener('click', () => {
  if (!stream) return;
  if (recorder) { recorder.stop(); return; }
  const c = $('#rec-canvas'), out = c.captureStream(30);
  stream.getAudioTracks().forEach(t => out.addTrack(t));
  const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  try { recorder = new MediaRecorder(out, type ? { mimeType: type } : undefined); }
  catch { toast("L'enregistrement vidéo n'est pas pris en charge ici."); return; }
  chunks = [];
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    draft.video = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    clearInterval(recTimer); recorder = null;
    stopCamera(); openForm();
  };
  recorder.start(250); recStart = Date.now();
  $('#rec-btn').classList.add('on'); $('#rec-hint').classList.add('gone');
  vibrate(40);
  recTimer = setInterval(() => {
    const k = Math.min(1, (Date.now() - recStart) / 1000 / MAX_REC);
    $('#rec-ring').style.strokeDashoffset = RING * (1 - k);
    if (k >= 1 && recorder) recorder.stop();
  }, 100);
});

/* =========================================================
   Ton vœu (nom, date de naissance, vœu) + transmission
   ========================================================= */
let confirmUrl = null;
function openForm() {
  show('s-form');
  const v = $('#confirm-video');
  if (confirmUrl) URL.revokeObjectURL(confirmUrl), confirmUrl = null;
  if (draft.video) { confirmUrl = URL.createObjectURL(draft.video); v.src = confirmUrl; v.classList.remove('hidden'); }
  else { v.removeAttribute('src'); v.classList.add('hidden'); }
  const last = LS.get('identity', {});
  if (last.name && !$('#f-name').value) $('#f-name').value = last.name;
  if (last.birth && !$('#f-birth').value) $('#f-birth').value = last.birth;
}
$('#form-back').addEventListener('click', () => { $('#confirm-video').pause(); show('s-home'); });
$('#refilm').addEventListener('click', () => { $('#confirm-video').pause(); openCamera(); });
$('#wish-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!draft) return;
  Object.assign(draft, { name: $('#f-name').value.trim(), birth: $('#f-birth').value, text: $('#f-wish').value.trim() });
  LS.set('identity', { name: draft.name, birth: draft.birth });
  $('#f-wish').value = '';
  sendWish();
});

async function sendWish() {
  if (!draft) return;
  $('#confirm-video').pause();
  show('s-sending');
  const txt = $('#sending-txt'), bar = $('#send-progress');
  H.send.set('pray'); H.send.noise = 0.3;
  GirigoAudio.granted(); vibrate([30, 40, 30]);
  const steps = ['TRANSMISSION…', 'VÉRIFICATION DE L\'IDENTITÉ…', 'NOM : ' + draft.name.toUpperCase(), 'NÉ(E) LE ' + fmtBirth(draft.birth), 'VŒU REÇU.'];
  for (let i = 0; i < steps.length; i++) {
    txt.textContent = steps[i];
    bar.style.width = ((i + 1) / steps.length * 100) + '%';
    if (Math.random() < 0.6) GirigoAudio.blip(300 + i * 200, 0.06, 0.05);
    await sleep(480);
  }
  H.send.noise = 1;
  await sleep(300);
  flash(); shake(); vibrate(400);
  await H.send.morph('open', 500);
  H.send.noise = 0;
  txt.textContent = '기리고 A ENTENDU TON VŒU.';
  await sleep(1600);

  const now = Date.now();
  const w = {
    id: 'w' + now.toString(36), name: draft.name, birth: draft.birth, text: draft.text,
    created: now, deadline: now + settings.duration * 1000, status: 'active', realized: false,
    hasVideo: !!draft.video, notified: [],
  };
  if (draft.video) await DB.put(w.id, draft.video);

  // Règle : le compte à rebours de quelqu'un d'autre s'arrête quand un nouveau vœu est fait
  const others = activeWishes().filter(o => o.name.toLowerCase() !== w.name.toLowerCase());
  others.forEach(o => { o.status = 'stopped'; o.stoppedAt = now; cancelSystemNotifications(o); });
  wishes.unshift(w); saveWishes();
  draft = null;
  bar.style.width = '0';

  show('s-counter');
  setTimeout(() => notify('Ton vœu a été accepté. Le compte à rebours a commencé.', { tag: w.id + 'start' }), 600);
  if (others.length) setTimeout(() => notify(`Le compte à rebours de ${others.map(o => o.name).join(', ')} s'est arrêté.`), 5200);
  scheduleSystemNotifications(w);
}

/* =========================================================
   Compte à rebours
   ========================================================= */
let shownWishId = null, lastBeat = 0;
function fmtCD(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}
function renderCounter(entering) {
  const a = activeWishes()[0];
  $('#counter-empty').classList.toggle('hidden', !!a);
  $('#counter-active').classList.toggle('hidden', !a);
  if (!a) return;
  if (entering || shownWishId !== a.id) {
    shownWishId = a.id;
    $('#cd-who').textContent = `${a.name.toUpperCase()} · ${fmtBirth(a.birth)}`;
    $('#cd-what').textContent = '« ' + a.text + ' »' + (a.realized ? '  — exaucé' : '');
    $('#cd-video').classList.toggle('hidden', !a.hasVideo);
    $('#cd-realized').classList.toggle('hidden', a.realized);
    H.cd.set('pray');
  }
}

function tick() {
  const now = Date.now();
  // expirations et paliers
  for (const w of activeWishes()) {
    for (const m of milestones(w)) {
      if (now >= m.at && !w.notified.includes(m.key)) {
        w.notified.push(m.key); saveWishes();
        // ne rejoue pas les vieux paliers au retour dans l'appli
        if (now - m.at < 120000 || m.key === 'end') notify(m.text, { tag: w.id + m.key });
      }
    }
    if (now >= w.deadline) expire(w);
  }
  const a = activeWishes()[0];
  if (a) {
    const left = a.deadline - now, total = a.deadline - a.created, frac = Math.max(0, left / total);
    const str = fmtCD(left);
    $('#home-timer-val').textContent = str;
    const cd = $('#cd'); cd.textContent = str; cd.dataset.text = str;
    const days = Math.floor(left / 86400000);
    $('#cd-days').textContent = days >= 1 ? `${days} J ${pad2(Math.floor(left % 86400000 / 3600000))} H` : '';
    const urgent = left < 60000 || frac < 0.1;
    cd.classList.toggle('urgent', urgent);
    H.cd.dissolve = (1 - frac) * 0.85;
    H.cd.color = urgent ? [224, 22, 43] : [255, 255, 255];
    H.cd.noise = urgent ? 0.4 : 0;
    H.home.color = urgent ? [255, 200, 200] : [255, 255, 255];
    if (current === 's-counter') {
      renderCounter(false);
      const sec = Math.ceil(left / 1000);
      if (sec !== lastBeat) {
        lastBeat = sec;
        if (left < 60000) { GirigoAudio.heartbeat(1.2); vibrate(60); $('#s-counter').classList.remove('beat'); void cd.offsetWidth; $('#s-counter').classList.add('beat'); glitchEl(cd, 150); }
        else if (frac < 0.25 && sec % 2 === 0) GirigoAudio.heartbeat(0.6);
        else if (sec % 10 === 0) glitchEl(cd, 200);
      }
    }
  } else if (current === 's-counter' && shownWishId) { shownWishId = null; renderCounter(true); }
  updateHome();
}
setInterval(tick, 250);

function expire(w) {
  w.status = 'expired'; w.endSeen = false; saveWishes();
  if (NATIVE) NATIVE.cancel({ notifications: [{ id: nid(w.id + 'ongoing') }] }).catch(() => {});
  H.home.color = [255, 255, 255];
  showEnd(w);
}
function showEnd(w) {
  if (document.visibilityState !== 'visible') return;
  w.endSeen = true; saveWishes();
  GirigoAudio.end(); flash(true); shake(); vibrate([500, 100, 500, 100, 800]);
  $('#end-sub').textContent = `${w.name} · « ${w.text} »`;
  show('s-end');
  glitchEl($('.end-big'), 3000);
}

$('#cd-realized').addEventListener('click', () => {
  const a = activeWishes()[0]; if (!a) return;
  a.realized = true; a.realizedAt = Date.now(); saveWishes();
  GirigoAudio.chime(); flash();
  toast('Ton vœu s\'est réalisé. Le compte à rebours continue.');
  renderCounter(true);
});
$('#cd-video').addEventListener('click', () => { const a = activeWishes()[0]; if (a) playVideo(a.id); });

let modalUrl = null;
async function playVideo(id) {
  const blob = await DB.get(id);
  if (!blob) { toast('Vidéo introuvable.'); return; }
  const v = $('#modal-video');
  if (modalUrl) URL.revokeObjectURL(modalUrl);
  modalUrl = URL.createObjectURL(blob);
  v.src = modalUrl; v.classList.remove('hidden'); v.play().catch(() => {});
}
// toucher en dehors de la vidéo pour la fermer
document.addEventListener('pointerdown', e => {
  const v = $('#modal-video');
  if (!v.classList.contains('hidden') && e.target !== v) { v.pause(); v.classList.add('hidden'); }
});

/* =========================================================
   Mes vœux
   ========================================================= */
const STATUS = { active: 'EN COURS', stopped: 'SUSPENDU', expired: 'EXPIRÉ' };
function renderWishes() {
  const ul = $('#wish-list'); ul.innerHTML = '';
  if (!wishes.length) { ul.innerHTML = '<li class="dim">Aucun vœu pour l\'instant.</li>'; return; }
  for (const w of wishes) {
    const li = document.createElement('li');
    const fmt = t => new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    li.innerHTML = `
      <div class="top"><b class="who"></b><span class="st ${w.status}">${STATUS[w.status]}</span></div>
      <p class="what"></p>
      ${w.realized ? '<span class="st realized">EXAUCÉ</span>' : ''}
      <p class="meta">Fait le ${fmt(w.created)} · ${w.status === 'active' ? 'fin le ' + fmt(w.deadline) : w.status === 'stopped' ? 'arrêté le ' + fmt(w.stoppedAt) : 'expiré le ' + fmt(w.deadline)}</p>
      <div class="acts"></div>`;
    li.querySelector('.who').textContent = `${w.name.toUpperCase()} · ${fmtBirth(w.birth)}`;
    li.querySelector('.what').textContent = '« ' + w.text + ' »';
    const acts = li.querySelector('.acts');
    const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; acts.appendChild(b); };
    if (w.hasVideo) add('VIDÉO', () => playVideo(w.id));
    if (!w.realized) add('RÉALISÉ', () => { w.realized = true; w.realizedAt = Date.now(); saveWishes(); GirigoAudio.chime(); renderWishes(); });
    if (w.status === 'active') add('COMPTE À REBOURS', () => show('s-counter'));
    else add('SUPPRIMER', () => { if (confirm('Supprimer ce vœu du journal ?')) { wishes = wishes.filter(x => x !== w); saveWishes(); DB.del(w.id); renderWishes(); } });
    ul.appendChild(li);
  }
}

/* =========================================================
   Compteur
   ========================================================= */
function worldCount() {
  // compteur mondial simulé : ~1 vœu toutes les 3,7 s depuis la sortie de la série
  const base = Date.UTC(2026, 3, 24);
  return 4021 + Math.floor((Date.now() - base) / 3700) + wishes.length;
}
function soulsToday() {
  const d = new Date(), midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.floor((Date.now() - midnight) / 47000) + wishes.filter(w => w.status === 'expired' && w.deadline >= midnight).length;
}
let shownWorld = 0;
function renderStats() {
  $('#st-total').textContent = wishes.length;
  $('#st-real').textContent = wishes.filter(w => w.realized).length;
  $('#st-active').textContent = wishes.filter(w => w.status === 'active').length;
  $('#st-stop').textContent = wishes.filter(w => w.status === 'stopped').length;
  $('#st-exp').textContent = wishes.filter(w => w.status === 'expired').length;
  $('#st-souls').textContent = soulsToday().toLocaleString('fr-FR');
}
setInterval(() => {
  const target = worldCount();
  shownWorld = shownWorld ? Math.min(target, shownWorld + Math.max(1, Math.ceil((target - shownWorld) / 8))) : target - 40;
  const s = shownWorld.toLocaleString('fr-FR');
  $('#st-world').textContent = s;
  if (current === 's-stats') renderStats();
}, 120);

/* =========================================================
   Paramètres
   ========================================================= */
function renderSettings() {
  $('#set-music').checked = settings.music;
  $('#set-volume').value = settings.volume;
  $('#set-source').value = settings.musicSource;
  $('#set-sfx').checked = settings.sfx;
  $('#set-vibe').checked = settings.vibe;
  $('#set-spirits').checked = settings.spirits;
  $('#set-duration').value = String(settings.duration);
  const p = NATIVE ? 'native' : 'Notification' in window ? Notification.permission : 'unsupported';
  $('#notif-state').textContent = {
    granted: 'Notifications activées.' + (typeof TimestampTrigger === 'undefined' ? ' Garde l\'appli ouverte en arrière-plan pour recevoir les rappels.' : ''),
    denied: 'Notifications bloquées : autorise-les dans les réglages du navigateur.',
    default: 'Les notifications te préviennent quand ton temps s\'écoule.',
    native: 'Les rappels sont programmés dans Android : ils arrivent même appli fermée.',
    unsupported: 'Ce navigateur ne gère pas les notifications. Installe l\'appli sur l\'écran d\'accueil.',
  }[p];
}
$('#set-music').addEventListener('change', e => { settings.music = e.target.checked; saveSettings(); GirigoAudio.setMusic(settings.music); });
$('#set-source').addEventListener('change', e => { settings.musicSource = e.target.value; saveSettings(); GirigoAudio.setSource(settings.musicSource); });
$('#set-volume').addEventListener('input', e => { settings.volume = +e.target.value; saveSettings(); GirigoAudio.setVolume(settings.volume / 100); });
$('#set-sfx').addEventListener('change', e => { settings.sfx = e.target.checked; saveSettings(); GirigoAudio.setSfx(settings.sfx); });
$('#set-vibe').addEventListener('change', e => { settings.vibe = e.target.checked; saveSettings(); vibrate(50); });
$('#set-spirits').addEventListener('change', e => { settings.spirits = e.target.checked; saveSettings(); });
$('#set-duration').addEventListener('change', e => { settings.duration = +e.target.value; saveSettings(); toast('S\'applique à tes prochains vœux.'); });
$('#set-notif').addEventListener('click', async () => {
  if (NATIVE) {
    try { await NATIVE.requestPermissions(); } catch {}
    activeWishes().forEach(scheduleSystemNotifications);
    notify('Les notifications de Girigo sont activées.');
    return;
  }
  if (!('Notification' in window)) { renderSettings(); return; }
  await Notification.requestPermission();
  renderSettings();
  if (Notification.permission === 'granted') { activeWishes().forEach(scheduleSystemNotifications); notify('Les notifications de Girigo sont activées.'); }
});
$('#set-test').addEventListener('click', () => notify('Quelqu\'un vient de faire un vœu.'));
$('#set-track').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  await DB.put('music', f); LS.set('trackName', f.name);
  GirigoAudio.setCustomTrack(f);
  $('#track-state').textContent = 'Musique : ' + f.name;
});
$('#set-track-reset').addEventListener('click', async () => {
  await DB.del('music'); LS.set('trackName', null);
  GirigoAudio.setCustomTrack(null);
  $('#track-state').textContent = 'Musique de Girigo.';
});
async function loadCustomTrack() {
  const name = LS.get('trackName', null);
  if (!name) return;
  const blob = await DB.get('music');
  if (blob) { GirigoAudio.setCustomTrack(blob); $('#track-state').textContent = 'Musique : ' + name; }
}
$('#set-reset').addEventListener('click', async () => {
  if (activeWishes().length) {
    GirigoAudio.glitch(0.4); shake(); vibrate([200, 80, 200]);
    toast('Un vœu ne peut jamais être annulé. Le compte à rebours continuera.');
    return;
  }
  if (!confirm('Effacer tous les vœux, vidéos et réglages ?')) return;
  wishes.forEach(cancelSystemNotifications);
  LS.clear(); await DB.clear();
  location.reload();
});

/* =========================================================
   Apparitions (« seuls ceux qui ont fait un vœu peuvent les voir »)
   ========================================================= */
(function spiritLoop() {
  const a = activeWishes()[0];
  let delay = 40000 + Math.random() * 40000;
  if (a && settings.spirits && document.visibilityState === 'visible' && ['s-home', 's-counter'].includes(current)) {
    const frac = (a.deadline - Date.now()) / (a.deadline - a.created);
    delay = 12000 + frac * 50000 + Math.random() * 15000;
    const s = $('#spirit');
    s.style.setProperty('--sx', (15 + Math.random() * 70) + '%');
    s.classList.remove('show'); void s.offsetWidth; s.classList.add('show');
    GirigoAudio.glitch(0.25);
    if (frac < 0.3) { H.home.noise = 1; H.cd.noise = 1; setTimeout(() => { H.home.noise = 0; }, 500); }
  }
  setTimeout(spiritLoop, delay);
})();

/* =========================================================
   Divers
   ========================================================= */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { tick(); checkUnseenEnd(); }
});
function checkUnseenEnd() {
  const w = wishes.find(x => x.status === 'expired' && x.endSeen === false);
  if (w) showEnd(w);
}
// bouton retour Android : revient à l'accueil plutôt que de quitter
history.pushState(null, '', location.href);
window.addEventListener('popstate', () => {
  history.pushState(null, '', location.href);
  if (current !== 's-home' && current !== 's-sending') show(current === 's-record' ? 's-form' : 's-home');
});
// au démarrage, ouvrir directement sur le compte à rebours si une notification y renvoie
if (location.hash === '#compte') setTimeout(() => show('s-counter'), 50);
renderSettings();
tick();
