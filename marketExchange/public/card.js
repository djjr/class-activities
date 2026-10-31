// The chair card: a student's phone screen in the Chairs phase.
// Meant to be HELD UP and read from ~2 m away, so:
//   - Shade is the whole card's background (and also a bar, since screen
//     brightness varies between phones and color alone is hard to rank).
//   - Every attribute is a row of 5 big blocks, not a number.
//   - The private strip (your target + score) is small and at the bottom.
//
// renderChairCard(el, { dims, chair, target, score, nickname })
//   dims    MarketSim.DIMS (ids, labels, lo/hi words)
//   chair   [1..5, 1..5, 1..5, 1..5]   what you hold (public)
//   target  [1..5, ...]                what you want (private)
//   score   0..64

(function () {
  // Five steps of one hue, pale -> deep. Text flips to white from step 4.
  const SHADES = ['#eef3f8', '#c9dbee', '#90b4da', '#4f80b8', '#1f4a82'];
  const darkText = level => level <= 3;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function blocks(value, cls) {
    let html = `<span class="${cls}" role="img" aria-label="${value} of 5">`;
    for (let k = 1; k <= 5; k++) html += `<i class="${k <= value ? 'on' : ''}"></i>`;
    return html + '</span>';
  }

  function renderChairCard(el, { dims, chair, target, score, nickname }) {
    const shade = chair[0];
    el.className = 'chair-card ' + (darkText(shade) ? 'ink-dark' : 'ink-light');
    el.style.setProperty('--card-bg', SHADES[shade - 1]);

    const rows = dims.map((d, k) => `
      <div class="attr">
        <div class="attr-label">${esc(d.label)}</div>
        ${blocks(chair[k], 'bar')}
        <div class="attr-ends"><span>${esc(d.lo)}</span><span>${esc(d.hi)}</span></div>
      </div>`).join('');

    // The strip lines up your target with the card's rows: one mini bar per
    // dimension, with a check where your chair already matches.
    const wants = dims.map((d, k) => `
      <div class="want" title="${esc(d.label)}">
        <span class="want-label">${esc(d.label)}</span>
        ${blocks(target[k], 'mini')}
        <span class="match">${target[k] === chair[k] ? '✓' : ''}</span>
      </div>`).join('');

    el.innerHTML = `
      <div class="card-face">
        <div class="nick">${esc(nickname || '')}</div>
        <div class="attrs">${rows}</div>
      </div>
      <div class="private">
        <div class="wants"><div class="private-title">You want</div>${wants}</div>
        <div class="score"><div class="private-title">Score</div><div class="score-num">${score}</div><div class="score-max">of 64</div></div>
      </div>`;
  }

  globalThis.renderChairCard = renderChairCard;
})();
