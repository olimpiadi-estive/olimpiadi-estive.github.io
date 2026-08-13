import { CONFIG, normalizeApiUrl } from '../config.js';
import { auth, mutate, checkPin, diagnose } from '../api.js';
import {
  store, nazioniSorted, atletiSorted, squadreSorted, sportSorted,
  atletiDiNazione, atletiDiSquadra, risultatiDiSport, incontriDiSport,
  nazione, atleta, squadra, sport as getSport, incontro,
  puntiSchema, refOptions, refEntity, idList,
  ZONE, FORMATI, STATI_INCONTRO, formatoLabel, zonaLabel,
} from '../store.js';
import { esc, toast, fmtDate, ordinal, MEDAL } from '../utils.js';
import { openModal, confirmModal, renderFields, formValues } from '../ui.js';
import { avatar, statoPill, nomiRisultato } from './public.js';

let tab = 'nazioni';
let calSportId = '';

/* ---------- descrittori campi ---------- */

const nazioneFields = () => [
  { k: 'nome', label: 'Nome nazione', required: true, hint: 'Es. Repubblica di Bologna' },
  { k: 'citta', label: 'Città di residenza', hint: 'La città reale dei partecipanti' },
  {
    k: 'zona', label: 'Zona', type: 'select', required: true,
    options: [{ v: '', l: '— seleziona —' }, ...ZONE.map(z => ({ v: z.v, l: z.emoji + ' ' + z.l }))],
    hint: 'Sottocategoria geografica delle nazioni. Le squadre miste non la seguono.',
  },
  { k: 'emoji', label: 'Emoji / bandiera', def: '🚩' },
  { k: 'colore', label: 'Colore', type: 'color', def: '#0b3d91' },
  { k: 'note', label: 'Motto o note', type: 'textarea', rows: 3 },
];

