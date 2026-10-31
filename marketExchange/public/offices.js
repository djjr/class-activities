// Office map rendering, shared by the student page and the room view.
// Each office cell is colored by its occupant's type (1 quiet .. 5 loud).

(function () {
  const TYPE_COLORS = ['#2d5f8a', '#4fa3a5', '#9ccf6c', '#f2c14e', '#e3743a'];
  const TYPE_INK = ['#fff', '#fff', '#1d2b12', '#3a2a00', '#fff'];
  const TYPE_WORDS = ['very quiet', 'quiet', 'middling', 'loud', 'very loud'];

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function typeChip(t, label = '') {
    return `<span class="type-chip" style="background:${TYPE_COLORS[t - 1]};color:${TYPE_INK[t - 1]}">${t}</span>${label}`;
  }

  // grid: { rows, cols, cells: [{kind:'me'|'student'|'phantom', index, name, type} | null] }
  // opts: { showNames, highlight: Set of student indices, clickable }
  function renderOfficeMap(el, grid, opts = {}) {
    el.className = 'office-map';
    el.style.gridTemplateColumns = `repeat(${grid.cols}, 1fr)`;
    el.innerHTML = grid.cells.map((c, k) => {
      if (!c) return '<div class="office empty"></div>';
      const style = c.kind === 'phantom' ? '' : `background:${TYPE_COLORS[c.type - 1]};color:${TYPE_INK[c.type - 1]}`;
      const cls = ['office', c.kind, opts.highlight && opts.highlight.has(c.index) ? 'flash' : ''].join(' ');
      const name = c.kind === 'me' ? 'You' : c.kind === 'phantom' ? '' : (opts.showNames ? esc(c.name) : '');
      const attrs = opts.clickable && c.kind === 'student' ? ` data-index="${c.index}" role="button" tabindex="0"` : '';
      return `<div class="${cls}" style="${style}"${attrs}><span class="office-type">${c.type}</span><span class="office-name">${name}</span></div>`;
    }).join('');
  }

  globalThis.Offices = { TYPE_COLORS, TYPE_WORDS, typeChip, renderOfficeMap };
})();
