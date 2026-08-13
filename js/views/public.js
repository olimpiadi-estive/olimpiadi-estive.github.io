import { CONFIG } from '../config.js';
import {
  store, classifica, classificaZone, classificaSquadre, classificaAtleti,
  statsGlobali, ultimiRisultati, prossimiImpegni,
  sportSorted, nazioniSorted, atletiSorted, squadreSorted,
  atletiDiNazione, atletiDiSquadra, nazioniDiSquadra, squadreDiAtleta,
  risultatiDiSport, atletiDiRisultato, incontriDiSport, fasiDiSport,
  gironeStandings, esitoIncontro, isConcluso, puntiIncontro,
  nazione, atleta, squadra, sport as getSport,
  puntiPerPosizione, puntiSchema, puntiAttivi, refEntity, ZONE, zonaLabel,
  FORMATI, formatoLabel, formatoDi, formatoMeta, isAnnullato,
  iscrittiDiSport, squadreDiSport, giorniCalendario,
} from '../store.js';
import { esc, richText, fmtDate, fmtOra, fmtGiorno, MEDAL, ordinal, textOn, slug } from '../utils.js';

/* ---------- frammenti riusabili ---------- */

const STATI = {
  'programmato': 'programmato', 'in corso': 'incorso', 'completato': 'completato',
  'concluso': 'completato', 'annullato': 'annullato',
};

export function statoPill(stato) {
  const s = (stato || 'programmato').toLowerCase();
  return `<span class="pill ${STATI[s] || 'programmato'}">${esc(s)}</span>`;
}

function chipLink(href, emoji, nome, colore, small) {
  const bg = colore || '#0b3d91';
  return `<a class="chip flag" href="${esc(href)}"
    style="background:${esc(bg)};color:${textOn(bg)}${small ? ';font-size:.7rem' : ''}">
    ${esc(emoji)} ${esc(nome)}</a>`;
}

export function flagChip(naz, small) {
  if (!naz) return '<span class="chip">—</span>';
  return chipLink('#/nazioni/' + naz.id, naz.emoji || '🚩', naz.nome, naz.colore, small);
}

export function squadraChip(sq, small) {
  if (!sq) return '<span class="chip">—</span>';
  return chipLink('#/squadre/' + sq.id, sq.emoji || '🛡️', sq.nome, sq.colore || '#1657c8', small);
}

export function zonaChip(z) {
  const zz = ZONE.find(x => x.v === z);
  return zz ? `<span class="chip">${zz.emoji} ${esc(zz.l)}</span>` : '<span class="chip">Zona da assegnare</span>';
}

/** Chip per un riferimento naz:/sqd:/atl: del calendario. */
export function refChip(ref, small) {
  const e = refEntity(ref);
  if (!e) return '<span class="chip tbd">da definire</span>';
  return chipLink(e.href, e.emoji, e.nome, e.colore, small);
}

