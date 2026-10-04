// Shared results view: frequency bars, co-selection graph, writeups panel.
// Used by the student page (anonymous) and the instructor aggregate slide.

(function () {
  const MIN_FOR_GRAPH = 5;
  const W = 420, H = 340;

  function el(tag, attrs = {}, ...children) {
    const svg = ['svg', 'g', 'circle', 'line', 'text', 'tspan', 'title'].includes(tag);
    const node = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'onclick') node.addEventListener('click', v);
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  // Split a label into at most two lines for graph nodes.
  function wrapLabel(label) {
    const words = label.replace(' / ', '/').split(' ');
    if (label.length <= 14 || words.length === 1) return [label.replace(' / ', '/')];
    let best = 1, bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
      if (diff < bestDiff) { best = i; bestDiff = diff; }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }

  // Live spring layout. Nodes persist across data updates so the picture
  // adjusts gently instead of restarting; drag a node and its strongly
  // linked partners follow, then it springs back on release.
  function forceGraph(box, virtues, { onTap }) {
    const cx = W / 2, cy = H / 2;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Co-selection graph' });
    const edgeLayer = el('g'), nodeLayer = el('g');
    svg.append(edgeLayer, nodeLayer);
    const waiting = el('div', { class: 'waiting' });
    box.append(waiting, svg);

    const nodes = virtues.map((v, i) => {
      const a = (2 * Math.PI * i) / virtues.length;
      const lines = wrapLabel(v.label);
      const n = {
        id: v.id, x: cx + 120 * Math.cos(a), y: cy + 110 * Math.sin(a), vx: 0, vy: 0, r: 8,
        fx: null, fy: null, lines,
        title: el('title', {}),
        hit: el('circle', { class: 'hit' }), // larger invisible tap target
        circle: el('circle', { class: 'dot' }),
        spans: lines.map((t, k) => el('tspan', { dy: k ? 12 : 0 }, t)),
      };
      n.text = el('text', {}, ...n.spans);
      n.g = el('g', { class: 'node' }, n.title, n.hit, n.circle, n.text);
      nodeLayer.append(n.g);
      attachDrag(n);
      return n;
    });
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    let edges = [];
    let alpha = 1, alphaTarget = 0, running = false;

    function toSvg(e) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
      return { x: p.x, y: p.y };
    }

    function attachDrag(n) {
      let start = null, dragging = false;
      n.g.addEventListener('pointerdown', e => {
        e.preventDefault();
        n.g.setPointerCapture(e.pointerId);
        start = { x: e.clientX, y: e.clientY };
        dragging = false;
      });
      n.g.addEventListener('pointermove', e => {
        if (!start) return;
        if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        dragging = true;
        const p = toSvg(e);
        n.fx = p.x; n.fy = p.y;
        alphaTarget = 0.3;
        reheat(0.3);
      });
      const end = () => {
        if (!start) return;
        if (!dragging) onTap(n.id);
        start = null;
        n.fx = n.fy = null; // let it spring back
        alphaTarget = 0;
      };
      n.g.addEventListener('pointerup', end);
      n.g.addEventListener('pointercancel', end);
    }

    function tick() {
      alpha += (alphaTarget - alpha) * 0.02;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const x = a.x - b.x, y = a.y - b.y;
          const d2 = Math.max(x * x + y * y, 1), d = Math.sqrt(d2);
          const f = (2500 / d2) * alpha;
          a.vx += (x / d) * f; a.vy += (y / d) * f;
          b.vx -= (x / d) * f; b.vy -= (y / d) * f;
        }
      }
      for (const e of edges) {
        const a = byId[e.a], b = byId[e.b];
        const x = b.x - a.x, y = b.y - a.y, d = Math.max(Math.hypot(x, y), 1);
        // Pull grows with the square of how far above chance the pair is,
        // so weak links barely tug and strong ones form visible clusters.
        const target = 40;
        const f = 0.2 * (d - target) * Math.min(e.lift - 1, 2) ** 2 * alpha;
        a.vx += (x / d) * f; a.vy += (y / d) * f;
        b.vx -= (x / d) * f; b.vy -= (y / d) * f;
      }
      for (const n of nodes) {
        if (n.fx != null) {
          n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0;
          continue;
        }
        n.vx = (n.vx + 0.03 * (cx - n.x) * alpha) * 0.6;
        n.vy = (n.vy + 0.03 * (cy - n.y) * alpha) * 0.6;
        const sp = Math.hypot(n.vx, n.vy);
        if (sp > 15) { n.vx *= 15 / sp; n.vy *= 15 / sp; }
        n.x = Math.min(W - 45, Math.max(45, n.x + n.vx));
        n.y = Math.min(H - 30, Math.max(22, n.y + n.vy));
      }
    }

    function draw() {
      for (const n of nodes) {
        n.circle.setAttribute('cx', n.x);
        n.circle.setAttribute('cy', n.y);
        n.circle.setAttribute('r', n.r);
        n.hit.setAttribute('cx', n.x);
        n.hit.setAttribute('cy', n.y);
        n.hit.setAttribute('r', Math.max(n.r + 4, 16));
        n.text.setAttribute('y', n.y + n.r + 12);
        for (const t of n.spans) t.setAttribute('x', n.x);
      }
      for (const e of edges) {
        const a = byId[e.a], b = byId[e.b];
        e.line.setAttribute('x1', a.x); e.line.setAttribute('y1', a.y);
        e.line.setAttribute('x2', b.x); e.line.setAttribute('y2', b.y);
      }
    }

    function loop() {
      tick();
      draw();
      if (alpha < 0.005 && alphaTarget === 0) { running = false; return; }
      requestAnimationFrame(loop);
    }

    function reheat(a) {
      alpha = Math.max(alpha, a);
      if (!running) { running = true; requestAnimationFrame(loop); }
    }

    let lastAgg = null;
    return {
      // Called on every render; only new data reheats the simulation.
      update(agg, { mine, active }) {
        const { n, counts, pairs } = agg;
        const enough = n >= MIN_FOR_GRAPH;
        waiting.hidden = enough;
        svg.style.display = enough ? '' : 'none';
        waiting.textContent = `Waiting for more designs (${n} of ${MIN_FOR_GRAPH} needed)…`;
        const v = Object.fromEntries(virtues.map(x => [x.id, x]));
        // Area tracks count relative to the most-picked virtue: 5 (none) to 14 (most).
        const maxCount = Math.max(1, ...Object.values(counts));
        for (const nd of nodes) {
          nd.r = 5 + 9 * Math.sqrt(counts[nd.id] / maxCount);
          nd.title.textContent = `${v[nd.id].label}: ${counts[nd.id]}`;
          nd.spans[nd.spans.length - 1].textContent = `${nd.lines[nd.lines.length - 1]} · ${counts[nd.id]}`;
          nd.g.setAttribute('class', ['node', mine.has(nd.id) && 'mine', counts[nd.id] === 0 && 'zero', active === nd.id && 'active']
            .filter(Boolean).join(' '));
        }
        if (agg !== lastAgg) {
          const first = !lastAgg || lastAgg.n < MIN_FOR_GRAPH;
          lastAgg = agg;
          edges = pairs.filter(p => p.count >= 2 && p.lift > 1).map(p => ({
            ...p, line: el('line', { class: 'edge', 'stroke-width': Math.min(1 + 3 * (p.lift - 1), 8) }),
          }));
          edgeLayer.replaceChildren(...edges.map(e => e.line));
          if (enough) reheat(first ? 1 : 0.3);
        }
        draw();
      },
      shake() {
        for (const nd of nodes) {
          nd.x = 50 + Math.random() * (W - 100);
          nd.y = 30 + Math.random() * (H - 60);
          nd.vx = nd.vy = 0;
        }
        reheat(1);
      },
    };
  }

  // Virtues in teaching order: most picked first.
  function ordered(virtues, counts) {
    return [...virtues].sort((a, b) => counts[b.id] - counts[a.id] || a.label.localeCompare(b.label));
  }

  // Default panel: the virtue with the most writeups, else the most picked.
  function defaultVirtue(virtues, agg) {
    const written = id => agg.byVirtue[id].excess.length + agg.byVirtue[id].missing.length;
    return [...virtues].sort((a, b) => written(b.id) - written(a.id) || agg.counts[b.id] - agg.counts[a.id])[0].id;
  }

  function create(root, { virtues, instructor = false }) {
    const byId = Object.fromEntries(virtues.map(v => [v.id, v]));
    const state = { agg: null, mine: new Set(), showNames: false, active: null };
    const stacked = window.matchMedia('(max-width: 719px)');

    const graphBox = el('div', { class: 'graph' });
    const writeBox = el('div', { class: 'card writeups' });
    root.append(
      el('div', { class: 'results' },
        el('div', { class: 'card' },
          el('div', { class: 'row' },
            el('h2', {}, 'Virtues chosen'),
            el('span', { class: 'spacer' }),
            el('button', { class: 'link small', onclick: () => graph.shake() }, 'Shake')),
          el('p', { class: 'small muted' },
            'Size = how many picked it. Lines join virtues picked together more often than chance. Tap a virtue to read its failure modes; drag to explore.'),
          graphBox),
        writeBox));

    const graph = forceGraph(graphBox, virtues, { onTap: id => select(id, true) });

    function select(id, fromGraph = false) {
      state.active = id;
      render();
      if (fromGraph && stacked.matches) writeBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function step(delta) {
      const order = ordered(virtues, state.agg.counts);
      const i = order.findIndex(v => v.id === state.active);
      select(order[(i + delta + order.length) % order.length].id);
    }

    function entryList(entries, cls) {
      if (!entries.length) return el('p', { class: 'none' }, 'Nothing written yet.');
      return el('ul', { class: cls }, entries.map(e => el('li', {},
        instructor && state.showNames && e.author ? el('div', { class: 'author' }, e.author) : null,
        e.failure ? el('pre', { class: 'fm' }, e.failure) : null,
        e.workaround ? el('pre', { class: 'wa' }, e.workaround) : null)));
    }

    function renderWriteups() {
      const { n, counts, byVirtue } = state.agg;
      const v = byId[state.active];
      const w = byVirtue[v.id];
      const order = ordered(virtues, counts);
      const pos = order.findIndex(x => x.id === v.id) + 1;
      const name = v.label.toLowerCase(); // reads naturally mid-sentence
      writeBox.replaceChildren(
        el('div', { class: 'row panel-head' },
          el('button', { class: 'nav', 'aria-label': 'Previous virtue', onclick: () => step(-1) }, '‹'),
          el('div', { class: 'panel-title' },
            el('h2', {}, v.label),
            el('div', { class: 'small muted' },
              `Picked by ${counts[v.id]} of ${n} · Ranked ${pos} of ${order.length}`,
              state.mine.has(v.id) ? el('span', { class: 'mine-tag' }, '★ in your design') : null)),
          el('button', { class: 'nav', 'aria-label': 'Next virtue', onclick: () => step(1) }, '›')),
        el('p', { class: 'small muted def' }, v.def),
        el('section', {},
          el('h3', {}, `Failure modes with excessive ${name}`),
          entryList(w.excess, 'excess')),
        el('section', {},
          el('h3', {}, `Failure modes with absence of ${name}`),
          entryList(w.missing, 'missing')));
    }

    function render() {
      if (!state.agg) return;
      if (!state.active) state.active = defaultVirtue(virtues, state.agg);
      graph.update(state.agg, { mine: state.mine, active: state.active });
      renderWriteups();
    }

    return {
      update(agg, { mine, showNames } = {}) {
        state.agg = agg;
        if (mine) state.mine = new Set(mine);
        if (showNames != null) state.showNames = showNames;
        render();
      },
      setShowNames(on) { state.showNames = on; render(); },
    };
  }

  window.Results = { create };
})();
