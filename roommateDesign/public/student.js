// Student page: join, design (pick virtues + notes), submit, view class results.

(function () {
  const $ = id => document.getElementById(id);
  const code = location.pathname.split('/').pop().toUpperCase();

  // ---------- Local storage (wrapped: may be unavailable) ----------

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function randomId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const pid = load('rd.pid', null) || randomId();
  store('rd.pid', pid);

  const DRAFT_KEY = `rd.draft.${code}`;
  const SUBMITTED_KEY = `rd.submitted.${code}`;
  const JOINED_KEY = `rd.joined.${code}`;

  // draft.notes[id] = { excess: {failure, workaround}, missing: {failure, workaround} }
  let draft = load(DRAFT_KEY, { selected: [], notes: {} });
  let lastSubmitted = load(SUBMITTED_KEY, null); // the payload last accepted by the server
  let info = null;
  let closed = false;
  let results = null;

  function show(screen) {
    for (const s of ['msgScreen', 'joinScreen', 'mainScreen']) $(s).hidden = s !== screen;
  }
  function fail(msg) {
    $('msgText').textContent = msg;
    show('msgScreen');
  }

  async function api(path, body) {
    const res = await fetch(`/api/s/${code}/${path}`, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  }

  // ---------- Startup ----------

  async function start() {
    try {
      info = await api('info');
    } catch (e) {
      return fail(e.message);
    }
    closed = info.closed;
    document.querySelectorAll('.budgetN').forEach(n => (n.textContent = info.budget));
    draft.selected = draft.selected.filter(id => info.virtues.some(v => v.id === id));
    if (load(JOINED_KEY, false)) enterMain();
    else show('joinScreen');
  }

  $('joinForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('join', { pid, name: $('jName').value, nickname: $('jNick').value, group: $('jGroup').value });
    } catch (err) {
      return fail(err.message);
    }
    store(JOINED_KEY, true);
    enterMain();
  });

  function enterMain() {
    show('mainScreen');
    results = Results.create($('resultsRoot'), { virtues: info.virtues });
    renderBoard();
    updateStatus();
    connect();
  }

  // ---------- Design board ----------

  function noteFor(id, mode) {
    return draft.notes[id]?.[mode] || { failure: '', workaround: '' };
  }
  function modeOf(id) {
    return draft.selected.includes(id) ? 'excess' : 'missing';
  }
  function hasNote(id) {
    const n = noteFor(id, modeOf(id));
    return !!(n.failure.trim() || n.workaround.trim());
  }

  function saveDraft() {
    store(DRAFT_KEY, draft);
    updateStatus();
  }

  function pill(v) {
    const node = document.createElement('div');
    node.className = 'pill';
    node.draggable = !closed;
    node.dataset.id = v.id;

    const text = document.createElement('div');
    text.className = 'text';
    text.setAttribute('role', 'button');
    text.tabIndex = 0;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = v.label;
    const def = document.createElement('span');
    def.className = 'def';
    def.textContent = v.def;
    text.append(name, def);
    text.addEventListener('click', () => toggle(v.id, node));
    text.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(v.id, node); } });

    const edit = document.createElement('button');
    edit.className = 'edit' + (hasNote(v.id) ? ' has-note' : '');
    edit.type = 'button';
    edit.textContent = '✎';
    edit.setAttribute('aria-label', `Describe how ${v.label} could fail`);
    edit.addEventListener('click', () => openNote(v.id));

    node.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', v.id));
    node.append(text, edit);
    return node;
  }

  function renderBoard() {
    const sel = $('selectedPills'), uns = $('unselectedPills');
    sel.replaceChildren();
    uns.replaceChildren();
    for (const v of info.virtues) {
      (draft.selected.includes(v.id) ? sel : uns).append(pill(v));
    }
    if (!draft.selected.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Tap virtues below to add them.';
      sel.append(empty);
    }
    $('budget').textContent = `${draft.selected.length} / ${info.budget}`;
  }

  function toggle(id, node) {
    if (closed) return;
    if (draft.selected.includes(id)) {
      draft.selected = draft.selected.filter(x => x !== id);
    } else if (draft.selected.length >= info.budget) {
      node?.classList.remove('shake'); void node?.offsetWidth; node?.classList.add('shake');
      const b = $('budget');
      b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
      return;
    } else {
      draft.selected.push(id);
    }
    saveDraft();
    renderBoard();
  }

  // Desktop drag and drop between zones.
  document.querySelectorAll('.zone').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const wantSelected = zone.dataset.zone === 'selected';
      if (draft.selected.includes(id) !== wantSelected) {
        toggle(id, document.querySelector(`.pill[data-id="${id}"]`));
      }
    });
  });

  // ---------- Note dialog ----------

  let editing = null;

  function openNote(id) {
    const v = info.virtues.find(x => x.id === id);
    const mode = modeOf(id);
    editing = { id, mode };
    const n = noteFor(id, mode);
    $('dlgTag').className = `mode-tag ${mode}`;
    $('dlgTag').textContent = mode === 'excess' ? 'SELECTED' : 'NOT SELECTED';
    $('dlgTitle').textContent = v.label;
    $('dlgDef').textContent = v.def;
    $('dlgPrompt').textContent = mode === 'excess'
      ? 'How could this fail if expressed in excess?'
      : 'How could this fail because it is missing?';
    $('dlgFailure').value = n.failure;
    $('dlgWork').value = n.workaround;
    for (const t of ['dlgFailure', 'dlgWork']) $(t).readOnly = closed;
    $('noteDlg').showModal();
  }

  function captureNote() {
    if (!editing || closed) return;
    const { id, mode } = editing;
    draft.notes[id] = draft.notes[id] || {};
    draft.notes[id][mode] = { failure: $('dlgFailure').value, workaround: $('dlgWork').value };
    saveDraft();
  }
  $('dlgFailure').addEventListener('input', captureNote);
  $('dlgWork').addEventListener('input', captureNote);
  $('noteDlg').addEventListener('close', () => { editing = null; renderBoard(); });

  // ---------- Submit ----------

  function payload() {
    const notes = {};
    for (const v of info.virtues) {
      const n = noteFor(v.id, modeOf(v.id));
      if (n.failure.trim() || n.workaround.trim()) notes[v.id] = { failure: n.failure, workaround: n.workaround };
    }
    return { selected: [...draft.selected], notes };
  }

  function updateStatus() {
    const s = $('status');
    s.className = 'status';
    if (closed) {
      s.textContent = lastSubmitted ? 'Submitted. Submissions are now closed.' : 'Submissions are closed.';
    } else if (!lastSubmitted) {
      s.textContent = 'Not submitted yet';
    } else if (JSON.stringify(payload()) === JSON.stringify(lastSubmitted)) {
      s.textContent = 'Submitted ✓';
      s.classList.add('ok');
    } else {
      s.textContent = 'You have changes that are not submitted yet.';
    }
    $('submitBtn').disabled = closed;
    $('submitBtn').textContent = lastSubmitted ? 'Submit changes' : 'Submit';
  }

  $('submitBtn').addEventListener('click', async () => {
    const data = payload();
    $('submitBtn').disabled = true;
    try {
      await api('submit', { pid, data });
      lastSubmitted = data;
      store(SUBMITTED_KEY, data);
      updateStatus();
      showTab('results');
    } catch (e) {
      updateStatus();
      $('status').textContent = e.message;
      $('status').className = 'status err';
    }
  });

  // ---------- Tabs ----------

  function showTab(which) {
    $('tabDesign').setAttribute('aria-selected', which === 'design');
    $('tabResults').setAttribute('aria-selected', which === 'results');
    $('designPane').hidden = which !== 'design';
    $('resultsPane').hidden = which !== 'results';
    $('budget').hidden = which !== 'design';
  }
  $('tabDesign').addEventListener('click', () => showTab('design'));
  $('tabResults').addEventListener('click', () => showTab('results'));

  // ---------- Live updates ----------

  function connect() {
    const es = new EventSource(`/api/s/${code}/stream?pid=${encodeURIComponent(pid)}`);
    es.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.ended) {
        es.close();
        return fail('This session has ended. Thanks for taking part!');
      }
      if (msg.closed !== closed) {
        closed = msg.closed;
        renderBoard();
      }
      $('closedBanner').hidden = !closed;
      // Server may have forgotten us (e.g. a new session with the same browser); trust it.
      if (!msg.submitted && lastSubmitted && !closed) {
        lastSubmitted = null;
        store(SUBMITTED_KEY, null);
      }
      updateStatus();
      $('resultsLocked').hidden = !!msg.aggregate;
      $('resultsRoot').hidden = !msg.aggregate;
      if (msg.aggregate) results.update(msg.aggregate, { mine: lastSubmitted?.selected || [] });
    };
    es.onerror = async () => {
      // EventSource retries on its own unless the server refused (e.g. session gone).
      if (es.readyState !== EventSource.CLOSED) return;
      try {
        await api('info');
        setTimeout(connect, 3000);
      } catch (e) {
        if (e instanceof TypeError) setTimeout(connect, 3000); // network down; keep trying
        else fail('This session has ended. Thanks for taking part!');
      }
    };
  }

  start();
})();
