import { CONFIG } from './config.js';
import { fetchState } from './api.js';

const LS_CACHE = 'oee.cache.v2';

const EMPTY = {
  nazioni: [], atleti: [], sport: [], squadre: [], iscrizioni: [],
  risultati: [], incontri: [], config: {}, rev: 0,
};

/** Sottocategorie geografiche delle nazioni. Le squadre non le seguono. */
export const ZONE = [
  { v: 'nord', l: 'Nord', emoji: '⛰️' },
  { v: 'centro', l: 'Centro', emoji: '🏛️' },
  { v: 'sud', l: 'Sud', emoji: '🌅' },
];

export const zonaLabel = z => ZONE.find(x => x.v === z)?.l || '—';

/** Formati di calendario disponibili per disciplina. */
export const FORMATI = [
  {
    v: 'tutti', l: 'Tutti contro tutti', genera: false,
    desc: 'Gara unica: tutti gareggiano insieme nello stesso momento e si registra la classifica finale.',
  },
  {
    v: 'scontro', l: 'Scontri diretti', genera: true,
    desc: 'Ognuno affronta ogni avversario una volta sola, in gare singole senza ritorno.',
  },
  {
    v: 'tabellone', l: 'Eliminazione diretta', genera: true,
    desc: 'Turni a eliminazione: chi vince passa automaticamente al turno successivo.',
  },
];

/** Il valore vuoto e i vecchi nomi restano leggibili. */
export function formatoDi(sportObj) {
  const f = String(sportObj?.formato || '').toLowerCase();
  if (f === 'girone') return 'scontro';
  if (f === '' || f === 'open' || f === 'classifica') return 'tutti';
  return FORMATI.some(x => x.v === f) ? f : 'tutti';
}

export const formatoMeta = f => FORMATI.find(x => x.v === f) || FORMATI[0];
export const formatoLabel = s => formatoMeta(typeof s === 'string' ? s : formatoDi(s)).l;

/** Stati di una disciplina. 'annullato' per gli sport che saltano. */
export const STATI_SPORT = [
  { v: 'programmato', l: 'Programmato' },
  { v: 'in corso', l: 'In corso' },
  { v: 'completato', l: 'Completato' },
  { v: 'annullato', l: 'Annullato' },
];

export const isAnnullato = s => String(s?.stato || '').toLowerCase() === 'annullato';

export const STATI_INCONTRO = [
  { v: 'programmato', l: 'Programmato' },
  { v: 'in corso', l: 'In corso' },
  { v: 'concluso', l: 'Concluso' },
];

export const store = {
  data: EMPTY,
  loading: false,
  error: null,
  lastSync: null,
  fromCache: false,
  _subs: new Set(),

  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
  emit() { this._subs.forEach(fn => fn(this)); },

  loadCache() {
    try {
      const raw = localStorage.getItem(LS_CACHE);
      if (!raw) return false;
      const { data, ts } = JSON.parse(raw);
      if (!data) return false;
      this.data = { ...EMPTY, ...data };
      this.lastSync = ts;
      this.fromCache = true;
      return true;
    } catch { return false; }
  },

  saveCache() {
    try {
      localStorage.setItem(LS_CACHE, JSON.stringify({ data: this.data, ts: Date.now() }));
    } catch { /* quota */ }
  },

  fails: 0,
  startedAt: 0,
  lastMs: 0,

  async refresh({ silent = false } = {}) {
    // Guardia: se una richiesta precedente è rimasta appesa oltre il suo timeout
    // la consideriamo persa, altrimenti il sync resterebbe bloccato per sempre.
    if (this.loading && Date.now() - this.startedAt < 20000) return;

    this.loading = true;
    this.startedAt = Date.now();
    this.error = null;
    if (!silent) this.emit();
    try {
      const data = await fetchState();
      this.data = { ...EMPTY, ...data };
      this.lastSync = Date.now();
      this.lastMs = Date.now() - this.startedAt;
      this.fromCache = false;
      this.fails = 0;
      this.saveCache();
    } catch (err) {
      this.error = err.message || String(err);
      this.fails++;
    } finally {
      this.loading = false;
      this.emit();
    }
  },
};

