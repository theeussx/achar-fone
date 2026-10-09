import {
  STALE_MS, HISTORY_SIZE, smoothRssi, proximity, proximityLabel, estimateMeters,
  formatDistance, beepInterval, beepFrequency, namePrefixFilters, sparklinePoints,
} from './signal.js';

const $ = id => document.getElementById(id);
const ui = {
  meter: $('meter'), arc: $('arc'), state: $('state'), rssi: $('rssi'), dist: $('dist'),
  line: $('line'), msg: $('msg'), announce: $('announce'), pulse: $('pulse'),
  pick: $('pick'), stop: $('stop'), names: $('names'), snd: $('snd'), vib: $('vib'),
};

const ARC_LENGTH = 552.9;
const NO_SIGNAL_HINT_MS = 8000;

// phase: idle -> searching (sem anúncio ainda) -> tracking <-> lost
const state = {
  phase: 'idle', device: null, abort: null, startedAt: 0, hinted: false,
  rssi: null, prox: 0, lastSeen: 0, history: [],
  sound: true, vibrate: true,
  audio: null, wake: null, beepTimer: null, watchdog: null, lastSpoken: '',
};

const storage = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* modo privado: ignora */ } },
};

function arcColor(p) {
  const mix = (a, b) => Math.round(a + (b - a) * p);
  return `rgb(${mix(63, 255)},${mix(111, 74)},${mix(181, 34)})`;
}

function setMessage(text = '', kind = 'info') {
  ui.msg.textContent = text;
  ui.msg.dataset.kind = kind;
}

// ---------- renderização ----------
function render() {
  const { phase } = state;
  const tracking = phase === 'tracking';
  const p = tracking ? state.prox : 0;
  const title = { idle: 'Sem aparelho', searching: 'Procurando…', lost: 'Sinal perdido' }[phase] ?? proximityLabel(p);

  ui.arc.style.strokeDashoffset = ARC_LENGTH * (1 - p);
  ui.arc.style.stroke = arcColor(p);
  ui.state.textContent = title;
  ui.line.setAttribute('points', sparklinePoints(state.history));
  ui.pick.textContent = state.device ? 'Trocar aparelho' : 'Escolher o fone';
  ui.stop.hidden = phase === 'idle';

  if (tracking) {
    ui.rssi.textContent = `${Math.round(state.rssi)} dBm`;
    ui.dist.textContent = formatDistance(estimateMeters(state.rssi));
  } else if (phase === 'lost') {
    ui.rssi.textContent = `sem sinal há ${Math.round((Date.now() - state.lastSeen) / 1000)} s`;
    ui.dist.textContent = '';
  } else {
    ui.rssi.textContent = state.device ? (state.device.name || 'Aparelho sem nome') : '—';
    ui.dist.textContent = '';
  }

  ui.meter.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  ui.meter.setAttribute('aria-valuetext', title);
  // Leitores de tela: só anuncia quando o estado muda, não a cada leitura.
  if (title !== state.lastSpoken) { state.lastSpoken = title; ui.announce.textContent = title; }
}

// ---------- áudio, vibração, tela ativa ----------
async function ensureAudio() {
  try {
    state.audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (state.audio.state === 'suspended') await state.audio.resume();
  } catch { state.audio = null; }
}

function playBeep() {
  const ctx = state.audio;
  if (!state.sound || !ctx) return;
  const osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime;
  osc.type = 'sine'; osc.frequency.value = beepFrequency(state.prox);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.16);
}

function beepLoop() {
  if (state.phase === 'tracking') {
    playBeep();
    if (state.vibrate && navigator.vibrate) navigator.vibrate(40 + Math.round(state.prox * 60));
    ui.pulse.classList.remove('go'); void ui.pulse.offsetWidth; ui.pulse.classList.add('go');
  }
  state.beepTimer = setTimeout(beepLoop, beepInterval(state.prox));
}

async function acquireWakeLock() {
  if (!navigator.wakeLock || state.wake) return;
  try {
    state.wake = await navigator.wakeLock.request('screen');
    state.wake.addEventListener('release', () => { state.wake = null; });
  } catch { /* opcional: segue sem manter a tela ativa */ }
}

function releaseWakeLock() {
  state.wake?.release().catch(() => {});
  state.wake = null;
}

