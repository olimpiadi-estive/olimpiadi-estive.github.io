import { CONFIG, normalizeApiUrl } from '../config.js';
import { auth, mutate, checkPin, diagnose } from '../api.js';
import {
  store, nazioniSorted, atletiSorted, squadreSorted, sportSorted,
  atletiDiNazione, atletiDiSquadra, risultatiDiSport, incontriDiSport,
  iscrittiDiSport, isIscritto, squadreDiSport, partecipantiDiSport,
  risultatiDiIncontro, partecipantiIncontro, isGaraMultipla,
  nazione, atleta, squadra, sport as getSport, incontro,
  puntiSchema, puntiAttivi, refOptions, refOptionsSport, refEntity, idList,
  ZONE, FORMATI, STATI_SPORT, STATI_INCONTRO,
  formatoDi, formatoLabel, formatoMeta, zonaLabel, isAnnullato,
} from '../store.js';
import { esc, toast, fmtDate, ordinal, MEDAL, slug } from '../utils.js';
import { openModal, confirmModal, renderFields, formValues } from '../ui.js';
import { avatar, statoPill, nomiRisultato } from './public.js';

let tab = 'sport';
let calSportId = '';   // disciplina selezionata in Calendario
let iscSportId = '';   // disciplina selezionata in Iscritti
let sqdSportId = '';   // disciplina selezionata in Squadre

/* ---------- descrittori campi ---------- */