function initials(nome) {
  return (nome || '?').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

export function avatar(a) {
  const naz = nazione(a.nazioneId);
  const bg = naz?.colore || '#0b3d91';
  return `<div class="avatar" style="background:${esc(bg)};color:${textOn(bg)}">${esc(initials(a.nome))}</div>`;
}

function empty(icon, msg, extra = '') {
  return `<div class="empty"><span class="big">${icon}</span>${esc(msg)}${extra ? `<div class="small" style="margin-top:.5rem">${extra}</div>` : ''}</div>`;
}

/** Sotto-navigazione della sezione Rose. */
function roseNav(active) {
  const items = [['/nazioni', '🚩 Nazioni'], ['/squadre', '🛡️ Squadre'], ['/atleti', '🏃 Atleti']];
  return `<nav class="subnav">${items.map(([h, l]) =>
    `<a href="#${h}" class="${active === h ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
}

/** Entità che ha ottenuto un risultato (squadra mista, atleti o nazione). */
export function nomiRisultato(r) {
  if (r.squadraId) return squadra(r.squadraId)?.nome || '—';
  const nomi = atletiDiRisultato(r).map(a => a.nome);
  if (nomi.length) return nomi.join(' · ');
  return nazione(r.nazioneId)?.nome || '—';
}

function entitaChipRisultato(r, small = true) {
  return r.squadraId ? squadraChip(squadra(r.squadraId), small) : flagChip(nazione(r.nazioneId), small);
}

/** Etichetta sintetica di una riga di classifica: punti se attivi, altrimenti medaglie. */
function badgeRiga(r) {
  if (puntiAttivi()) return r.punti + ' pt';
  const tot = r.oro + r.argento + r.bronzo;
  return tot ? '🥇' + r.oro + ' 🥈' + r.argento + ' 🥉' + r.bronzo : '—';
}

/* ---------- HOME ---------- */

export const home = {
  render() {
    const st = statsGlobali();
    const cls = classifica().filter(r => r.gare > 0).slice(0, 3);
    const attivi = sportSorted().filter(s => (s.stato || '').toLowerCase() === 'in corso');
    const impegni = prossimiImpegni(6);
    const ultimi = ultimiRisultati(6);
    const desc = store.data.config?.descrizione;

    return `
    <section class="hero">
      <span class="tag">${esc(store.data.config?.edizione || CONFIG.EDITION)}</span>
      <h1>${esc(store.data.config?.nome || CONFIG.EVENT_NAME)}</h1>
      <p>${esc(desc || 'Il torneo che decide chi comanda l\'estate. Nazioni, squadre miste, discipline e una classifica che si aggiorna in diretta.')}</p>
    </section>

    <div class="grid stats">
      <div class="card stat"><b>${st.nazioni}</b><span>Nazioni</span></div>
      <div class="card stat"><b>${st.squadre}</b><span>Squadre</span></div>
      <div class="card stat"><b>${st.atleti}</b><span>Atleti</span></div>
      <div class="card stat"><b>${st.completati}/${st.sport}</b><span>Gare concluse</span></div>
    </div>

    ${impegni.length ? `
    <div class="section-head"><h2>📅 Prossimi impegni</h2><a class="small" href="#/sport">Calendari →</a></div>
    <div class="list">${impegni.map(it => {
      const s = it.sport;
      if (it.tipo === 'sport') {
        return `<a class="row-item" href="#/sport/${esc(s.id)}">
          <span style="font-size:1.3rem">${esc(s?.icona || '🏅')}</span>
          <span class="grow"><b>${esc(s?.nome || '')}</b>
            <span class="small muted">${esc(fmtDate(s.data))}${s.luogo ? ' · 📍 ' + esc(s.luogo) : ''}</span></span>
          ${statoPill(s.stato)}</a>`;
      }
      const i = it.incontro;
      return `<a class="row-item" href="#/sport/${esc(i.sportId)}">
        <span style="font-size:1.3rem">${esc(s?.icona || '🗓️')}</span>
        <span class="grow"><b>${esc(s?.nome || '')} · ${esc(i.fase || 'Incontro')}</b>
          <span class="small muted">${esc(fmtDate(i.data))}${i.luogo ? ' · 📍 ' + esc(i.luogo) : ''}</span></span>
        <span class="vs-mini">${refChip(i.latoA, true)}<span class="vs">vs</span>${refChip(i.latoB, true)}</span>
      </a>`;
    }).join('')}</div>` : ''}

    ${cls.length ? `
    <div class="section-head"><h2>Podio nazioni</h2><a class="small" href="#/classifica">Classifiche →</a></div>
    <div class="card">${tabellaMedagliere(cls, 'Nazione', r => flagChip(r.nazione))}</div>` : ''}

    ${attivi.length ? `
    <div class="section-head"><h2>🔴 In corso adesso</h2></div>
    <div class="grid cards">${attivi.map(sportCard).join('')}</div>` : ''}

    ${ultimi.length ? `
    <div class="section-head"><h2>Ultimi risultati</h2></div>
    <div class="list">${ultimi.map(r => {
      const s = getSport(r.sportId);
      return `<a class="row-item" href="#/sport/${esc(r.sportId)}">
        <span style="font-size:1.3rem">${MEDAL[Number(r.posizione)] || '🎽'}</span>
        <span class="grow"><b>${esc(nomiRisultato(r))}</b>
          <span class="small muted">${esc(s?.nome || 'Sport')} · ${ordinal(r.posizione)}${r.punteggio ? ' · ' + esc(r.punteggio) : ''}</span></span>
        ${entitaChipRisultato(r)}
      </a>`;
    }).join('')}</div>` : ''}

    ${!st.sport && !st.nazioni ? empty('🏗️', 'Nessun dato ancora inserito.',
      'Vai in <a href="#/admin">Admin</a> per creare nazioni, squadre, discipline e calendari.') : ''}
    `;
  },
};

/* ---------- SPORT ---------- */

function sportCard(s) {
  const nRis = risultatiDiSport(s.id).length;
  const nInc = incontriDiSport(s.id).length;
  const nIsc = iscrittiDiSport(s.id).length;
  return `<a class="card link sport-card ${isAnnullato(s) ? 'annullato' : ''}" href="#/sport/${esc(s.id)}">
    <div class="head">
      <span class="ico">${esc(s.icona || '🏅')}</span>
      <span class="grow"><h3 style="margin:0">${esc(s.nome)}</h3>
        <span class="small muted">${esc(s.categoria || (s.tipo || 'individuale'))}${s.data ? ' · ' + esc(fmtDate(s.data)) : ''}</span>
      </span>
      ${statoPill(s.stato)}
    </div>
    <p>${esc((s.descrizione || 'Nessuna descrizione.').slice(0, 160))}</p>
    <div class="small muted">${esc(formatoLabel(s))}${nIsc ? ' · ' + nIsc + ' iscritti' : ''}${nInc ? ' · ' + nInc + ' incontri' : ''}${nRis ? ' · ' + nRis + ' risultati' : ''}${s.luogo ? ' · 📍 ' + esc(s.luogo) : ''}</div>
  </a>`;
}

export const sportList = {
  render() {
    const all = sportSorted();
    if (!all.length) return empty('🥇', 'Nessuno sport inserito.', 'Aggiungili da <a href="#/admin">Admin</a>.');
    return `
    <h1>Sport e discipline</h1>
    <div class="filters">
      <input id="q" type="search" placeholder="Cerca disciplina…" aria-label="Cerca">
      <select id="fStato" aria-label="Filtra per stato">
        <option value="">Tutti gli stati</option>
        <option value="programmato">Programmati</option>
        <option value="in corso">In corso</option>
        <option value="completato">Completati</option>
        <option value="annullato">Annullati</option>
      </select>
      <select id="fFormato" aria-label="Filtra per formato">
        <option value="">Tutti i formati</option>
        ${FORMATI.map(f => `<option value="${esc(f.v)}">${esc(f.l)}</option>`).join('')}
      </select>
    </div>
    <div class="grid cards" id="sportGrid">${all.map(sportCard).join('')}</div>`;
  },
  mount() {
    const q = document.getElementById('q');
    if (!q) return;
    const fs = document.getElementById('fStato');
    const ff = document.getElementById('fFormato');
    const apply = () => {
      const term = slug(q.value);
      const html = sportSorted().filter(s =>
        (!term || slug(s.nome + ' ' + (s.categoria || '') + ' ' + (s.descrizione || '')).includes(term)) &&
        (!fs.value || (s.stato || 'programmato').toLowerCase() === fs.value) &&
        (!ff.value || formatoDi(s) === ff.value)
      ).map(sportCard).join('');
      document.getElementById('sportGrid').innerHTML = html ||
        '<div class="empty">Nessun risultato per questi filtri.</div>';
    };
    q.addEventListener('input', apply);
    fs.addEventListener('change', apply);
    ff.addEventListener('change', apply);
  },
};

/* ---------- calendario: rendering per formato ---------- */

function matchCard(i, compact) {
  const esito = esitoIncontro(i);
  const done = isConcluso(i);
  const side = (ref, punteggio, vinta) => {
    const e = refEntity(ref);
    return `<div class="side ${vinta ? 'win' : ''}">
      <span class="dot" style="background:${esc(e?.colore || '#c9d4e8')}"></span>
      <span class="nm">${e ? esc(e.emoji + ' ' + e.nome) : '<i class="muted">da definire</i>'}</span>
      <b class="sc">${punteggio !== '' && punteggio !== undefined ? esc(punteggio) : (done ? '—' : '')}</b>
    </div>`;
  };
  return `<div class="match ${done ? 'done' : ''}">
    ${side(i.latoA, i.punteggioA, esito === 'A')}
    ${side(i.latoB, i.punteggioB, esito === 'B')}
    <div class="meta">
      ${i.data ? '🕒 ' + esc(fmtDate(i.data)) : ''}
      ${i.luogo ? ' · 📍 ' + esc(i.luogo) : ''}
      ${esito === 'X' ? ' · pareggio' : ''}
      ${!compact && i.note ? ' · ' + esc(i.note) : ''}
      ${!done && (i.stato || '') ? ' ' + statoPill(i.stato) : ''}
    </div>
  </div>`;
}

function bracketView(sportId) {
  const fasi = fasiDiSport(sportId);
  if (!fasi.length) return '';
  return `<div class="bracket">${fasi.map(f => `
    <div class="round">
      <h4>${esc(f.fase)}</h4>
      ${f.incontri.map(i => matchCard(i, true)).join('')}
    </div>`).join('')}</div>`;
}

function listaFasi(sportId) {
  const fasi = fasiDiSport(sportId);
  return fasi.map(f => `
    <div class="fase">
      <h4>${esc(f.fase)}</h4>
      <div class="match-list">${f.incontri.map(i => matchCard(i)).join('')}</div>
    </div>`).join('');
}

function gironeTable(sportId) {
  const rows = gironeStandings(sportId);
  if (!rows.length) return '';
  const p = puntiIncontro();
  return `
  <h4>Classifica degli scontri</h4>
  <div class="tbl-wrap"><table>
    <thead><tr><th class="num">#</th><th>Partecipante</th><th class="num">G</th><th class="num">V</th>
      <th class="num">N</th><th class="num">P</th><th class="num">Fatti</th><th class="num">Subiti</th><th class="num">Punti</th></tr></thead>
    <tbody>${rows.map((r, idx) => `<tr class="${idx < 3 ? 'podio-' + (idx + 1) : ''}">
      <td class="num">${idx + 1}</td>
      <td>${refChip(r.ref, true)}</td>
      <td class="num">${r.g}</td><td class="num">${r.v}</td><td class="num">${r.n}</td><td class="num">${r.p}</td>
      <td class="num muted">${r.fatti}</td><td class="num muted">${r.subiti}</td>
      <td class="num pts">${r.punti}</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="small muted">Vittoria ${p.vittoria} punti, pareggio ${p.pareggio}. Calcolata solo sugli incontri conclusi; a parità conta la differenza punti.</p>`;
}

function calendarioPane(s) {
  const incontri = incontriDiSport(s.id);
  const formato = formatoDi(s);
  const meta = formatoMeta(formato);
  const testa = `<div class="alert info"><b>${esc(meta.l)}.</b> ${esc(meta.desc)}</div>`;

  if (!incontri.length) {
    return `<div class="card">${testa}
      <div class="empty">${formato === 'tutti'
        ? 'Si gareggia tutti insieme: non ci sono incontri, guarda la classifica.'
        : 'Nessun incontro in calendario.'}</div>
    </div>`;
  }

  let body;
  if (formato === 'tabellone') body = bracketView(s.id);
  else if (formato === 'scontro') body = listaFasi(s.id) + gironeTable(s.id);
  else body = listaFasi(s.id);

  return `<div class="card">${testa}${body}</div>`;
}

/** Elenco degli iscritti a una disciplina, con le squadre se ci sono. */
function iscrittiPane(s) {
  const isc = iscrittiDiSport(s.id);
  const sqd = squadreDiSport(s.id);
  return `<div class="card">
    ${sqd.length ? `
      <h3>Squadre (${sqd.length})</h3>
      <div class="list" style="margin-bottom:1rem">${sqd.map(q => {
        const rosa = atletiDiSquadra(q.id);
        return `<a class="row-item" href="#/squadre/${esc(q.id)}">
          <span style="font-size:1.4rem">${esc(q.emoji || '🛡️')}</span>
          <span class="grow"><b>${esc(q.nome)}</b>
            <span class="small muted">${esc(rosa.map(a => a.nome).join(' · ') || 'rosa da comporre')}</span></span>
        </a>`;
      }).join('')}</div>` : ''}

    <h3>Iscritti (${isc.length})</h3>
    ${isc.length ? `<div class="list">${isc.map(a => `
      <div class="row-item">${avatar(a)}
        <span class="grow"><b>${esc(a.nome)}</b>
          <span class="small muted">${esc(a.ruolo || 'Atleta')}</span></span>
        ${flagChip(nazione(a.nazioneId), true)}
      </div>`).join('')}</div>`
      : '<div class="empty">Nessun iscritto registrato per questa disciplina.</div>'}
  </div>`;
}

/* ---------- CALENDARIO GENERALE ---------- */

export const calendarioView = {
  render() {
    const giorni = giorniCalendario();
    if (!giorni.length) {
      return `<h1>Calendario</h1>` + empty('🗓️', 'Nessun evento con data.',
        'Metti una data alle discipline o genera i calendari da <a href="#/admin">Admin</a>.');
    }
    const oggi = new Date().toISOString().slice(0, 10);

    return `
    <h1>Calendario</h1>
    <p class="muted small">Compaiono solo i giorni con almeno un evento.</p>
    ${giorni.map(g => `
      <div class="giorno ${g.key === oggi ? 'oggi' : ''}">
        <div class="giorno-head">
          <h2>${esc(fmtGiorno(g.date))}</h2>
          <span class="small muted">${g.eventi.length} event${g.eventi.length === 1 ? 'o' : 'i'}${g.key === oggi ? ' · oggi' : ''}</span>
        </div>
        <div class="card"><div class="slots">${g.eventi.map(rigaEvento).join('')}</div></div>
      </div>`).join('')}`;
  },
};

function rigaEvento(ev) {
  const s = ev.sport;
  const ora = fmtOra(ev.data) || '—';
  if (ev.tipo === 'sport') {
    return `<a class="slot" href="#/sport/${esc(s.id)}">
      <b class="ora">${esc(ora)}</b>
      <span class="grow"><b>${esc(s.icona || '🏅')} ${esc(s.nome)}</b>
        <span class="small muted">${esc(formatoLabel(s))}${s.luogo ? ' · 📍 ' + esc(s.luogo) : ''}</span></span>
      ${statoPill(s.stato)}
    </a>`;
  }
  const i = ev.incontro;
  const a = refEntity(i.latoA), b = refEntity(i.latoB);
  const nome = (a || b)
    ? `${a ? esc(a.emoji + ' ' + a.nome) : '<i class="muted">?</i>'} <span class="vs">vs</span> ${b ? esc(b.emoji + ' ' + b.nome) : '<i class="muted">?</i>'}`
    : '<i class="muted">avversari da definire</i>';
  const punteggio = isConcluso(i) ? `<b class="sc">${esc(i.punteggioA || '—')}-${esc(i.punteggioB || '—')}</b>` : '';
  return `<a class="slot" href="#/sport/${esc(i.sportId)}">
    <b class="ora">${esc(ora)}</b>
    <span class="grow"><b>${nome}</b>
      <span class="small muted">${esc(s?.icona || '🏅')} ${esc(s?.nome || '')}${i.fase ? ' · ' + esc(i.fase) : ''}${i.luogo ? ' · 📍 ' + esc(i.luogo) : ''}</span></span>
    ${punteggio || statoPill(i.stato)}
  </a>`;
}

export const sportDetail = {
  render({ id }) {
    const s = getSport(id);
    if (!s) return empty('❓', 'Disciplina non trovata.', '<a href="#/sport">Torna agli sport</a>');
    const ris = risultatiDiSport(s.id);
    const inc = incontriDiSport(s.id);
    const isc = iscrittiDiSport(s.id);
    const sqd = squadreDiSport(s.id);
    const conPunti = puntiAttivi();

    return `
    <a class="back" href="#/sport">← Tutti gli sport</a>
    <div class="card">
      <div class="sport-card head">
        <span class="ico" style="font-size:2.2rem">${esc(s.icona || '🏅')}</span>
        <span class="grow"><h1 style="margin:0">${esc(s.nome)}</h1>
          <span class="small muted">${esc(s.categoria || '')}${s.categoria && s.tipo ? ' · ' : ''}${esc(s.tipo || '')}</span>
        </span>
        ${statoPill(s.stato)}
      </div>
      ${isAnnullato(s) ? '<div class="alert warn" style="margin-top:.7rem"><b>Disciplina annullata.</b> Non assegna medaglie e non compare in calendario.</div>' : ''}
      <div class="btn-row small muted" style="margin-top:.4rem">
        <span class="chip">🗓️ ${esc(formatoLabel(s))}</span>
        ${s.data ? `<span class="chip">📅 ${esc(fmtDate(s.data))}</span>` : ''}
        ${s.luogo ? `<span class="chip">📍 ${esc(s.luogo)}</span>` : ''}
        ${isc.length ? `<span class="chip">👥 ${isc.length} iscritti</span>` : ''}
        ${conPunti ? `<span class="chip">🎯 Punti: ${puntiSchema(s).join(' / ')}</span>` : '<span class="chip">🥇 Medaglie ai primi tre</span>'}
      </div>
    </div>

    <div class="tabs" role="tablist" style="margin-top:1rem">
      <button class="on" data-tab="cal" role="tab">Calendario (${inc.length})</button>
      <button data-tab="ris" role="tab">Classifica (${ris.length})</button>
      <button data-tab="isc" role="tab">Iscritti (${sqd.length ? sqd.length + ' sq.' : isc.length})</button>
      <button data-tab="desc" role="tab">Descrizione</button>
      <button data-tab="reg" role="tab">Regolamento</button>
    </div>

    <div data-pane="cal">${calendarioPane(s)}</div>

    <div class="card hide" data-pane="ris">
      ${ris.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th class="num">Pos</th><th>Chi</th><th>Per</th><th>Risultato</th>
          ${conPunti ? '<th class="num">Punti</th>' : ''}</tr></thead>
        <tbody>${ris.map(r => `<tr class="podio-${Number(r.posizione)}">
          <td class="num">${MEDAL[Number(r.posizione)] || ordinal(r.posizione)}</td>
          <td><b>${esc(nomiRisultato(r))}</b>${r.note ? `<br><span class="small muted">${esc(r.note)}</span>` : ''}</td>
          <td>${entitaChipRisultato(r)}</td>
          <td>${esc(r.punteggio || '—')}</td>
          ${conPunti ? `<td class="num pts">${puntiPerPosizione(s, r.posizione)}</td>` : ''}
        </tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">Classifica non ancora registrata.</div>'}
    </div>

    <div class="hide" data-pane="isc">${iscrittiPane(s)}</div>
    <div class="card hide" data-pane="desc">${richText(s.descrizione)}</div>
    <div class="card hide" data-pane="reg">
      <h3>Regolamento</h3>${richText(s.regolamento)}
    </div>`;
  },
  mount() {
    document.querySelectorAll('.tabs [data-tab]').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.tabs [data-tab]').forEach(x => x.classList.toggle('on', x === b));
        document.querySelectorAll('[data-pane]').forEach(p =>
          p.classList.toggle('hide', p.dataset.pane !== b.dataset.tab));
      });
    });
  },
};

