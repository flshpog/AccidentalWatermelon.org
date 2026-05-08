/* ============================================================
   chaos.js — global glitch engine
   include with <script defer src="...chaos.js"></script>
   set <body data-chaos="off|low|med|high|max"> for intensity
   ============================================================ */

(function () {
  'use strict';

  const STORE_GATE  = 'taw-gate-passed';
  const STORE_CHAOS = 'taw-chaos';
  const STORE_BSOD  = 'taw-bsod-shown';

  const LEVEL = (document.body && document.body.dataset.chaos) || 'high';
  const INT = ({ off: 0, low: 0.4, med: 0.7, high: 1.0, max: 1.5 })[LEVEL] || 1.0;

  /* ---------- helpers ---------- */
  const isOn = () => localStorage.getItem(STORE_CHAOS) !== 'off';
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- audio ---------- */
  let actx;
  let lastBeep = 0;
  function getCtx() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    return actx;
  }
  function blip(freq, dur, type, vol) {
    if (!isOn()) return;
    const a = getCtx(); if (!a) return;
    try {
      const o = a.createOscillator();
      const g = a.createGain();
      o.frequency.value = freq;
      o.type = type || 'square';
      g.gain.setValueAtTime(vol || 0.04, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + (dur || 0.04));
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + (dur || 0.04) + 0.02);
    } catch (e) {}
  }
  function chirp() {
    const now = Date.now();
    if (now - lastBeep < 60) return;
    lastBeep = now;
    blip(1800 + Math.random() * 800, 0.025, 'square', 0.022);
  }
  function thunk() { blip(80, 0.07, 'sawtooth', 0.05); }
  function staticBuzz() { blip(120, 0.04, 'sawtooth', 0.025); }

  /* ---------- gate ---------- */
  function showGate(onDone) {
    if (LEVEL === 'off') { onDone(); return; }
    if (localStorage.getItem(STORE_GATE)) { onDone(); return; }

    const g = document.createElement('div');
    g.className = 'chaos-gate';
    g.innerHTML =
      '<div class="triangle">⚠</div>' +
      '<h2>PHOTOSENSITIVITY WARNING</h2>' +
      '<p>this site contains <b>flashing lights, strobing imagery, and rapid visual glitches</b> that may cause discomfort or seizures in photosensitive individuals.</p>' +
      '<div class="btns">' +
        '<button id="cg-full">[ ENTER · FULL CHAOS ]</button>' +
        '<button class="alt" id="cg-tame">[ TURN DOWN ]</button>' +
      '</div>';
    document.body.appendChild(g);
    g.querySelector('#cg-full').addEventListener('click', () => {
      localStorage.setItem(STORE_GATE, '1');
      localStorage.setItem(STORE_CHAOS, 'on');
      g.remove();
      thunk();
      onDone();
    });
    g.querySelector('#cg-tame').addEventListener('click', () => {
      localStorage.setItem(STORE_GATE, '1');
      localStorage.setItem(STORE_CHAOS, 'off');
      g.remove();
      onDone();
    });
  }

  /* ---------- toggle ---------- */
  function makeToggle() {
    const btn = document.createElement('div');
    btn.className = 'chaos-toggle';
    document.body.appendChild(btn);
    function refresh() {
      const on = isOn();
      btn.textContent = on ? '[CHAOS:ON]' : '[CHAOS:OFF]';
      document.body.classList.toggle('chaos-off', !on);
    }
    btn.addEventListener('click', () => {
      localStorage.setItem(STORE_CHAOS, isOn() ? 'off' : 'on');
      refresh();
      thunk();
    });
    refresh();
  }

  /* ---------- canvas static ---------- */
  function makeStatic() {
    const c = document.createElement('canvas');
    c.id = 'chaos-static';
    c.width = 240;
    c.height = 140;
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    function paint() {
      if (!isOn() || document.hidden) return;
      const id = ctx.createImageData(c.width, c.height);
      const buf = id.data;
      for (let i = 0; i < buf.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        buf[i] = buf[i + 1] = buf[i + 2] = v;
        buf[i + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
    }
    setInterval(paint, 90);
  }

  /* ---------- signal-loss flicker ---------- */
  function makeFlicker() {
    const f = document.createElement('div');
    f.className = 'chaos-flicker';
    document.body.appendChild(f);
    function strike() {
      if (!isOn()) { schedule(); return; }
      f.classList.add('on');
      staticBuzz();
      setTimeout(() => f.classList.remove('on'), rand(45, 110));
      // double tap occasionally
      if (Math.random() < 0.25) {
        setTimeout(() => { f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 50); }, rand(160, 260));
      }
      schedule();
    }
    function schedule() {
      const base = 5000 + Math.random() * 9000;
      setTimeout(strike, base / INT);
    }
    schedule();
  }

  /* ---------- tear bands ---------- */
  function spawnTear() {
    if (!isOn()) { scheduleTear(); return; }
    const t = document.createElement('div');
    t.className = 'chaos-tear';
    const h = 2 + Math.random() * 5;
    t.style.height = h + 'px';
    t.style.top = (Math.random() * 100) + '%';
    t.style.background = pick(['#00ffff', '#ff00ff', '#ffff00', '#ffffff', '#ff0080']);
    t.style.transform = 'translateX(-110vw)';
    t.style.transition = 'transform ' + rand(0.25, 0.55).toFixed(2) + 's linear, opacity 0.18s linear';
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform = 'translateX(110vw)'; });
    setTimeout(() => { t.style.opacity = '0'; }, 350);
    setTimeout(() => t.remove(), 800);
    scheduleTear();
  }
  function scheduleTear() {
    setTimeout(spawnTear, rand(1200, 3500) / INT);
  }

  /* ---------- glyph corruption ---------- */
  const GLITCH_CHARS = '█▒░◊▆▼▲◣◢◤◥▌▐╳╲╱⌬⌭#@%&';
  function corruptOnce() {
    if (!isOn()) { scheduleCorrupt(); return; }
    const candidates = document.querySelectorAll(
      'h1, h2, h3, .role, .tagline, .folder-label, .marquee span, .menu-item, .watermark .line, .bio p, .ribbon, .uc, .title-mark, .center-mark .line, .center-mark .sub, .corner-tl, .corner-bl, p, a'
    );
    if (!candidates.length) { scheduleCorrupt(); return; }
    // pick a random candidate, then a random text node within it
    let attempts = 0;
    while (attempts++ < 5) {
      const el = candidates[Math.floor(Math.random() * candidates.length)];
      const tn = pickTextNode(el);
      if (!tn) continue;
      const orig = tn.nodeValue;
      if (!orig || orig.trim().length < 2 || orig.length > 240) continue;
      const chars = orig.split('');
      const n = 1 + Math.floor(Math.random() * 3);
      const used = new Set();
      let mutated = false;
      for (let i = 0; i < n; i++) {
        let idx, t = 0;
        do { idx = Math.floor(Math.random() * chars.length); t++; } while ((!chars[idx].trim() || used.has(idx)) && t < 30);
        if (chars[idx] && chars[idx].trim() && !used.has(idx)) {
          used.add(idx);
          chars[idx] = pick(GLITCH_CHARS.split(''));
          mutated = true;
        }
      }
      if (!mutated) continue;
      tn.nodeValue = chars.join('');
      const dur = 50 + Math.random() * 120;
      setTimeout(() => { tn.nodeValue = orig; }, dur);
      break;
    }
    scheduleCorrupt();
  }
  function pickTextNode(el) {
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim().length > 1) nodes.push(node);
    }
    return nodes.length ? nodes[Math.floor(Math.random() * nodes.length)] : null;
  }
  function scheduleCorrupt() {
    setTimeout(corruptOnce, rand(700, 1800) / INT);
  }

  /* ---------- cursor trail ---------- */
  function makeTrail() {
    const N = 5;
    const colors = ['#ff0080', '#00ffff', '#ffff00', '#ff00ff', '#ffffff'];
    const dots = [];
    for (let i = 0; i < N; i++) {
      const d = document.createElement('div');
      d.className = 'chaos-cursor-dot';
      d.style.background = colors[i % colors.length];
      d.style.opacity = (1 - i / N) * 0.55;
      d.style.transitionProperty = 'transform';
      d.style.transitionTimingFunction = 'linear';
      d.style.transitionDuration = (0.04 + i * 0.05).toFixed(3) + 's';
      document.body.appendChild(d);
      dots.push(d);
    }
    let mx = -200, my = -200;
    document.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      dots.forEach((d) => {
        d.style.transform = 'translate(' + (mx - 3) + 'px,' + (my - 3) + 'px)';
      });
    }, { passive: true });
  }

  /* ---------- error popups ---------- */
  const ERRORS = [
    'SIGNAL LOST',
    'BUFFER UNDERRUN',
    'HEAP OVERFLOW @ 0x4D656C6F',
    'KERNEL PANIC',
    'AUDIO DRIVER FAILURE',
    'SEEK ERROR ON DEVICE 0',
    'MISSING WATERMELON.DLL',
    'TYPE MISMATCH',
    'DIVISION BY ZERO',
    'STACK OVERFLOW',
    'INVALID SECTOR',
    'CRC MISMATCH',
    'MEMORY ACCESS VIOLATION',
    'DEVICE NOT READY',
    'TASK FAILED SUCCESSFULLY',
    'HCF // HALT AND CATCH FIRE',
    'WATERMELON.EXE has stopped responding',
    'cannot read property "soul" of undefined',
    'NO COFFEE FOUND',
    'PARITY CHECK FAILED'
  ];
  function popup() {
    if (!isOn()) { schedulePopup(); return; }
    const e = document.createElement('div');
    e.className = 'chaos-error';
    e.textContent = pick(ERRORS);
    e.style.left = (5 + Math.random() * 70) + 'vw';
    e.style.top  = (10 + Math.random() * 70) + 'vh';
    document.body.appendChild(e);
    blip(2400, 0.045, 'square', 0.04);
    setTimeout(() => { e.style.opacity = '0'; e.style.transition = 'opacity 0.15s'; }, rand(220, 480));
    setTimeout(() => e.remove(), 700);
    schedulePopup();
  }
  function schedulePopup() {
    setTimeout(popup, rand(4500, 12000) / INT);
  }

  /* ---------- BSOD easter egg (once per session) ---------- */
  function maybeBSOD() {
    if (sessionStorage.getItem(STORE_BSOD)) return;
    if (LEVEL !== 'high' && LEVEL !== 'max') return;
    setTimeout(() => {
      if (!isOn()) return;
      sessionStorage.setItem(STORE_BSOD, '1');
      const b = document.createElement('div');
      b.className = 'chaos-bsod on';
      b.innerHTML =
        '<span class="head">  TAW.OS  </span>\n\n' +
        'A fatal exception 0xDEAD_MELON has occurred at 0028:C001BABE in VXD WATERMELON(03) +\n' +
        '00010E36. The current application will be terminated.\n\n' +
        '*  Press any key to terminate the current application.\n' +
        '*  Press CTRL+ALT+DEL again to restart your computer. you will\n' +
        '   lose any unsaved information in all applications.\n\n' +
        '            ___________________________\n' +
        '           /                           \\\n' +
        '          (    THE ACCIDENTAL          )\n' +
        '           \\        WATERMELON        /\n' +
        '            \\__has been an accident_/\n\n\n' +
        'Press any key to continue _';
      document.body.appendChild(b);
      blip(220, 1.2, 'sawtooth', 0.06);
      const dismiss = () => {
        b.classList.remove('on');
        setTimeout(() => b.remove(), 50);
        document.removeEventListener('keydown', dismiss);
        document.removeEventListener('click', dismiss);
        thunk();
      };
      setTimeout(() => {
        document.addEventListener('keydown', dismiss);
        document.addEventListener('click', dismiss);
      }, 200);
    }, rand(20000, 45000));
  }

  /* ---------- audio bindings ---------- */
  function bindAudio() {
    const HOVER_SEL = 'a, button, .menu-item, .ctx-item, .ctx-swatch, .folder, .menu-button, .modal-btn, .cta, .tagline span';
    const CLICK_SEL = 'a, button, .menu-item, .ctx-item, .folder, .menu-button, .modal-btn, .cta, .ctx-swatch';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest && e.target.closest(HOVER_SEL)) chirp();
    }, true);
    document.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest(CLICK_SEL)) thunk();
    }, true);
  }

  /* ---------- start ---------- */
  function start() {
    makeToggle();
    bindAudio();
    if (LEVEL === 'off') return;
    makeStatic();
    makeFlicker();
    scheduleTear();
    scheduleCorrupt();
    makeTrail();
    schedulePopup();
    maybeBSOD();
  }

  function go() {
    showGate(start);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', go);
  } else {
    go();
  }
})();
