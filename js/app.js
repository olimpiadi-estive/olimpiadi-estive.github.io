import { CONFIG } from './config.js';
import { store } from './store.js';
import { fmtTime, toast, esc } from './utils.js';
import {
  home, sportList, sportDetail, nazioniList, nazioneDetail,
  squadreList, squadraDetail, atletiList, classificaView, calendarioView,
} from './views/public.js';
import { admin } from './views/admin.js';
import { debugView } from './views/debug.js';

const ROUTES = [
  [/^\/?$/, home],
  [/^\/calendario$/, calendarioView],
  [/^\/debug$/, debugView],
  [/^\/sport$/, sportList],
  [/^\/sport\/(.+)$/, sportDetail, ['id']],
  [/^\/nazioni$/, nazioniList],
  [/^\/nazioni\/(.+)$/, nazioneDetail, ['id']],
  [/^\/squadre$/, squadreList],
  [/^\/squadre\/(.+)$/, squadraDetail, ['id']],
  [/^\/atleti$/, atletiList],
  [/^\/classifica$/, classificaView],
  [/^\/admin$/, admin],
];

const viewEl = () => document.getElementById('view');
let current = null;
let lastStamp = '';
let pendingRender = false;

function path() {
  const h = location.hash.replace(/^#/, '');
  return h || '/';
}

function match(p) {
  for (const [re, view, keys = []] of ROUTES) {
    const m = re.exec(p);
    if (m) {
      const params = {};
      keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { view, params };
    }
  }
  return null;
}

/**
 * Firma del contenuto, non solo della revisione: le modifiche fatte a mano nel
 * foglio Google non incrementano `rev`, e contare le righe non basta perché una
 * correzione può lasciare invariato il numero di righe. Con l'hash del contenuto
 * qualunque cambiamento fa ridisegnare la pagina.
 */
function stamp() {
  const json = JSON.stringify(store.data);
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return store.data.rev + ':' + json.length + ':' + h;
}

function render() {
  // Non ridisegnare mentre una modale è aperta: rimanda.
  if (document.getElementById('modalRoot').children.length) { pendingRender = true; return; }
  pendingRender = false;

  const p = path();
  const hit = match(p);
  const el = viewEl();

  if (!hit) {
    el.innerHTML = `<div class="empty"><span class="big">🤷</span>Pagina non trovata.
      <div class="small" style="margin-top:.5rem"><a href="#/">Torna alla home</a></div></div>`;
  } else if (store.loading && !store.lastSync) {
    el.innerHTML = '<div class="spinner"></div><p class="center muted">Carico i dati…</p>';
    return;
  } else {
    const banner = store.error && !store.lastSync
      ? `<div class="alert err"><b>Dati non disponibili.</b> ${esc(store.error)}</div>`
      : (store.error ? `<div class="alert warn">Ultimo aggiornamento non riuscito: ${esc(store.error)}. Mostro i dati salvati.</div>` : '');
    el.innerHTML = banner + hit.view.render(hit.params);
    hit.view.mount?.(hit.params);
    current = hit;
  }

  lastStamp = stamp();
  document.querySelectorAll('.tabbar a').forEach(a => {
    // data-match: elenco di prefissi (una voce può coprire più rotte, es. la sezione Rose)
    const pref = (a.dataset.match || a.dataset.tab || '').split(',').filter(Boolean);
    a.classList.toggle('on', pref.some(t => (t === '/' ? p === '/' : p.startsWith(t))));
  });
  window.scrollTo(0, 0);
}

function updateBadge() {
  const b = document.getElementById('syncBadge');
  const r = document.getElementById('btnRefresh');
  r.classList.toggle('spin', store.loading);
  if (!CONFIG.apiUrl) { b.textContent = 'non configurata'; b.className = 'badge warn'; return; }
  if (store.loading && !store.lastSync) { b.textContent = 'carico…'; b.className = 'badge'; return; }
  if (!navigator.onLine) { b.textContent = 'offline'; b.className = 'badge warn'; return; }
  if (store.error) { b.textContent = 'errore'; b.className = 'badge err'; return; }
  b.textContent = fmtTime(store.lastSync);
  b.className = 'badge';
}

/* ---------- avvio ---------- */

store.loadCache();
store.subscribe(() => {
  updateBadge();
  if (stamp() !== lastStamp || pendingRender || store.error) render();
});

const cfgName = () => {
  const c = store.data.config || {};
  document.getElementById('brandName').textContent = c.nome || CONFIG.EVENT_NAME;
  document.getElementById('brandEdition').textContent = c.edizione || CONFIG.EDITION;
  document.title = (c.nome || CONFIG.EVENT_NAME) + ' — ' + (c.edizione || CONFIG.EDITION);
};
store.subscribe(cfgName);

window.addEventListener('hashchange', render);
window.addEventListener('oee:rerender', render);
window.addEventListener('online', () => { updateBadge(); store.refresh({ silent: true }); });
window.addEventListener('offline', updateBadge);

document.getElementById('btnRefresh').addEventListener('click', () => {
  store.refresh();
  toast('Aggiorno…');
});

// la spia di stato apre la diagnostica
const badge = document.getElementById('syncBadge');
badge.style.cursor = 'pointer';
badge.title = 'Apri la diagnostica';
badge.addEventListener('click', () => { location.hash = '#/debug'; });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) store.refresh({ silent: true });
});

setInterval(() => {
  if (!document.hidden && navigator.onLine) store.refresh({ silent: true });
}, CONFIG.REFRESH_MS);

cfgName();
render();
updateBadge();
if (CONFIG.apiUrl) store.refresh({ silent: !!store.lastSync });

/* ---------- service worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => toast('Nuova versione disponibile, ricarica la pagina'));
    }).catch(() => { /* http locale: ok */ });
  });
}
