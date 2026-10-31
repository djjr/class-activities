// Helpers shared by the instructor pages. The key comes from the page URL.
// (Copied from roommateDesign, plus JSON bodies for POSTs.)

const params = new URLSearchParams(location.search);
const KEY = params.get('key') || '';

async function iapi(path, method = 'GET', body) {
  const res = await fetch(`/api/i/${path}?key=${encodeURIComponent(KEY)}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

function istream(onMessage) {
  const es = new EventSource(`/api/i/stream?key=${encodeURIComponent(KEY)}`);
  es.onmessage = e => onMessage(JSON.parse(e.data));
  return es;
}

// Two-click confirm without a blocking dialog (dialogs can freeze slide iframes).
function confirmButton(btn, label, action) {
  let original = btn.textContent;
  let armed = null;
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    if (!armed) {
      original = btn.textContent;
      btn.textContent = label;
      btn.classList.add('armed');
      armed = setTimeout(() => { btn.textContent = original; btn.classList.remove('armed'); armed = null; }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    btn.textContent = original;
    btn.classList.remove('armed');
    await action();
  });
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