/* ---------- NAZIONI ---------- */

export const nazioniList = {
  render() {
    const cls = classifica();
    if (!cls.length) {
      return roseNav('/nazioni') + empty('🚩', 'Nessuna nazione inserita.', 'Aggiungile da <a href="#/admin">Admin</a>.');
    }
    const gruppi = [...ZONE.map(z => ({
      titolo: z.emoji + ' ' + z.l,
      righe: cls.filter(r => (r.nazione.zona || '') === z.v),
    })), {
      titolo: '❔ Zona da assegnare',
      righe: cls.filter(r => !ZONE.some(z => z.v === (r.nazione.zona || ''))),
    }].filter(g => g.righe.length);

    return `
    ${roseNav('/nazioni')}
    <h1>Nazioni</h1>
    <p class="muted small">Ogni "nazione" è la città di residenza dei partecipanti, raggruppata per zona.
    Le squadre invece sono miste e non seguono le zone.</p>
    ${gruppi.map(g => `
      <div class="section-head"><h2>${esc(g.titolo)}</h2>
        <span class="small muted">🥇 ${g.righe.reduce((s, r) => s + r.oro, 0)} ·
        ${g.righe.length} nazion${g.righe.length === 1 ? 'e' : 'i'}</span></div>
      <div class="grid cards">${g.righe.map(nazioneCard).join('')}</div>`).join('')}`;
  },
};

