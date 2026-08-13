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

/** Lettura dati (GET, senza preflight CORS). */
export async function fetchState() {
  const url = requireUrl() + '?action=state&t=' + Date.now();
  let res;
  try {
    res = await fetch(url, { method: 'GET', redirect: 'follow', cache: 'no-store' });
  } catch (err) { throw netError(err); }
  return readResponse(res);
}

/**
 * Scrittura dati.
 * Content-Type text/plain per evitare il preflight OPTIONS che Apps Script non gestisce.
 */
export async function mutate(action, payload = {}) {
  const url = requireUrl();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, pin: auth.pin, payload }),
    });
  } catch (err) { throw netError(err); }
  return readResponse(res);
}

/** Verifica il PIN admin lato server. */
export async function checkPin(pin) {
  const url = requireUrl();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'login', pin }),
    });
  } catch (err) { throw netError(err); }
  try {
    await readResponse(res);
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
