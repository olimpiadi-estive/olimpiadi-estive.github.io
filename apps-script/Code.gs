/**
 * Olimpiadi Epiche Estive — backend su Google Sheet.
 *
 * Setup:
 *  1. Crea un Google Sheet vuoto.
 *  2. Estensioni > Apps Script, incolla questo file, salva.
 *  3. Esegui una volta la funzione `setup` (autorizza quando richiesto):
 *     crea i fogli e imposta il PIN admin di default 123456.
 *  4. Cambia il PIN: Impostazioni progetto > Proprietà script >
 *     ADMIN_PIN = <il tuo pin>   (oppure esegui setAdminPin_ manualmente).
 *  5. Distribuisci > Nuova distribuzione > Tipo: App web
 *     - Esegui come: Me
 *     - Chi ha accesso: Chiunque
 *     Copia l'URL che finisce con /exec e incollalo nella web app.
 *
 * Nota: dopo ogni modifica al codice serve "Distribuisci > Gestisci distribuzioni >
 * modifica > Nuova versione", altrimenti l'URL continua a servire la versione vecchia.
 */

/**
 * Le colonne nuove vanno SEMPRE aggiunte in fondo a ogni elenco:
 * i dati esistenti sono letti per posizione, quindi così restano validi
 * e basta rieseguire setup() per allineare le intestazioni.
 */
var SCHEMA = {
  NAZIONI:   ['id', 'nome', 'citta', 'emoji', 'colore', 'note', 'zona'],
  ATLETI:    ['id', 'nome', 'nazioneId', 'ruolo', 'note'],
  SPORT:     ['id', 'nome', 'icona', 'categoria', 'tipo', 'stato', 'data', 'luogo',
              'descrizione', 'regolamento', 'punti', 'ordine', 'formato'],
  // Le squadre sono per disciplina: si compongono dagli iscritti a quello sport.
  SQUADRE:   ['id', 'nome', 'emoji', 'colore', 'atletaIds', 'note', 'sportId'],
  // Chi partecipa a una singola disciplina.
  ISCRIZIONI: ['id', 'sportId', 'atletaId', 'seed', 'note'],
  // incontroId vuoto = classifica finale della disciplina (assegna le medaglie).
  // incontroId valorizzato = ordine d'arrivo di quella singola gara o batteria.
  RISULTATI: ['id', 'sportId', 'posizione', 'nazioneId', 'atletaIds', 'punteggio', 'note', 'ts',
              'squadraId', 'incontroId'],
  // Calendario: un evento per riga. latoA/latoB sono riferimenti "naz:<id>", "sqd:<id>",
  // "atl:<id>" per le sfide; `partecipanti` è l'elenco per le gare a più concorrenti.
  // `prossimo` dice dove va il vincitore, nella forma "round.ordine.lato" (es. "2.3.B").
  INCONTRI:  ['id', 'sportId', 'fase', 'round', 'ordine', 'data', 'luogo', 'stato',
              'latoA', 'latoB', 'punteggioA', 'punteggioB', 'vincitore', 'note',
              'partecipanti', 'prossimo'],
  CONFIG:    ['chiave', 'valore']
};

var DEFAULT_PIN = '123456';

/* ---------------- setup ---------------- */

/**
 * Crea i fogli mancanti e allinea le intestazioni allo SCHEMA.
 * È idempotente: rieseguila dopo ogni aggiornamento del codice per applicare
 * le nuove colonne (es. `zona` e `squadraId`) senza perdere i dati.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (name) {
    var cols = SCHEMA[name];
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getMaxColumns() < cols.length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
    }
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // tutte le colonne dati come testo semplice
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), cols.length).setNumberFormat('@');
  });
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PIN')) props.setProperty('ADMIN_PIN', DEFAULT_PIN);
  if (!props.getProperty('REV')) props.setProperty('REV', '1');
  var def = ss.getSheetByName('Foglio1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  return 'Setup completato. PIN attuale: ' + props.getProperty('ADMIN_PIN');
}

function setAdminPin_(pin) {
  PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', String(pin));
}

/* ---------------- entry point ---------------- */

function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  return handle_(body);
}