const atletaFields = () => [
  { k: 'nome', label: 'Nome e cognome', required: true },
  {
    k: 'nazioneId', label: 'Nazione', type: 'select', required: true,
    options: [{ v: '', l: '— seleziona —' }, ...nazioniSorted().map(n => ({
      v: n.id, l: n.nome + ' (' + zonaLabel(n.zona) + ')',
    }))],
  },
  { k: 'ruolo', label: 'Ruolo / soprannome', hint: 'Es. Capitano, Portabandiera' },
  { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
];

const squadraFields = () => [
  { k: 'nome', label: 'Nome squadra', required: true },
  { k: 'emoji', label: 'Emoji', def: '🛡️' },
  { k: 'colore', label: 'Colore', type: 'color', def: '#1657c8' },
  {
    k: 'atletaIds', label: 'Componenti', type: 'select',
    attrs: 'multiple size="9"',
    options: atletiSorted().map(a => ({
      v: a.id,
      l: a.nome + ' — ' + (nazione(a.nazioneId)?.nome || 'senza nazione'),
      group: zonaLabel(nazione(a.nazioneId)?.zona) === '—' ? 'Zona da assegnare' : zonaLabel(nazione(a.nazioneId)?.zona),
    })),
    hint: 'Selezione multipla: pesca liberamente da nazioni e zone diverse.',
  },
  { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
];

const sportFields = () => [
  { k: 'nome', label: 'Nome disciplina', required: true },
  { k: 'icona', label: 'Emoji disciplina', def: '🏅' },
  { k: 'categoria', label: 'Categoria', hint: 'Es. Acqua, Terra, Tavolo' },
  {
    k: 'tipo', label: 'Chi gareggia', type: 'select', def: 'individuale',
    options: [
      { v: 'individuale', l: 'Atleti singoli' },
      { v: 'coppia', l: 'Coppie' },
      { v: 'squadra', l: 'Squadre miste' },
      { v: 'nazione', l: 'Nazioni' },
    ],
  },
  {
    k: 'formato', label: 'Formato calendario', type: 'select', def: 'open',
    options: FORMATI.map(f => ({ v: f.v, l: f.l })),
    hint: 'Decide come viene mostrato il calendario della disciplina.',
  },
  {
    k: 'stato', label: 'Stato', type: 'select', def: 'programmato',
    options: [
      { v: 'programmato', l: 'Programmato' },
      { v: 'in corso', l: 'In corso' },
      { v: 'completato', l: 'Completato' },
    ],
  },
  { k: 'data', label: 'Data e ora di inizio', type: 'datetime-local' },
  { k: 'luogo', label: 'Luogo' },
  { k: 'descrizione', label: 'Descrizione', type: 'textarea', rows: 4 },
  { k: 'regolamento', label: 'Regolamento', type: 'textarea', rows: 7, hint: 'Una regola per riga: diventa un elenco' },
  { k: 'punti', label: 'Punti personalizzati', hint: 'Opzionale, es. 20,14,10,6,4,2 — sovrascrive lo schema globale' },
  { k: 'ordine', label: 'Ordine di visualizzazione', type: 'number' },
];

const incontroFields = (sportId) => [
  {
    k: 'sportId', label: 'Disciplina', type: 'select', required: true, def: sportId || '',
    options: [{ v: '', l: '— seleziona —' }, ...sportSorted().map(s => ({
      v: s.id, l: (s.icona || '') + ' ' + s.nome + ' · ' + formatoLabel(s.formato),
    }))],
  },
  { k: 'fase', label: 'Fase / turno', hint: 'Es. Girone unico, Quarti, Semifinale, Finale' },
  { k: 'round', label: 'Numero turno', type: 'number', hint: 'Ordina le fasi nel tabellone (1, 2, 3…)' },
  { k: 'ordine', label: 'Ordine nel turno', type: 'number' },
  { k: 'data', label: 'Data e ora', type: 'datetime-local' },
  { k: 'luogo', label: 'Luogo' },
  {
    k: 'stato', label: 'Stato', type: 'select', def: 'programmato',
    options: STATI_INCONTRO.map(s => ({ v: s.v, l: s.l })),
  },
  { k: 'latoA', label: 'Lato A', type: 'select', options: refOptions() },
  { k: 'punteggioA', label: 'Punteggio A' },
  { k: 'latoB', label: 'Lato B', type: 'select', options: refOptions() },
  { k: 'punteggioB', label: 'Punteggio B' },
  {
    k: 'vincitore', label: 'Vincitore (se non deducibile dal punteggio)', type: 'select',
    options: refOptions({ vuoto: '— dal punteggio —' }),
  },
  { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
];

const risultatoFields = (sportId) => [
  {
    k: 'sportId', label: 'Disciplina', type: 'select', required: true, def: sportId || '',
    options: [{ v: '', l: '— seleziona —' }, ...sportSorted().map(s => ({ v: s.id, l: (s.icona || '') + ' ' + s.nome }))],
  },
  { k: 'posizione', label: 'Posizione finale', type: 'number', required: true, attrs: 'min="1" max="99"' },
  {
    k: 'squadraId', label: 'Squadra mista', type: 'select',
    options: [{ v: '', l: '— nessuna —' }, ...squadreSorted().map(s => ({ v: s.id, l: (s.emoji || '🛡️') + ' ' + s.nome }))],
    hint: 'Se compilata, i punti vanno alla squadra e non alla nazione.',
  },
  {
    k: 'nazioneId', label: 'Nazione', type: 'select',
    options: [{ v: '', l: '— nessuna —' }, ...nazioniSorted().map(n => ({ v: n.id, l: (n.emoji || '🚩') + ' ' + n.nome }))],
    hint: 'Per gare individuali o di nazione. Indica almeno una fra squadra e nazione.',
  },
  {
    k: 'atletaIds', label: 'Atleti coinvolti', type: 'select',
    attrs: 'multiple size="7"',
    options: atletiSorted().map(a => ({ v: a.id, l: a.nome + ' — ' + (nazione(a.nazioneId)?.nome || '?') })),
    hint: 'Ricevono i punti nella classifica individuale. Se lasci vuoto e scegli una squadra, valgono tutti i suoi componenti.',
  },
  { k: 'punteggio', label: 'Misura / punteggio', hint: 'Es. 12,4s — 3-1 — 45 punti' },
  { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
];

/* ---------- helper salvataggio ---------- */

async function save(action, payload, okMsg) {
  try {
    await mutate(action, payload);
    toast(okMsg || 'Salvato', 'ok');
    await store.refresh({ silent: true });
  } catch (err) {
    toast(err.message, 'err');
    return false;
  }
}

function multiValues(form, name) {
  const el = form.querySelector(`[name="${name}"]`);
  if (!el) return '';
  if (!el.multiple) return el.value;
  return [...el.selectedOptions].map(o => o.value).join(',');
}

/** Preseleziona le voci di una select multipla dopo l'apertura della modale. */
function preselect(name, ids) {
  const sel = document.querySelector(`[name="${name}"]`);
  if (!sel || !sel.multiple) return;
  const wanted = idList(ids);
  [...sel.options].forEach(o => { o.selected = wanted.includes(o.value); });
}

function editRow(kind, fields, action, values, title) {
  openModal({
    title,
    body: renderFields(fields, values || {}),
    onOk: async (form) => {
      const v = formValues(form);
      if (kind === 'risultato' || kind === 'squadra') v.atletaIds = multiValues(form, 'atletaIds');
      if (kind === 'risultato' && !v.squadraId && !v.nazioneId) {
        toast('Indica la squadra oppure la nazione che riceve i punti', 'err');
        return false;
      }
      if (kind === 'incontro' && v.latoA && v.latoA === v.latoB) {
        toast('I due lati devono essere diversi', 'err');
        return false;
      }
      if (values?.id) v.id = values.id;
      return await save(action, v);
    },
  });
  if (kind === 'risultato' || kind === 'squadra') preselect('atletaIds', values?.atletaIds);
}

function del(action, id, nome) {
  confirmModal('Eliminare?', `"${nome}" verrà rimosso definitivamente.`, async () => {
    await save(action, { id }, 'Eliminato');
  });
}

/* ---------- vista ---------- */

export const admin = {
  render() {
    if (!CONFIG.apiUrl) return setupScreen();
    if (!auth.isAdmin) return loginScreen();

    const tabs = [
      ['nazioni', '🚩 Nazioni'], ['atleti', '🏃 Atleti'], ['squadre', '🛡️ Squadre'],
      ['sport', '🥇 Sport'], ['calendario', '🗓️ Calendario'],
      ['risultati', '🏆 Risultati'], ['config', '⚙️ Impostazioni'],
    ];
    return `
    <div class="section-head">
      <h1 style="margin:0">Pannello admin</h1>
      <button class="btn ghost sm" id="logout">Esci</button>
    </div>
    <div class="tabs" role="tablist">
      ${tabs.map(([k, l]) => `<button data-atab="${k}" class="${tab === k ? 'on' : ''}" role="tab">${l}</button>`).join('')}
    </div>
    <div id="adminPane">${pane()}</div>`;
  },

  mount() {
    const lg = document.getElementById('adminLogin');
    if (lg) {
      lg.addEventListener('submit', async e => {
        e.preventDefault();
        const pin = lg.pin.value.trim();
        const btn = lg.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Verifico…';
        try {
          if (await checkPin(pin)) {
            auth.save(pin, lg.remember.checked);
            toast('Accesso effettuato', 'ok');
            rerender();
          } else {
            toast('PIN errato', 'err');
          }
        } catch (err) {
          toast(err.message, 'err');
        } finally {
          btn.disabled = false; btn.textContent = 'Entra';
        }
      });
      bindConnTools();
      return;
    }

    const setup = document.getElementById('setupForm');
    if (setup) {
      setup.addEventListener('submit', async e => {
        e.preventDefault();
        const url = normalizeApiUrl(setup.url.value);
        setup.url.value = url;
        const btn = setup.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Verifico…';
        const res = await diagnose(url);
        btn.disabled = false; btn.textContent = 'Verifica e collega';
        showDiag(res);
        if (!res.ok) return;
        CONFIG.apiUrl = url;
        toast('Collegato', 'ok');
        await store.refresh();
        rerender();
      });
      return;
    }

    document.getElementById('logout')?.addEventListener('click', () => {
      auth.clear(); toast('Sessione chiusa'); rerender();
    });

    document.querySelectorAll('[data-atab]').forEach(b => b.addEventListener('click', () => {
      tab = b.dataset.atab;
      document.querySelectorAll('[data-atab]').forEach(x => x.classList.toggle('on', x === b));
      document.getElementById('adminPane').innerHTML = pane();
      bindPane();
    }));

    bindPane();
  },
};

function rerender() {
  window.dispatchEvent(new CustomEvent('oee:rerender'));
}

function setupScreen() {
  return `
  <h1>Configurazione iniziale</h1>
  <div class="alert info">L'app non è ancora collegata al foglio Google. Segui il <b>README</b>,
  poi incolla qui l'URL del Web App di Apps Script (finisce con <code>/exec</code>).</div>
  <form class="card" id="setupForm">
    ${renderFields([{ k: 'url', label: 'URL Web App', required: true, hint: 'https://script.google.com/macros/s/…/exec' }])}
    <div id="diagOut"></div>
    <button class="btn block" type="submit">Verifica e collega</button>
  </form>`;
}

function showDiag(res, where = 'diagOut') {
  const el = document.getElementById(where);
  if (el) el.innerHTML = `<div class="alert ${res.ok ? 'info' : 'err'}">${esc(res.msg)}</div>`;
}

function loginScreen() {
  return `
  <h1>Area riservata</h1>
  <p class="muted">Inserisci il PIN admin per gestire nazioni, squadre, discipline, calendario e risultati.</p>
  <form class="card" id="adminLogin">
    ${renderFields([{ k: 'pin', label: 'PIN admin', type: 'password', required: true, attrs: 'autocomplete="current-password"' }])}
    <label class="fld" style="display:flex;gap:.5rem;align-items:center">
      <input type="checkbox" name="remember" style="width:auto" checked>
      <span style="margin:0;text-transform:none;letter-spacing:0;font-weight:400;color:var(--txt)">Ricordami su questo dispositivo</span>
    </label>
    <button class="btn block" type="submit">Entra</button>
  </form>
  <p class="small muted">Il PIN è verificato dal server (Apps Script) e non è contenuto nell'app.</p>
  <div class="card">
    <h3>Problemi di collegamento?</h3>
    <p class="small muted" style="word-break:break-all">${esc(CONFIG.apiUrl)}</p>
    <div id="diagOut"></div>
    <div class="btn-row">
      <button class="btn ghost sm" id="testConn">Testa connessione</button>
      <button class="btn ghost sm" id="changeUrl">Cambia URL API</button>
    </div>
  </div>`;
}

function pane() {
  if (tab === 'nazioni') return paneNazioni();
  if (tab === 'atleti') return paneAtleti();
  if (tab === 'squadre') return paneSquadre();
  if (tab === 'sport') return paneSport();
  if (tab === 'calendario') return paneCalendario();
  if (tab === 'risultati') return paneRisultati();
  return paneConfig();
}

function actions(kind, id) {
  return `<div class="btn-row">
    <button class="btn ghost sm" data-edit="${kind}" data-id="${esc(id)}">Modifica</button>
    <button class="btn danger sm" data-del="${kind}" data-id="${esc(id)}">✕</button>
  </div>`;
}

function paneNazioni() {
  const gruppi = [
    ...ZONE.map(z => ({ titolo: z.emoji + ' ' + z.l, list: nazioniSorted().filter(n => n.zona === z.v) })),
    { titolo: '❔ Zona da assegnare', list: nazioniSorted().filter(n => !ZONE.some(z => z.v === n.zona)) },
  ].filter(g => g.list.length);

  return `
  <div class="btn-row" style="margin-bottom:.8rem">
    <button class="btn" data-new="nazione">+ Nuova nazione</button>
  </div>
  ${gruppi.length ? gruppi.map(g => `
    <div class="section-head" style="margin-top:.8rem"><h3 style="margin:0">${esc(g.titolo)}</h3>
      <span class="small muted">${g.list.length}</span></div>
    <div class="list">${g.list.map(n => `
      <div class="row-item">
        <span style="font-size:1.5rem">${esc(n.emoji || '🚩')}</span>
        <span class="grow"><b>${esc(n.nome)}</b>
          <span class="small muted">${esc(n.citta || '—')} · ${atletiDiNazione(n.id).length} atleti</span></span>
        ${actions('nazione', n.id)}
      </div>`).join('')}</div>`).join('')
    : '<div class="empty">Nessuna nazione. Inizia da qui.</div>'}`;
}

function paneAtleti() {
  const list = atletiSorted();
  return `
  <div class="btn-row" style="margin-bottom:.8rem">
    <button class="btn" data-new="atleta" ${nazioniSorted().length ? '' : 'disabled'}>+ Nuovo atleta</button>
    ${nazioniSorted().length ? '' : '<span class="small muted">Crea prima una nazione</span>'}
  </div>
  ${list.length ? `<div class="list">${list.map(a => `
    <div class="row-item">${avatar(a)}
      <span class="grow"><b>${esc(a.nome)}</b>
        <span class="small muted">${esc(nazione(a.nazioneId)?.nome || 'Senza nazione')}${a.ruolo ? ' · ' + esc(a.ruolo) : ''}</span></span>
      ${actions('atleta', a.id)}
    </div>`).join('')}</div>` : '<div class="empty">Nessun atleta.</div>'}`;
}

function paneSquadre() {
  const list = squadreSorted();
  return `
  <div class="alert info">Le squadre sono <b>miste</b>: pesca i componenti da nazioni e zone diverse.
  I loro punti finiscono nella classifica squadre e in quella individuale, non nel medagliere delle nazioni.</div>
  <div class="btn-row" style="margin-bottom:.8rem">
    <button class="btn" data-new="squadra" ${atletiSorted().length ? '' : 'disabled'}>+ Nuova squadra</button>
    ${atletiSorted().length ? '' : '<span class="small muted">Crea prima gli atleti</span>'}
  </div>
  ${list.length ? `<div class="list">${list.map(s => {
    const rosa = atletiDiSquadra(s.id);
    return `<div class="row-item">
      <span style="font-size:1.5rem">${esc(s.emoji || '🛡️')}</span>
      <span class="grow"><b>${esc(s.nome)}</b>
        <span class="small muted">${rosa.length} component${rosa.length === 1 ? 'e' : 'i'}: ${esc(rosa.map(a => a.nome).join(', ') || 'nessuno')}</span></span>
      ${actions('squadra', s.id)}
    </div>`;
  }).join('')}</div>` : '<div class="empty">Nessuna squadra.</div>'}`;
}

function paneSport() {
  const list = sportSorted();
  return `
  <div class="btn-row" style="margin-bottom:.8rem">
    <button class="btn" data-new="sport">+ Nuova disciplina</button>
  </div>
  ${list.length ? `<div class="list">${list.map(s => `
    <div class="row-item">
      <span style="font-size:1.5rem">${esc(s.icona || '🏅')}</span>
      <span class="grow"><b>${esc(s.nome)}</b>
        <span class="small muted">${statoPill(s.stato)} ${esc(formatoLabel(s.formato))} · ${incontriDiSport(s.id).length} incontri · ${risultatiDiSport(s.id).length} risultati</span></span>
      ${actions('sport', s.id)}
    </div>`).join('')}</div>` : '<div class="empty">Nessuna disciplina.</div>'}`;
}

/* ---------- calendario per disciplina ---------- */

function paneCalendario() {
  const sports = sportSorted();
  if (!sports.length) return '<div class="empty">Crea prima una disciplina.</div>';
  if (!calSportId || !getSport(calSportId)) calSportId = sports[0].id;
  const s = getSport(calSportId);
  const inc = incontriDiSport(s.id);

  return `
  <div class="filters">
    <select id="calSport" aria-label="Disciplina del calendario">
      ${sports.map(x => `<option value="${esc(x.id)}" ${String(x.id) === String(calSportId) ? 'selected' : ''}>
        ${esc((x.icona || '') + ' ' + x.nome)}</option>`).join('')}
    </select>
    <button class="btn" data-new="incontro">+ Nuovo incontro</button>
  </div>
  <div class="alert info"><b>${esc(formatoLabel(s.formato))}.</b>
    ${esc(FORMATI.find(f => f.v === (s.formato || 'open'))?.desc || '')}
    Cambi il formato dalla scheda Sport.</div>
  ${inc.length ? `<div class="list">${inc.map(i => {
    const a = refEntity(i.latoA), b = refEntity(i.latoB);
    const testa = a || b
      ? `${a ? esc(a.emoji + ' ' + a.nome) : 'da definire'} <span class="vs">vs</span> ${b ? esc(b.emoji + ' ' + b.nome) : 'da definire'}`
      : '<i class="muted">turno senza avversari definiti</i>';
    const score = (i.punteggioA || i.punteggioB) ? ` · ${esc(i.punteggioA || '—')}-${esc(i.punteggioB || '—')}` : '';
    return `<div class="row-item">
      <span class="grow"><b>${testa}</b>
        <span class="small muted">${esc(i.fase || 'Fase da definire')}${i.round ? ' · turno ' + esc(i.round) : ''}${i.data ? ' · ' + esc(fmtDate(i.data)) : ''}${i.luogo ? ' · 📍 ' + esc(i.luogo) : ''}${score}</span></span>
      ${statoPill(i.stato)}
      ${actions('incontro', i.id)}
    </div>`;
  }).join('')}</div>` : '<div class="empty">Nessun incontro per questa disciplina.</div>'}`;
}

function paneRisultati() {
  const sports = sportSorted();
  const pronti = sports.length && (nazioniSorted().length || squadreSorted().length);
  return `
  <div class="btn-row" style="margin-bottom:.8rem">
    <button class="btn gold" data-new="risultato" ${pronti ? '' : 'disabled'}>+ Nuovo risultato</button>
    ${pronti ? '' : '<span class="small muted">Servono una disciplina e almeno una nazione o squadra</span>'}
  </div>
  ${sports.map(s => {
    const ris = risultatiDiSport(s.id);
    if (!ris.length) return '';
    return `<div class="card" style="margin-bottom:.7rem">
      <h3>${esc(s.icona || '🏅')} ${esc(s.nome)}</h3>
      <div class="list">${ris.map(r => `
        <div class="row-item">
          <span style="font-size:1.2rem">${MEDAL[Number(r.posizione)] || ordinal(r.posizione)}</span>
          <span class="grow"><b>${esc(nomiRisultato(r))}</b>
            <span class="small muted">${esc(r.squadraId ? (squadra(r.squadraId)?.nome || '—') + ' (squadra)' : nazione(r.nazioneId)?.nome || '—')}${r.punteggio ? ' · ' + esc(r.punteggio) : ''}</span></span>
          ${actions('risultato', r.id)}
        </div>`).join('')}</div>
    </div>`;
  }).join('') || '<div class="empty">Nessun risultato registrato.</div>'}`;
}

function paneConfig() {
  const c = store.data.config || {};
  return `
  <form class="card" id="cfgForm">
    ${renderFields([
      { k: 'nome', label: 'Nome evento', def: CONFIG.EVENT_NAME },
      { k: 'edizione', label: 'Edizione', def: CONFIG.EDITION },
      { k: 'descrizione', label: 'Descrizione in homepage', type: 'textarea', rows: 3 },
      { k: 'punti', label: 'Punti per posizione', hint: 'Separati da virgola: 1°,2°,3°… Attuale: ' + puntiSchema(null).join(' / '), def: CONFIG.POINTS.join(',') },
      { k: 'puntiVittoria', label: 'Punti per vittoria (gironi)', type: 'number', def: '3' },
      { k: 'puntiPareggio', label: 'Punti per pareggio (gironi)', type: 'number', def: '1' },
    ], c)}
    <button class="btn block" type="submit">Salva impostazioni</button>
  </form>
  <div class="card" style="margin-top:.8rem">
    <h3>Collegamento dati</h3>
    <p class="small muted" style="word-break:break-all">${esc(CONFIG.apiUrl || 'non configurato')}</p>
    <div id="diagOut"></div>
    <div class="btn-row">
      <button class="btn ghost sm" id="testConn">Testa connessione</button>
      <button class="btn ghost sm" id="changeUrl">Cambia URL API</button>
      <button class="btn ghost sm" id="exportJson">Esporta JSON</button>
    </div>
  </div>`;
}

function bindPane() {
  const pane = document.getElementById('adminPane');
  if (!pane) return;

  document.getElementById('calSport')?.addEventListener('change', e => {
    calSportId = e.target.value;
    pane.innerHTML = paneCalendario();
    bindPane();
  });

  pane.querySelectorAll('[data-new]').forEach(b => b.addEventListener('click', () => {
    switch (b.dataset.new) {
      case 'nazione': return editRow('nazione', nazioneFields(), 'upsertNazione', {}, 'Nuova nazione');
      case 'atleta': return editRow('atleta', atletaFields(), 'upsertAtleta', {}, 'Nuovo atleta');
      case 'squadra': return editRow('squadra', squadraFields(), 'upsertSquadra', {}, 'Nuova squadra mista');
      case 'sport': return editRow('sport', sportFields(), 'upsertSport', {}, 'Nuova disciplina');
      case 'incontro': return editRow('incontro', incontroFields(calSportId), 'upsertIncontro', {}, 'Nuovo incontro');
      case 'risultato': return editRow('risultato', risultatoFields(), 'upsertRisultato', {}, 'Nuovo risultato');
    }
  }));

  pane.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const { edit, id } = b.dataset;
    switch (edit) {
      case 'nazione': return editRow('nazione', nazioneFields(), 'upsertNazione', nazione(id), 'Modifica nazione');
      case 'atleta': return editRow('atleta', atletaFields(), 'upsertAtleta', atleta(id), 'Modifica atleta');
      case 'squadra': return editRow('squadra', squadraFields(), 'upsertSquadra', squadra(id), 'Modifica squadra');
      case 'sport': return editRow('sport', sportFields(), 'upsertSport', getSport(id), 'Modifica disciplina');
      case 'incontro': {
        const i = incontro(id);
        return editRow('incontro', incontroFields(i?.sportId), 'upsertIncontro', i, 'Modifica incontro');
      }
      case 'risultato': {
        const r = store.data.risultati.find(x => String(x.id) === String(id));
        return editRow('risultato', risultatoFields(r?.sportId), 'upsertRisultato', r, 'Modifica risultato');
      }
    }
  }));

  pane.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    const { del: kind, id } = b.dataset;
    switch (kind) {
      case 'nazione': return del('deleteNazione', id, nazione(id)?.nome || 'Nazione');
      case 'atleta': return del('deleteAtleta', id, atleta(id)?.nome || 'Atleta');
      case 'squadra': return del('deleteSquadra', id, squadra(id)?.nome || 'Squadra');
      case 'sport': return del('deleteSport', id, getSport(id)?.nome || 'Sport');
      case 'incontro': return del('deleteIncontro', id, 'Questo incontro');
      case 'risultato': return del('deleteRisultato', id, 'Questo risultato');
    }
  }));

  const cfg = document.getElementById('cfgForm');
  cfg?.addEventListener('submit', async e => {
    e.preventDefault();
    await save('setConfig', formValues(cfg), 'Impostazioni salvate');
  });

  bindConnTools();

  document.getElementById('exportJson')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'olimpiadi-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

/** Test connessione e cambio URL: disponibili anche dalla schermata di login. */
function bindConnTools() {
  document.getElementById('testConn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Verifico…';
    showDiag(await diagnose());
    btn.disabled = false; btn.textContent = 'Testa connessione';
  });

  document.getElementById('changeUrl')?.addEventListener('click', () => {
    openModal({
      title: 'URL API',
      body: renderFields([{
        k: 'url', label: 'URL Web App', required: true,
        hint: 'Deve finire con /exec. Verifico il collegamento prima di salvare.',
      }], { url: CONFIG.apiUrl }) + '<div id="diagModal"></div>',
      okText: 'Verifica e salva',
      onOk: async form => {
        const url = normalizeApiUrl(formValues(form).url);
        const res = await diagnose(url);
        showDiag(res, 'diagModal');
        if (!res.ok) return false;
        CONFIG.apiUrl = url;
        await store.refresh();
        toast('URL aggiornato', 'ok');
        rerender();
      },
    });
  });
}
