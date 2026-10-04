// Helpers shared by the instructor pages. The key comes from the page URL.

const params = new URLSearchParams(location.search);
const KEY = params.get('key') || '';
document.documentElement.dataset.theme = params.get('theme') || 'light';

async function iapi(path, method = 'GET') {
  const res = await fetch(`/api/i/${path}?key=${encodeURIComponent(KEY)}`, { method });
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