function handle_(req) {
  try {
    var action = req.action || 'state';
    if (action === 'state') return json_({ ok: true, data: readAll_() });
    if (action === 'login') { requireAdmin_(req.pin); return json_({ ok: true, data: { ok: true } }); }

    requireAdmin_(req.pin);
    var p = req.payload || {};
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var out;
      switch (action) {
        case 'upsertNazione':   out = upsert_('NAZIONI', p); break;
        case 'deleteNazione':   out = remove_('NAZIONI', p.id); break;
        case 'upsertAtleta':    out = upsert_('ATLETI', p); break;
        case 'deleteAtleta':    out = remove_('ATLETI', p.id); break;
        case 'upsertSport':     out = upsert_('SPORT', p); break;
        case 'deleteSport':     out = remove_('SPORT', p.id); break;
        case 'upsertSquadra':   out = upsert_('SQUADRE', p); break;
        case 'deleteSquadra':   out = remove_('SQUADRE', p.id); break;
        case 'setIscrizioni':   out = setIscrizioni_(p); break;
        case 'generaSquadre':   out = generaSquadre_(p); break;
        case 'generaCalendario': out = generaCalendario_(p); break;
        case 'svuotaCalendario':
          removeWhere_('INCONTRI', 'sportId', p.sportId);
          out = { sportId: p.sportId, svuotato: true };
          break;
        case 'upsertRisultato':
          validateRisultato_(p);
          if (!p.ts) p.ts = new Date().toISOString();
          out = upsert_('RISULTATI', p);
          break;
        case 'deleteRisultato': out = remove_('RISULTATI', p.id); break;
        case 'setClassificaSport': out = setClassificaSport_(p); break;
        case 'componiFinale':   out = componiFinale_(p); break;
        case 'upsertIncontro':
          validateIncontro_(p);
          out = upsert_('INCONTRI', p);
          propagaVincitore_(p);
          break;
        case 'deleteIncontro':  out = remove_('INCONTRI', p.id); break;
        case 'setConfig':       out = setConfig_(p); break;
        default: throw new Error('Azione non riconosciuta: ' + action);
      }
      bumpRev_();
      return json_({ ok: true, data: out });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function requireAdmin_(pin) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || DEFAULT_PIN;
  if (String(pin || '') !== String(expected)) throw new Error('PIN admin non valido');
}

/* ---------------- validazione ---------------- */

function validateRisultato_(p) {
  if (!p.sportId) throw new Error('Disciplina obbligatoria');
  if (!Number(p.posizione)) throw new Error('Posizione obbligatoria');
  if (!p.nazioneId && !p.squadraId) {
    throw new Error('Indica la nazione oppure la squadra che riceve i punti');
  }
}

function validateIncontro_(p) {
  if (!p.sportId) throw new Error('Disciplina obbligatoria');
  if (p.latoA && p.latoB && p.latoA === p.latoB) {
    throw new Error('I due lati dell\'incontro devono essere diversi');
  }
}

/** Stati ammessi per una disciplina: 'annullato' per gli sport che saltano. */
var STATI_SPORT = ['programmato', 'in corso', 'completato', 'annullato'];

/* ---------------- lettura ---------------- */

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Foglio "' + name + '" mancante: esegui la funzione setup()');
  return sh;
}

function rows_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  var cols = SCHEMA[name];
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, cols.length).getDisplayValues();
  var out = [];
  values.forEach(function (r) {
    if (!r.join('').trim()) return;
    var o = {};
    cols.forEach(function (c, i) { o[c] = r[i]; });
    out.push(o);
  });
  return out;
}

function readAll_() {
  var cfg = {};
  rows_('CONFIG').forEach(function (r) { if (r.chiave) cfg[r.chiave] = r.valore; });
  return {
    nazioni: rows_('NAZIONI'),
    atleti: rows_('ATLETI'),
    sport: rows_('SPORT'),
    squadre: rows_('SQUADRE'),
    iscrizioni: rows_('ISCRIZIONI'),
    risultati: rows_('RISULTATI'),
    incontri: rows_('INCONTRI'),
    config: cfg,
    rev: Number(PropertiesService.getScriptProperties().getProperty('REV') || 0)
  };
}

/* ---------------- scrittura ---------------- */

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 10);
}

function findRow_(name, id) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function upsert_(name, payload) {
  var cols = SCHEMA[name];
  var sh = sheet_(name);
  var id = payload.id;
  var row = id ? findRow_(name, id) : -1;

  if (row > 0) {
    var range = sh.getRange(row, 1, 1, cols.length);
    var existing = range.getDisplayValues()[0];
    var merged = cols.map(function (c, i) {
      return Object.prototype.hasOwnProperty.call(payload, c) ? String(payload[c]) : existing[i];
    });
    merged[0] = id;
    range.setNumberFormat('@'); // testo semplice: nessuna formula, nessuna data reinterpretata
    range.setValues([merged]);
    return { id: id, updated: true };
  }

  var fresh = cols.map(function (c) {
    if (c === 'id') return id || newId_();
    return Object.prototype.hasOwnProperty.call(payload, c) ? String(payload[c]) : '';
  });
  var newRow = sh.getLastRow() + 1;
  var target = sh.getRange(newRow, 1, 1, cols.length);
  target.setNumberFormat('@');
  target.setValues([fresh]);
  return { id: fresh[0], created: true };
}

function remove_(name, id) {
  if (!id) throw new Error('id mancante');
  var row = findRow_(name, id);
  if (row < 0) throw new Error('Elemento non trovato');
  sheet_(name).deleteRow(row);

  // Pulizia riferimenti orfani
  if (name === 'NAZIONI') {
    removeWhere_('RISULTATI', 'nazioneId', id);
    clearWhere_('ATLETI', 'nazioneId', id);
    clearRefs_('naz:' + id);
  }
  if (name === 'SQUADRE') {
    removeWhere_('RISULTATI', 'squadraId', id);
    clearRefs_('sqd:' + id);
  }
  if (name === 'ATLETI') {
    pruneFromList_('SQUADRE', 'atletaIds', id);
    pruneFromList_('RISULTATI', 'atletaIds', id);
    clearRefs_('atl:' + id);
  }
  if (name === 'ATLETI') removeWhere_('ISCRIZIONI', 'atletaId', id);
  if (name === 'SPORT') {
    removeWhere_('RISULTATI', 'sportId', id);
    removeWhere_('INCONTRI', 'sportId', id);
    removeWhere_('ISCRIZIONI', 'sportId', id);
    removeWhere_('SQUADRE', 'sportId', id);
  }
  return { id: id, deleted: true };
}

