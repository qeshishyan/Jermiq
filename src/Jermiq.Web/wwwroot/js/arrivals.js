/* Durable arrival cursor + non-overlapping polling; no form values are refreshed. */
(() => {
  'use strict';
  const { $, t } = window.Jermiq;
  if (!$('#admin-app')) return;
  const soundButton = $('#arrival-sound'), banner = $('#arrival-banner'), connection = $('#arrival-connection');
  const originalTitle = document.title, unread = new Set();
  let cursor = null, timer, stopped = false, active = false, pendingRefresh = false, callbacks;
  let audio = null, enabled = false, preferred = false;
  try { preferred = localStorage.getItem('jermiq.arrivalSound') === 'on'; } catch { }
  function status(text) { connection.parentElement?.classList.toggle('is-connected', text === 'Live updates connected'); const message = t(text); if (connection.textContent !== message) connection.textContent = message; }
  function soundLabel() {
    soundButton.textContent = t(enabled ? 'Mute sound' : preferred ? 'Activate sound' : 'Enable sound');
    soundButton.setAttribute('aria-pressed', String(enabled));
  }
  function render() {
    banner.hidden = unread.size === 0;
    $('#arrival-message').textContent = `${t('New requests')}: ${unread.size}`;
    document.title = unread.size ? `(${unread.size}) ${t('New requests')} · ${originalTitle}` : originalTitle;
  }
  async function chime() {
    if (!enabled || !audio) return;
    try {
      await audio.resume();
      if (!enabled) return;
      if (audio.state !== 'running') { enabled = false; soundLabel(); return; }
      for (const [offset, frequency] of [[0, 660], [.22, 880]]) {
        const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + offset;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.12, at + .02); gain.gain.exponentialRampToValueAtTime(.001, at + .2);
        oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + .22);
      }
    } catch { enabled = false; soundLabel(); }
  }
  soundButton.addEventListener('click', async () => {
    if (enabled) { enabled = false; preferred = false; }
    else {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { status('Sound is unavailable in this browser.'); return; }
      try { audio ||= new Audio(); await audio.resume(); enabled = audio.state === 'running'; preferred = enabled; }
      catch { enabled = false; }
    }
    try { localStorage.setItem('jermiq.arrivalSound', preferred ? 'on' : 'off'); } catch { }
    soundLabel(); if (enabled) void chime();
  });
  async function fetchArrivals() {
    const response = await fetch('/api/admin/arrivals' + (cursor === null ? '' : '?after=' + cursor), { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401 || response.status === 403) { stopped = true; throw new Error(t('Sign in again to receive new requests.')); }
    if (!response.ok) throw new Error(t('Connection interrupted. Retrying automatically…'));
    return response.json();
  }
  async function poll() {
    if (stopped || active) return;
    active = true; let more = false;
    try {
      const data = await fetchArrivals();
      let added = 0;
      for (const id of data.ids) if (!unread.has(id)) { unread.add(id); added++; }
      cursor = data.cursor; more = data.more;
      if (added) { pendingRefresh = true; render(); void chime(); }
      if (pendingRefresh && await callbacks.refresh()) pendingRefresh = false;
      status('Live updates connected');
    } catch (err) { status(stopped ? err.message : 'Connection interrupted. Retrying automatically…'); }
    finally { active = false; if (!stopped) timer = setTimeout(poll, more ? 100 : 3000); }
  }
  $('#arrival-open').addEventListener('click', async () => {
    if (callbacks && await callbacks.open()) { unread.clear(); render(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !active && callbacks && !stopped) { clearTimeout(timer); void poll(); }
  });
  window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); void audio?.close(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted && callbacks) { stopped = false; audio = null; enabled = false; soundLabel(); void poll(); }
  });
  soundLabel();
  window.JermiqArrivals = Object.freeze({
    async start(options) {
      if (callbacks) return;
      callbacks = options; await poll();
    }
  });
})();