/* ---------- accesso base ---------- */

export const byId = (list, id) => list.find(x => String(x.id) === String(id));

export function nazione(id) { return byId(store.data.nazioni, id); }
export function atleta(id) { return byId(store.data.atleti, id); }
export function sport(id) { return byId(store.data.sport, id); }
export function squadra(id) { return byId(store.data.squadre, id); }
export function incontro(id) { return byId(store.data.incontri, id); }

const byNome = (a, b) => (a.nome || '').localeCompare(b.nome || '', 'it');

export function nazioniSorted() { return [...store.data.nazioni].sort(byNome); }
export function atletiSorted() { return [...store.data.atleti].sort(byNome); }
export function squadreSorted() { return [...store.data.squadre].sort(byNome); }

export function sportSorted() {
  return [...store.data.sport].sort((a, b) => {
    const oa = Number(a.ordine) || 999, ob = Number(b.ordine) || 999;
    return oa - ob || byNome(a, b);
  });
}

export function idList(v) {
  return String(v || '').split(',').map(s => s.trim()).filter(Boolean);
}

export function atletiDiNazione(nazioneId) {
  return atletiSorted().filter(a => String(a.nazioneId) === String(nazioneId));
}

export function nazioniDiZona(zona) {
  return nazioniSorted().filter(n => (n.zona || '') === zona);
}

export function atletiDiSquadra(squadraId) {
  const s = squadra(squadraId);
  if (!s) return [];
  return idList(s.atletaIds).map(id => atleta(id)).filter(Boolean);
}

export function squadreDiAtleta(atletaId) {
  return squadreSorted().filter(s => idList(s.atletaIds).includes(String(atletaId)));
}

/** Nazioni rappresentate in una squadra (le squadre sono miste per definizione). */
export function nazioniDiSquadra(squadraId) {
  const seen = new Set();
  const out = [];
  atletiDiSquadra(squadraId).forEach(a => {
    const n = nazione(a.nazioneId);
    if (n && !seen.has(String(n.id))) { seen.add(String(n.id)); out.push(n); }
  });
  return out;
}

/* ---------- riferimenti partecipanti (naz: / sqd: / atl:) ---------- */

export function refParse(ref) {
  const m = /^(naz|sqd|atl):(.+)$/.exec(String(ref || '').trim());
  return m ? { tipo: m[1], id: m[2] } : null;
}

export const refOf = (tipo, id) => (id ? tipo + ':' + id : '');

/**
 * Risolve un riferimento in un oggetto visualizzabile.
 * @returns {{tipo:string,id:string,nome:string,emoji:string,colore:string,href:string}|null}
 */
export function refEntity(ref) {
  const p = refParse(ref);
  if (!p) return null;
  if (p.tipo === 'naz') {
    const n = nazione(p.id);
    return n && { ...p, nome: n.nome, emoji: n.emoji || '🚩', colore: n.colore || '#0b3d91', href: '#/nazioni/' + n.id };
  }
  if (p.tipo === 'sqd') {
    const s = squadra(p.id);
    return s && { ...p, nome: s.nome, emoji: s.emoji || '🛡️', colore: s.colore || '#1657c8', href: '#/squadre/' + s.id };
  }
  const a = atleta(p.id);
  if (!a) return null;
  const n = nazione(a.nazioneId);
  return { ...p, nome: a.nome, emoji: '🏃', colore: n?.colore || '#68789a', href: '#/atleti' };
}

/* ---------- iscrizioni per disciplina ---------- */

/** Atleti registrati a una disciplina, nell'ordine di seed. */
export function iscrittiDiSport(sportId) {
  return store.data.iscrizioni
    .filter(i => String(i.sportId) === String(sportId))
    .sort((a, b) => (Number(a.seed) || 999) - (Number(b.seed) || 999))
    .map(i => atleta(i.atletaId))
    .filter(Boolean);
}

export function isIscritto(sportId, atletaId) {
  return store.data.iscrizioni.some(i =>
    String(i.sportId) === String(sportId) && String(i.atletaId) === String(atletaId));
}