const nazioneFields = () => [
  { k: 'nome', label: 'Nome nazione', required: true, hint: 'Es. Repubblica di Bologna' },
  { k: 'citta', label: 'Città di residenza' },
  {
    k: 'zona', label: 'Zona', type: 'select', required: true,
    options: [{ v: '', l: '— seleziona —' }, ...ZONE.map(z => ({ v: z.v, l: z.emoji + ' ' + z.l }))],
    hint: 'Sottocategoria delle nazioni. Le squadre non la seguono.',
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
  { k: 'ruolo', label: 'Ruolo / soprannome' },
  { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
];

const squadraFields = (sportId) => [
  {
    k: 'sportId', label: 'Disciplina', type: 'select', required: true, def: sportId || '',
    options: [{ v: '', l: '— seleziona —' }, ...sportSorted().map(s => ({
      v: s.id, l: (s.icona || '') + ' ' + s.nome,
    }))],
    hint: 'Le squadre valgono per una sola disciplina.',
  },
  { k: 'nome', label: 'Nome squadra', required: true },
  { k: 'emoji', label: 'Emoji', def: '🛡️' },
  { k: 'colore', label: 'Colore', type: 'color', def: '#1657c8' },
  {
    k: 'atletaIds', label: 'Componenti', type: 'select',
    attrs: 'multiple size="9"',
    options: (sportId && iscrittiDiSport(sportId).length ? iscrittiDiSport(sportId) : atletiSorted())
      .map(a => ({
        v: a.id,
        l: a.nome + ' — ' + (nazione(a.nazioneId)?.nome || 'senza nazione'),
        group: sportId && isIscritto(sportId, a.id) ? 'Iscritti alla disciplina' : 'Altri atleti',
      })),
    hint: 'Selezione multipla. Compaiono prima gli iscritti alla disciplina.',
  },
  { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
];

const sportFields = () => [
  { k: 'nome', label: 'Nome disciplina', required: true },
  { k: 'icona', label: 'Emoji disciplina', def: '🏅' },
  { k: 'categoria', label: 'Categoria', hint: 'Es. Acqua, Tavolo, Campo' },
  {
    k: 'tipo', label: 'Chi gareggia', type: 'select', def: 'individuale',
    options: [
      { v: 'individuale', l: 'Atleti singoli' },
      { v: 'coppia', l: 'Coppie (squadre da 2)' },
      { v: 'squadra', l: 'Squadre' },
      { v: 'nazione', l: 'Nazioni' },
    ],
    hint: 'Determina da dove pescare i partecipanti quando generi il calendario.',
  },
  {
    k: 'formato', label: 'Formato', type: 'select', def: 'tutti',
    options: FORMATI.map(f => ({ v: f.v, l: f.l })),
    hint: FORMATI.map(f => f.l + ': ' + f.desc).join(' · '),
  },
  {
    k: 'stato', label: 'Stato', type: 'select', def: 'programmato',
    options: STATI_SPORT.map(s => ({ v: s.v, l: s.l })),
    hint: 'Annullato: la disciplina salta, esce dal calendario e non assegna medaglie.',
  },
  { k: 'data', label: 'Data e ora di inizio', type: 'datetime-local' },
  { k: 'luogo', label: 'Luogo' },
  { k: 'descrizione', label: 'Descrizione', type: 'textarea', rows: 4 },
  { k: 'regolamento', label: 'Regolamento', type: 'textarea', rows: 7, hint: 'Una regola per riga: diventa un elenco' },
  { k: 'punti', label: 'Punti personalizzati', hint: 'Solo se attivi i punti per piazzamento. Es. 20,14,10,6' },
  { k: 'ordine', label: 'Ordine di visualizzazione', type: 'number' },
];

const incontroFields = (sportId) => [
  {
    k: 'sportId', label: 'Disciplina', type: 'select', required: true, def: sportId || '',
    options: [{ v: '', l: '— seleziona —' }, ...sportSorted().map(s => ({
      v: s.id, l: (s.icona || '') + ' ' + s.nome + ' · ' + formatoLabel(s),
    }))],
  },
  { k: 'fase', label: 'Fase / turno', hint: 'Es. Playoff, Giornata 1, Quarti, Semifinale, Finale' },
  { k: 'round', label: 'Numero turno', type: 'number' },
  { k: 'ordine', label: 'Ordine nel turno', type: 'number' },
  {
    k: 'prossimo', label: 'Dove va il vincitore',
    hint: 'Formato turno.ordine.lato, es. 2.3.B. Vuoto: va al turno successivo nella posizione corrispondente.',
  },
  { k: 'data', label: 'Data e ora', type: 'datetime-local' },
  { k: 'luogo', label: 'Luogo' },
  {
    k: 'stato', label: 'Stato', type: 'select', def: 'programmato',
    options: STATI_INCONTRO.map(s => ({ v: s.v, l: s.l })),
    hint: 'Appena metti "concluso" il vincitore avanza nel tabellone.',
  },
  {
    k: 'partecipanti', label: 'Concorrenti (gara con più partecipanti)', type: 'select',
    attrs: 'multiple size="8"',
    options: refOptionsSport(sportId, { vuoto: '' }).filter(o => o.v),
    hint: 'Per le gare uniche: seleziona tutti i concorrenti e lascia vuoti i due lati.',
  },
  { k: 'latoA', label: 'Lato A (sfida uno contro uno)', type: 'select', options: refOptionsSport(sportId) },
  { k: 'punteggioA', label: 'Punteggio A' },
  { k: 'latoB', label: 'Lato B', type: 'select', options: refOptionsSport(sportId) },
  { k: 'punteggioB', label: 'Punteggio B' },
  {
    k: 'vincitore', label: 'Vincitore', type: 'select',
    options: refOptionsSport(sportId, { vuoto: '— dedotto dal punteggio —' }),
  },
  { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
];

const risultatoFields = (sportId) => [
  {
    k: 'sportId', label: 'Disciplina', type: 'select', required: true, def: sportId || '',
    options: [{ v: '', l: '— seleziona —' }, ...sportSorted().map(s => ({ v: s.id, l: (s.icona || '') + ' ' + s.nome }))],
  },
  { k: 'posizione', label: 'Posizione in classifica', type: 'number', required: true, attrs: 'min="1" max="99"' },
  {
    k: 'squadraId', label: 'Squadra', type: 'select',
    options: [{ v: '', l: '— nessuna —' }, ...squadreSorted().map(s => ({
      v: s.id, l: (s.emoji || '🛡️') + ' ' + s.nome + (getSport(s.sportId) ? ' · ' + getSport(s.sportId).nome : ''),
    }))],
    hint: 'Se compilata, la medaglia va alla squadra e non alla nazione.',
  },
  {
    k: 'nazioneId', label: 'Nazione', type: 'select',
    options: [{ v: '', l: '— nessuna —' }, ...nazioniSorted().map(n => ({ v: n.id, l: (n.emoji || '🚩') + ' ' + n.nome }))],
  },
  {
    k: 'atletaIds', label: 'Atleti coinvolti', type: 'select',
    attrs: 'multiple size="7"',
    options: atletiSorted().map(a => ({ v: a.id, l: a.nome + ' — ' + (nazione(a.nazioneId)?.nome || '?') })),
  },
  { k: 'punteggio', label: 'Misura / punteggio', hint: 'Es. 12,4s — 3-1 — 45 punti' },
  { k: 'note', label: 'Note', type: 'textarea', rows: 2 },
];

/* ---------- helper salvataggio ---------- */

async function save(action, payload, okMsg) {
  try {
    const out = await mutate(action, payload);
    toast(okMsg || 'Salvato', 'ok');
    await store.refresh({ silent: true });
    return out || true;
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
      if (kind === 'incontro') v.partecipanti = multiValues(form, 'partecipanti');
      if (kind === 'risultato' && !v.squadraId && !v.nazioneId) {
        toast('Indica la squadra oppure la nazione', 'err');
        return false;
      }
      if (kind === 'incontro') {
        if (v.latoA && v.latoA === v.latoB) {
          toast('I due lati devono essere diversi', 'err');
          return false;
        }
        if (!v.latoA && !v.latoB && !v.partecipanti) {
          toast('Indica i due lati oppure l\'elenco dei concorrenti', 'err');
          return false;
        }
      }
      if (values?.id) v.id = values.id;
      return await save(action, v);
    },
  });
  if (kind === 'risultato' || kind === 'squadra') preselect('atletaIds', values?.atletaIds);
  if (kind === 'incontro') preselect('partecipanti', values?.partecipanti);
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
      ['sport', '🥇 Sport'], ['iscritti', '👥 Iscritti'], ['squadre', '🛡️ Squadre'],
      ['calendario', '🗓️ Calendario'], ['classifiche', '🏆 Classifiche'],
      ['nazioni', '🚩 Nazioni'], ['atleti', '🏃 Atleti'], ['config', '⚙️ Impostazioni'],
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
      redrawPane();
    }));

    bindPane();
  },
};