function nazioneCard(r) {
  const n = r.nazione;
  const bg = n.colore || '#0b3d91';
  const roster = atletiDiNazione(n.id);
  return `<a class="card link" href="#/nazioni/${esc(n.id)}">
    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.5rem">
      <span style="font-size:1.8rem">${esc(n.emoji || '🚩')}</span>
      <span style="flex:1;min-width:0"><h3 style="margin:0">${esc(n.nome)}</h3>
        <span class="small muted">${esc(n.citta || '')}</span></span>
      <span class="pill" style="background:${esc(bg)};color:${textOn(bg)}">${esc(badgeRiga(r))}</span>
    </div>
    <div class="small muted">${roster.length} atlet${roster.length === 1 ? 'a' : 'i'} · ${r.pos}ª posizione · ${esc(zonaLabel(n.zona))}</div>
  </a>`;
}

export const nazioneDetail = {
  render({ id }) {
    const n = nazione(id);
    if (!n) return empty('❓', 'Nazione non trovata.', '<a href="#/nazioni">Torna alle nazioni</a>');
    const bg = n.colore || '#0b3d91';
    const row = classifica().find(r => String(r.nazione.id) === String(n.id));
    const roster = atletiDiNazione(n.id);
    const ris = store.data.risultati
      .filter(r => !r.squadraId && String(r.nazioneId) === String(n.id))
      .sort((a, b) => (Number(a.posizione) || 99) - (Number(b.posizione) || 99));

    return `
    <a class="back" href="#/nazioni">← Tutte le nazioni</a>
    <section class="hero" style="background:linear-gradient(135deg,${esc(bg)},#10233f)">
      <span class="tag">${esc(n.citta || 'Nazione')}</span>
      <h1>${esc(n.emoji || '🚩')} ${esc(n.nome)}</h1>
      <p>${esc(n.note || '')}</p>
      <div style="margin-top:.6rem">${zonaChip(n.zona)}</div>
    </section>
    <div class="grid stats">
      <div class="card stat"><b>${row?.pos || '—'}</b><span>Posizione</span></div>
      <div class="card stat"><b>${row?.oro || 0}</b><span>🥇 Ori</span></div>
      <div class="card stat"><b>${(row?.oro || 0) + (row?.argento || 0) + (row?.bronzo || 0)}</b><span>Medaglie</span></div>
      <div class="card stat"><b>${roster.length}</b><span>Atleti</span></div>
    </div>

    <div class="section-head"><h2>Atleti</h2></div>
    ${roster.length ? `<div class="list">${roster.map(a => {
      const sq = squadreDiAtleta(a.id);
      return `<div class="row-item">${avatar(a)}
        <span class="grow"><b>${esc(a.nome)}</b>
          <span class="small muted">${esc(a.ruolo || 'Atleta')}</span></span>
        ${sq.map(s => squadraChip(s, true)).join(' ')}
      </div>`;
    }).join('')}</div>`
      : '<div class="empty">Nessun atleta assegnato.</div>'}

    <div class="section-head"><h2>Risultati individuali</h2></div>
    ${ris.length ? `<div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th class="num">Pos</th><th>Disciplina</th><th>Atleta</th></tr></thead>
      <tbody>${ris.map(r => {
        const s = getSport(r.sportId);
        return `<tr class="podio-${Number(r.posizione)}">
          <td class="num">${MEDAL[Number(r.posizione)] || ordinal(r.posizione)}</td>
          <td><a href="#/sport/${esc(r.sportId)}">${esc(s?.icona || '🏅')} ${esc(s?.nome || '—')}</a></td>
          <td>${esc(nomiRisultato(r))}</td></tr>`;
      }).join('')}</tbody></table></div></div>`
      : '<div class="empty">Nessun risultato registrato.</div>'}
    <p class="small muted">I punti delle squadre miste non entrano nel bilancio delle nazioni.</p>`;
  },
};

