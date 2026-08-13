import { esc } from './utils.js';

const root = () => document.getElementById('modalRoot');

export function closeModal() {
  document.removeEventListener('keydown', escHandler);
  root().innerHTML = '';
  document.body.style.overflow = '';
  // il router rimanda i re-render mentre una modale è aperta: sbloccalo
  window.dispatchEvent(new CustomEvent('oee:rerender'));
}

/**
 * Apre una modale.
 * @param {{title:string, body:string, okText?:string, cancelText?:string,
 *          onOk?:(el:HTMLElement)=>any, wide?:boolean}} opts
 */
export function openModal(opts) {
  const { title, body, okText = 'Salva', cancelText = 'Annulla', onOk } = opts;
  root().innerHTML = `
    <div class="modal-bg" data-close>
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="icon-btn" style="background:#eef3fc;color:#0b3d91" data-close aria-label="Chiudi">✕</button>
        </div>
        <form data-form>
          <div data-body>${body}</div>
          <div class="modal-foot">
            <button type="button" class="btn ghost" data-close>${esc(cancelText)}</button>
            ${onOk ? `<button type="submit" class="btn" data-ok>${esc(okText)}</button>` : ''}
          </div>
        </form>
      </div>
    </div>`;
  document.body.style.overflow = 'hidden';

  const bg = root().querySelector('.modal-bg');
  bg.addEventListener('click', e => {
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  const form = root().querySelector('[data-form]');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!onOk) return closeModal();
    const btn = form.querySelector('[data-ok]');
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Attendi…';
    try {
      const keep = await onOk(form);
      if (keep !== false) closeModal();
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });
  const first = root().querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 60);
  document.addEventListener('keydown', escHandler);
}

function escHandler(e) {
  if (e.key === 'Escape') closeModal();
}

export function confirmModal(title, message, onYes, okText = 'Elimina') {
  openModal({
    title,
    body: `<p>${esc(message)}</p>`,
    okText,
    onOk: async () => await onYes(),
  });
}

/* ---------- form generico ---------- */

/**
 * @typedef {{k:string,label:string,type?:string,required?:boolean,hint?:string,
 *            options?:Array<{v:string,l:string}>,def?:string,rows?:number,attrs?:string}} Field
 */

export function renderFields(fields, values = {}) {
  return fields.map(f => {
    const v = values[f.k] ?? f.def ?? '';
    const id = 'f_' + f.k;
    let ctrl;
    if (f.type === 'textarea') {
      ctrl = `<textarea id="${id}" name="${esc(f.k)}" ${f.required ? 'required' : ''}
        ${f.rows ? `rows="${f.rows}"` : ''} ${f.attrs || ''}>${esc(v)}</textarea>`;
    } else if (f.type === 'select') {
      const sel = new Set(String(v ?? '').split(',').map(s => s.trim()));
      const opt = o => `<option value="${esc(o.v)}" ${sel.has(String(o.v)) ? 'selected' : ''}>${esc(o.l)}</option>`;
      const list = f.options || [];
      let opts = '';
      if (list.some(o => o.group)) {
        // raggruppa mantenendo l'ordine di comparsa dei gruppi
        const senza = list.filter(o => !o.group);
        opts += senza.map(opt).join('');
        const gruppi = [];
        list.forEach(o => { if (o.group && !gruppi.includes(o.group)) gruppi.push(o.group); });
        gruppi.forEach(g => {
          opts += `<optgroup label="${esc(g)}">` +
            list.filter(o => o.group === g).map(opt).join('') + '</optgroup>';
        });
      } else {
        opts = list.map(opt).join('');
      }
      ctrl = `<select id="${id}" name="${esc(f.k)}" ${f.required ? 'required' : ''} ${f.attrs || ''}>${opts}</select>`;
    } else {
      ctrl = `<input id="${id}" name="${esc(f.k)}" type="${esc(f.type || 'text')}"
        value="${esc(v)}" ${f.required ? 'required' : ''} ${f.attrs || ''}>`;
    }
    return `<label class="fld" for="${id}">
      <span>${esc(f.label)}${f.required ? ' <em class="req">*</em>' : ''}</span>
      ${ctrl}
      ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}
    </label>`;
  }).join('');
}

export function formValues(form) {
  const out = {};
  new FormData(form).forEach((v, k) => { out[k] = typeof v === 'string' ? v.trim() : v; });
  return out;
}
