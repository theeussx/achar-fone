(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = 552.9, STALE_MS = 6000, TX_POWER = -59, PATH_LOSS = 2.2, HISTORY = 60;
  const el = { arc: $('arc'), state: $('state'), rssi: $('rssi'), dist: $('dist'), msg: $('msg'),
    pulse: $('pulse'), pick: $('pick'), snd: $('snd'), vib: $('vib'), names: $('names'), line: $('line') };
  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };
  const s = { sound: true, vibrate: true, device: null, smooth: null, prox: 0, lastSeen: 0,
    beepTimer: null, history: [], ctx: null, wake: null };

  el.names.value = store.get('names', el.names.value);
  const say = t => { el.msg.textContent = t || ''; };

  const supported = !!navigator.bluetooth && 'watchAdvertisements' in BluetoothDevice.prototype;
  if (!supported) {
    el.state.textContent = 'Sem suporte';
    say('Abra no Chrome do Android, direto no navegador. Se já estiver, ative chrome://flags/#enable-experimental-web-platform-features e reinicie.');
    el.pick.disabled = true;
  }

  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const color = t => `rgb(${lerp(63,255,t)},${lerp(111,74,t)},${lerp(181,34,t)})`;
  const label = p => p > .85 ? 'Está aqui!' : p > .65 ? 'Muito perto' : p > .45 ? 'Perto' : p > .25 ? 'Longe' : 'Muito longe';
  const meters = rssi => 10 ** ((TX_POWER - rssi) / (10 * PATH_LOSS));

  function render() {
    el.arc.style.strokeDashoffset = C * (1 - s.prox);
    el.arc.style.stroke = color(s.prox);
    el.state.textContent = label(s.prox);
    const pts = s.history.map((v, i) =>
      `${(i / (HISTORY - 1) * 120).toFixed(1)},${(30 - Math.max(0, Math.min(1, (v + 100) / 70)) * 28 - 1).toFixed(1)}`);
    el.line.setAttribute('points', pts.join(' '));
  }

  function prefixes() {
    const out = new Set();
    el.names.value.split(',').map(x => x.trim()).filter(Boolean).forEach(n => {
      [n, n.toLowerCase(), n.toUpperCase(), n[0].toUpperCase() + n.slice(1).toLowerCase()].forEach(v => out.add(v));
    });
    return [...out].map(namePrefix => ({ namePrefix }));
  }

  function beep() {
    if (!s.sound || !s.ctx) return;
    const o = s.ctx.createOscillator(), g = s.ctx.createGain(), t = s.ctx.currentTime;
    o.type = 'sine'; o.frequency.value = 500 + s.prox * 700;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(.4, t + .01);
    g.gain.exponentialRampToValueAtTime(.0001, t + .14);
    o.connect(g); g.connect(s.ctx.destination); o.start(); o.stop(t + .16);
  }

  function tick() {
    if (s.device && Date.now() - s.lastSeen <= STALE_MS) {
      beep();
      if (s.vibrate && navigator.vibrate) navigator.vibrate(40 + Math.round(s.prox * 60));
      el.pulse.classList.remove('go'); void el.pulse.offsetWidth; el.pulse.classList.add('go');
    }
    s.beepTimer = setTimeout(tick, Math.round(1300 - s.prox * 1150));
  }

  function onAd(e) {
    if (typeof e.rssi !== 'number') return;
    s.lastSeen = Date.now();
    s.smooth = s.smooth === null ? e.rssi : s.smooth * .6 + e.rssi * .4;
    s.prox = Math.max(0, Math.min(1, (s.smooth + 95) / 60));
    s.history.push(s.smooth); if (s.history.length > HISTORY) s.history.shift();
    el.rssi.textContent = `${Math.round(s.smooth)} dBm`;
    const m = meters(s.smooth);
    el.dist.textContent = m < 1 ? 'menos de 1 m (estimativa)' : `≈ ${Math.round(m)} m (estimativa)`;
    say(''); render();
  }

  async function keepAwake() {
    try { s.wake = await navigator.wakeLock?.request('screen'); } catch {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && s.device) keepAwake();
  });

  el.pick.addEventListener('click', async () => {
    try {
      s.ctx = s.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (s.ctx.state === 'suspended') await s.ctx.resume();
      store.set('names', el.names.value);
      const f = prefixes();
      const opts = f.length ? { filters: f } : { acceptAllDevices: true };
      const d = await navigator.bluetooth.requestDevice(opts);
      if (s.device) s.device.removeEventListener('advertisementreceived', onAd);
      Object.assign(s, { device: d, smooth: null, prox: 0, lastSeen: 0, history: [] });
      d.addEventListener('advertisementreceived', onAd);
      await d.watchAdvertisements();
      el.pick.textContent = 'Trocar aparelho';
      el.state.textContent = 'Procurando…';
      el.rssi.textContent = d.name || 'Aparelho sem nome';
      el.dist.textContent = '';
      say(`Aguardando sinal de ${d.name || 'aparelho'}…`);
      keepAwake();
      clearTimeout(s.beepTimer); tick();
      setTimeout(() => { if (s.device === d && !s.lastSeen) say('Nenhum sinal ainda. Abra a caixinha ou coloque o fone em modo de pareamento.'); }, 8000);
    } catch (err) {
      say(err?.name === 'NotFoundError' ? 'Nenhum aparelho escolhido. Se a lista veio vazia, apague os nomes do campo e tente de novo.' : `Erro: ${err?.message || err}`);
    }
  });

  setInterval(() => {
    if (s.device && s.lastSeen && Date.now() - s.lastSeen > STALE_MS) {
      el.state.textContent = 'Sinal perdido';
      el.rssi.textContent = `sem sinal há ${Math.round((Date.now() - s.lastSeen) / 1000)} s`;
      el.dist.textContent = '';
      el.arc.style.strokeDashoffset = C;
    }
  }, 1000);

  el.snd.addEventListener('click', () => { s.sound = !s.sound; el.snd.textContent = `Bipe: ${s.sound ? 'ligado' : 'desligado'}`; });
  el.vib.addEventListener('click', () => { s.vibrate = !s.vibrate; el.vib.textContent = `Vibrar: ${s.vibrate ? 'ligado' : 'desligado'}`; });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