function rerender() {
  window.dispatchEvent(new CustomEvent('oee:rerender'));
}

function redrawPane() {
  const p = document.getElementById('adminPane');
  if (!p) return;
  p.innerHTML = pane();
  bindPane();
}

function setupScreen() {
  return `
  <h1>Configurazione iniziale</h1>
  <div class="alert info">L'app non è collegata al foglio Google. Incolla l'URL del Web App
  di Apps Script (finisce con <code>/exec</code>).</div>
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
  <p class="muted">Inserisci il PIN admin per gestire discipline, iscritti, squadre, calendari e classifiche.</p>
  <form class="card" id="adminLogin">
    ${renderFields([{ k: 'pin', label: 'PIN admin', type: 'password', required: true, attrs: 'autocomplete="current-password"' }])}
    <label class="fld" style="display:flex;gap:.5rem;align-items:center">
      <input type="checkbox" name="remember" style="width:auto" checked>
      <span style="margin:0;text-transform:none;letter-spacing:0;font-weight:400;color:var(--txt)">Ricordami su questo dispositivo</span>
    </label>
    <button class="btn block" type="submit">Entra</button>
  </form>
  <p class="small muted">Il PIN è verificato dal server e non è contenuto nell'app.</p>
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
  switch (tab) {
    case 'sport': return paneSport();
    case 'iscritti': return paneIscritti();
    case 'squadre': return paneSquadre();
    case 'calendario': return paneCalendario();
    case 'classifiche': return paneClassifiche();
    case 'nazioni': return paneNazioni();
    case 'atleti': return paneAtleti();
    default: return paneConfig();
  }
}

function actions(kind, id) {
  return `<div class="btn-row">
    <button class="btn ghost sm" data-edit="${kind}" data-id="${esc(id)}">Modifica</button>
    <button class="btn danger sm" data-del="${kind}" data-id="${esc(id)}">✕</button>
  </div>`;
}

/** Selettore di disciplina condiviso dalle schede che lavorano su un solo sport. */
function sportPicker(id, selected) {
  return `<select id="${id}" aria-label="Disciplina">
    ${sportSorted().map(s => `<option value="${esc(s.id)}" ${String(s.id) === String(selected) ? 'selected' : ''}>
      ${esc((s.icona || '') + ' ' + s.nome)}${isAnnullato(s) ? ' (annullato)' : ''}</option>`).join('')}
  </select>`;
}

function scegliSport(corrente, setter) {
  const list = sportSorted();
  if (!list.length) return null;
  if (!corrente || !getSport(corrente)) setter(list[0].id);
  return getSport(corrente) || list[0];
}

/* ---------- sport ---------- */

function paneSport() {
  const list = sportSorted();
  return `
  <div class="btn-row" style="margin-bottom:.8rem">
    <button class="btn" data-new="sport">+ Nuova disciplina</button>
  </div>
  ${list.length ? `<div class="list">${list.map(s => `
    <div class="row-item ${isAnnullato(s) ? 'annullato' : ''}">
      <span style="font-size:1.5rem">${esc(s.icona || '🏅')}</span>
      <span class="grow"><b>${esc(s.nome)}</b>
        <span class="small muted">${statoPill(s.stato)} ${esc(formatoLabel(s))} ·
        ${iscrittiDiSport(s.id).length} iscritti · ${incontriDiSport(s.id).length} incontri ·
        ${risultatiDiSport(s.id).length} in classifica${s.data ? ' · ' + esc(fmtDate(s.data)) : ''}</span></span>
      ${actions('sport', s.id)}
    </div>`).join('')}</div>` : '<div class="empty">Nessuna disciplina.</div>'}`;
}

/* ---------- iscritti ---------- */

function paneIscritti() {
  const s = scegliSport(iscSportId, v => { iscSportId = v; });
  if (!s) return '<div class="empty">Crea prima una disciplina.</div>';
  const tutti = atletiSorted();
  if (!tutti.length) return '<div class="empty">Crea prima gli atleti.</div>';
  const iscritti = iscrittiDiSport(s.id);

  return `
  <div class="filters">
    ${sportPicker('iscSport', s.id)}
    <input id="qIsc" type="search" placeholder="Cerca atleta…" aria-label="Cerca atleta">
  </div>
  <div class="alert info">Spunta chi partecipa a <b>${esc(s.nome)}</b>.
  Da qui nascono le squadre e i calendari della disciplina.</div>
  <form id="iscForm">
    <div class="btn-row" style="margin-bottom:.7rem">
      <button class="btn" type="submit">Salva iscritti</button>
      <button class="btn ghost sm" type="button" data-sel="tutti">Tutti</button>
      <button class="btn ghost sm" type="button" data-sel="nessuno">Nessuno</button>
      <span class="small muted" id="iscCount">${iscritti.length} selezionati</span>
    </div>
    <div class="checklist" id="iscList">
      ${tutti.map(a => `
        <label class="check" data-nome="${esc(slug(a.nome + ' ' + (nazione(a.nazioneId)?.nome || '')))}">
          <input type="checkbox" name="atleti" value="${esc(a.id)}" ${isIscritto(s.id, a.id) ? 'checked' : ''}>
          <span class="grow"><b>${esc(a.nome)}</b>
            <span class="small muted">${esc(nazione(a.nazioneId)?.nome || 'senza nazione')}</span></span>
        </label>`).join('')}
    </div>
  </form>`;
}

/* ---------- squadre ---------- */

function paneSquadre() {
  const s = scegliSport(sqdSportId, v => { sqdSportId = v; });
  if (!s) return '<div class="empty">Crea prima una disciplina.</div>';
  const iscritti = iscrittiDiSport(s.id);
  const list = squadreDiSport(s.id);
  const orfane = squadreSorted().filter(x => !x.sportId);

  return `
  <div class="filters">
    ${sportPicker('sqdSport', s.id)}
  </div>
  <div class="alert info">Le squadre di <b>${esc(s.nome)}</b> si compongono dai suoi
  ${iscritti.length} iscritti. Restano miste: i componenti possono venire da nazioni e zone diverse.</div>
  <div class="btn-row" style="margin-bottom:.8rem">
    <button class="btn gold" data-gen="squadre" ${iscritti.length >= 2 ? '' : 'disabled'}>⚡ Genera squadre</button>
    <button class="btn" data-new="squadra">+ A mano</button>
    ${iscritti.length >= 2 ? '' : '<span class="small muted">Registra prima gli iscritti</span>'}
  </div>
  ${list.length ? `<div class="list">${list.map(q => {
    const rosa = atletiDiSquadra(q.id);
    return `<div class="row-item">
      <span style="font-size:1.5rem">${esc(q.emoji || '🛡️')}</span>
      <span class="grow"><b>${esc(q.nome)}</b>
        <span class="small muted">${esc(rosa.map(a => a.nome).join(', ') || 'rosa vuota')}</span></span>
      ${actions('squadra', q.id)}
    </div>`;
  }).join('')}</div>` : '<div class="empty">Nessuna squadra per questa disciplina.</div>'}
  ${orfane.length ? `
    <div class="section-head" style="margin-top:1.2rem"><h3 style="margin:0">Senza disciplina</h3></div>
    <div class="list">${orfane.map(q => `
      <div class="row-item">
        <span style="font-size:1.5rem">${esc(q.emoji || '🛡️')}</span>
        <span class="grow"><b>${esc(q.nome)}</b>
          <span class="small muted">assegnale una disciplina</span></span>
        ${actions('squadra', q.id)}
      </div>`).join('')}</div>` : ''}`;
}

/* ---------- calendario ---------- */

function paneCalendario() {
  const s = scegliSport(calSportId, v => { calSportId = v; });
  if (!s) return '<div class="empty">Crea prima una disciplina.</div>';
  const formato = formatoDi(s);
  const meta = formatoMeta(formato);
  const inc = incontriDiSport(s.id);
  const parts = partecipantiDiSport(s.id);

  return `
  <div class="filters">
    ${sportPicker('calSport', s.id)}
  </div>
  <div class="alert info"><b>${esc(meta.l)}.</b> ${esc(meta.desc)}
  Il formato si cambia dalla scheda Sport.</div>
  <div class="alert ${parts.length >= 2 ? 'info' : 'warn'}">
    Partecipanti rilevati: <b>${parts.length}</b>
    (${esc(s.tipo === 'squadra' || s.tipo === 'coppia' ? 'squadre della disciplina'
      : s.tipo === 'nazione' ? 'nazioni' : 'iscritti alla disciplina')}).
    ${parts.length >= 2 ? previsione(formato, parts.length) : 'Servono almeno 2 partecipanti.'}
  </div>
  <div class="btn-row" style="margin-bottom:.8rem">
    <button class="btn gold" data-gen="calendario" ${parts.length >= 2 ? '' : 'disabled'}>⚡ ${formato === 'tutti' ? 'Crea la gara' : 'Genera calendario'}</button>
    <button class="btn" data-new="incontro">+ ${formato === 'tutti' ? 'Gara a mano' : 'Incontro a mano'}</button>
    ${inc.length ? '<button class="btn danger sm" data-gen="svuota">Svuota calendario</button>' : ''}
  </div>
  ${inc.length ? `<div class="list">${inc.map(i => {
    const gara = isGaraMultipla(i);
    const a = refEntity(i.latoA); const b = refEntity(i.latoB);
    const ordine = risultatiDiIncontro(i.id);
    const testa = gara
      ? `${partecipantiIncontro(i).length} concorrenti`
      : ((a || b)
        ? `${a ? esc(a.emoji + ' ' + a.nome) : '<i class="muted">da definire</i>'} <span class="vs">vs</span> ${b ? esc(b.emoji + ' ' + b.nome) : '<i class="muted">da definire</i>'}`
        : '<i class="muted">avversari da definire</i>');
    const score = gara
      ? (ordine.length ? ' · 🥇 ' + esc(nomiRisultato(ordine[0])) : ' · ordine d\'arrivo da registrare')
      : ((i.punteggioA || i.punteggioB) ? ` · ${esc(i.punteggioA || '—')}-${esc(i.punteggioB || '—')}` : '');
    return `<div class="row-item">
      <span class="grow"><b>${testa}</b>
        <span class="small muted">${esc(i.fase || 'Fase da definire')}${i.data ? ' · ' + esc(fmtDate(i.data)) : ''}${i.luogo ? ' · 📍 ' + esc(i.luogo) : ''}${score}</span></span>
      ${gara ? `<button class="btn gold sm" data-cls="${esc(s.id)}" data-inc="${esc(i.id)}">Arrivi</button>` : statoPill(i.stato)}
      ${actions('incontro', i.id)}
    </div>`;
  }).join('')}</div>` : `<div class="empty">${meta.genera
    ? 'Nessun incontro: genera il calendario o aggiungine uno a mano.'
    : 'Gara unica: non serve un calendario di incontri.'}</div>`}`;
}

function previsione(formato, n, batterie = 1) {
  if (formato === 'tutti') {
    const b = Math.max(1, Number(batterie) || 1);
    return b > 1
      ? `${b} batterie da circa ${Math.ceil(n / b)} concorrenti, con l'ordine d'arrivo di ognuna.`
      : `Una gara unica con tutti i ${n} concorrenti e il suo ordine d'arrivo.`;
  }
  if (formato === 'scontro') {
    return `Ogni partecipante affronta gli altri una volta: ${n * (n - 1) / 2} partite, ` +
      `${n % 2 ? n : n - 1} giornate, ${n - 1} incontri a testa. Nessun ritorno.`;
  }
  if (formato === 'tabellone') {
    let posti = 1; while (posti * 2 <= n) posti *= 2;
    const playoff = n - posti;
    const turni = Math.round(Math.log2(posti)) + (playoff ? 1 : 0);
    if (!playoff) {
      return `Tabellone perfetto da ${n}: ${turni} turni, ${n - 1} partite, nessun playoff.`;
    }
    return `${n} non è una potenza di due: ${playoff} partit${playoff === 1 ? 'a' : 'e'} di playoff ` +
      `fra ${playoff * 2} sorteggiati, poi tabellone da ${posti} posti. ` +
      `In totale ${turni} turni e ${n - 1} partite. ` +
      `I ${n - playoff * 2} non sorteggiati entrano direttamente nel tabellone.`;
  }
  return 'Gara unica: si gareggia tutti insieme, non servono incontri. Compila la classifica.';
}