/* ---------------- iscrizioni per disciplina ---------------- */

/** Sostituisce in blocco gli iscritti a una disciplina. */
function setIscrizioni_(p) {
  if (!p.sportId) throw new Error('Disciplina obbligatoria');
  var ids = uniq_(splitIds_(p.atletaIds));
  removeWhere_('ISCRIZIONI', 'sportId', p.sportId);
  if (!ids.length) return { sportId: p.sportId, iscritti: 0 };
  var rows = ids.map(function (aid, i) {
    return [newId_(), String(p.sportId), String(aid), String(i + 1), ''];
  });
  appendRows_('ISCRIZIONI', rows);
  return { sportId: p.sportId, iscritti: rows.length };
}

function iscrittiRefs_(sportId) {
  return rows_('ISCRIZIONI')
    .filter(function (r) { return String(r.sportId) === String(sportId) && r.atletaId; })
    .sort(function (a, b) { return (Number(a.seed) || 999) - (Number(b.seed) || 999); })
    .map(function (r) { return 'atl:' + r.atletaId; });
}

function squadreRefs_(sportId) {
  return rows_('SQUADRE')
    .filter(function (r) { return String(r.sportId) === String(sportId); })
    .map(function (r) { return 'sqd:' + r.id; });
}

/* ---------------- generazione squadre ---------------- */

var EMOJI_SQUADRE = ['🛡️', '🦈', '🐯', '🦅', '🐺', '🐝', '🦊', '🐉', '🦁', '🐧', '🦂', '🐻'];
var COLORI_SQUADRE = ['#1657c8', '#e0322c', '#1a9e5b', '#f5a623', '#8e44ad', '#0f8b8d',
                      '#d35400', '#2c3e50', '#c2185b', '#00796b', '#5d4037', '#3949ab'];

/**
 * Crea le squadre di una disciplina a partire dai suoi iscritti.
 * payload: { sportId, dimensione, mescola, prefisso }
 */
function generaSquadre_(p) {
  if (!p.sportId) throw new Error('Disciplina obbligatoria');
  var dim = Math.max(2, Number(p.dimensione) || 2);
  var atleti = iscrittiRefs_(p.sportId).map(function (r) { return r.split(':')[1]; });
  if (atleti.length < dim) {
    throw new Error('Iscritti insufficienti: ' + atleti.length + ' per squadre da ' + dim);
  }
  if (String(p.mescola) === 'true') atleti = shuffle_(atleti);

  // via le squadre esistenti della disciplina, con i loro risultati
  squadreRefs_(p.sportId).forEach(function (ref) {
    removeWhere_('RISULTATI', 'squadraId', ref.split(':')[1]);
  });
  removeWhere_('SQUADRE', 'sportId', p.sportId);

  var prefisso = String(p.prefisso || (dim === 2 ? 'Coppia' : 'Squadra')).trim();
  var rows = [], resti = [];
  for (var i = 0; i < atleti.length; i += dim) {
    var gruppo = atleti.slice(i, i + dim);
    if (gruppo.length < dim) { resti = gruppo; break; }
    var k = rows.length;
    rows.push([newId_(), prefisso + ' ' + (k + 1), EMOJI_SQUADRE[k % EMOJI_SQUADRE.length],
      COLORI_SQUADRE[k % COLORI_SQUADRE.length], gruppo.join(','), '', String(p.sportId)]);
  }
  // gli avanzi entrano nell'ultima squadra invece di restare fuori
  if (resti.length && rows.length) {
    var last = rows[rows.length - 1];
    last[4] = last[4] + ',' + resti.join(',');
  }
  appendRows_('SQUADRE', rows);
  return {
    squadre: rows.length,
    avanzi: resti.length,
    nota: resti.length ? resti.length + ' atleti aggiunti all\'ultima squadra' : ''
  };
}

/* ---------------- generazione calendario ---------------- */

/** open/girone sono i vecchi nomi: li normalizziamo. */
function formatoDi_(s) {
  var f = String((s && s.formato) || '').toLowerCase();
  if (f === 'girone') return 'scontro';
  if (f === '' || f === 'open' || f === 'classifica') return 'tutti';
  return f;
}

function nomeTurno_(round, totale) {
  var da = totale - round;
  if (da === 0) return 'Finale';
  if (da === 1) return 'Semifinale';
  if (da === 2) return 'Quarti di finale';
  if (da === 3) return 'Ottavi di finale';
  if (da === 4) return 'Sedicesimi di finale';
  return 'Turno ' + round;
}

