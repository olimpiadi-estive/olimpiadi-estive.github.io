import { CONFIG } from '../config.js';
import { apiLog, diagnose, fetchState, auth } from '../api.js';
import { store, statsGlobali } from '../store.js';
import { esc, toast, fmtTime } from '../utils.js';

let esito = null;      // risultato dell'ultimo test
let inCorso = false;

const ms = v => (v == null ? '—' : v + ' ms');

function riga(k, v, kind = '') {
  return `<tr><th style="text-transform:none;letter-spacing:0">${esc(k)}</th>
    <td class="${kind}">${v}</td></tr>`;
}

function semaforo(ok, testo) {
  return `<b style="color:${ok ? 'var(--verde)' : 'var(--rosso)'}">${ok ? '● ' : '● '}${esc(testo)}</b>`;
}

export const debugView = {
  render() {
    const st = statsGlobali();
    const s = apiLog.stats();
    const sw = navigator.serviceWorker?.controller ? 'attivo' : 'non attivo';
    const eta = store.lastSync ? Math.round((Date.now() - store.lastSync) / 1000) : null;

    return `
    <a class="back" href="#/admin">← Admin</a>
    <h1>Diagnostica sincronizzazione</h1>
    <p class="muted small">Serve per capire perché i dati non si aggiornano. Nessun dato viene inviato
    altrove: le prove parlano solo col tuo Web App di Apps Script.</p>

    <div class="btn-row" style="margin-bottom:.9rem">
      <button class="btn" id="dbgTest" ${inCorso ? 'disabled' : ''}>${inCorso ? 'Test in corso…' : '▶ Esegui test'}</button>
      <button class="btn ghost" id="dbgSync">Forza sync</button>
      <button class="btn ghost" id="dbgCopy">Copia rapporto</button>
      <button class="btn ghost sm" id="dbgClear">Svuota log</button>
    </div>

    ${esito ? `<div class="alert ${esito.ok ? 'info' : 'err'}">${esito.html}</div>` : ''}

    <div class="card">
      <h3>Stato</h3>
      <div class="tbl-wrap"><table><tbody>
        ${riga('Collegamento', navigator.onLine ? semaforo(true, 'online') : semaforo(false, 'offline'))}
        ${riga('Ultimo sync riuscito', store.lastSync
          ? `${fmtTime(store.lastSync)} <span class="muted">(${eta}s fa, durato ${ms(store.lastMs)})</span>`
          : semaforo(false, 'mai'))}
        ${riga('Sync in corso', store.loading ? 'sì, da ' + Math.round((Date.now() - store.startedAt) / 1000) + 's' : 'no')}
        ${riga('Errori consecutivi', store.fails ? semaforo(false, String(store.fails)) : '0')}
        ${riga('Ultimo errore', store.error ? `<span style="color:var(--rosso)">${esc(store.error)}</span>` : '—')}
        ${riga('Dati mostrati', store.fromCache ? 'dalla cache locale' : 'dal server')}
        ${riga('Revisione dati', String(store.data.rev || 0))}
        ${riga('Service worker', sw + ' · cache ' + esc(esito?.cache || 'da verificare'))}
      </tbody></table></div>
    </div>

    <div class="card" style="margin-top:.8rem">
      <h3>Collegamento</h3>
      <div class="tbl-wrap"><table><tbody>
        ${riga('URL API', `<span style="word-break:break-all">${esc(CONFIG.apiUrl || 'non configurato')}</span>`)}
        ${riga('Origine URL', CONFIG.apiUrlSource === 'locale'
          ? semaforo(false, 'sovrascritto in questo browser')
          : 'predefinito dal codice')}
        ${riga('PIN admin', auth.isAdmin ? 'presente in questo browser' : 'assente')}
      </tbody></table></div>
    </div>

    <div class="card" style="margin-top:.8rem">
      <h3>Contenuto</h3>
      <div class="grid stats">
        <div class="stat"><b>${st.nazioni}</b><span>Nazioni</span></div>
        <div class="stat"><b>${st.atleti}</b><span>Atleti</span></div>
        <div class="stat"><b>${st.sport}</b><span>Sport</span></div>
        <div class="stat"><b>${st.iscrizioni}</b><span>Iscrizioni</span></div>
        <div class="stat"><b>${st.incontri}</b><span>Incontri</span></div>
        <div class="stat"><b>${st.risultati}</b><span>Risultati</span></div>
      </div>
    </div>

    <div class="card" style="margin-top:.8rem">
      <h3>Ultime richieste <span class="muted small">(${s.tot}, ${s.errori} fallite,
        media ${ms(s.media)}, massimo ${ms(s.max)})</span></h3>
      ${apiLog.items.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Ora</th><th>Operazione</th><th class="num">Durata</th><th>Esito</th></tr></thead>
        <tbody>${apiLog.items.slice(0, 25).map(x => `<tr>
          <td class="muted">${fmtTime(x.ts)}</td>
          <td>${esc(x.etichetta || '—')}</td>
          <td class="num ${x.ms > 8000 ? 'pts' : 'muted'}">${x.ms} ms</td>
          <td>${x.ok ? '<span style="color:var(--verde)">ok</span>'
            : `<span style="color:var(--rosso)">${esc((x.err || 'errore').slice(0, 80))}</span>`}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">Nessuna richiesta registrata.</div>'}
    </div>

    <div class="card" style="margin-top:.8rem">
      <h3>Ambiente</h3>
      <p class="small muted" style="word-break:break-word">${esc(navigator.userAgent)}</p>
      <p class="small muted">Fuso: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)} ·
      Schermo: ${window.innerWidth}×${window.innerHeight}</p>
      <div class="btn-row">
        <button class="btn danger sm" id="dbgReset">Svuota cache e ricarica</button>
      </div>
    </div>`;
  },

  mount() {
    document.getElementById('dbgSync')?.addEventListener('click', async () => {
      await store.refresh();
      toast(store.error ? 'Sync fallito: ' + store.error : 'Sync riuscito', store.error ? 'err' : 'ok');
      rerender();
    });

    document.getElementById('dbgClear')?.addEventListener('click', () => {
      apiLog.clear();
      esito = null;
      rerender();
    });

    document.getElementById('dbgCopy')?.addEventListener('click', async () => {
      const testo = rapporto();
      try {
        await navigator.clipboard.writeText(testo);
        toast('Rapporto copiato', 'ok');
      } catch {
        // il clipboard può essere negato: mostro il testo da copiare a mano
        openTesto(testo);
      }
    });

    document.getElementById('dbgReset')?.addEventListener('click', async () => {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
      await Promise.all(regs.map(r => r.unregister()));
      location.reload();
    });

    document.getElementById('dbgTest')?.addEventListener('click', eseguiTest);

    // stato della cache del service worker, per la tabella
    if ('caches' in window && esito && !esito.cache) {
      caches.keys().then(k => { esito.cache = k.join(', ') || 'vuota'; });
    }
  },
};

function rerender() {
  window.dispatchEvent(new CustomEvent('oee:rerender'));
}

/**
 * Batteria di prove: cinque letture consecutive per misurare latenza e stabilità.
 * Le letture sono innocue, non modificano nulla nel foglio.
 */
async function eseguiTest() {
  inCorso = true;
  esito = null;
  rerender();

  const righe = [];
  let ok = true;

  const d = await diagnose();
  righe.push(`${d.ok ? '✅' : '❌'} Raggiungibilità: ${esc(d.msg)}`);
  if (!d.ok) ok = false;

  if (d.ok) {
    const tempi = [];
    let fallite = 0;
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      try {
        await fetchState({ tentativi: 1 });
        tempi.push(Date.now() - t0);
      } catch {
        fallite++;
      }
    }
    const media = tempi.length ? Math.round(tempi.reduce((a, b) => a + b, 0) / tempi.length) : 0;
    const max = tempi.length ? Math.max(...tempi) : 0;
    righe.push(`${fallite ? '⚠️' : '✅'} 5 letture consecutive: ${tempi.length} riuscite, ` +
      `${fallite} fallite, media ${media} ms, massimo ${max} ms`);
    if (fallite) ok = false;

    if (max > 10000) {
      righe.push('⚠️ Apps Script risponde molto lentamente: con più di 15 secondi la lettura scade. ' +
        'Succede quando il foglio ha molte righe o quando più persone scrivono insieme.');
    }
    if (media > 3000 && max <= 10000) {
      righe.push('ℹ️ Latenza alta ma tollerabile: il polling ogni 30 secondi regge.');
    }
  }

  if (CONFIG.apiUrlSource === 'locale') {
    righe.push('⚠️ Questo browser usa un URL API sovrascritto a mano: gli altri dispositivi ' +
      'leggono un altro foglio. Vai in Admin ▸ Impostazioni ▸ Usa il predefinito.');
  }
  if (!navigator.onLine) {
    righe.push('❌ Il dispositivo risulta offline.');
    ok = false;
  }

  let cache = '';
  if ('caches' in window) cache = (await caches.keys()).join(', ') || 'vuota';

  esito = { ok, cache, html: righe.map(r => `<div>${r}</div>`).join('') };
  inCorso = false;
  rerender();
}

function rapporto() {
  const s = apiLog.stats();
  return [
    'Olimpiadi Epiche Estive — rapporto diagnostica',
    'Data: ' + new Date().toISOString(),
    'URL API: ' + CONFIG.apiUrl + ' (' + CONFIG.apiUrlSource + ')',
    'Online: ' + navigator.onLine,
    'Ultimo sync: ' + (store.lastSync ? new Date(store.lastSync).toISOString() : 'mai') +
      ' in ' + store.lastMs + ' ms',
    'Errori consecutivi: ' + store.fails,
    'Ultimo errore: ' + (store.error || '—'),
    'Revisione: ' + store.data.rev,
    'Richieste registrate: ' + s.tot + ' (' + s.errori + ' fallite, media ' + s.media +
      ' ms, max ' + s.max + ' ms)',
    'Conteggi: ' + JSON.stringify(statsGlobali()),
    'UA: ' + navigator.userAgent,
    '',
    'Ultime richieste:',
    ...apiLog.items.slice(0, 25).map(x =>
      `${new Date(x.ts).toISOString()}  ${x.ok ? 'OK ' : 'KO '} ${x.ms}ms  ${x.etichetta || ''} ${x.err || ''}`),
  ].join('\n');
}

function openTesto(testo) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-bg" data-close>
    <div class="modal">
      <div class="modal-head"><h3>Rapporto</h3>
        <button class="icon-btn" style="background:#eef3fc;color:#0b3d91" data-close>✕</button></div>
      <textarea rows="14" readonly style="font-family:monospace;font-size:12px">${esc(testo)}</textarea>
      <p class="small muted">Selezionalo e copialo a mano.</p>
    </div></div>`;
  root.querySelector('.modal-bg').addEventListener('click', e => {
    if (e.target.hasAttribute('data-close')) root.innerHTML = '';
  });
}
