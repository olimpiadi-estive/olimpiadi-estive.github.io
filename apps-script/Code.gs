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
  SQUADRE:   ['id', 'nome', 'emoji', 'colore', 'atletaIds', 'note'],
  RISULTATI: ['id', 'sportId', 'posizione', 'nazioneId', 'atletaIds', 'punteggio', 'note', 'ts',
              'squadraId'],
  // Calendario: un incontro/turno per riga. latoA/latoB sono riferimenti
  // nella forma "naz:<id>", "sqd:<id>", "atl:<id>" (vuoti nei formati open).
  INCONTRI:  ['id', 'sportId', 'fase', 'round', 'ordine', 'data', 'luogo', 'stato',
              'latoA', 'latoB', 'punteggioA', 'punteggioB', 'vincitore', 'note'],
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
        case 'upsertRisultato':
          validateRisultato_(p);
          if (!p.ts) p.ts = new Date().toISOString();
          out = upsert_('RISULTATI', p);
          break;
        case 'deleteRisultato': out = remove_('RISULTATI', p.id); break;
        case 'upsertIncontro':
          validateIncontro_(p);
          out = upsert_('INCONTRI', p);
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
  if (name === 'SPORT') {
    removeWhere_('RISULTATI', 'sportId', id);
    removeWhere_('INCONTRI', 'sportId', id);
  }
  return { id: id, deleted: true };
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

  // squadre miste: pescano da nazioni diverse
  var s1 = upsert_('SQUADRE', { nome: 'Squali Volanti', emoji: '🦈', colore: '#1657c8', atletaIds: a1 + ',' + a3 }).id;
  var s2 = upsert_('SQUADRE', { nome: 'Tigri di Cartone', emoji: '🐯', colore: '#f5a623', atletaIds: a2 + ',' + a1 }).id;

  var sp1 = upsert_('SPORT', {
    nome: 'Staffetta del Gavettone', icona: '💧', categoria: 'Acqua', tipo: 'squadra',
    formato: 'tabellone', stato: 'programmato', ordine: 1, luogo: 'Giardino grande',
    descrizione: 'Quattro frazioni, un secchio, zero pietà.',
    regolamento: '- Squadre da 4\n- Il secchio non si tiene con i denti\n- Chi bagna il giudice è squalificato'
  }).id;
  var sp2 = upsert_('SPORT', {
    nome: 'Torneo di Racchettoni', icona: '🏓', categoria: 'Spiaggia', tipo: 'coppia',
    formato: 'girone', stato: 'programmato', ordine: 2,
    descrizione: 'Girone all\'italiana, tutti contro tutti.',
    regolamento: '1. Partite a 11 punti\n2. Cambio battuta ogni 2 punti\n3. Il vento non è una scusa'
  }).id;
  var sp3 = upsert_('SPORT', {
    nome: 'Tuffo Artistico', icona: '🤿', categoria: 'Acqua', tipo: 'individuale',
    formato: 'open', stato: 'programmato', ordine: 3,
    descrizione: 'Una sola discesa, giuria impietosa.',
    regolamento: '- Un solo tentativo\n- Voto da 1 a 10\n- La bomba vale doppio'
  }).id;

  upsert_('INCONTRI', {
    sportId: sp1, fase: 'Semifinale', round: '1', ordine: '1', stato: 'programmato',
    latoA: 'sqd:' + s1, latoB: 'sqd:' + s2, luogo: 'Giardino grande'
  });
  upsert_('INCONTRI', {
    sportId: sp2, fase: 'Girone unico', round: '1', ordine: '1', stato: 'concluso',
    latoA: 'naz:' + n1, latoB: 'naz:' + n2, punteggioA: '11', punteggioB: '7',
    vincitore: 'naz:' + n1
  });
  upsert_('INCONTRI', {
    sportId: sp2, fase: 'Girone unico', round: '1', ordine: '2', stato: 'programmato',
    latoA: 'naz:' + n2, latoB: 'naz:' + n3
  });

  upsert_('RISULTATI', { sportId: sp3, posizione: '1', nazioneId: n3, atletaIds: a3, punteggio: '9,5', ts: new Date().toISOString() });
  upsert_('RISULTATI', { sportId: sp3, posizione: '2', nazioneId: n1, atletaIds: a1, punteggio: '8,0', ts: new Date().toISOString() });

  setConfig_({
    nome: 'Olimpiadi Epiche Estive', edizione: 'I Edizione', punti: '10,7,5,3,2,1',
    puntiVittoria: '3', puntiPareggio: '1'
  });
  bumpRev_();
  return 'Demo inserita';
}