/** Ordine dei posti in un tabellone: 1 contro l'ultimo, e così via. */
function seedOrder_(size) {
  var order = [1, 2];
  while (order.length < size) {
    var somma = order.length * 2 + 1, next = [];
    for (var i = 0; i < order.length; i++) { next.push(order[i]); next.push(somma - order[i]); }
    order = next;
  }
  return order;
}

/**
 * Tabellone a eliminazione diretta.
 *
 * Quando i partecipanti non sono una potenza di due, invece di regalare un bye
 * a chi sta in cima all'elenco si gioca un turno di playoff: gli ultimi
 * 2 x (n - P) partecipanti si affrontano fra loro e i vincitori entrano nel
 * tabellone principale da P posti. Con l'ordine mescolato, chi va ai playoff
 * è sorteggiato.
 *
 * @returns {{turni:number, partite:Array, playoff:number, posti:number}}
 */
function bracket_(refs) {
  var n = refs.length;
  var posti = 1; while (posti * 2 <= n) posti *= 2;   // potenza di due <= n
  var playoff = n - posti;                             // quante partite preliminari
  var turniMain = Math.round(Math.log(posti) / Math.log(2));
  var offset = playoff > 0 ? 1 : 0;                    // il playoff occupa il turno 1
  var partite = [];

  // chi entra diretto e chi passa dal playoff
  var diretti = refs.slice(0, n - 2 * playoff);
  var spareggio = refs.slice(n - 2 * playoff);

  // posti del tabellone principale: prima i diretti, poi i posti dei vincitori
  var ingressi = diretti.slice();
  for (var q = 0; q < playoff; q++) ingressi.push(null); // null = vincitore del playoff q
  var ordine = seedOrder_(posti);
  var slots = ordine.map(function (seed) {
    var v = ingressi[seed - 1];
    return v === undefined ? '' : v;                    // '' = posto vuoto, null = da playoff
  });

  // struttura del tabellone principale
  var m = {};
  for (var r = 1; r <= turniMain; r++) {
    m[r] = [];
    var cnt = posti / Math.pow(2, r);
    for (var i = 0; i < cnt; i++) m[r].push({ A: '', B: '' });
  }
  var destinazioni = []; // dove finisce il vincitore di ogni playoff
  for (var j = 0; j < posti / 2; j++) {
    var sa = slots[2 * j], sb = slots[2 * j + 1];
    m[1][j].A = sa === null ? '' : sa;
    m[1][j].B = sb === null ? '' : sb;
    if (sa === null) destinazioni.push({ round: 1 + offset, ordine: j + 1, lato: 'A' });
    if (sb === null) destinazioni.push({ round: 1 + offset, ordine: j + 1, lato: 'B' });
  }

  // turno di playoff
  for (var k = 0; k < playoff; k++) {
    var d = destinazioni[k] || null;
    partite.push({
      fase: playoff === 1 ? 'Playoff di qualificazione' : 'Playoff di qualificazione',
      round: 1, ordine: k + 1,
      A: spareggio[2 * k] || '', B: spareggio[2 * k + 1] || '',
      prossimo: d ? d.round + '.' + d.ordine + '.' + d.lato : ''
    });
  }

  // turni del tabellone principale
  for (var r2 = 1; r2 <= turniMain; r2++) {
    for (var i2 = 0; i2 < m[r2].length; i2++) {
      var dest = r2 < turniMain
        ? (r2 + 1 + offset) + '.' + Math.ceil((i2 + 1) / 2) + '.' + ((i2 + 1) % 2 === 1 ? 'A' : 'B')
        : '';
      partite.push({
        fase: nomeTurno_(r2, turniMain), round: r2 + offset, ordine: i2 + 1,
        A: m[r2][i2].A, B: m[r2][i2].B, prossimo: dest
      });
    }
  }

  return { turni: turniMain + offset, partite: partite, playoff: playoff, posti: posti };
}

/** Tutti contro tutti con il metodo del cerchio: una giornata per turno. */
function roundRobin_(refs) {
  var list = refs.slice();
  if (list.length % 2) list.push('');
  var n = list.length, giornate = [];
  for (var g = 0; g < n - 1; g++) {
    var partite = [];
    for (var i = 0; i < n / 2; i++) {
      var a = list[i], b = list[n - 1 - i];
      if (a && b) partite.push(g % 2 ? { A: b, B: a } : { A: a, B: b });
    }
    giornate.push(partite);
    list.splice(1, 0, list.pop());
  }
  return giornate;
}

function slotTime_(startStr, minuti, idx) {
  var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(startStr || ''));
  if (!m) return '';
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  d.setMinutes(d.getMinutes() + (Number(minuti) || 0) * idx);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");
}

/**
 * Crea gli incontri di una disciplina. Sostituisce quelli esistenti.
 * payload: { sportId, fonte, mescola, dataInizio, intervallo, luogo, formato }
 */
