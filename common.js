// Shared helpers for the KNK Kafé and KNK Pantry apps

async function api(action, ...args) {
  const url = window.KNK_API_URL || '';
  if (!/^https:\/\/script\.google\.com\//.test(url)) throw new Error('App is not set up yet: add the web app URL in config.js.');
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // plain text avoids a CORS preflight
      body: JSON.stringify({ action: action, args: args })
    });
  } catch (e) {
    throw new Error('No internet connection. Check Wi-Fi or mobile data.');
  }
  let d;
  try { d = await r.json(); }
  catch (e) { throw new Error('The sheet did not answer. Check the deployment access is set to "Anyone".'); }
  if (!d.ok) throw new Error(d.error || 'Something went wrong.');
  return d.data;
}

// Offline support + installability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// "Install app" button
let knkInstallPrompt = null;
const knkIsIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const knkStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  knkInstallPrompt = e;
  const b = document.getElementById('installBtn');
  if (b && !knkStandalone()) b.classList.remove('hidden');
});
window.addEventListener('appinstalled', () => {
  const b = document.getElementById('installBtn');
  if (b) b.classList.add('hidden');
});
document.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('installBtn');
  if (!b) return;
  if (knkIsIOS && !knkStandalone()) b.classList.remove('hidden');
  b.addEventListener('click', async () => {
    if (knkInstallPrompt) {
      knkInstallPrompt.prompt();
      await knkInstallPrompt.userChoice;
      knkInstallPrompt = null;
      b.classList.add('hidden');
    } else if (knkIsIOS) {
      alert('To install on iPhone: open this page in Safari, tap the Share button, then "Add to Home Screen".');
    }
  });
});

/* ---------- Notification sounds ----------
 * Soft bell / chime tones made in the browser (no sound files to load).
 * order  : new order at a station – bright 4-note rise, played twice
 * ready  : staff's order is ready – warm "ding-dong"
 * update : small tap for other status changes
 * cancel : gentle falling two notes
 */
const KNKSound = (() => {
  let ctx = null, bus = null;

  function unlock() {
    try {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();

      // master chain: tone filter -> soft room echo -> compressor (loud but never harsh)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      const out = ctx.createGain(); out.gain.value = 1.15;
      const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 7000;
      const delay = ctx.createDelay(1); delay.delayTime.value = 0.17;
      const fb = ctx.createGain(); fb.gain.value = 0.26;
      const wet = ctx.createGain(); wet.gain.value = 0.2;
      bus = ctx.createGain(); bus.gain.value = 0.9;
      bus.connect(tone); tone.connect(comp);
      tone.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(comp);
      comp.connect(out); out.connect(ctx.destination);

      // iPhone needs a silent sound inside the first tap
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (e) { ctx = null; }
  }

  // one bell note: a few sine partials with a quick strike and a long soft decay
  function bell(freq, at, vol, len) {
    [[1, 1, 1], [2, 0.38, 0.55], [3, 0.14, 0.35], [4.07, 0.07, 0.22]].forEach(p => {
      const o = ctx.createOscillator(), g = ctx.createGain(), end = at + len * p[2];
      o.type = 'sine';
      o.frequency.value = freq * p[0];
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol * p[1], at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      o.connect(g); g.connect(bus);
      o.start(at); o.stop(end + 0.05);
    });
  }

  const PATTERNS = {
    order:  [[784, 0, .42, 1.0], [988, .12, .42, 1.0], [1175, .24, .45, 1.1], [1568, .36, .5, 1.6],
             [784, 1.0, .4, 1.0], [988, 1.12, .4, 1.0], [1175, 1.24, .43, 1.1], [1568, 1.36, .5, 1.9]],
    ready:  [[1319, 0, .5, 1.3], [1047, .28, .5, 1.9]],
    update: [[1175, 0, .25, .7]],
    cancel: [[784, 0, .38, .9], [622, .22, .38, 1.4]]
  };

  function play(name) {
    unlock();
    if (!ctx) return;
    const t = ctx.currentTime + 0.03;
    (PATTERNS[name] || PATTERNS.update).forEach(n => bell(n[0], t + n[1], n[2], n[3]));
  }

  return { unlock: unlock, play: play };
})();
document.addEventListener('pointerdown', () => KNKSound.unlock(), { passive: true });