/** Discipline a cui un atleta è iscritto. */
export function sportDiAtleta(atletaId) {
  return store.data.iscrizioni
    .filter(i => String(i.atletaId) === String(atletaId))
    .map(i => sport(i.sportId))
    .filter(Boolean);
}

/** Squadre di una disciplina (le squadre sono per sport). */
export function squadreDiSport(sportId) {
  return squadreSorted().filter(s => String(s.sportId) === String(sportId));
}

/** Squadre senza disciplina: create prima che le squadre diventassero per sport. */
export function squadreSenzaSport() {
  return squadreSorted().filter(s => !s.sportId);
}

/**
 * Partecipanti di una disciplina, come riferimenti del calendario.
 * Segue il tipo dello sport: squadre, nazioni o iscritti.
 */
export function partecipantiDiSport(sportId, fonte) {
  const s = sport(sportId);
  const f = fonte || (s?.tipo === 'squadra' || s?.tipo === 'coppia' ? 'squadre'
    : (s?.tipo === 'nazione' ? 'nazioni' : 'iscritti'));
  if (f === 'squadre') return squadreDiSport(sportId).map(x => refOf('sqd', x.id));
  if (f === 'nazioni') return nazioniSorted().map(x => refOf('naz', x.id));
  return iscrittiDiSport(sportId).map(x => refOf('atl', x.id));
}

/** Opzioni ristrette ai partecipanti di una disciplina. */
export function refOptionsSport(sportId, { vuoto = '— da definire —' } = {}) {
  const out = [{ v: '', l: vuoto }];
  squadreDiSport(sportId).forEach(s =>
    out.push({ v: refOf('sqd', s.id), l: (s.emoji || '🛡️') + ' ' + s.nome, group: 'Squadre della disciplina' }));
  iscrittiDiSport(sportId).forEach(a =>
    out.push({ v: refOf('atl', a.id), l: a.nome, group: 'Iscritti alla disciplina' }));
  if (out.length === 1) return refOptions({ vuoto });
  // in coda tutto il resto, per i casi fuori standard
  nazioniSorted().forEach(n =>
    out.push({ v: refOf('naz', n.id), l: (n.emoji || '🚩') + ' ' + n.nome, group: 'Nazioni' }));
  return out;
}

/** Opzioni per i select di calendario, raggruppate per tipo. */
export function refOptions({ vuoto = '— da definire —' } = {}) {
  const out = [{ v: '', l: vuoto }];
  squadreSorted().forEach(s => out.push({ v: refOf('sqd', s.id), l: (s.emoji || '🛡️') + ' ' + s.nome, group: 'Squadre' }));
  nazioniSorted().forEach(n => out.push({ v: refOf('naz', n.id), l: (n.emoji || '🚩') + ' ' + n.nome, group: 'Nazioni' }));
  atletiSorted().forEach(a => out.push({
    v: refOf('atl', a.id),
    l: a.nome + (nazione(a.nazioneId) ? ' — ' + nazione(a.nazioneId).nome : ''),
    group: 'Atleti',
  }));
  return out;
}

/* ---------- risultati ---------- */

const perPosizione = (a, b) => (Number(a.posizione) || 99) - (Number(b.posizione) || 99);

/** Le medaglie arrivano solo dalla classifica finale: righe senza incontroId. */
export const isFinale = r => !r.incontroId;

/** Classifica finale di una disciplina. */
export function risultatiDiSport(sportId) {
  return store.data.risultati
    .filter(r => String(r.sportId) === String(sportId) && isFinale(r))
    .sort(perPosizione);
}

/** Ordine d'arrivo di una singola gara o batteria. */
export function risultatiDiIncontro(incontroId) {
  return store.data.risultati
    .filter(r => String(r.incontroId || '') === String(incontroId))
    .sort(perPosizione);
}

/** Partecipanti di una gara a più concorrenti, come riferimenti. */
export function partecipantiIncontro(i) {
  return idList(i?.partecipanti);
}

/** Una gara unica o batteria: nessun lato, un elenco di concorrenti. */
export const isGaraMultipla = i => !i?.latoA && !i?.latoB && partecipantiIncontro(i).length > 0;