function generaCalendario_(p) {
  if (!p.sportId) throw new Error('Disciplina obbligatoria');
  var s = null;
  rows_('SPORT').forEach(function (r) { if (String(r.id) === String(p.sportId)) s = r; });
  if (!s) throw new Error('Disciplina non trovata');

  var formato = String(p.formato || '').toLowerCase() || formatoDi_(s);

  var fonte = p.fonte || (s.tipo === 'squadra' || s.tipo === 'coppia' ? 'squadre'
    : (s.tipo === 'nazione' ? 'nazioni' : 'iscritti'));
  var refs;
  if (fonte === 'squadre') refs = squadreRefs_(p.sportId);
  else if (fonte === 'nazioni') refs = rows_('NAZIONI').map(function (n) { return 'naz:' + n.id; });
  else refs = iscrittiRefs_(p.sportId);

  if (refs.length < 2) {
    throw new Error('Servono almeno 2 partecipanti, trovati ' + refs.length +
      ' (fonte: ' + fonte + '). Registra gli iscritti o crea le squadre.');
  }
  if (String(p.mescola) === 'true') refs = shuffle_(refs);

  var n = refs.length;
  var partite = []; // {fase, round, ordine, A, B, partecipanti, prossimo}
  var esitoGen = {};

  if (formato === 'tutti') {
    // Gara unica: tutti in campo insieme. Con più batterie i concorrenti
    // vengono distribuiti a serpentina per non concentrare i favoriti.
    var batterie = Math.max(1, Math.min(Number(p.batterie) || 1, Math.floor(n / 2) || 1));
    var gruppi = [];
    for (var g = 0; g < batterie; g++) gruppi.push([]);
    refs.forEach(function (ref, i) {
      var giro = Math.floor(i / batterie);
      var pos = giro % 2 === 0 ? i % batterie : batterie - 1 - (i % batterie);
      gruppi[pos].push(ref);
    });
    gruppi.forEach(function (gruppo, i) {
      if (!gruppo.length) return;
      partite.push({
        fase: batterie > 1 ? 'Batteria ' + (i + 1) : 'Gara unica',
        round: 1, ordine: i + 1, A: '', B: '', partecipanti: gruppo.join(',')
      });
    });
  } else if (formato === 'tabellone') {
    if (n > 32) throw new Error('Troppi partecipanti per un tabellone: ' + n + ' (massimo 32)');
    if (n < 2) throw new Error('Servono almeno 2 partecipanti');
    var br = bracket_(refs);
    partite = br.partite;
    esitoGen = { playoff: br.playoff, posti: br.posti, turni: br.turni };
  } else { // scontri diretti: tutti contro tutti in gare singole, senza ritorno
    var tot = n * (n - 1) / 2;
    if (tot > 120) throw new Error('Sarebbero ' + tot + ' partite: troppe. Riduci i partecipanti o dividi in gruppi.');
    var giornate = roundRobin_(refs);
    for (var g = 0; g < giornate.length; g++) {
      for (var j = 0; j < giornate[g].length; j++) {
        partite.push({
          fase: 'Giornata ' + (g + 1), round: g + 1, ordine: j + 1,
          A: giornate[g][j].A, B: giornate[g][j].B
        });
      }
    }
  }

  if (!partite.length) throw new Error('Nessuna partita generata: controlla i partecipanti');

  removeWhere_('INCONTRI', 'sportId', p.sportId);

  var luogo = p.luogo !== undefined && p.luogo !== '' ? p.luogo : (s.luogo || '');
  var inizio = p.dataInizio || s.data || '';
  var intervallo = Number(p.intervallo) || 0;
  var cols = SCHEMA.INCONTRI;

  var rows = partite.map(function (x, idx) {
    var o = {
      id: newId_(), sportId: String(p.sportId), fase: x.fase, round: String(x.round),
      ordine: String(x.ordine), data: intervallo ? slotTime_(inizio, intervallo, idx) : (idx === 0 ? inizio : ''),
      luogo: luogo, stato: 'programmato', latoA: x.A || '', latoB: x.B || '',
      punteggioA: '', punteggioB: '', vincitore: '', note: '',
      partecipanti: x.partecipanti || '', prossimo: x.prossimo || ''
    };
    return cols.map(function (c) { return o[c] !== undefined ? String(o[c]) : ''; });
  });
  appendRows_('INCONTRI', rows);

  var out = {
    sportId: p.sportId, formato: formato, fonte: fonte,
    partecipanti: n, partite: rows.length
  };
  if (esitoGen.playoff) {
    out.playoff = esitoGen.playoff;
    out.posti = esitoGen.posti;
    out.nota = esitoGen.playoff + ' partite di playoff per arrivare a ' + esitoGen.posti +
      ' posti nel tabellone';
  }
  return out;
}

