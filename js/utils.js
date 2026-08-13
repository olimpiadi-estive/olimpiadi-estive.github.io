/** Escape per interpolazione sicura in HTML. */
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Testo multilinea -> HTML con paragrafi ed elenchi semplici. */
export function richText(txt) {
  const raw = (txt || '').trim();
  if (!raw) return '<p class="muted">Nessun contenuto inserito.</p>';
  const blocks = raw.split(/\n{2,}/);
  return blocks.map(b => {
    const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
    const isList = lines.length > 1 && lines.every(l => /^([-*•]|\d+[.)])\s+/.test(l));
    if (isList) {
      const items = lines.map(l => '<li>' + esc(l.replace(/^([-*•]|\d+[.)])\s+/, '')) + '</li>').join('');
      return /^\d/.test(lines[0]) ? '<ol>' + items + '</ol>' : '<ul>' + items + '</ul>';
    }
    return '<p>' + lines.map(esc).join('<br>') + '</p>';
  }).join('');
}

export function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  const hasTime = /\d{2}:\d{2}/.test(String(v));
  return d.toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/** Solo l'ora di un valore datetime-local ('2026-08-14T15:30' -> '15:30'). */
export function fmtOra(v) {
  const m = /[T ](\d{2}):(\d{2})/.exec(String(v || ''));
  return m ? m[1] + ':' + m[2] : '';
}

/** Giorno in forma lunga: 'venerdì 14 agosto'. */
export function fmtGiorno(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return String(v || '');
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

export const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

export function ordinal(pos) {
  const n = Number(pos);
  return n > 0 ? n + '°' : '—';
}

export function toast(msg, kind = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 3200);
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function slug(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Contrasto testo su colore di sfondo. */
export function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#10233f' : '#ffffff';
}