/** Atleti che incassano i punti di un risultato (squadra inclusa). */
export function atletiDiRisultato(r) {
  const espliciti = idList(r.atletaIds).map(id => atleta(id)).filter(Boolean);
  if (espliciti.length) return espliciti;
  if (r.squadraId) return atletiDiSquadra(r.squadraId);
  return [];
}

/**
 * I punti per piazzamento sono opzionali: per ora le classifiche si ordinano
 * a medaglie, come il medagliere olimpico. Si attivano da Admin ▸ Impostazioni.
 */
export function puntiAttivi() {
  return /^(si|sì|yes|true|1)$/i.test(String(store.data.config?.puntiAttivi || ''));
}

/** Schema punti: override per sport, altrimenti quello globale. */
export function puntiSchema(sportObj) {
  const parse = s => String(s || '').split(/[,;\s]+/).map(Number).filter(n => !isNaN(n));
  if (sportObj && sportObj.punti) {
    const p = parse(sportObj.punti);
    if (p.length) return p;
  }
  const g = parse(store.data.config?.punti);
  return g.length ? g : CONFIG.POINTS;
}

export function puntiPerPosizione(sportObj, posizione) {
  const p = puntiSchema(sportObj);
  const i = (Number(posizione) || 0) - 1;
  return i >= 0 && i < p.length ? p[i] : 0;
}

/* ---------- classifiche ---------- */

const vuotaRiga = extra => ({
  oro: 0, argento: 0, bronzo: 0, punti: 0, gare: 0, piazzamenti: 0, ...extra,
});

/** Medaglie ai primi tre della classifica di ogni disciplina. */
function contaMedaglia(row, pos) {
  if (pos === 1) row.oro++;
  else if (pos === 2) row.argento++;
  else if (pos === 3) row.bronzo++;
  else if (pos > 3) row.piazzamenti++;
}

const chiaveRiga = row => (puntiAttivi()
  ? [row.punti, row.oro, row.argento, row.bronzo]
  : [row.oro, row.argento, row.bronzo, row.piazzamenti]).join('|');

function assegnaPosizioni(list) {
  let prev = null, rank = 0;
  list.forEach((row, i) => {
    const key = chiaveRiga(row);
    if (key !== prev) { rank = i + 1; prev = key; }
    row.pos = rank;
  });
  return list;
}

/**
 * Ordinamento a medaglie (oro, poi argento, poi bronzo, poi altri piazzamenti).
 * Se i punti sono attivi vengono davanti a tutto.
 */
const perPunti = (a, b) => {
  if (puntiAttivi() && b.punti !== a.punti) return b.punti - a.punti;
  return b.oro - a.oro || b.argento - a.argento || b.bronzo - a.bronzo ||
    b.piazzamenti - a.piazzamenti ||
    (a.nome || '').localeCompare(b.nome || '', 'it');
};

/**
 * Medagliere nazioni. I risultati assegnati a una squadra non entrano qui:
 * le squadre sono miste, quindi i loro punti non appartengono a nessuna nazione.
 */
export function classifica() {
  const rows = new Map();
  store.data.nazioni.forEach(n => rows.set(String(n.id), vuotaRiga({ nazione: n, nome: n.nome })));
  store.data.risultati.forEach(r => {
    if (r.squadraId || !isFinale(r)) return;
    const row = rows.get(String(r.nazioneId));
    if (!row) return;
    const pos = Number(r.posizione) || 0;
    contaMedaglia(row, pos);
    row.punti += puntiPerPosizione(sport(r.sportId), pos);
    row.gare++;
  });
  return assegnaPosizioni([...rows.values()].sort(perPunti));
}

/** Classifica per zona: somma delle nazioni che le appartengono. */
export function classificaZone() {
  const cls = classifica();
  const rows = ZONE.map(z => vuotaRiga({
    zona: z, nome: z.l, nazioni: 0,
  }));
  const idx = new Map(rows.map(r => [r.zona.v, r]));
  cls.forEach(r => {
    const row = idx.get(r.nazione.zona || '');
    if (!row) return;
    row.nazioni++;
    row.oro += r.oro; row.argento += r.argento; row.bronzo += r.bronzo;
    row.punti += r.punti; row.gare += r.gare;
  });
  return assegnaPosizioni(rows.sort(perPunti));
}