/** In un tabellone, porta il vincitore al turno successivo. */
function propagaVincitore_(p) {
  var id = p && p.id;
  var inc = null;
  rows_('INCONTRI').forEach(function (r) {
    if (id && String(r.id) === String(id)) inc = r;
  });
  if (!inc) {
    // appena creato: prendi l'ultimo con gli stessi riferimenti
    rows_('INCONTRI').forEach(function (r) {
      if (String(r.sportId) === String(p.sportId) && String(r.round) === String(p.round) &&
          String(r.ordine) === String(p.ordine)) inc = r;
    });
  }
  if (!inc) return;
  if (String(inc.stato || '').toLowerCase() !== 'concluso') return;

  var s = null;
  rows_('SPORT').forEach(function (r) { if (String(r.id) === String(inc.sportId)) s = r; });
  if (!s || formatoDi_(s) !== 'tabellone') return;

  var w = inc.vincitore;
  if (!w) {
    var a = Number(inc.punteggioA), b = Number(inc.punteggioB);
    if (isNaN(a) || isNaN(b) || a === b) return;
    w = a > b ? inc.latoA : inc.latoB;
  }
  if (!w) return;

  var round = Number(inc.round), ordine = Number(inc.ordine);
  if (!round || !ordine) return;

  // `prossimo` ("round.ordine.lato") è la destinazione esplicita: serve perché
  // dopo un turno di playoff il numero di partite non si dimezza.
  var destR, destO, destLato;
  var pross = String(inc.prossimo || '').split('.');
  if (pross.length === 3 && Number(pross[0]) && Number(pross[1])) {
    destR = Number(pross[0]);
    destO = Number(pross[1]);
    destLato = pross[2].toUpperCase() === 'B' ? 'latoB' : 'latoA';
  } else {
    destR = round + 1;
    destO = Math.ceil(ordine / 2);
    destLato = (ordine % 2 === 1) ? 'latoA' : 'latoB';
  }

  var target = null;
  rows_('INCONTRI').forEach(function (r) {
    if (String(r.sportId) === String(inc.sportId) && Number(r.round) === destR &&
        Number(r.ordine) === destO) target = r;
  });
  if (!target) return;

  var lato = destLato;
  if (String(target[lato] || '') === String(w)) return;
  var patch = { id: target.id };
  patch[lato] = w;
  upsert_('INCONTRI', patch);
}

/* ---------------- classifica finale di una disciplina ---------------- */

/**
 * Cancella i risultati di una disciplina: solo quelli di un incontro,
 * oppure solo la classifica finale (le righe senza incontroId).
 */
function removeRisultati_(sportId, incontroId) {
  var cols = SCHEMA.RISULTATI;
  var iS = cols.indexOf('sportId'), iI = cols.indexOf('incontroId');
  var sh = sheet_('RISULTATI');
  var last = sh.getLastRow();
  if (last < 2) return;
  var vals = sh.getRange(2, 1, last - 1, cols.length).getDisplayValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][iS]) !== String(sportId)) continue;
    var suo = String(vals[i][iI] || '');
    if (String(incontroId || '') === suo) sh.deleteRow(i + 2);
  }
}

/**
 * Sostituisce una classifica ordinata.
 * payload: { sportId, ordine: 'atl:1,sqd:2,naz:3', incontroId? }
 * Senza incontroId è la classifica finale e assegna le medaglie ai primi tre;
 * con incontroId è l'ordine d'arrivo di quella gara o batteria.
 */
function setClassificaSport_(p) {
  if (!p.sportId) throw new Error('Disciplina obbligatoria');
  var gruppi = parseOrdine_(p.ordine);
  var incontroId = String(p.incontroId || '');
  removeRisultati_(p.sportId, incontroId);
  if (!gruppi.length) return { sportId: p.sportId, posizioni: 0 };

  // posizioni con pari merito: due primi ex aequo occupano 1 e 1, il successivo è 3
  var refs = [], posizioni = [], pos = 1;
  gruppi.forEach(function (g) {
    g.forEach(function (ref) { refs.push(ref); posizioni.push(pos); });
    pos += g.length;
  });

  var atleti = rows_('ATLETI');
  var squadre = rows_('SQUADRE');
  var cols = SCHEMA.RISULTATI;
  var ts = new Date().toISOString();

  var rows = refs.map(function (ref, i) {
    var parti = String(ref).split(':');
    var tipo = parti[0], rid = parti[1];
    var o = {
      id: newId_(), sportId: String(p.sportId), posizione: String(posizioni[i]),
      nazioneId: '', atletaIds: '', punteggio: '', note: '', ts: ts, squadraId: '',
      incontroId: incontroId
    };
    if (tipo === 'sqd') {
      o.squadraId = rid;
      squadre.forEach(function (s) { if (String(s.id) === String(rid)) o.atletaIds = s.atletaIds || ''; });
    } else if (tipo === 'naz') {
      o.nazioneId = rid;
    } else {
      o.atletaIds = rid;
      atleti.forEach(function (a) { if (String(a.id) === String(rid)) o.nazioneId = a.nazioneId || ''; });
    }
    return cols.map(function (c) { return o[c] !== undefined ? String(o[c]) : ''; });
  });
  appendRows_('RISULTATI', rows);

  var out = { sportId: p.sportId, incontroId: incontroId, posizioni: rows.length };
  // gli arrivi di una gara ricompongono anche la classifica finale, salvo rifiuto esplicito
  if (incontroId && String(p.finale) !== 'false') {
    out.finale = componiFinale_({ sportId: p.sportId });
  }
  return out;
}

/** Riferimento "atl:/sqd:/naz:" di una riga di risultato. */
function refDiRisultato_(r) {
  if (r.squadraId) return 'sqd:' + r.squadraId;
  var atl = splitIds_(r.atletaIds);
  if (atl.length) return 'atl:' + atl[0];
  return r.nazioneId ? 'naz:' + r.nazioneId : '';
}