/* ---------- classifiche per disciplina ---------- */

function paneClassifiche() {
  const list = sportSorted();
  if (!list.length) return '<div class="empty">Crea prima una disciplina.</div>';
  return `
  <div class="alert info">Per ogni disciplina si compila la <b>classifica completa</b>:
  le medaglie vanno automaticamente ai primi tre.
  ${puntiAttivi() ? 'I punti per piazzamento sono attivi.' : 'I punti per piazzamento sono disattivati.'}</div>
  <div class="list">${list.map(s => {
    const ris = risultatiDiSport(s.id);
    const arrivi = gareConArrivi(s.id);
    return `<div class="row-item ${isAnnullato(s) ? 'annullato' : ''}">
      <span style="font-size:1.4rem">${esc(s.icona || '🏅')}</span>
      <span class="grow"><b>${esc(s.nome)}</b>
        <span class="small muted">${ris.length ? ris.length + ' posizioni · 🥇 ' + esc(nomiRisultato(ris[0])) : 'classifica vuota'}${arrivi.length ? ' · ' + arrivi.length + ' gare con arrivi' : ''}</span></span>
      ${arrivi.length ? `<button class="btn gold sm" data-comp="${esc(s.id)}" title="Ricava la classifica finale dagli arrivi">⚡ Dagli arrivi</button>` : ''}
      <button class="btn sm" data-cls="${esc(s.id)}">${ris.length ? 'Modifica' : 'Compila'}</button>
    </div>`;
  }).join('')}</div>
  <div class="section-head" style="margin-top:1.2rem"><h3 style="margin:0">Risultati singoli</h3>
    <button class="btn ghost sm" data-new="risultato">+ Aggiungi</button></div>
  ${list.map(s => {
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
  }).join('')}`;
}