/** Nazioni senza zona assegnata: utile per segnalarlo in admin. */
export function nazioniSenzaZona() {
  return nazioniSorted().filter(n => !ZONE.some(z => z.v === (n.zona || '')));
}

/** Classifica squadre miste: solo risultati con squadraId. */
export function classificaSquadre() {
  const rows = new Map();
  store.data.squadre.forEach(s => rows.set(String(s.id), vuotaRiga({ squadra: s, nome: s.nome })));
  store.data.risultati.forEach(r => {
    if (!r.squadraId || !isFinale(r)) return;
    const row = rows.get(String(r.squadraId));
    if (!row) return;
    const pos = Number(r.posizione) || 0;
    contaMedaglia(row, pos);
    row.punti += puntiPerPosizione(sport(r.sportId), pos);
    row.gare++;
  });
  return assegnaPosizioni([...rows.values()].sort(perPunti));
}

/** Classifica individuale: somma punti da gare individuali e di squadra. */
let _atlCache = { key: null, val: [] };

export function classificaAtleti() {
  const key = [store.data.rev, store.data.atleti.length, store.data.risultati.length,
    store.lastSync].join('|');
  if (_atlCache.key === key) return _atlCache.val;

  const rows = new Map();
  store.data.atleti.forEach(a => rows.set(String(a.id), vuotaRiga({ atleta: a, nome: a.nome })));
  store.data.risultati.forEach(r => {
    if (!isFinale(r)) return;
    const pos = Number(r.posizione) || 0;
    const pts = puntiPerPosizione(sport(r.sportId), pos);
    atletiDiRisultato(r).forEach(a => {
      const row = rows.get(String(a.id));
      if (!row) return;
      contaMedaglia(row, pos);
      row.punti += pts;
      row.gare++;
    });
  });
  const out = assegnaPosizioni([...rows.values()].filter(r => r.gare > 0).sort(perPunti));
  _atlCache = { key, val: out };
  return out;
}

/* ---------- calendario ---------- */

export function incontriDiSport(sportId) {
  return store.data.incontri
    .filter(i => String(i.sportId) === String(sportId))
    .sort((a, b) =>
      (Number(a.round) || 0) - (Number(b.round) || 0) ||
      (Number(a.ordine) || 0) - (Number(b.ordine) || 0) ||
      String(a.data || '').localeCompare(String(b.data || '')));
}

/** Incontri raggruppati per fase (o per turno se la fase non è indicata). */
export function fasiDiSport(sportId) {
  const groups = new Map();
  incontriDiSport(sportId).forEach(i => {
    const key = (i.fase || '').trim() || (i.round ? 'Turno ' + i.round : 'Calendario');
    if (!groups.has(key)) groups.set(key, { fase: key, round: Number(i.round) || 0, incontri: [] });
    groups.get(key).incontri.push(i);
  });
  return [...groups.values()].sort((a, b) => a.round - b.round || a.fase.localeCompare(b.fase, 'it'));
}

export const isConcluso = i => (i.stato || '').toLowerCase() === 'concluso';

/** Punti per vittoria/pareggio nei gironi (configurabili). */
export function puntiIncontro() {
  const c = store.data.config || {};
  const v = Number(c.puntiVittoria);
  const p = Number(c.puntiPareggio);
  return { vittoria: isNaN(v) || !c.puntiVittoria ? 3 : v, pareggio: isNaN(p) || !c.puntiPareggio ? 1 : p };
}

/** Esito di un incontro concluso: 'A' | 'B' | 'X' (pareggio) | null. */
export function esitoIncontro(i) {
  if (!isConcluso(i)) return null;
  if (i.vincitore) {
    if (i.vincitore === i.latoA) return 'A';
    if (i.vincitore === i.latoB) return 'B';
  }
  const a = Number(i.punteggioA), b = Number(i.punteggioB);
  if (i.punteggioA !== '' && i.punteggioB !== '' && !isNaN(a) && !isNaN(b)) {
    return a > b ? 'A' : (b > a ? 'B' : 'X');
  }
  return i.vincitore ? null : 'X';
}