/**
 * Compone la classifica finale di una disciplina dagli arrivi delle sue gare.
 * Con una gara sola e una copia fedele, pari merito compresi; con piu batterie
 * intreccia le posizioni (tutti i primi, poi tutti i secondi...).
 */
function componiFinale_(p) {
  if (!p.sportId) throw new Error('Disciplina obbligatoria');

  var ordineGare = {};
  rows_('INCONTRI').forEach(function (i) {
    if (String(i.sportId) !== String(p.sportId)) return;
    ordineGare[i.id] = (Number(i.round) || 0) * 1000 + (Number(i.ordine) || 0);
  });

  var perGara = {};
  rows_('RISULTATI').forEach(function (r) {
    if (String(r.sportId) !== String(p.sportId) || !r.incontroId) return;
    if (!(r.incontroId in ordineGare)) return;
    if (!perGara[r.incontroId]) perGara[r.incontroId] = [];
    perGara[r.incontroId].push(r);
  });

  var gare = Object.keys(perGara).sort(function (a, b) { return ordineGare[a] - ordineGare[b]; });
  if (!gare.length) {
    throw new Error('Nessun arrivo registrato: compila prima gli arrivi delle gare');
  }

  var maxPos = 0;
  gare.forEach(function (g) {
    perGara[g].forEach(function (r) { maxPos = Math.max(maxPos, Number(r.posizione) || 0); });
  });

  // i pari merito dentro una gara restano pari merito anche nella finale
  var gruppi = [], visti = {};
  for (var pos = 1; pos <= maxPos; pos++) {
    for (var k = 0; k < gare.length; k++) {
      var gruppo = [];
      perGara[gare[k]].forEach(function (r) {
        if (Number(r.posizione) !== pos) return;
        var ref = refDiRisultato_(r);
        if (ref && !visti[ref]) { visti[ref] = 1; gruppo.push(ref); }
      });
      if (gruppo.length) gruppi.push(gruppo.join('+'));
    }
  }

  var res = setClassificaSport_({ sportId: p.sportId, ordine: gruppi.join(','), incontroId: '' });
  res.gare = gare.length;
  return res;
}

/* ---------------- utilità ---------------- */

/**
 * Ordine di una classifica, con i pari merito.
 * "atl:1+atl:2,atl:3" = due primi ex aequo, poi un terzo (che prende il bronzo).
 * @returns {Array<Array<string>>} un gruppo per posizione
 */
function parseOrdine_(v) {
  return String(v || '').split(',')
    .map(function (g) { return splitPlus_(g); })
    .filter(function (g) { return g.length; });
}

function splitPlus_(v) {
  return String(v || '').split('+').map(function (s) { return s.trim(); })
    .filter(function (s) { return !!s; });
}

function splitIds_(v) {
  return String(v || '').split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return !!s; });
}

function uniq_(list) {
  var seen = {}, out = [];
  list.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
  return out;
}

function shuffle_(list) {
  var a = list.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function appendRows_(name, rows) {
  if (!rows.length) return;
  var sh = sheet_(name);
  var cols = SCHEMA[name];
  var range = sh.getRange(sh.getLastRow() + 1, 1, rows.length, cols.length);
  range.setNumberFormat('@');
  range.setValues(rows);
}

/** Svuota i riferimenti a un partecipante negli incontri, senza cancellare gli incontri. */
function clearRefs_(ref) {
  var cols = SCHEMA.INCONTRI;
  var sh = sheet_('INCONTRI');
  var last = sh.getLastRow();
  if (last < 2) return;
  var range = sh.getRange(2, 1, last - 1, cols.length);
  var vals = range.getDisplayValues();
  var idx = [cols.indexOf('latoA'), cols.indexOf('latoB'), cols.indexOf('vincitore')];
  var changed = false;
  for (var i = 0; i < vals.length; i++) {
    for (var j = 0; j < idx.length; j++) {
      if (String(vals[i][idx[j]]) === String(ref)) { vals[i][idx[j]] = ''; changed = true; }
    }
  }
  if (changed) { range.setNumberFormat('@'); range.setValues(vals); }
}

/** Rimuove un id da una colonna che contiene elenchi separati da virgola. */
function pruneFromList_(name, col, id) {
  var cols = SCHEMA[name];
  var idx = cols.indexOf(col);
  if (idx < 0) return;
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return;
  var range = sh.getRange(2, idx + 1, last - 1, 1);
  var vals = range.getDisplayValues();
  var changed = false;
  for (var i = 0; i < vals.length; i++) {
    var list = String(vals[i][0] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var kept = list.filter(function (x) { return String(x) !== String(id); });
    if (kept.length !== list.length) { vals[i][0] = kept.join(','); changed = true; }
  }
  if (changed) { range.setNumberFormat('@'); range.setValues(vals); }
}

function removeWhere_(name, col, value) {
  var cols = SCHEMA[name];
  var idx = cols.indexOf(col);
  if (idx < 0) return;
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return;
  var values = sh.getRange(2, 1, last - 1, cols.length).getDisplayValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][idx]) === String(value)) sh.deleteRow(i + 2);
  }
}