/* ---------- SQUADRE ---------- */

export const squadreList = {
  render() {
    const cls = classificaSquadre();
    if (!cls.length) {
      return roseNav('/squadre') + empty('🛡️', 'Nessuna squadra creata.',
        'Le squadre sono miste: le componi da <a href="#/admin">Admin</a> pescando atleti da nazioni diverse.');
    }
    return `
    ${roseNav('/squadre')}
    <h1>Squadre</h1>
    <p class="muted small">Le squadre si creano per disciplina, a partire dagli iscritti, e sono miste:
    i componenti arrivano da nazioni e zone diverse. Le loro medaglie non entrano nel medagliere delle nazioni.</p>
    <div class="grid cards">${cls.map(r => {
      const s = r.squadra;
      const bg = s.colore || '#1657c8';
      const rosa = atletiDiSquadra(s.id);
      const nazioni = nazioniDiSquadra(s.id);
      return `<a class="card link" href="#/squadre/${esc(s.id)}">
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.5rem">
          <span style="font-size:1.8rem">${esc(s.emoji || '🛡️')}</span>
          <span style="flex:1;min-width:0"><h3 style="margin:0">${esc(s.nome)}</h3>
            <span class="small muted">${rosa.length} component${rosa.length === 1 ? 'e' : 'i'}</span></span>
          <span class="pill" style="background:${esc(bg)};color:${textOn(bg)}">${esc(badgeRiga(r))}</span>
        </div>
        <div class="small muted">${getSport(s.sportId) ? esc((getSport(s.sportId).icona || '') + ' ' + getSport(s.sportId).nome) : 'Squadra generica'}</div>
        <div style="margin-top:.45rem;display:flex;gap:.25rem;flex-wrap:wrap">
          ${nazioni.map(n => flagChip(n, true)).join('')}</div>
      </a>`;
    }).join('')}</div>`;
  },
};

