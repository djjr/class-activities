// Demo settings: parse and check the URL; if anything is wrong (or there are
// no settings, or ?setup), show a setup screen with selectors and a ready-
// made iframe URL instead of a broken demo.
//
// DemoSetup.ok      true when the demo can run
// DemoSetup.values  parsed settings (defaults filled in)

(function (root) {
  const PHASES = [
    ['chairs', 'Chairs (pure exchange)'],
    ['offices-random', 'Offices: random neighbors'],
    ['offices-like-me', 'Offices: neighbors like me'],
  ];
  const DEFAULT_SEED = { chairs: 17, 'offices-random': 156, 'offices-like-me': 39 };
  const SPEEDS = [0.5, 0.75, 1, 1.5, 2, 3];

  // name -> { kind, default, ...limits }. The order here is the order on the setup screen.
  const PARAMS = {
    phase: { kind: 'enum', values: PHASES.map(p => p[0]), dflt: 'chairs' },
    classifieds: { kind: 'bool', dflt: false },
    money: { kind: 'bool', dflt: false },
    captions: { kind: 'bool', dflt: true },
    speed: { kind: 'num', min: 0.25, max: 10, dflt: 1 },
    meetings: { kind: 'int', min: 4, max: 60, dflt: 24 },
    seed: { kind: 'int', min: 1, max: 999999999, dflt: null },   // null = the phase's default
    title: { kind: 'text', dflt: '' },
    group: { kind: 'text', dflt: '' },
    setup: { kind: 'flag' },
  };
  const TRUE = ['', '1', 'true', 'yes', 'on'], FALSE = ['0', 'false', 'no', 'off'];

  // Edit distance, for "did you mean" on misspelled parameter names.
  function distance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  const closest = (word, options) => {
    const best = options.map(o => [o, distance(word.toLowerCase(), o)]).sort((x, y) => x[1] - y[1])[0];
    return best && best[1] <= Math.max(2, Math.floor(word.length / 3)) ? best[0] : null;
  };

  // Options that start with what was typed ("office" -> both offices phases).
  const startsWith = (word, options) => options.filter(o => o.startsWith(word.toLowerCase()) && word.length >= 3);

  function parse(search) {
    const q = new URLSearchParams(search), problems = [], values = {};
    const apply = (name, raw) => setValue(name, raw, values, problems);
    for (const [name, spec] of Object.entries(PARAMS)) if (spec.kind !== 'flag') values[name] = spec.dflt;
    for (const [rawName, raw] of q) {
      const name = rawName.toLowerCase(), spec = PARAMS[name];
      const v = raw.trim().toLowerCase();
      if (!spec) {
        // A confident guess at a misspelled name is applied, so the selectors
        // below already reflect what was meant.
        const guess = closest(rawName, Object.keys(PARAMS));
        if (guess && PARAMS[guess].kind !== 'flag' && !q.has(guess)) {
          problems.push(`<b>${esc(rawName)}</b> isn't a setting. Did you mean <b>${guess}</b>? (Applied below.)`);
          apply(guess, raw);
        } else problems.push(`<b>${esc(rawName)}</b> isn't a setting${guess ? `. Did you mean <b>${guess}</b>?` : '.'}`);
        continue;
      }
      if (spec.kind === 'flag') continue;
      apply(name, raw);
    }
    if (values.seed == null) values.seed = DEFAULT_SEED[values.phase];
    return { problems, values, empty: [...q.keys()].length === 0, asked: q.has('setup') };
  }

  function setValue(name, raw, values, problems) {
    const spec = PARAMS[name], v = raw.trim().toLowerCase();
    if (spec.kind === 'enum') {
      if (spec.values.includes(v)) values[name] = v;
      else {
        const guesses = [...new Set([closest(v, spec.values), ...startsWith(v, spec.values)].filter(Boolean))];
        const hint = guesses.length ? `. Did you mean ${guesses.map(g => `<b>${g}</b>`).join(' or ')}?` : '';
        problems.push(`<b>${name}=${esc(raw)}</b> isn't a ${name}${hint} Choose ${spec.values.map(x => `<code>${x}</code>`).join(', ')}.`);
      }
    } else if (spec.kind === 'bool') {
      if (TRUE.includes(v)) values[name] = true;
      else if (FALSE.includes(v)) values[name] = false;
      else problems.push(`<b>${name}=${esc(raw)}</b> should be <code>1</code> or <code>0</code>.`);
    } else if (spec.kind === 'num' || spec.kind === 'int') {
      const x = Number(v);
      if (!Number.isFinite(x) || (spec.kind === 'int' && !Number.isInteger(x)) || x < spec.min || x > spec.max) {
        problems.push(`<b>${name}=${esc(raw)}</b> should be ${spec.kind === 'int' ? 'a whole number' : 'a number'} from ${spec.min} to ${spec.max}.`);
      } else values[name] = x;
    } else values[name] = raw.slice(0, 60);
  }

  // Only settings that differ from their defaults go in the URL (phase always does).
  function buildQuery(v) {
    const q = new URLSearchParams();
    q.set('phase', v.phase);
    if (v.classifieds) q.set('classifieds', '1');
    if (v.money) q.set('money', '1');
    if (!v.captions) q.set('captions', '0');
    if (v.speed !== 1) q.set('speed', String(v.speed));
    if (v.meetings !== 24) q.set('meetings', String(v.meetings));
    if (v.seed !== DEFAULT_SEED[v.phase]) q.set('seed', String(v.seed));
    if (v.title) q.set('title', v.title);
    if (v.group) q.set('group', v.group);
    return q.toString();
  }

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function showSetup({ problems, values, empty }) {
    document.body.classList.remove('slide');
    document.body.classList.add('setup-page');
    const intro = problems.length
      ? `<div class="setup-problems"><b>This demo's URL needs fixing:</b><ul>${problems.map(p => `<li>${p}</li>`).join('')}</ul>
         The selectors below keep the settings that were valid.</div>`
      : empty ? '<p class="muted">Choose the settings for this pane, then copy the URL into a slides.com iframe.</p>' : '';
    document.body.innerHTML = `
      <main class="setup">
        <h1>Market Exchange demo · settings</h1>
        ${intro}
        <form id="setupForm">
          <fieldset><legend>Phase</legend>
            ${PHASES.map(([id, label]) => `<label class="opt"><input type="radio" name="phase" value="${id}" ${values.phase === id ? 'checked' : ''}> ${label}</label>`).join('')}
          </fieldset>
          <fieldset><legend>Institutions in this pane</legend>
            <label class="opt"><input type="checkbox" name="classifieds" ${values.classifieds ? 'checked' : ''}> Classifieds</label>
            <label class="opt"><input type="checkbox" name="money" ${values.money ? 'checked' : ''}> Money (side payments)</label>
            <p class="muted small">Neither = plain market. For a side-by-side slide, make a second pane with the same phase and seed and different institutions.</p>
          </fieldset>
          <fieldset class="grid2"><legend>Presentation</legend>
            <label>Speed <select name="speed">${SPEEDS.map(s => `<option value="${s}" ${values.speed === s ? 'selected' : ''}>${s}×${s === 1 ? ' (about 3.5 s per meeting)' : ''}</option>`).join('')}
              ${SPEEDS.includes(values.speed) ? '' : `<option value="${values.speed}" selected>${values.speed}×</option>`}</select></label>
            <label>Meetings <input type="number" name="meetings" min="4" max="60" value="${values.meetings}"></label>
            <label class="opt"><input type="checkbox" name="captions" ${values.captions ? 'checked' : ''}> Captions (off if you'll narrate)</label>
          </fieldset>
          <fieldset class="grid2"><legend>Advanced</legend>
            <label>Seed <input type="number" name="seed" min="1" value="${values.seed}"> <span class="muted small">same seed = same economy</span></label>
            <label>Title <input type="text" name="title" maxlength="60" value="${esc(values.title)}" placeholder="automatic"></label>
            <label>Sync group <input type="text" name="group" maxlength="20" value="${esc(values.group)}" placeholder="default"> <span class="muted small">only if two demo slides would sync</span></label>
          </fieldset>
        </form>
        <div class="setup-out">
          <div class="muted small">URL for this pane's iframe</div>
          <div class="url-row"><code id="url"></code><button class="btn small" id="copy">Copy</button></div>
          <div class="muted small" id="pairNote"></div>
          <div class="url-row" id="pairRow"><code id="pairUrl"></code><button class="btn small secondary" id="copyPair">Copy</button></div>
          <div class="row" style="margin-top:12px"><a class="btn" id="run">Run demo with these settings</a></div>
        </div>
      </main>`;
    const form = document.getElementById('setupForm');
    const read = () => {
      const f = new FormData(form), phase = f.get('phase');
      const num = (k, d) => { const x = Number(f.get(k)); return Number.isFinite(x) && x > 0 ? x : d; };
      return {
        phase, classifieds: f.has('classifieds'), money: f.has('money'), captions: f.has('captions'),
        speed: num('speed', 1), meetings: Math.min(60, Math.max(4, Math.round(num('meetings', 24)))),
        seed: Math.round(num('seed', DEFAULT_SEED[phase])),
        title: (f.get('title') || '').trim(), group: (f.get('group') || '').trim(),
      };
    };
    let lastPhase = values.phase;
    const update = () => {
      const v = read();
      // Switching phase resets the seed to that phase's default, unless it was customized.
      if (v.phase !== lastPhase) {
        if (v.seed === DEFAULT_SEED[lastPhase]) { v.seed = DEFAULT_SEED[v.phase]; form.seed.value = v.seed; }
        lastPhase = v.phase;
      }
      const url = `${location.origin}/demo?${buildQuery(v)}`;
      document.getElementById('url').textContent = url;
      document.getElementById('run').href = url;
      // The matching other pane: plain market if this pane has an institution, else classifieds.
      const other = v.classifieds || v.money ? { ...v, classifieds: false, money: false, title: '' } : { ...v, classifieds: true, title: '' };
      document.getElementById('pairNote').textContent = v.classifieds || v.money ? 'Matching plain-market pane (same phase and seed)' : 'A matching pane with classifieds (same phase and seed)';
      document.getElementById('pairUrl').textContent = `${location.origin}/demo?${buildQuery(other)}`;
    };
    const copy = (id, btn) => {
      const text = document.getElementById(id).textContent;
      const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => selectText(id));
      else selectText(id);
    };
    const selectText = id => { const r = document.createRange(); r.selectNodeContents(document.getElementById(id)); getSelection().removeAllRanges(); getSelection().addRange(r); };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    document.getElementById('copy').onclick = e => copy('url', e.target);
    document.getElementById('copyPair').onclick = e => copy('pairUrl', e.target);
    update();
  }

  const parsed = parse(location.search);
  const ok = !parsed.problems.length && !parsed.empty && !parsed.asked;
  if (!ok) {
    const go = () => showSetup(parsed);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
  root.DemoSetup = { ok, values: parsed.values, parse, buildQuery, DEFAULT_SEED };
})(globalThis);