function clearWhere_(name, col, value) {
  var cols = SCHEMA[name];
  var idx = cols.indexOf(col);
  if (idx < 0) return;
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return;
  var range = sh.getRange(2, idx + 1, last - 1, 1);
  var vals = range.getDisplayValues();
  var changed = false;
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(value)) { vals[i][0] = ''; changed = true; }
  }
  if (changed) range.setValues(vals);
}

function setConfig_(payload) {
  var sh = sheet_('CONFIG');
  Object.keys(payload).forEach(function (k) {
    if (k === 'action' || k === 'pin') return;
    var row = -1;
    var last = sh.getLastRow();
    if (last >= 2) {
      var keys = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
      for (var i = 0; i < keys.length; i++) {
        if (String(keys[i][0]) === String(k)) { row = i + 2; break; }
      }
    }
    var cell = row > 0 ? sh.getRange(row, 1, 1, 2) : sh.getRange(sh.getLastRow() + 1, 1, 1, 2);
    cell.setNumberFormat('@');
    cell.setValues([[k, String(payload[k])]]);
  });
  return { saved: true };
}

function bumpRev_() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('REV', String(Number(props.getProperty('REV') || 0) + 1));
}

/* ---------------- dati di esempio (opzionale) ---------------- */

function seedDemo() {
  var n1 = upsert_('NAZIONI', { nome: 'Repubblica di Milano', citta: 'Milano', emoji: '🏙️', colore: '#0b3d91', zona: 'nord' }).id;
  var n2 = upsert_('NAZIONI', { nome: 'Ducato di Bologna', citta: 'Bologna', emoji: '🍝', colore: '#e0322c', zona: 'centro' }).id;
  var n3 = upsert_('NAZIONI', { nome: 'Regno di Palermo', citta: 'Palermo', emoji: '🍋', colore: '#1a9e5b', zona: 'sud' }).id;

  var a1 = upsert_('ATLETI', { nome: 'Mario Rossi', nazioneId: n1, ruolo: 'Portabandiera' }).id;
  var a2 = upsert_('ATLETI', { nome: 'Lucia Bianchi', nazioneId: n2, ruolo: 'Capitano' }).id;
  var a3 = upsert_('ATLETI', { nome: 'Nino Verdi', nazioneId: n3, ruolo: 'Specialista' }).id;

  var sp1 = upsert_('SPORT', {
    nome: 'Staffetta del Gavettone', icona: '💧', categoria: 'Acqua', tipo: 'squadra',
    formato: 'tabellone', stato: 'programmato', ordine: 1, luogo: 'Giardino grande',
    descrizione: 'Quattro frazioni, un secchio, zero pietà.',
    regolamento: '- Squadre da 4\n- Il secchio non si tiene con i denti\n- Chi bagna il giudice è squalificato'
  }).id;
  var sp2 = upsert_('SPORT', {
    nome: 'Torneo di Racchettoni', icona: '🏓', categoria: 'Spiaggia', tipo: 'individuale',
    formato: 'scontro', stato: 'programmato', ordine: 2, data: '2026-08-14T15:00',
    descrizione: 'Scontri diretti: ognuno affronta ogni avversario una volta.',
    regolamento: '1. Partite a 11 punti\n2. Cambio battuta ogni 2 punti\n3. Il vento non è una scusa'
  }).id;
  var sp3 = upsert_('SPORT', {
    nome: 'Tuffo Artistico', icona: '🤿', categoria: 'Acqua', tipo: 'individuale',
    formato: 'tutti', stato: 'programmato', ordine: 3, data: '2026-08-14T18:00',
    descrizione: 'Gara unica, una sola discesa, giuria impietosa.',
    regolamento: '- Un solo tentativo\n- Voto da 1 a 10\n- La bomba vale doppio'
  }).id;

  // iscritti per disciplina
  setIscrizioni_({ sportId: sp1, atletaIds: [a1, a2, a3].join(',') });
  setIscrizioni_({ sportId: sp2, atletaIds: [a1, a2, a3].join(',') });
  setIscrizioni_({ sportId: sp3, atletaIds: [a1, a2, a3].join(',') });

  // squadre della staffetta a partire dagli iscritti, poi tabellone e girone
  generaSquadre_({ sportId: sp1, dimensione: 2, mescola: 'false', prefisso: 'Coppia' });
  generaCalendario_({ sportId: sp1, dataInizio: '2026-08-14T12:00', intervallo: 20 });
  generaCalendario_({ sportId: sp2, dataInizio: '2026-08-14T15:00', intervallo: 15 });

  // gara unica: si registra la classifica completa, medaglie ai primi tre
  setClassificaSport_({ sportId: sp3, ordine: ['atl:' + a3, 'atl:' + a1, 'atl:' + a2].join(',') });

  setConfig_({
    nome: 'Olimpiadi Epiche Estive', edizione: 'I Edizione',
    puntiAttivi: 'no', punti: '10,7,5,3,2,1',
    puntiVittoria: '3', puntiPareggio: '1'
  });
  bumpRev_();
  return 'Demo inserita';
}