export const squadraDetail = {
  render({ id }) {
    const s = squadra(id);
    if (!s) return empty('❓', 'Squadra non trovata.', '<a href="#/squadre">Torna alle squadre</a>');
    const bg = s.colore || '#1657c8';
    const row = classificaSquadre().find(r => String(r.squadra.id) === String(s.id));
    const rosa = atletiDiSquadra(s.id);
    const nazioni = nazioniDiSquadra(s.id);
    const ris = store.data.risultati
      .filter(r => String(r.squadraId) === String(s.id))
      .sort((a, b) => (Number(a.posizione) || 99) - (Number(b.posizione) || 99));
    const ref = 'sqd:' + s.id;
    const inc = store.data.incontri.filter(i => i.latoA === ref || i.latoB === ref);

    return `
    <a class="back" href="#/squadre">← Tutte le squadre</a>
    <section class="hero" style="background:linear-gradient(135deg,${esc(bg)},#10233f)">
      <span class="tag">Squadra mista</span>
      <h1>${esc(s.emoji || '🛡️')} ${esc(s.nome)}</h1>
      <p>${esc(s.note || '')}</p>
      <div style="margin-top:.6rem;display:flex;gap:.3rem;flex-wrap:wrap">
        ${nazioni.map(n => flagChip(n, true)).join('')}</div>
    </section>
    <div class="grid stats">
      <div class="card stat"><b>${row?.pos || '—'}</b><span>Posizione</span></div>
      <div class="card stat"><b>${row?.oro || 0}</b><span>🥇 Ori</span></div>
      <div class="card stat"><b>${(row?.oro || 0) + (row?.argento || 0) + (row?.bronzo || 0)}</b><span>Medaglie</span></div>
      <div class="card stat"><b>${rosa.length}</b><span>Componenti</span></div>
    </div>

    <div class="section-head"><h2>Rosa</h2></div>
    ${rosa.length ? `<div class="list">${rosa.map(a => `
      <div class="row-item">${avatar(a)}
        <span class="grow"><b>${esc(a.nome)}</b>
          <span class="small muted">${esc(a.ruolo || 'Atleta')}</span></span>
        ${flagChip(nazione(a.nazioneId), true)}
      </div>`).join('')}</div>`
      : '<div class="empty">Nessun componente assegnato.</div>'}

    ${inc.length ? `
    <div class="section-head"><h2>Incontri</h2></div>
    <div class="card"><div class="match-list">${inc.map(i => {
      const sp = getSport(i.sportId);
      return `<div>
        <div class="small muted" style="margin-bottom:.2rem">
          <a href="#/sport/${esc(i.sportId)}">${esc(sp?.icona || '🏅')} ${esc(sp?.nome || '')}</a>
          ${i.fase ? ' · ' + esc(i.fase) : ''}</div>
        ${matchCard(i, true)}
      </div>`;
    }).join('')}</div></div>` : ''}

    ${ris.length ? `
    <div class="section-head"><h2>Risultati</h2></div>
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th class="num">Pos</th><th>Disciplina</th></tr></thead>
      <tbody>${ris.map(r => {
        const sp = getSport(r.sportId);
        return `<tr class="podio-${Number(r.posizione)}">
          <td class="num">${MEDAL[Number(r.posizione)] || ordinal(r.posizione)}</td>
          <td><a href="#/sport/${esc(r.sportId)}">${esc(sp?.icona || '🏅')} ${esc(sp?.nome || '—')}</a></td></tr>`;
      }).join('')}</tbody></table></div></div>` : ''}`;
  },
};