const refDiRisultato = r => r.squadraId ? 'sqd:' + r.squadraId
  : (idList(r.atletaIds)[0] ? 'atl:' + idList(r.atletaIds)[0] : 'naz:' + r.nazioneId);

/** Gare a più concorrenti di una disciplina (gara unica o batterie). */
const gareDiSport = sportId => incontriDiSport(sportId).filter(isGaraMultipla);

/** Gare che hanno già un ordine d'arrivo registrato. */
const gareConArrivi = sportId => gareDiSport(sportId).filter(i => risultatiDiIncontro(i.id).length);

/**
 * Editor di una classifica ordinata.
 * Senza incontroId è la classifica finale della disciplina e assegna le medaglie;
 * con incontroId è l'ordine d'arrivo di quella gara o batteria.
 */
function apriClassifica(sportId, incontroId) {
  const s = getSport(sportId);
  if (!s) return;
  const inc = incontroId ? incontro(incontroId) : null;
  const ris = inc ? risultatiDiIncontro(inc.id) : risultatiDiSport(sportId);
  const attuali = ris.map(refDiRisultato);
  const candidati = inc ? partecipantiIncontro(inc) : partecipantiDiSport(sportId);
  const ordine = [...attuali, ...candidati.filter(c => !attuali.includes(c))]
    .filter(ref => refEntity(ref));

  if (!ordine.length) {
    toast(inc ? 'Questa gara non ha concorrenti: modificala e aggiungili'
      : 'Nessun partecipante: registra gli iscritti o crea le squadre', 'err');
    return;
  }

  openModal({
    title: inc ? 'Arrivi · ' + (inc.fase || s.nome) : 'Classifica finale · ' + s.nome,
    okText: 'Salva',
    body: `
      <p class="small muted">Usa le frecce per ordinare dal primo all'ultimo, ✕ per togliere
      chi non ha gareggiato. ${inc
        ? 'Questo è l\'ordine d\'arrivo della gara: non assegna medaglie.'
        : 'Il primo prende l\'oro, il secondo l\'argento, il terzo il bronzo.'}</p>
      <ol class="rank" id="rankList">
        ${ordine.map(ref => {
          const e = refEntity(ref);
          return `<li data-ref="${esc(ref)}">
            <span class="grow">${esc(e.emoji + ' ' + e.nome)}</span>
            <button type="button" class="icon-btn sm" data-up title="Su">▲</button>
            <button type="button" class="icon-btn sm" data-down title="Giù">▼</button>
            <button type="button" class="icon-btn sm" data-out title="Togli">✕</button>
          </li>`;
        }).join('')}
      </ol>
      ${inc ? `<label class="fld" style="display:flex;gap:.5rem;align-items:flex-start;margin-top:.4rem">
        <input type="checkbox" name="finale" style="width:auto;margin-top:.2rem" ${gareDiSport(sportId).length <= 1 ? 'checked' : ''}>
        <span style="margin:0;text-transform:none;letter-spacing:0;font-weight:400;color:var(--txt)">
          Aggiorna anche la <b>classifica finale</b> della disciplina (assegna le medaglie).
          ${gareDiSport(sportId).length > 1
            ? 'Con ' + gareDiSport(sportId).length + ' batterie la finale viene ricomposta intrecciando gli arrivi di tutte.'
            : ''}
        </span>
      </label>` : ''}`,
    onOk: async (form) => {
      const refs = [...document.querySelectorAll('#rankList li')].map(li => li.dataset.ref);
      const finale = form.querySelector('[name="finale"]')?.checked ? 'true' : 'false';
      const out = await save('setClassificaSport',
        { sportId, incontroId: incontroId || '', ordine: refs.join(','), finale }, 'Ordine salvato');
      if (out?.finale) toast('Classifica finale aggiornata: ' + out.finale.posizioni + ' posizioni', 'ok');
      if (out) redrawPane();
      return out !== false;
    },
  });

  const list = document.getElementById('rankList');
  list?.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const li = btn.closest('li');
    if (btn.hasAttribute('data-up') && li.previousElementSibling) {
      li.parentNode.insertBefore(li, li.previousElementSibling);
    } else if (btn.hasAttribute('data-down') && li.nextElementSibling) {
      li.parentNode.insertBefore(li.nextElementSibling, li);
    } else if (btn.hasAttribute('data-out')) {
      li.remove();
    }
  });
}

