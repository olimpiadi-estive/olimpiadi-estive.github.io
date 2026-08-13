import { CONFIG, validateApiUrl } from './config.js';

const LS_PIN = 'oee.pin';

export const auth = {
  get pin() { return sessionStorage.getItem(LS_PIN) || localStorage.getItem(LS_PIN) || ''; },
  save(pin, remember) {
    if (remember) localStorage.setItem(LS_PIN, pin);
    else sessionStorage.setItem(LS_PIN, pin);
  },
  clear() {
    localStorage.removeItem(LS_PIN);
    sessionStorage.removeItem(LS_PIN);
  },
  get isAdmin() { return !!this.pin; },
};

export class ApiError extends Error {}

/** Timeout delle richieste: senza questo una richiesta appesa blocca il sync. */
const TIMEOUT_LETTURA = 15000;
const TIMEOUT_SCRITTURA = 45000; // le generazioni scrivono molte righe nel foglio

const LS_LOG = 'oee.log';

/** Registro circolare delle ultime richieste, per la schermata di diagnostica. */
export const apiLog = {
  items: [],
  max: 80,
  load() {
    try { this.items = JSON.parse(localStorage.getItem(LS_LOG) || '[]'); }
    catch { this.items = []; }
  },
  push(entry) {
    this.items.unshift({ ts: Date.now(), ...entry });
    if (this.items.length > this.max) this.items.length = this.max;
    try { localStorage.setItem(LS_LOG, JSON.stringify(this.items.slice(0, 40))); }
    catch { /* quota */ }
  },
  clear() {
    this.items = [];
    localStorage.removeItem(LS_LOG);
  },
  /** Statistiche sintetiche sulle richieste registrate. */
  stats() {
    const tot = this.items.length;
    const ko = this.items.filter(x => !x.ok);
    const ms = this.items.filter(x => x.ok).map(x => x.ms);
    return {
      tot, errori: ko.length,
      media: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0,
      max: ms.length ? Math.max(...ms) : 0,
      ultimoErrore: ko[0] || null,
    };
  },
};
apiLog.load();

const sleep = ms => new Promise(r => setTimeout(r, ms));

function requireUrl() {
  const url = CONFIG.apiUrl;
  if (!url) throw new ApiError('API non configurata. Apri Admin ▸ Impostazioni e incolla l\'URL del Web App (finisce con /exec).');
  const v = validateApiUrl(url);
  if (!v.ok) throw new ApiError(v.msg);
  return url;
}

/** Traduce la risposta grezza in dati, con messaggi comprensibili. */
async function readResponse(res) {
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    if (res.status === 404) {
      throw new ApiError('404: nessuna distribuzione a quell\'indirizzo. Controlla di aver copiato l\'URL da Distribuisci ▸ Gestisci distribuzioni (deve finire con /exec) e che la distribuzione non sia stata archiviata.');
    }
    if (res.status === 401 || res.status === 403) {
      throw new ApiError(res.status + ': accesso negato. Nella distribuzione imposta "Chi ha accesso: Chiunque".');
    }
    throw new ApiError('Errore di rete (' + res.status + ').');
  }
  const t = (text || '').trim();
  if (!t) throw new ApiError('Risposta vuota dal server.');
  if (t.startsWith('<')) {
    throw new ApiError('Il server ha risposto con una pagina HTML invece dei dati: la distribuzione non è pubblica ("Chi ha accesso" deve essere "Chiunque") oppure serve una nuova versione dopo l\'ultima modifica al codice.');
  }
  let json;
  try { json = JSON.parse(t); }
  catch { throw new ApiError('Risposta non riconosciuta dal server: ' + t.slice(0, 120)); }
  if (!json.ok) throw new ApiError(json.error || 'Errore sconosciuto dal server.');
  return json.data;
}

function netError(err) {
  if (err instanceof ApiError) return err;
  return new ApiError('Impossibile raggiungere il server (' + (err.message || 'rete') + '). Verifica la connessione e che l\'URL sia quello /exec.');
}

/**
 * Esegue una richiesta con timeout e la registra nel log.
 * Senza timeout una richiesta appesa blocca il sync a tempo indefinito.
 */
async function request(etichetta, url, opts = {}, timeout = TIMEOUT_LETTURA) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { redirect: 'follow', ...opts, signal: ctrl.signal });
    const data = await readResponse(res);
    apiLog.push({ etichetta, ok: true, ms: Date.now() - t0, status: res.status });
    return data;
  } catch (err) {
    const scaduto = err.name === 'AbortError';
    const e = scaduto
      ? new ApiError(`Tempo scaduto dopo ${Math.round(timeout / 1000)}s: rete lenta o Apps Script occupato.`)
      : netError(err);
    apiLog.push({ etichetta, ok: false, ms: Date.now() - t0, err: e.message, scaduto });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Lettura dati (GET, senza preflight CORS). Un tentativo di riserva sui guasti di rete. */
export async function fetchState({ tentativi = 2 } = {}) {
  const base = requireUrl();
  let ultimo;
  for (let i = 1; i <= tentativi; i++) {
    try {
      return await request('lettura' + (i > 1 ? ' (tentativo ' + i + ')' : ''),
        base + '?action=state&t=' + Date.now(), { method: 'GET', cache: 'no-store' });
    } catch (err) {
      ultimo = err;
      if (i < tentativi) await sleep(700 * i);
    }
  }
  throw ultimo;
}

/**
 * Scrittura dati.
 * Content-Type text/plain per evitare il preflight OPTIONS che Apps Script non gestisce.
 */
export async function mutate(action, payload = {}) {
  return request(action, requireUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, pin: auth.pin, payload }),
  }, TIMEOUT_SCRITTURA);
}

/** Verifica il PIN admin lato server. */
export async function checkPin(pin) {
  try {
    await request('login', requireUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'login', pin }),
    });
    return true;
  } catch (err) {
    if (/PIN/i.test(err.message)) return false;
    throw err;
  }
}

/**
 * Diagnostica del collegamento: prova l'URL e spiega cosa non torna.
 * @returns {Promise<{ok:boolean, msg:string}>}
 */
export async function diagnose(rawUrl) {
  const url = rawUrl !== undefined ? rawUrl : CONFIG.apiUrl;
  if (!url) return { ok: false, msg: 'Nessun URL configurato.' };
  const v = validateApiUrl(url);
  if (!v.ok) return { ok: false, msg: v.msg };
  try {
    const res = await fetch(url + '?action=state&t=' + Date.now(),
      { method: 'GET', redirect: 'follow', cache: 'no-store' });
    const data = await readResponse(res);
    const n = (data.nazioni || []).length, s = (data.sport || []).length;
    return { ok: true, msg: `Collegamento riuscito. Trovate ${n} nazioni e ${s} discipline (revisione ${data.rev || 0}).` };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}
