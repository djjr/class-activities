// Helpers shared by the instructor pages. The key comes from the page URL.

const params = new URLSearchParams(location.search);
const KEY = params.get('key') || '';
document.documentElement.dataset.theme = params.get('theme') || 'light';

// ---------- Admin key ----------
// The URL's ?key= is the VIEW key (it is in the public deck). The ADMIN key
// is typed once on the instructor's own browser and kept in localStorage,
// so it never appears in a URL anyone else can see.
function adminKey() { try { return localStorage.getItem('admin-key') || ''; } catch { return ''; } }
function setAdminKey(k) { try { k ? localStorage.setItem('admin-key', k) : localStorage.removeItem('admin-key'); } catch { /* storage blocked */ } }

async function iapi(path, method = 'GET', body) {
  const res = await fetch(`/api/i/${path}?key=${encodeURIComponent(KEY)}`, {
    method,
    headers: { 'X-Admin-Key': adminKey(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// EventSource can't send headers, so the admin key rides in the query string
// (only on the instructor's own browser; it is not in the deck).
function istream(onMessage) {
  const admin = adminKey() ? `&admin=${encodeURIComponent(adminKey())}` : '';
  const es = new EventSource(`/api/i/stream?key=${encodeURIComponent(KEY)}${admin}`);
  es.onmessage = e => onMessage(JSON.parse(e.data));
  return es;
}

// Lock control. Puts a small lock button in `el`. Elements with class
// "admin-only" are shown only when <body> has class "is-admin".
// Unlocking/locking reloads the page so the stream reconnects with or
// without names. No prompt(): dialogs can freeze slide iframes.
async function adminGate(el) {
  let admin = false;
  if (adminKey()) {
    try { admin = (await iapi('whoami')).admin; } catch { admin = false; }
    if (!admin) setAdminKey('');   // stale or wrong key
  }
  document.body.classList.toggle('is-admin', admin);
  if (admin) {
    el.innerHTML = '<button class="link lock" title="Lock controls on this browser">🔓 Lock</button>';
    el.querySelector('button').onclick = () => { setAdminKey(''); location.reload(); };
  } else {
    el.innerHTML = `<button class="link lock" title="Unlock instructor controls">🔒 Unlock</button>
      <form class="unlock" hidden><input type="password" placeholder="Admin key" autocomplete="current-password"><button class="link">Unlock</button><span class="unlock-err"></span></form>`;
    const form = el.querySelector('form');
    el.querySelector('.lock').onclick = () => { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); };
    form.onsubmit = async e => {
      e.preventDefault();
      setAdminKey(form.querySelector('input').value.trim());
      const ok = await iapi('whoami').then(r => r.admin).catch(() => false);
      if (ok) location.reload();
      else { setAdminKey(''); form.querySelector('.unlock-err').textContent = 'Wrong key'; }
    };
  }
  return admin;
}

// Two-click confirm without a blocking dialog (dialogs can freeze slide iframes).
function confirmButton(btn, label, action) {
  const original = btn.textContent;
  let armed = null;
  btn.addEventListener('click', async () => {
    if (!armed) {
      btn.textContent = label;
      armed = setTimeout(() => { btn.textContent = original; armed = null; }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    btn.textContent = original;
    await action();
  });
}