/* ---------- nazioni e atleti ---------- */

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
    : '<div class="empty">Nessuna nazione.</div>'}`;
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

function paneConfig() {
  const c = store.data.config || {};
  return `
  <form class="card" id="cfgForm">
    ${renderFields([
      { k: 'nome', label: 'Nome evento', def: CONFIG.EVENT_NAME },
      { k: 'edizione', label: 'Edizione', def: CONFIG.EDITION },
      { k: 'descrizione', label: 'Descrizione in homepage', type: 'textarea', rows: 3 },
      {
        k: 'puntiAttivi', label: 'Punti per piazzamento', type: 'select', def: 'no',
        options: [{ v: 'no', l: 'No: solo medaglie ai primi tre' }, { v: 'si', l: 'Sì: assegna punti per posizione' }],
        hint: 'Con "no" le classifiche si ordinano a medaglie, come il medagliere olimpico.',
      },
      { k: 'punti', label: 'Punti per posizione', hint: 'Usati solo se attivi i punti. Attuale: ' + puntiSchema(null).join(' / '), def: CONFIG.POINTS.join(',') },
      { k: 'puntiVittoria', label: 'Punti per vittoria (gruppi)', type: 'number', def: '3' },
      { k: 'puntiPareggio', label: 'Punti per pareggio (gruppi)', type: 'number', def: '1' },
    ], c)}
    <button class="btn block" type="submit">Salva impostazioni</button>
  </form>
  <div class="card" style="margin-top:.8rem">
    <h3>Collegamento dati</h3>
    <p class="small muted" style="word-break:break-all">${esc(CONFIG.apiUrl || 'non configurato')}</p>
    <p class="small muted">${CONFIG.apiUrlSource === 'locale'
      ? '⚠️ URL sovrascritto solo in questo browser: gli altri usano quello predefinito nel codice.'
      : 'URL predefinito dal codice: valido per tutti i visitatori.'}</p>
    <div id="diagOut"></div>
    <div class="btn-row">
      <button class="btn ghost sm" id="testConn">Testa connessione</button>
      <a class="btn ghost sm" href="#/debug">Diagnostica sync</a>
      <button class="btn ghost sm" id="changeUrl">Cambia URL API</button>
      ${CONFIG.apiUrlSource === 'locale' ? '<button class="btn ghost sm" id="resetUrl">Usa il predefinito</button>' : ''}
      <button class="btn ghost sm" id="exportJson">Esporta JSON</button>
    </div>
  </div>`;
}

/* ---------- generatori ---------- */

function apriGeneraSquadre(sportId) {
  const s = getSport(sportId);
  const n = iscrittiDiSport(sportId).length;
  openModal({
    title: 'Genera squadre · ' + s.nome,
    okText: 'Genera',
    body: `<div class="alert warn">Le squadre esistenti di questa disciplina, e i loro risultati,
      verranno sostituite.</div>` +
      renderFields([
        { k: 'dimensione', label: 'Componenti per squadra', type: 'number', def: s.tipo === 'coppia' ? '2' : '3', attrs: 'min="2" max="12"', hint: n + ' iscritti disponibili' },
        { k: 'prefisso', label: 'Nome base', def: s.tipo === 'coppia' ? 'Coppia' : 'Squadra' },
        {
          k: 'mescola', label: 'Composizione', type: 'select', def: 'true',
          options: [{ v: 'true', l: 'Sorteggio casuale' }, { v: 'false', l: 'Ordine di iscrizione' }],
        },
      ]),
    onOk: async form => {
      const v = formValues(form);
      const out = await save('generaSquadre', { sportId, ...v }, 'Squadre create');
      if (out && out.nota) toast(out.nota, 'ok');
      if (out) redrawPane();
      return out !== false;
    },
  });
}

function apriGeneraCalendario(sportId) {
  const s = getSport(sportId);
  const formato = formatoDi(s);
  const parts = partecipantiDiSport(sportId);
  openModal({
    title: (formato === 'tutti' ? 'Crea la gara · ' : 'Genera calendario · ') + s.nome,
    okText: formato === 'tutti' ? 'Crea' : 'Genera',
    body: `<div class="alert warn">Gli eventi già presenti in questa disciplina, e i loro arrivi,
      verranno sostituiti.</div>
      <p class="small muted" id="prevGen">${esc(previsione(formato, parts.length))}</p>` +
      renderFields([
        ...(formato === 'tutti' ? [{
          k: 'batterie', label: 'Quante gare o batterie', type: 'number', def: '1',
          attrs: 'min="1" max="' + Math.max(1, Math.floor(parts.length / 2)) + '"',
          hint: 'Una sola gara con tutti, oppure più batterie con i concorrenti distribuiti a serpentina.',
        }] : []),
        {
          k: 'fonte', label: 'Partecipanti', type: 'select',
          def: s.tipo === 'squadra' || s.tipo === 'coppia' ? 'squadre' : (s.tipo === 'nazione' ? 'nazioni' : 'iscritti'),
          options: [
            { v: 'iscritti', l: 'Iscritti alla disciplina (' + iscrittiDiSport(sportId).length + ')' },
            { v: 'squadre', l: 'Squadre della disciplina (' + squadreDiSport(sportId).length + ')' },
            { v: 'nazioni', l: 'Tutte le nazioni (' + nazioniSorted().length + ')' },
          ],
        },
        {
          k: 'mescola', label: 'Ordine', type: 'select', def: 'true',
          options: [{ v: 'true', l: 'Sorteggio casuale' }, { v: 'false', l: 'Ordine di iscrizione (testa di serie)' }],
        },
        { k: 'dataInizio', label: 'Prima partita', type: 'datetime-local', def: s.data || '' },
        { k: 'intervallo', label: 'Minuti tra una partita e l\'altra', type: 'number', def: '20', attrs: 'min="0" max="600"', hint: '0 per non assegnare orari' },
        { k: 'luogo', label: 'Luogo', def: s.luogo || '' },
      ]),
    onOk: async form => {
      const out = await save('generaCalendario', { sportId, ...formValues(form) },
        formato === 'tutti' ? 'Gara creata' : 'Calendario generato');
      if (out && out.nota) toast(out.nota, 'ok');
      else if (out && out.partite) toast(out.partite + (formato === 'tutti' ? ' gare create' : ' partite create'), 'ok');
      if (out) redrawPane();
      return out !== false;
    },
  });

  // la previsione si aggiorna se cambi il numero di batterie
  document.querySelector('[name="batterie"]')?.addEventListener('input', e => {
    const el = document.getElementById('prevGen');
    if (el) el.textContent = previsione(formato, parts.length, e.target.value);
  });
}

/* ---------- binding ---------- */

function bindPane() {
  const pane = document.getElementById('adminPane');
  if (!pane) return;

  // selettori di disciplina
  const picker = (id, setter) => document.getElementById(id)?.addEventListener('change', e => {
    setter(e.target.value);
    redrawPane();
  });
  picker('calSport', v => { calSportId = v; });
  picker('iscSport', v => { iscSportId = v; });
  picker('sqdSport', v => { sqdSportId = v; });

  // iscrizioni
  const iscForm = document.getElementById('iscForm');
  if (iscForm) {
    const boxes = () => [...iscForm.querySelectorAll('input[name="atleti"]')];
    const conta = () => {
      const el = document.getElementById('iscCount');
      if (el) el.textContent = boxes().filter(b => b.checked).length + ' selezionati';
    };
    iscForm.addEventListener('change', conta);
    iscForm.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => {
      const on = b.dataset.sel === 'tutti';
      boxes().forEach(x => { if (!x.closest('.check').classList.contains('hide')) x.checked = on; });
      conta();
    }));
    document.getElementById('qIsc')?.addEventListener('input', e => {
      const term = slug(e.target.value);
      iscForm.querySelectorAll('.check').forEach(l =>
        l.classList.toggle('hide', !!term && !l.dataset.nome.includes(term)));
    });
    iscForm.addEventListener('submit', async e => {
      e.preventDefault();
      const ids = boxes().filter(b => b.checked).map(b => b.value);
      const out = await save('setIscrizioni', { sportId: iscSportId, atletaIds: ids.join(',') },
        ids.length + ' iscritti salvati');
      if (out) redrawPane();
    });
  }

  // generatori
  pane.querySelectorAll('[data-gen]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.gen === 'squadre') return apriGeneraSquadre(sqdSportId);
    if (b.dataset.gen === 'calendario') return apriGeneraCalendario(calSportId);
    if (b.dataset.gen === 'svuota') {
      return confirmModal('Svuotare il calendario?',
        'Tutti gli incontri di questa disciplina verranno eliminati.', async () => {
          const out = await save('svuotaCalendario', { sportId: calSportId }, 'Calendario svuotato');
          if (out) redrawPane();
        }, 'Svuota');
    }
  }));

  // classifica per disciplina
  pane.querySelectorAll('[data-cls]').forEach(b =>
    b.addEventListener('click', () => apriClassifica(b.dataset.cls, b.dataset.inc || '')));

  // classifica finale ricavata dagli arrivi delle gare
  pane.querySelectorAll('[data-comp]').forEach(b => b.addEventListener('click', () => {
    const sportId = b.dataset.comp;
    const gare = gareConArrivi(sportId);
    confirmModal('Comporre la classifica finale?',
      `La classifica finale di ${getSport(sportId)?.nome} verrà ricostruita dagli arrivi di ` +
      `${gare.length} gar${gare.length === 1 ? 'a' : 'e'}` +
      (gare.length > 1 ? ', intrecciando le posizioni (tutti i primi, poi tutti i secondi).' : '.') +
      ' Quella attuale verrà sostituita.',
      async () => {
        const out = await save('componiFinale', { sportId }, 'Classifica finale composta');
        if (out) { toast(out.posizioni + ' posizioni', 'ok'); redrawPane(); }
      }, 'Componi');
  }));

  pane.querySelectorAll('[data-new]').forEach(b => b.addEventListener('click', () => {
    switch (b.dataset.new) {
      case 'nazione': return editRow('nazione', nazioneFields(), 'upsertNazione', {}, 'Nuova nazione');
      case 'atleta': return editRow('atleta', atletaFields(), 'upsertAtleta', {}, 'Nuovo atleta');
      case 'squadra': return editRow('squadra', squadraFields(sqdSportId), 'upsertSquadra',
        { sportId: sqdSportId }, 'Nuova squadra');
      case 'sport': return editRow('sport', sportFields(), 'upsertSport', {}, 'Nuova disciplina');
      case 'incontro': return editRow('incontro', incontroFields(calSportId), 'upsertIncontro',
        { sportId: calSportId }, 'Nuovo incontro');
      case 'risultato': return editRow('risultato', risultatoFields(), 'upsertRisultato', {}, 'Nuovo risultato');
    }
  }));

  pane.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const { edit, id } = b.dataset;
    switch (edit) {
      case 'nazione': return editRow('nazione', nazioneFields(), 'upsertNazione', nazione(id), 'Modifica nazione');
      case 'atleta': return editRow('atleta', atletaFields(), 'upsertAtleta', atleta(id), 'Modifica atleta');
      case 'squadra': {
        const q = squadra(id);
        return editRow('squadra', squadraFields(q?.sportId || sqdSportId), 'upsertSquadra', q, 'Modifica squadra');
      }
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

  document.getElementById('resetUrl')?.addEventListener('click', async () => {
    CONFIG.resetApiUrl();
    await store.refresh();
    toast('Ripristinato l\'URL predefinito', 'ok');
    rerender();
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