/* ---------- ATLETI ---------- */

export const atletiList = {
  render() {
    const all = atletiSorted();
    if (!all.length) {
      return roseNav('/atleti') + empty('🏃', 'Nessun partecipante inserito.', 'Aggiungili da <a href="#/admin">Admin</a>.');
    }
    return `
    ${roseNav('/atleti')}
    <h1>Atleti <span class="muted small">(${all.length})</span></h1>
    <div class="filters">
      <input id="qa" type="search" placeholder="Cerca atleta…" aria-label="Cerca atleta">
      <select id="fNaz" aria-label="Filtra per nazione">
        <option value="">Tutte le nazioni</option>
        ${nazioniSorted().map(n => `<option value="${esc(n.id)}">${esc(n.nome)}</option>`).join('')}
      </select>
      <select id="fZona" aria-label="Filtra per zona">
        <option value="">Tutte le zone</option>
        ${ZONE.map(z => `<option value="${esc(z.v)}">${esc(z.l)}</option>`).join('')}
      </select>
      <select id="fSqd" aria-label="Filtra per squadra">
        <option value="">Tutte le squadre</option>
        ${squadreSorted().map(s => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="list" id="atletiList">${all.map(atletaRow).join('')}</div>`;
  },
  mount() {
    const q = document.getElementById('qa');
    if (!q) return;
    const fn = document.getElementById('fNaz');
    const fz = document.getElementById('fZona');
    const fq = document.getElementById('fSqd');
    const apply = () => {
      const term = slug(q.value);
      const html = atletiSorted().filter(a => {
        const n = nazione(a.nazioneId);
        return (!term || slug(a.nome).includes(term)) &&
          (!fn.value || String(a.nazioneId) === String(fn.value)) &&
          (!fz.value || (n?.zona || '') === fz.value) &&
          (!fq.value || squadreDiAtleta(a.id).some(s => String(s.id) === String(fq.value)));
      }).map(atletaRow).join('');
      document.getElementById('atletiList').innerHTML = html ||
        '<div class="empty">Nessun atleta trovato.</div>';
    };
    [q, fn, fz, fq].forEach(el => el.addEventListener(el === q ? 'input' : 'change', apply));
  },
};