// ---------- ciclo da busca ----------
function onAdvertisement(event) {
  if (typeof event.rssi !== 'number') return;
  if (state.phase === 'lost') state.rssi = null; // recomeça a média após perda de sinal
  state.rssi = smoothRssi(state.rssi, event.rssi);
  state.prox = proximity(state.rssi);
  state.lastSeen = Date.now();
  state.history.push(state.rssi);
  if (state.history.length > HISTORY_SIZE) state.history.shift();
  state.phase = 'tracking';
  setMessage('');
  render();
}

function watchdog() {
  const now = Date.now();
  if (state.phase === 'tracking' && now - state.lastSeen > STALE_MS) {
    state.phase = 'lost';
    setMessage('Sinal perdido. Volte ao último lugar onde ele apareceu ou confira se o fone continua ligado.', 'warn');
  }
  if (state.phase === 'searching' && !state.hinted && now - state.startedAt > NO_SIGNAL_HINT_MS) {
    state.hinted = true;
    setMessage('Nenhum sinal ainda. Abra a caixinha ou coloque o fone em modo de pareamento.', 'warn');
  }
  if (state.phase === 'lost') render();
}

function stopSearch() {
  state.abort?.abort();
  state.device?.removeEventListener('advertisementreceived', onAdvertisement);
  clearTimeout(state.beepTimer); clearInterval(state.watchdog);
  state.beepTimer = state.watchdog = state.abort = null;
  releaseWakeLock();
  if (state.audio) { state.audio.close().catch(() => {}); state.audio = null; }
  Object.assign(state, { phase: 'idle', device: null, rssi: null, prox: 0, lastSeen: 0, history: [], hinted: false });
}

async function startSearch(device) {
  stopSearch();
  state.device = device;
  state.abort = new AbortController();
  state.phase = 'searching'; state.startedAt = Date.now();
  device.addEventListener('advertisementreceived', onAdvertisement);
  try {
    await device.watchAdvertisements({ signal: state.abort.signal });
  } catch (err) {
    stopSearch(); render(); throw err;
  }
  await ensureAudio();
  acquireWakeLock();
  state.beepTimer = setTimeout(beepLoop, 0);
  state.watchdog = setInterval(watchdog, 1000);
  setMessage(`Aguardando sinal de ${device.name || 'aparelho sem nome'}…`);
  render();
}

function describeError(err) {
  const text = `${err?.name} ${err?.message}`;
  if (/permissions policy|disallowed by/i.test(text)) return 'O navegador bloqueou o Bluetooth nesta página. Abra o app direto no Chrome (não dentro de outro app ou iframe).';
  switch (err?.name) {
    case 'NotFoundError': return 'Nenhum aparelho escolhido. Se a lista veio vazia, apague os nomes do campo e tente de novo.';
    case 'SecurityError': return 'Bluetooth exige HTTPS ou localhost.';
    case 'NotSupportedError': return 'Este aparelho ou navegador não consegue escutar anúncios Bluetooth.';
    case 'NotAllowedError': return 'Permissão de Bluetooth negada. Ative Bluetooth e Localização e tente de novo.';
    default: return `Erro: ${err?.message || err}`;
  }
}

async function pickDevice() {
  storage.set('names', ui.names.value);
  try {
    const filters = namePrefixFilters(ui.names.value);
    const device = await navigator.bluetooth.requestDevice(filters.length ? { filters } : { acceptAllDevices: true });
    await startSearch(device);
  } catch (err) {
    if (err?.name !== 'AbortError') setMessage(describeError(err), 'error');
  }
}

// ---------- inicialização ----------
function toggle(button, key, label) {
  button.addEventListener('click', () => {
    state[key] = !state[key];
    button.setAttribute('aria-pressed', String(state[key]));
    button.textContent = `${label}: ${state[key] ? 'ligado' : 'desligado'}`;
  });
}

ui.names.value = storage.get('names', ui.names.value);
ui.names.addEventListener('change', () => storage.set('names', ui.names.value));
ui.pick.addEventListener('click', pickDevice);
ui.stop.addEventListener('click', () => { stopSearch(); setMessage('Busca encerrada.'); render(); });
toggle(ui.snd, 'sound', 'Bipe');
toggle(ui.vib, 'vibrate', 'Vibrar');
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.device) acquireWakeLock();
});
window.addEventListener('pagehide', stopSearch);

if (!navigator.bluetooth || !('watchAdvertisements' in BluetoothDevice.prototype)) {
  ui.pick.disabled = true;
  ui.state.textContent = 'Sem suporte';
  setMessage('Use o Chrome no Android, direto no navegador. Se já estiver usando, ative chrome://flags/#enable-experimental-web-platform-features e reinicie.', 'error');
} else {
  render();
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
