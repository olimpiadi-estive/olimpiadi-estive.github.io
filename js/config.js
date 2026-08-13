// Configurazione applicazione.
// API_URL: URL "/exec" del Web App di Google Apps Script (vedi README).
// Puo' essere sovrascritto a runtime dalla schermata Admin > Impostazioni (salvato in localStorage).

const DEFAULTS = {
  // Web App di Apps Script condiviso da tutti i visitatori.
  API_URL: 'https://script.google.com/macros/s/AKfycbxEROUGVQmPxCCDMU0RbuOglHbgibi6SFkzeW5rK9ZAOOPTVTbJbfI0HBrJv2zIPz7q/exec',
  EVENT_NAME: 'Olimpiadi Epiche Estive',
  EDITION: 'I Edizione',
  // Punti assegnati per posizione: 1°, 2°, 3°, 4°, 5°, 6°...
  POINTS: [10, 7, 5, 3, 2, 1],
  // Intervallo di polling per l'aggiornamento automatico (ms)
  REFRESH_MS: 30000,
};

const LS_API = 'oee.apiUrl';

/**
 * Ripulisce l'URL incollato dall'utente: virgolette, spazi, query string,
 * slash finale e la forma senza /exec sono le cause tipiche di 404.
 */
export function normalizeApiUrl(raw) {
  let u = String(raw || '').trim().replace(/^["'<]+|["'>]+$/g, '');
  if (!u) return '';
  u = u.split('#')[0].split('?')[0].replace(/\/+$/, '');
  // URL dell'editor invece della distribuzione
  const editor = u.match(/^https:\/\/script\.google\.com\/(?:u\/\d+\/)?home\/projects\/[^/]+/);
  if (editor) return u; // lasciato passare: validateApiUrl lo segnala
  const m = u.match(/^(https:\/\/script\.google\.com\/(?:a\/[^/]+\/)?macros\/s\/[^/]+)(?:\/(exec|dev))?$/);
  if (m) return m[1] + '/' + (m[2] || 'exec');
  return u;
}

/** @returns {{ok:boolean, msg?:string}} problema riconoscibile prima di chiamare la rete. */
export function validateApiUrl(url) {
  const u = normalizeApiUrl(url);
  if (!u) return { ok: false, msg: 'URL vuoto.' };
  if (!/^https:\/\//.test(u)) return { ok: false, msg: 'L\'URL deve iniziare con https://' };
  if (/\/home\/projects\//.test(u)) {
    return { ok: false, msg: 'Questo è l\'URL dell\'editor Apps Script, non della distribuzione. Serve quello di Distribuisci ▸ Gestisci distribuzioni, che finisce con /exec.' };
  }
  if (/docs\.google\.com\/spreadsheets/.test(u)) {
    return { ok: false, msg: 'Questo è l\'URL del Google Sheet. Serve l\'URL del Web App di Apps Script, che finisce con /exec.' };
  }
  if (/\/dev$/.test(u)) {
    return { ok: false, msg: 'L\'URL /dev funziona solo per te da browser autenticato e non è usabile dall\'app. Usa l\'URL /exec della distribuzione.' };
  }
  if (!/\/macros\/s\/[^/]+\/exec$/.test(u)) {
    return { ok: false, msg: 'Formato non riconosciuto. Deve essere https://script.google.com/macros/s/<ID>/exec' };
  }
  return { ok: true };
}

export const CONFIG = {
  ...DEFAULTS,

  /** URL in uso: vince quello salvato nel browser, altrimenti il predefinito qui sopra. */
  get apiUrl() {
    return normalizeApiUrl(localStorage.getItem(LS_API) || DEFAULTS.API_URL);
  },
  set apiUrl(v) {
    const val = normalizeApiUrl(v);
    if (val) localStorage.setItem(LS_API, val);
    else localStorage.removeItem(LS_API);
  },

  /** 'locale' se sovrascritto in questo browser, 'predefinito' se arriva dal codice. */
  get apiUrlSource() {
    if (localStorage.getItem(LS_API)) return 'locale';
    return DEFAULTS.API_URL ? 'predefinito' : 'assente';
  },

  /** Rimuove l'override locale e torna all'URL scritto in config.js. */
  resetApiUrl() {
    localStorage.removeItem(LS_API);
  },
};