function atletaRow(a) {
  const stats = classificaAtleti().find(r => String(r.atleta.id) === String(a.id));
  const sq = squadreDiAtleta(a.id);
  return `<div class="row-item">${avatar(a)}
    <span class="grow"><b>${esc(a.nome)}</b>
      <span class="small muted">${esc(a.ruolo || 'Atleta')}${stats ? ` · ${stats.punti} pt · 🥇${stats.oro}` : ''}</span></span>
    <span class="chips-inline">${sq.map(s => squadraChip(s, true)).join('')}${flagChip(nazione(a.nazioneId), true)}</span></div>`;
}

/* ---------- CLASSIFICHE ---------- */

function tabellaMedagliere(rows, colonna, chipFn) {
  const conPunti = puntiAttivi();
  return `<div class="tbl-wrap"><table>
    <thead><tr><th class="num">#</th><th>${esc(colonna)}</th><th class="num">🥇</th><th class="num">🥈</th>
      <th class="num">🥉</th><th class="num">Tot</th><th class="num">Gare</th>
      ${conPunti ? '<th class="num">Punti</th>' : ''}</tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.pos <= 3 && r.gare ? 'podio-' + r.pos : ''}">
      <td class="num">${r.gare && MEDAL[r.pos] ? MEDAL[r.pos] : r.pos}</td>
      <td>${chipFn(r)}</td>
      <td class="num">${r.oro}</td><td class="num">${r.argento}</td><td class="num">${r.bronzo}</td>
      <td class="num"><b>${r.oro + r.argento + r.bronzo}</b></td>
      <td class="num muted">${r.gare}</td>
      ${conPunti ? `<td class="num pts">${r.punti}</td>` : ''}</tr>`).join('')}</tbody>
  </table></div>`;
}

const notaOrdinamento = () => puntiAttivi()
  ? `Ordinata per punti (${puntiSchema(null).join(' / ')} per posizione), poi per medaglie.`
  : 'Ordinata a medaglie: prima gli ori, poi argenti e bronzi. I punti per piazzamento sono disattivati.';

export const classificaView = {
  render() {
    const cls = classifica();
    const zone = classificaZone();
    const sqd = classificaSquadre();
    const atl = classificaAtleti();
    if (!cls.length && !sqd.length) return empty('📊', 'Classifica vuota.', 'Serve almeno una nazione o una squadra.');

    return `
    <h1>Classifiche</h1>
    <div class="tabs" role="tablist">
      <button class="on" data-tab="naz" role="tab">🚩 Nazioni</button>
      <button data-tab="zone" role="tab">🧭 Zone</button>
      <button data-tab="sqd" role="tab">🛡️ Squadre</button>
      <button data-tab="atl" role="tab">🏃 Atleti</button>
    </div>

    <div class="card" data-pane="naz">
      ${tabellaMedagliere(cls, 'Nazione', r => flagChip(r.nazione))}
      <p class="small muted" style="margin-top:.7rem">${notaOrdinamento()}
      Le medaglie delle squadre non compaiono qui: le squadre sono miste.</p>
    </div>

    <div class="card hide" data-pane="zone">
      ${tabellaMedagliere(zone, 'Zona', r => `<span class="chip">${r.zona.emoji} ${esc(r.zona.l)}</span>
        <span class="small muted">${r.nazioni} nazioni</span>`)}
      <p class="small muted" style="margin-top:.7rem">Somma delle nazioni di ciascuna zona.</p>
    </div>

    <div class="card hide" data-pane="sqd">
      ${sqd.length ? tabellaMedagliere(sqd, 'Squadra', r => squadraChip(r.squadra))
        : '<div class="empty">Nessuna squadra creata.</div>'}
      <p class="small muted" style="margin-top:.7rem">Classifica indipendente: le squadre sono miste per costruzione.</p>
    </div>

    <div class="card hide" data-pane="atl">
      ${atl.length ? tabellaMedagliere(atl, 'Atleta', r => `<b>${esc(r.atleta.nome)}</b>
          ${flagChip(nazione(r.atleta.nazioneId), true)}`) +
        `<p class="small muted" style="margin-top:.7rem">Medaglie prese sia con la nazione sia con le squadre.</p>`
        : '<div class="empty">Nessun risultato individuale registrato.</div>'}
    </div>`;
  },
  mount: sportDetail.mount,
};