/** Classifica del girone calcolata dagli incontri conclusi. */
export function gironeStandings(sportId) {
  const pts = puntiIncontro();
  const rows = new Map();
  const tocca = ref => {
    if (!ref) return null;
    if (!rows.has(ref)) {
      const e = refEntity(ref);
      rows.set(ref, {
        ref, nome: e?.nome || '—', entity: e,
        g: 0, v: 0, n: 0, p: 0, fatti: 0, subiti: 0, punti: 0,
      });
    }
    return rows.get(ref);
  };

  incontriDiSport(sportId).forEach(i => {
    const esito = esitoIncontro(i);
    const A = tocca(i.latoA), B = tocca(i.latoB);
    if (!A || !B || !esito) return;
    const pa = Number(i.punteggioA) || 0, pb = Number(i.punteggioB) || 0;
    A.g++; B.g++;
    A.fatti += pa; A.subiti += pb;
    B.fatti += pb; B.subiti += pa;
    if (esito === 'A') { A.v++; B.p++; A.punti += pts.vittoria; }
    else if (esito === 'B') { B.v++; A.p++; B.punti += pts.vittoria; }
    else { A.n++; B.n++; A.punti += pts.pareggio; B.punti += pts.pareggio; }
  });

  return [...rows.values()].sort((a, b) =>
    b.punti - a.punti ||
    (b.fatti - b.subiti) - (a.fatti - a.subiti) ||
    b.fatti - a.fatti ||
    a.nome.localeCompare(b.nome, 'it'));
}

/**
 * Tutti gli eventi datati: un incontro per riga, più le discipline
 * che hanno una data ma nessun incontro in calendario.
 */
export function eventiDatati() {
  const items = [];
  store.data.incontri.forEach(i => {
    const s = sport(i.sportId);
    if (isAnnullato(s)) return;
    const t = new Date(i.data).getTime();
    if (!i.data || isNaN(t)) return;
    items.push({ t, data: i.data, tipo: 'incontro', incontro: i, sport: s });
  });
  store.data.sport.forEach(s => {
    if (!s.data || isAnnullato(s)) return;
    if (incontriDiSport(s.id).some(i => i.data)) return; // già rappresentata dai suoi incontri
    const t = new Date(s.data).getTime();
    if (isNaN(t)) return;
    items.push({ t, data: s.data, tipo: 'sport', sport: s });
  });
  return items.sort((a, b) => a.t - b.t);
}

/**
 * Calendario raggruppato per giorno: compaiono solo i giorni con almeno un evento.
 * @returns {Array<{key:string, date:Date, eventi:Array}>}
 */
export function giorniCalendario() {
  const giorni = new Map();
  eventiDatati().forEach(ev => {
    const key = String(ev.data).slice(0, 10); // YYYY-MM-DD
    if (!giorni.has(key)) giorni.set(key, { key, date: new Date(ev.t), eventi: [] });
    giorni.get(key).eventi.push(ev);
  });
  return [...giorni.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Prossimi impegni su tutte le discipline. */
export function prossimiImpegni(n = 6) {
  const soglia = Date.now() - 3 * 3600e3;
  return eventiDatati()
    .filter(ev => ev.t >= soglia && !(ev.tipo === 'incontro' && isConcluso(ev.incontro)) &&
      !(ev.tipo === 'sport' && (ev.sport.stato || '').toLowerCase() === 'completato'))
    .slice(0, n);
}

/* ---------- statistiche ---------- */

export function statsGlobali() {
  const s = store.data.sport;
  const stato = x => (x.stato || '').toLowerCase();
  const attivi = s.filter(x => stato(x) !== 'annullato');
  return {
    nazioni: store.data.nazioni.length,
    atleti: store.data.atleti.length,
    squadre: store.data.squadre.length,
    sport: attivi.length,
    annullati: s.length - attivi.length,
    completati: s.filter(x => stato(x) === 'completato').length,
    inCorso: s.filter(x => stato(x) === 'in corso').length,
    risultati: store.data.risultati.length,
    incontri: store.data.incontri.length,
    iscrizioni: store.data.iscrizioni.length,
  };
}

export function ultimiRisultati(n = 8) {
  return store.data.risultati
    .filter(isFinale)
    .sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
    .slice(0, n);
}
