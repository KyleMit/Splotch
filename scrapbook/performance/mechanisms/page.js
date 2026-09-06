(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const REPO = 'https://github.com/KyleMit/Splotch/blob/3c017796622f374d428ee91c74b731b00964a63f/';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const el = (tag, attrs = {}, children = []) => {
    const node = tag === 'svg' || attrs.ns ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'ns') continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) node.appendChild(c);
    return node;
  };
  const s = (tag, attrs = {}, children = []) => el(tag, { ...attrs, ns: true }, children);
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const chartRenders = [];
  const isNarrow = () => innerWidth < 640;
  const fmt = (n, d = 1) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });

  /* ---------- syntax highlighting ---------- */
  const KW = /\b(const|let|var|function|return|if|else|export|import|from|new|typeof|await|async|void|for|of|while|do|throw|try|catch|finally|type|null|undefined|true|false|this|default|in)\b/;
  function highlight(code) {
    const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b0x[0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|\b([A-Z][A-Za-z0-9_]*)\b|\b([a-z]+)\b/g;
    return code.replace(re, (m, cm, str, num, fn, type, word) => {
      if (cm) return `<span class="cm">${esc(m)}</span>`;
      if (str) return `<span class="str">${esc(m)}</span>`;
      if (num) return `<span class="num">${esc(m)}</span>`;
      if (fn) return KW.test(fn) ? `<span class="kw">${esc(fn)}</span>` : `<span class="fn">${esc(fn)}</span>`;
      if (type) return `<span class="type">${esc(m)}</span>`;
      if (word) return KW.test(word) ? `<span class="kw">${esc(word)}</span>` : esc(word);
      return esc(m);
    });
  }
  function highlightCss(code) {
    const re = /(\/\*[\s\S]*?\*\/)|('[^']*'|"[^"]*")|(\b\d+(?:\.\d+)?(?:px|ms|s|%|em|rem)?\b)|(^\s*[.#:@][^{\n]*)(?=\s*\{)|([a-z-]+)(?=\s*:)/gm;
    return code.replace(re, (m, cm, str, num, sel, prop) => {
      if (cm) return `<span class="cm">${esc(m)}</span>`;
      if (str) return `<span class="str">${esc(m)}</span>`;
      if (num) return `<span class="num">${esc(m)}</span>`;
      if (sel) return `<span class="fn">${esc(m)}</span>`;
      if (prop) return `<span class="kw">${esc(m)}</span>`;
      return esc(m);
    });
  }
  for (const block of $$('pre > code')) {
    const src = block.textContent;
    block.innerHTML = block.classList.contains('lang-css') ? highlightCss(src) : highlight(src);
  }

  /* ---------- scroll spy ---------- */
  const navLinks = $$('.quicknav a');
  const sections = navLinks.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  let activeId = null;
  function setActive(id) {
    if (id === activeId) return;
    activeId = id;
    for (const a of navLinks) {
      const on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('active', on);
      if (on) a.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }
  const spy = () => {
    const line = (parseInt(cssVar('--nav-h'), 10) || 46) + 40;
    let current = sections[0];
    for (const sec of sections) if (sec.getBoundingClientRect().top <= line) current = sec;
    if (current) setActive(current.id);
  };
  let spyFrame = 0;
  addEventListener('scroll', () => { if (!spyFrame) spyFrame = requestAnimationFrame(() => { spyFrame = 0; spy(); }); }, { passive: true });
  spy();

  /* ---------- tooltip ---------- */
  const tip = $('#tip');
  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.classList.add('show');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 14, top = y - h - 10;
    if (left + w > innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 16;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  const hideTip = () => tip.classList.remove('show');
  function attachTip(node, html) {
    node.addEventListener('pointerenter', (e) => showTip(html, e.clientX, e.clientY));
    node.addEventListener('pointermove', (e) => showTip(html, e.clientX, e.clientY));
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('focus', () => { const r = node.getBoundingClientRect(); showTip(html, r.left + r.width / 2, r.top); });
    node.addEventListener('blur', hideTip);
  }

  /* ---------- lab: frame budget ---------- */
  (() => {
    const svg = $('#budget-svg'), work = $('#budget-work'), out = $('#budget-work-out');
    if (!svg) return;
    let hz = 60;
    const FRAMES = 12;
    function render() {
      const beat = 1000 / hz;
      const w = parseFloat(work.value);
      out.value = w + ' ms';
      const total = FRAMES * beat;
      const W = isNarrow() ? 390 : 720, H = isNarrow() ? 168 : 140, left = 10, right = 10, top = 34, barH = 34;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const x = (ms) => left + (ms / total) * (W - left - right);
      svg.innerHTML = '';
      svg.appendChild(s('text', { x: left, y: 16, text: isNarrow() ? `beat: ${fmt(beat)} ms · one tick per frame` : `beat: ${fmt(beat)} ms · each tick is one frame the display wants to show` }));
      for (let i = 0; i <= FRAMES; i++) {
        svg.appendChild(s('line', { class: 'tick', x1: x(i * beat), x2: x(i * beat), y1: top - 6, y2: top + barH + 30 }));
      }
      let t = 0, late = 0, lostMs = 0, slot = 0;
      while (t < total - 0.01 && slot < FRAMES) {
        const dur = Math.max(1, Math.ceil(w / beat)) * beat;
        const isLate = dur > beat + 0.001;
        if (isLate) { late += Math.round(dur / beat); lostMs += dur; }
        const color = isLate ? cssVar('--bad') : cssVar('--accent');
        svg.appendChild(s('rect', { x: x(t) + 1, y: top, width: Math.max(2, x(t + Math.min(w, dur)) - x(t) - 2), height: barH, rx: 5, fill: color, opacity: isLate ? 0.85 : 0.75 }));
        if (isLate) {
          svg.appendChild(s('rect', { x: x(t + beat), y: top + barH + 6, width: x(t + dur) - x(t + beat), height: 10, rx: 3, fill: cssVar('--bad'), opacity: 0.35 }));
        }
        t += dur;
        slot += Math.round(dur / beat);
      }
      if (isNarrow()) {
        svg.appendChild(s('text', { x: left, y: top + barH + 30 + 14, text: 'blue: work that fit its frame' }));
        svg.appendChild(s('text', { x: left, y: top + barH + 30 + 30, text: 'red: work that ran past the beat' }));
      } else svg.appendChild(s('text', { x: left, y: top + barH + 30 + 14, text: 'blue: work that fit its frame · red: work that ran past the beat (the display repeats the last picture)' }));
      $('#budget-beat').textContent = fmt(beat) + ' ms';
      const lateEl = $('#budget-late'), lostEl = $('#budget-lost');
      lateEl.textContent = `${Math.min(late, FRAMES)} of ${FRAMES}`;
      const share = Math.min(1, lostMs / total);
      lostEl.textContent = fmt(share * 100, 0) + '%';
      lateEl.className = late ? 'bad' : 'ok';
      lostEl.className = share > 0.01 ? 'bad' : 'ok';
    }
    for (const b of $$('#lab-budget [data-hz]')) b.addEventListener('click', () => {
      hz = +b.dataset.hz;
      for (const o of $$('#lab-budget [data-hz]')) o.setAttribute('aria-pressed', String(o === b));
      render();
    });
    work.addEventListener('input', render);
    chartRenders.push(render);
  })();

  /* ---------- lab: samples vs frames ---------- */
  (() => {
    const svg = $('#events-svg');
    if (!svg) return;
    let rate = 120, mode = 'event';
    function render() {
      const WINDOW = 100, hz = 60, beat = 1000 / hz;
      const W = isNarrow() ? 390 : 720, left = 12, right = 12, x = (ms) => left + (ms / WINDOW) * (W - left - right);
      const frames = Math.round(WINDOW / beat), samples = Math.round(WINDOW / (1000 / rate));
      svg.setAttribute('viewBox', `0 0 ${W} 170`);
      svg.innerHTML = '';
      const laneY = [30, 82, 134];
      const labels = ['finger samples', 'display frames', 'raster ops'];
      labels.forEach((t, i) => svg.appendChild(s('text', { x: left, y: laneY[i] - 14, text: t })));
      for (let i = 0; i <= frames; i++) {
        svg.appendChild(s('line', { class: 'tick', x1: x(i * beat), x2: x(i * beat), y1: laneY[1] - 10, y2: laneY[2] + 12, 'stroke-dasharray': i ? '' : '' }));
      }
      // frames
      for (let i = 0; i < frames; i++) {
        svg.appendChild(s('rect', { x: x(i * beat) + 1, y: laneY[1] - 8, width: x(beat) - x(0) - 2, height: 18, rx: 4, fill: cssVar('--card-2'), stroke: cssVar('--hair-strong') }));
      }
      // samples
      const step = 1000 / rate;
      for (let i = 0; i < samples; i++) {
        svg.appendChild(s('circle', { cx: x(i * step + step / 2), cy: laneY[0], r: isNarrow() && rate > 120 ? 3.5 : 5, fill: cssVar('--c-pink') }));
      }
      // ops
      let ops = 0;
      if (mode === 'event') {
        for (let i = 0; i < samples; i++) {
          svg.appendChild(s('rect', { x: x(i * step + step / 2) - 3, y: laneY[2] - 9, width: 6, height: 18, rx: 2, fill: cssVar('--accent') }));
          ops++;
        }
      } else {
        for (let i = 0; i < frames; i++) {
          const inFrame = [];
          for (let k = 0; k < samples; k++) { const t = k * step + step / 2; if (t >= i * beat && t < (i + 1) * beat) inFrame.push(t); }
          if (!inFrame.length) continue;
          ops++;
          svg.appendChild(s('path', { d: `M${x(inFrame[0])} ${laneY[0] + 8} L${x(inFrame[0])} ${laneY[0] + 16} L${x(inFrame[inFrame.length - 1])} ${laneY[0] + 16} L${x(inFrame[inFrame.length - 1])} ${laneY[0] + 8}`, fill: 'none', stroke: cssVar('--faint'), 'stroke-width': 1.2 }));
          svg.appendChild(s('rect', { x: x((i + 1) * beat) - 8, y: laneY[2] - 9, width: 6, height: 18, rx: 2, fill: cssVar('--accent') }));
          if (!isNarrow()) svg.appendChild(s('text', { x: x((i + 1) * beat) - 12, y: laneY[2] + 4, 'text-anchor': 'end', text: `${inFrame.length} pts` }));
        }
      }
      svg.appendChild(s('text', { x: W - right, y: laneY[2] + 26, 'text-anchor': 'end', text: mode === 'event' ? 'one raster op per sample' : (isNarrow() ? 'one raster op per frame, all samples inside' : 'one raster op per frame, carrying every sample as its own curve segment') }));
      $('#events-samples').textContent = samples;
      $('#events-ops').textContent = ops;
      $('#events-ratio').textContent = (samples / frames).toFixed(1);
    }
    for (const b of $$('#lab-events [data-rate]')) b.addEventListener('click', () => { rate = +b.dataset.rate; for (const o of $$('#lab-events [data-rate]')) o.setAttribute('aria-pressed', String(o === b)); render(); });
    for (const b of $$('#lab-events [data-mode]')) b.addEventListener('click', () => { mode = b.dataset.mode; for (const o of $$('#lab-events [data-mode]')) o.setAttribute('aria-pressed', String(o === b)); render(); });
    chartRenders.push(render);
  })();

  /* ---------- lab: tile pad ---------- */
  (() => {
    const svg = $('#tile-pad');
    if (!svg) return;
    const COLS = 4, ROWS = 5, W = 400, H = 500, STROKE = 22, PAD = STROKE / 2 + 2;
    const cells = [];
    const gridLayer = s('g'), inkLayer = s('g'), boundLayer = s('g');
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const rect = s('rect', { class: 'cell', x: c * (W / COLS), y: r * (H / ROWS), width: W / COLS, height: H / ROWS });
      cells.push(rect); gridLayer.appendChild(rect);
    }
    const hint = s('text', { class: 'hint', x: W / 2, y: H / 2, 'text-anchor': 'middle', text: 'draw here' });
    svg.append(gridLayer, inkLayer, boundLayer, hint);
    const strokes = []; let current = null;
    const toPaper = (e) => { const r = svg.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
    const pathD = (pts) => pts.length === 1 ? `M${pts[0][0]} ${pts[0][1]} l0.01 0` : 'M' + pts.map((p) => p.join(' ')).join(' L');
    function recompute() {
      boundLayer.innerHTML = '';
      const hit = new Set();
      let dirty = null;
      for (const pts of strokes) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD); x1 = Math.min(W, x1 + PAD); y1 = Math.min(H, y1 + PAD);
        boundLayer.appendChild(s('rect', { class: 'bound', x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 4 }));
        dirty = dirty ? [Math.min(dirty[0], x0), Math.min(dirty[1], y0), Math.max(dirty[2], x1), Math.max(dirty[3], y1)] : [x0, y0, x1, y1];
        cells.forEach((cell, i) => {
          const cx = (i % COLS) * (W / COLS), cy = Math.floor(i / COLS) * (H / ROWS);
          if (x0 < cx + W / COLS && x1 > cx && y0 < cy + H / ROWS && y1 > cy) hit.add(i);
        });
      }
      cells.forEach((cell, i) => cell.classList.toggle('hit', hit.has(i)));
      $('#tiles-hit').textContent = `${hit.size} of ${COLS * ROWS}`;
      $('#tiles-skip').textContent = fmt((1 - hit.size / (COLS * ROWS)) * 100, 0) + '%';
      const patch = dirty ? ((dirty[2] - dirty[0]) * (dirty[3] - dirty[1])) / (W * H) : 0;
      $('#tiles-patch').textContent = fmt(patch * 100, patch < 0.1 ? 1 : 0) + '%';
      hint.style.display = strokes.length ? 'none' : '';
    }
    svg.addEventListener('pointerdown', (e) => {
      e.preventDefault(); svg.setPointerCapture(e.pointerId);
      current = { pts: [toPaper(e)], path: s('path', { class: 'ink' }) };
      inkLayer.appendChild(current.path); current.path.setAttribute('d', pathD(current.pts));
      strokes.push(current.pts); recompute();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!current) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) current.pts.push(toPaper(ev));
      current.path.setAttribute('d', pathD(current.pts)); recompute();
    });
    const end = () => { current = null; };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    $('#tiles-clear').addEventListener('click', () => { strokes.length = 0; inkLayer.innerHTML = ''; recompute(); });
    recompute();
  })();

  /* ---------- lab: idle scheduler ---------- */
  (() => {
    const hold = $('#idle-hold'), jobsEl = $('#idle-jobs'), meter = $('#idle-meter'), quietOut = $('#idle-quiet'), status = $('#idle-status');
    if (!hold) return;
    const QUIET_MS = 300, SLICE_MS = 700, RUN_MS = 380;
    const JOBS = [
      ['Warm the UI font', 'document.fonts.load()'],
      ['Import the overlay chunk', '8 dialogs, one lazy file'],
      ['Mount the color picker', 'first background resident'],
      ['Mount the coloring book', 'second resident'],
      ['Scan: did the eraser empty the page?', 'waits 400 ms of idle'],
      ['Fold one old undo command', 'one per 1.5 s tick'],
      ['Warm this color’s crayon wax', '2 ms per frame budget'],
    ];
    let pressed = false, lastInput = -Infinity, started = false, queue = [], running = null, runningUntil = 0, nextSliceAt = 0, tick = 0;
    const ensureLoop = () => { if (!tick) tick = requestAnimationFrame(loop); };
    function reset() {
      if (tick) { cancelAnimationFrame(tick); tick = 0; }
      pressed = false; started = false; running = null; queue = JOBS.map((j, i) => ({ i, state: 'idle' }));
      hold.classList.remove('holding'); hold.textContent = 'Hold to draw';
      renderJobs(); meter.style.width = '0'; meter.classList.remove('busy'); quietOut.textContent = '0 ms';
      status.textContent = 'Nothing is scheduled yet. The queue fills as soon as you touch the paper.';
    }
    function renderJobs() {
      jobsEl.innerHTML = '';
      for (const q of queue) {
        const label = { idle: 'not yet', waiting: 'waiting', running: 'running', done: 'done' }[q.state];
        jobsEl.appendChild(el('div', { class: 'job ' + q.state, html: `<div>${esc(JOBS[q.i][0])}<small>${esc(JOBS[q.i][1])}</small></div><span class="state">${label}</span>` }));
      }
    }
    function down(e) { e.preventDefault(); if (!started) { started = true; for (const q of queue) q.state = 'waiting'; }
      pressed = true; lastInput = performance.now(); ensureLoop(); hold.classList.add('holding'); hold.textContent = 'Drawing… release to stop'; hold.setPointerCapture?.(e.pointerId); renderJobs(); }
    function up() { if (!pressed) return; pressed = false; lastInput = performance.now(); hold.classList.remove('holding'); hold.textContent = 'Hold to draw'; }
    hold.addEventListener('pointerdown', down); hold.addEventListener('pointerup', up); hold.addEventListener('pointercancel', up); hold.addEventListener('pointerleave', up);
    hold.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!pressed) down(e); } });
    hold.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
    $('#idle-reset').addEventListener('click', reset);
    function loop(now) {
      const quiet = pressed || !started ? 0 : Math.min(QUIET_MS, now - lastInput);
      meter.style.width = (quiet / QUIET_MS) * 100 + '%';
      meter.classList.toggle('busy', pressed);
      quietOut.textContent = pressed ? 'finger down' : started ? fmt(quiet, 0) + ' ms' : '0 ms';
      if (started) {
        if (running && now >= runningUntil) { running.state = 'done'; running = null; nextSliceAt = now + SLICE_MS; renderJobs(); }
        if (pressed) {
          if (running) { running.state = 'waiting'; running = null; renderJobs(); }
          status.textContent = 'A pointer is down. Nothing deferred runs, no matter how long you hold.';
        } else if (quiet < QUIET_MS) {
          status.textContent = `Input quiet for ${fmt(quiet, 0)} ms. Deferred work needs ${QUIET_MS} ms of quiet plus two clean frames.`;
        } else if (!running) {
          const next = queue.find((q) => q.state === 'waiting');
          if (next && now >= nextSliceAt) { running = next; next.state = 'running'; runningUntil = now + RUN_MS; renderJobs(); }
          status.textContent = next ? 'Idle. Jobs drain one per slice, with a breather between slices.' : 'Queue drained. Everything ran without ever landing inside a stroke. This demo stops its own animation loop now, for the same reason the coachmark does.';
          if (!next) { tick = 0; return; }
        }
      }
      tick = requestAnimationFrame(loop);
    }
    reset();
  })();

  /* ---------- chart helpers ---------- */
  function niceTicks(max, count = 5) {
    const raw = max / count, mag = 10 ** Math.floor(Math.log10(raw)), norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const ticks = []; for (let v = 0; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6)); return ticks;
  }
  function tableFor(id, headers, rows) {
    const host = $('#' + id); if (!host) return;
    host.innerHTML = `<table class="chart-table"><thead><tr>${headers.map((h, i) => `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  for (const b of $$('.toggle-table')) b.addEventListener('click', () => { const t = $('#' + b.dataset.table); t.hidden = !t.hidden; b.textContent = t.hidden ? 'Show as table' : 'Hide table'; });

  function dumbbell(svgId, rows, { max, ref, refLabel, unit, decimals = 0 }) {
    const svg = $('#' + svgId); if (!svg) return;
    const narrow = isNarrow();
    const W = narrow ? 390 : 720, labelW = narrow ? 0 : 250, left = narrow ? 8 : labelW + 14, right = 44, rowH = narrow ? 46 : 30, top = narrow ? 36 : 28;
    const H = top + rows.length * rowH + 30;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = '';
    const x = (v) => left + (v / max) * (W - left - right);
    for (const t of niceTicks(max)) {
      svg.appendChild(s('line', { class: 'grid', x1: x(t), x2: x(t), y1: top - 4, y2: H - 26 }));
      svg.appendChild(s('text', { x: x(t), y: H - 10, 'text-anchor': 'middle', text: fmt(t) + (t === 0 ? '' : unit) }));
    }
    if (ref != null) {
      svg.appendChild(s('line', { class: 'ref', x1: x(ref), x2: x(ref), y1: 16, y2: H - 26 }));
      svg.appendChild(s('text', { x: x(ref) + 4, y: 12, text: refLabel, fill: cssVar('--gold') }));
    }
    rows.forEach((r, i) => {
      const cy = top + i * rowH + (narrow ? rowH - 12 : rowH / 2);
      if (narrow) svg.appendChild(s('text', { class: 'row-label', x: left, y: top + i * rowH + 10, text: r.label }));
      else svg.appendChild(s('text', { class: 'row-label', x: left - 12, y: cy + 4, 'text-anchor': 'end', text: r.label }));
      svg.appendChild(s('line', { x1: x(r.before), x2: x(r.after), y1: cy, y2: cy, stroke: cssVar('--hair-strong'), 'stroke-width': 3, 'stroke-linecap': 'round' }));
      const b = s('circle', { class: 'ring', cx: x(r.before), cy, r: 6, fill: cssVar('--faint'), tabindex: 0 });
      const a = s('circle', { class: 'ring', cx: x(r.after), cy, r: 6, fill: cssVar('--accent'), tabindex: 0 });
      svg.append(b, a);
      svg.appendChild(s('text', { x: x(r.after) + (r.after < r.before ? -10 : 10), y: cy + 4, 'text-anchor': r.after < r.before ? 'end' : 'start', text: fmt(r.after, decimals) + unit, fill: cssVar('--ink') }));
      const html = `<b>${esc(r.label)}</b><br>${fmt(r.before, decimals)}${unit} → ${fmt(r.after, decimals)}${unit}<br><span style="opacity:.8">${esc(r.where)}</span>`;
      attachTip(b, html); attachTip(a, html);
    });
  }

  /* ---------- chart: wins ---------- */
  const WINS = [
    { label: 'Undo after a paper-restoring resize', before: 103, after: 17, where: 'iPad · issue 1198 · extra repaint skipped' },
    { label: 'Theme flip, post-action P95 median', before: 100.1, after: 66.7, where: 'Android emulator · coachmark animations scoped to .visible' },
    { label: 'Rotate with drawer open, worst frame', before: 66.7, after: 16.8, where: 'Android Chrome · issue 1632 · drawer motion canceled' },
    { label: 'Rotate with drawer open, frame P95', before: 33.4, after: 16.7, where: 'Android Chrome · issue 1632' },
    { label: 'Settings pane open flip, frame P95', before: 33, after: 17, where: 'iPad · staged presentation (ADR-0049)' },
    { label: 'Pick a page, worst frame (landscape)', before: 31, after: 20, where: 'iPad Safari · issue 1569 · decode-gated swap' },
    { label: 'Page select, post-action P95', before: 31, after: 18, where: 'iPad Safari · ADR-0157 · picker backdrop blur off' },
    { label: 'Pick a page, frame P95 (landscape, dark)', before: 29, after: 19, where: 'iPad Safari · issue 1569' },
    { label: 'Clear from the picker, post-action P95', before: 28, after: 17, where: 'iPad Safari · ADR-0157' },
    { label: 'Pick a page, frame P95 (landscape, light)', before: 25, after: 19, where: 'iPad Safari · issue 1569' },
  ];
  chartRenders.push(() => dumbbell('wins-svg', WINS, { max: 110, ref: 16.7, refLabel: '16.7 ms', unit: ' ms', decimals: 1 }));
  tableFor('wins-table', ['Measurement', 'Before (ms)', 'After (ms)', 'Where'], WINS.map((r) => [r.label, fmt(r.before, 1), fmt(r.after, 1), r.where]).map((r) => [r[0], r[1], r[2], r[3]]));

  const CRAYON = [
    { label: 'Native: planes → per-op glaze', before: 2.14, after: 1.11, where: 'iPad native WKWebView · per-frame merge, then ADR-0148; three samples 0.96/1.11/1.44%' },
    { label: 'Native A/B: planes on → off', before: 1.87, after: 0.46, where: 'upper ends of the measured bands: 1.21–1.87% with planes, 0.02–0.46% without' },
    { label: 'Web: pass bounds → op rect', before: 2.18, after: 0.97, where: 'iPad Safari · ADR-0147; frame unions measured 2.62%' },
    { label: 'Web: mirror by blit', before: 2.11, after: 1.17, where: 'iPad Safari · halved pattern fills per op (historical, planes era)' },
  ];
  chartRenders.push(() => dumbbell('crayon-svg', CRAYON, { max: 3, ref: 1.5, refLabel: '1.5% gate', unit: '%', decimals: 2 }));
  tableFor('crayon-table', ['Change', 'Before (%)', 'After (%)', 'Where'], CRAYON.map((r) => [r.label, fmt(r.before, 2), fmt(r.after, 2), r.where]));

  /* ---------- chart: costs ---------- */
  chartRenders.push(() => {
    const svg = $('#costs-svg'); if (!svg) return;
    const COSTS = [
      { label: 'Hydration long task', lo: 375, hi: 375, where: 'iPad · the engine boots before it', kind: 'moved' },
      { label: 'Paper texture fetch for export', lo: 226, hi: 226, where: 'warmed at idle', kind: 'moved' },
      { label: 'PNG encode on the main thread', lo: 163, hi: 206, where: 'WebKit toBlob · now a worker', kind: 'moved' },
      { label: 'Theme flip, post-action P95 (was)', lo: 100.1, hi: 100.1, where: 'emulator · coachmark loops', kind: 'moved' },
      { label: 'Compositing transparent tiles', lo: 40, hi: 50, where: 'per theme switch · tiles now hidden', kind: 'moved' },
      { label: 'What’s New mounted at once', lo: 43, hi: 47, where: 'desktop WebKit · now one per frame', kind: 'moved' },
      { label: 'Eraser empty scan', lo: 4.5, hi: 12.3, where: 'Android · now 400 ms after idle', kind: 'moved' },
      { label: 'One frame at 60 Hz', lo: 16.7, hi: 16.7, where: 'iPad budget', kind: 'beat' },
      { label: 'One frame at 120 Hz', lo: 8.3, hi: 8.3, where: 'Android phone budget', kind: 'beat' },
    ];
    const narrow = isNarrow();
    const W = narrow ? 390 : 720, labelW = narrow ? 0 : 230, left = narrow ? 8 : labelW + 14, right = narrow ? 84 : 60, rowH = narrow ? 44 : 30, top = 14, max = 400;
    const H = top + COSTS.length * rowH + 30;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = '';
    const x = (v) => left + (v / max) * (W - left - right);
    for (const t of niceTicks(max)) {
      svg.appendChild(s('line', { class: 'grid', x1: x(t), x2: x(t), y1: top - 4, y2: H - 26 }));
      svg.appendChild(s('text', { x: x(t), y: H - 10, 'text-anchor': 'middle', text: fmt(t) + (t ? ' ms' : '') }));
    }
    COSTS.forEach((c, i) => {
      const y = top + i * rowH + (narrow ? rowH - 22 : (rowH - 16) / 2);
      if (narrow) svg.appendChild(s('text', { class: 'row-label', x: left, y: top + i * rowH + 10, text: c.label }));
      else svg.appendChild(s('text', { class: 'row-label', x: left - 12, y: y + 12, 'text-anchor': 'end', text: c.label }));
      const fill = c.kind === 'beat' ? cssVar('--gold') : cssVar('--accent');
      const w = Math.max(3, x(c.hi) - x(0));
      const bar = s('path', { d: `M${x(0)} ${y} H${x(0) + w - 4} a4 4 0 0 1 4 4 v8 a4 4 0 0 1 -4 4 H${x(0)} Z`, fill, opacity: c.kind === 'beat' ? 1 : 0.8, tabindex: 0 });
      svg.appendChild(bar);
      if (c.hi !== c.lo) svg.appendChild(s('rect', { x: x(c.lo), y: y + 3, width: x(c.hi) - x(c.lo), height: 10, fill: cssVar('--card'), opacity: 0.45 }));
      const val = c.hi === c.lo ? fmt(c.hi, 1) + ' ms' : `${fmt(c.lo, 1)}–${fmt(c.hi, 1)} ms`;
      svg.appendChild(s('text', { x: x(c.hi) + 6, y: y + 12, text: val, fill: cssVar('--ink') }));
      attachTip(bar, `<b>${esc(c.label)}</b><br>${val}<br><span style="opacity:.8">${esc(c.where)}</span>`);
    });
    tableFor('costs-table', ['Cost', 'Low (ms)', 'High (ms)', 'Where it went'], COSTS.map((c) => [c.label, fmt(c.lo, 1), fmt(c.hi, 1), c.where]));
  });

  /* ---------- chart: cache lifetimes ---------- */
  chartRenders.push(() => {
    const svg = $('#cache-svg'); if (!svg) return;
    const ROWS = [
      { label: 'Built JS and CSS (hashed names)', days: 365, note: 'public, max-age=31536000, immutable' },
      { label: 'Coloring pack manifests', days: 365, note: 'immutable' },
      { label: 'Sounds, icons, styles, coloring art', days: 7, note: 'public, max-age=604800 · rename on change' },
      { label: 'CORS preflight (API)', days: 1, note: 'Access-Control-Max-Age: 86400' },
      { label: 'sw.js and version.json', days: 0, note: 'no-cache, no-store, must-revalidate' },
    ];
    const narrow = isNarrow();
    const W = narrow ? 390 : 720, labelW = narrow ? 0 : 250, left = narrow ? 8 : labelW + 14, right = 70, rowH = narrow ? 44 : 32, top = 12, max = 365;
    const H = top + ROWS.length * rowH + 30;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = '';
    const x = (v) => left + (v / max) * (W - left - right);
    for (const t of [0, 90, 180, 270, 365]) {
      svg.appendChild(s('line', { class: 'grid', x1: x(t), x2: x(t), y1: top - 4, y2: H - 26 }));
      svg.appendChild(s('text', { x: x(t), y: H - 10, 'text-anchor': 'middle', text: t ? t + ' d' : '0' }));
    }
    ROWS.forEach((r, i) => {
      const y = top + i * rowH + (narrow ? rowH - 22 : (rowH - 16) / 2);
      if (narrow) svg.appendChild(s('text', { class: 'row-label', x: left, y: top + i * rowH + 10, text: r.label }));
      else svg.appendChild(s('text', { class: 'row-label', x: left - 12, y: y + 12, 'text-anchor': 'end', text: r.label }));
      const w = Math.max(4, x(r.days) - x(0));
      const bar = s('path', { d: `M${x(0)} ${y} H${x(0) + w - 4} a4 4 0 0 1 4 4 v8 a4 4 0 0 1 -4 4 H${x(0)} Z`, fill: r.days ? cssVar('--accent') : cssVar('--bad'), opacity: 0.85, tabindex: 0 });
      svg.appendChild(bar);
      svg.appendChild(s('text', { x: x(r.days) + 8, y: y + 12, text: r.days ? (r.days === 365 ? '1 year' : r.days === 7 ? '1 week' : '1 day') : 'never', fill: cssVar('--ink') }));
      attachTip(bar, `<b>${esc(r.label)}</b><br>${esc(r.note)}`);
    });
  });
  for (const fn of chartRenders) fn();

  /* ---------- heatmap ---------- */
  (() => {
    const host = $('#heat'); if (!host) return;
    const brushes = ['pen', 'crayon', 'magic', 'eraser'];
    const targets = [
      { label: 'iPad · web (Safari)', hz: '60 Hz', v: [0.0079, 0.0023, 0.0079, 0.0082], gate: [0.01, 0.015, 0.01, 0.01] },
      { label: 'iPad · native', hz: '60 Hz', v: [0, 0.0005, 0.0002, 0.0006], gate: [0.01, 0.015, 0.01, 0.01] },
      { label: 'Android · web (Chrome)', hz: '120 Hz', v: [0.0064, 0.0077, 0.0083, 0.0073], gate: [0.01, 0.01, 0.01, 0.01] },
      { label: 'Android · native', hz: '120 Hz', v: [0.0003, 0.0003, 0.0006, 0.0003], gate: [0.01, 0.01, 0.01, 0.01] },
    ];
    host.appendChild(el('div'));
    for (const b of brushes) host.appendChild(el('div', { class: 'h', text: b }));
    const accent = cssVar('--accent');
    for (const t of targets) {
      host.appendChild(el('div', { class: 'rl', html: `${esc(t.label)}<br><small style="color:var(--muted);font-weight:600">${t.hz}</small>` }));
      t.v.forEach((v, i) => {
        const pct = v * 100, share = Math.min(1, v / 0.01);
        const cell = el('div', { class: 'cell' + (v > t.gate[i] ? ' over' : ''), html: `${pct.toFixed(2)}%<small>gate ${t.gate[i] * 100}%</small>`, tabindex: 0 });
        cell.style.background = `color-mix(in srgb, ${accent} ${Math.round(8 + share * 70)}%, var(--card))`;
        attachTip(cell, `<b>${esc(t.label)} · ${b(i)}</b><br>worst of 4 modes: ${pct.toFixed(2)}% lost frame time<br>gate ${t.gate[i] * 100}% · ${t.hz}`);
        host.appendChild(cell);
      });
    }
    function b(i) { return brushes[i]; }
    $('#heat-legend').innerHTML = `<span><i class="dot" style="background:color-mix(in srgb,${accent} 8%,var(--card));border:1px solid var(--hair)"></i>0%</span><span><i class="dot" style="background:color-mix(in srgb,${accent} 78%,var(--card))"></i>1% (the gate)</span><span><i class="dot" style="background:transparent;outline:2px solid var(--bad)"></i>over gate (none)</span>`;
  })();

  /* ---------- inventory ---------- */
  (() => {
    const list = $('#inv-list'); if (!list) return;
    const data = (window.__PERF_INVENTORY__ || []).slice();
    const GROUPS = [
      ['frame', '1 · Do it per frame, not per event', 'var(--c-blue)', '#per-frame'],
      ['changed', '2 · Touch only what changed', 'var(--c-orange)', '#tiles'],
      ['idle', '3 · Do it at idle, never under a finger', 'var(--c-green)', '#idle'],
      ['startup', '4 · Keep it off the startup path', 'var(--c-purple)', '#startup'],
      ['offload', '5 · Move heavy work off the main thread', 'var(--c-pink)', '#offload'],
      ['network', '6 · Never let the network hold a frame', 'var(--c-yellow)', '#network'],
    ];
    for (const [key] of GROUPS) {
      const n = data.filter((d) => d.b === key).length;
      const c = $(`[data-count-for="${key}"]`); if (c) c.textContent = n + ' mechanisms';
    }
    let filter = 'all', query = '';
    const ADR_FILES = {
      '0004': '0004-imperative-canvas-engine.md',
      '0005': '0005-dual-layer-storage.md',
      '0007': '0007-cors-csrf-for-native-api-calls.md',
      '0010': '0010-compile-time-build-constants.md',
      '0013': '0013-platform-detection-without-capacitor-core.md',
      '0015': '0015-capped-dpr-canvas-rendering.md',
      '0022': '0022-pwa-service-worker-strategy.md',
      '0032': '0032-performance-profiling-harness.md',
      '0036': '0036-stroke-simplification-at-commit.md',
      '0040': '0040-per-route-render-modes-and-ssg-home.md',
      '0042': '0042-static-media-cache-invalidation.md',
      '0043': '0043-magic-brush-color-sheet-reveal.md',
      '0045': '0045-coloring-picker-thumbnails-and-prefetch.md',
      '0049': '0049-idle-mount-boot-hidden-overlays.md',
      '0051': '0051-desynchronized-canvas-low-latency.md',
      '0061': '0061-parent-center-section-drill-in.md',
      '0065': '0065-crayon-brush-textured-wax.md',
      '0066': '0066-snapshot-undo-reinstated.md',
      '0068': '0068-crayon-raster-pass-commit.md',
      '0072': '0072-early-engine-boot-adopt-contract.md',
      '0075': '0075-no-web-font-preload-on-drawing-route.md',
      '0076': '0076-scope-toddler-zoom-lock-element-level.md',
      '0082': '0082-resident-snapshot-tier-byte-budget.md',
      '0085': '0085-tiled-live-canvas-for-ipad-webkit.md',
      '0086': '0086-tiled-dirty-region-snapshots-for-frame-bounded-undo.md',
      '0087': '0087-frame-bound-theme-switch-on-ipad-webkit.md',
      '0088': '0088-frame-bound-screenshot-export-on-ipad-webkit.md',
      '0089': '0089-css-presented-tiled-paper-on-rotation.md',
      '0091': '0091-alpha-overlays-and-worker-magic-sheets.md',
      '0103': '0103-progressive-coloring-book-packs.md',
      '0110': '0110-single-replay-worker-canvas-context-recovery.md',
      '0112': '0112-single-beta-page-with-platform-tabs.md',
      '0116': '0116-minimize-a-waiting-generation.md',
      '0121': '0121-recode-retained-magic-ink-with-coloring-appearance.md',
      '0128': '0128-persistent-storage-after-explicit-durable-actions.md',
      '0131': '0131-adaptive-clear-feedback.md',
      '0132': '0132-recover-reset-live-tile-contexts-on-resume.md',
      '0134': '0134-frame-beat-from-the-dominant-interval.md',
      '0136': '0136-browser-target-lost-frame-gate.md',
      '0141': '0141-cadence-is-a-floor-and-silent-checks-are-named.md',
      '0144': '0144-coalescing-is-a-witness-not-a-check.md',
      '0145': '0145-cadence-gates-on-density-not-rate.md',
      '0146': '0146-crayon-op-granularity-per-runtime.md',
      '0147': '0147-crayon-restamp-renderer-no-preview-planes.md',
      '0148': '0148-crayon-per-op-glaze-on-native.md',
      '0152': '0152-responsive-raster-coloring-selectors.md',
      '0153': '0153-reject-webgl-crayon-renderer.md',
      '0156': '0156-physical-rows-gate-releases-advisory-rows-never-count.md',
      '0157': '0157-no-backdrop-blur-on-coarse-pointers.md',
    };
    const adrHref = (a) => REPO + 'docs/adrs/' + (ADR_FILES[a] || '');
    function fileLink([path, lines]) {
      const short = path.replace(/^web\/src\/lib\//, '').replace(/^web\/src\//, '').replace(/^web\//, '');
      const anchor = lines ? '#L' + lines.replace('-', '-L') : '';
      return `<a href="${REPO}${esc(path)}${anchor}" title="${esc(path)}">${esc(short)}${lines ? ':' + esc(lines) : ''}</a>`;
    }
    function render() {
      list.innerHTML = '';
      const q = query.trim().toLowerCase();
      let shown = 0;
      for (const [key, title, hue] of GROUPS) {
        if (filter !== 'all' && filter !== key) continue;
        const rows = data.filter((d) => d.b === key).filter((d) => !q || [d.t, d.s, d.note || '', (d.f || []).map((f) => f[0]).join(' '), (d.a || []).map((a) => 'adr-' + a).join(' ')].join(' ').toLowerCase().includes(q)).sort((a, b) => a.n - b.n);
        if (!rows.length) continue;
        shown += rows.length;
        const group = el('div', { class: 'inv-group' });
        group.style.setProperty('--hue', hue);
        group.appendChild(el('h3', { html: `${esc(title)} <small>${rows.length}</small>` }));
        const box = el('div', { class: 'inv-rows' });
        for (const d of rows) {
          const badge = d.x === 'rev' ? '<span class="badge rev">revised</span>' : d.x === 'new' ? '<span class="badge new">new</span>' : d.x === 'hist' ? '<span class="badge hist">retired</span>' : '';
          const meta = [...(d.f || []).map(fileLink), ...(d.a || []).map((a) => `<a href="${adrHref(a)}">ADR-${a}</a>`)].join('');
          box.appendChild(el('article', { class: 'inv-row', html: `<div class="inv-n">${d.n < 89 ? '#' + d.n : 'new'}</div><div><h4>${esc(d.t)} ${badge}</h4><p>${esc(d.s)}</p>${d.note ? `<p class="muted" style="font-size:.78rem"><b>Since the inventory:</b> ${esc(d.note)}</p>` : ''}<div class="inv-meta">${meta}</div></div>` }));
        }
        group.appendChild(box); list.appendChild(group);
      }
      if (!shown) list.appendChild(el('div', { class: 'inv-empty', text: 'No mechanism matches that search.' }));
      $('#inv-count').textContent = `${shown} of ${data.length}`;
    }
    for (const b of $$('#inv-bar [data-filter]')) b.addEventListener('click', () => { filter = b.dataset.filter; for (const o of $$('#inv-bar [data-filter]')) o.setAttribute('aria-pressed', String(o === b)); render(); });
    $('#inv-search').addEventListener('input', (e) => { query = e.target.value; render(); });
    render();

    const adrs = new Map();
    for (const d of data) for (const a of d.a || []) adrs.set(a, true);
    for (const a of ['0051', '0075', '0036', '0066', '0153', '0141', '0144', '0134', '0136', '0145', '0156', '0157', '0152']) adrs.set(a, true);
    const wrap = $('#adr-links');
    for (const a of Array.from(adrs.keys()).sort()) wrap.appendChild(el('a', { href: adrHref(a), text: 'ADR-' + a }));
  })();

  /* re-render width-dependent charts when the layout breakpoint flips */
  let rz = 0, wasNarrow = isNarrow();
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => { const narrow = isNarrow(); if (narrow !== wasNarrow) { wasNarrow = narrow; for (const fn of chartRenders) fn(); } }, 150);
  }, { passive: true });
})();
