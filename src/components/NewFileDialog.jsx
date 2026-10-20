import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { errorMessage } from '../api/client';
import { drive } from '../lib/driveApi';
import { NEW_GROUPS, NEW_TYPES, cleanName, createFile, defaultName, typeById } from '../lib/officeFmt/create';
import '../styles/css/new-file.css';

/**
 * "New file" dialog — pick a type (Word, Excel, PowerPoint, PDF, CSV, Markdown, image, code…), a starter template and a name;
 * the file is built in the browser, saved into My PC (`parentId`, null = the root) and handed to `onCreated(node)` so the caller can
 * open it in the matching editor straight away.
 *
 *   <NewFileDialog locale="ar" parentId={folderId} onClose={() => …} onCreated={(node) => open(node)} />
 *   `kinds` (optional): only these type ids, e.g. ['docx','xlsx','pptx','pdf']
 */
export default function NewFileDialog({ locale = 'en', parentId = null, kinds, initialType = 'docx', onClose, onCreated }) {
  const ar = locale === 'ar';
  const tt = useCallback((en, a) => (ar ? a : en), [ar]);
  const types = useMemo(() => (kinds ? NEW_TYPES.filter((t) => kinds.includes(t.id)) : NEW_TYPES), [kinds]);
  const startType = types.some((t) => t.id === initialType) ? initialType : types[0]?.id;
  const [type, setType] = useState(startType);
  const [template, setTemplate] = useState(typeById(startType)?.templates[0].id);
  const [name, setName] = useState(() => defaultName(startType, locale).replace(/\.[^.]+$/, ''));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef(null);
  const t = typeById(type);

  const pick = (id) => {
    setType(id); setTemplate(typeById(id).templates[0].id); setError('');
    if (!touched) setName(defaultName(id, locale).replace(/\.[^.]+$/, ''));
  };

  useEffect(() => { const el = nameRef.current; if (el) { el.focus(); el.select(); } }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose?.(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onClose]);

  const submit = async () => {
    if (busy || !t) return;
    const clean = cleanName(name);
    if (!clean) { setError(tt('Type a file name.', 'اكتب اسم الملف.')); return; }
    setBusy(true); setError('');
    try {
      const file = await createFile({ type, template, name: clean, locale });
      const res = await drive.upload(parentId, file);
      const node = res?.data?.items?.[0] ?? res?.items?.[0];
      if (!node) throw new Error(res?.data?.failed?.[0]?.message || tt('The file could not be saved.', 'تعذّر حفظ الملف.'));
      window.dispatchEvent(new Event('uip-drive-changed'));
      onCreated?.(node);
      onClose?.();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="nf-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className="nf" role="dialog" aria-modal="true" aria-label={tt('New file', 'ملف جديد')} dir={ar ? 'rtl' : 'ltr'} onPointerDown={(e) => e.stopPropagation()}>
        <header className="nf__head">
          <h3>{tt('Create a new file', 'إنشاء ملف جديد')}</h3>
          <button type="button" className="nf__x" onClick={onClose} disabled={busy} aria-label={tt('Close', 'إغلاق')}><Icon name="x" size={16} /></button>
        </header>

        <div className="nf__body">
          <div className="nf__types" role="listbox" aria-label={tt('File type', 'نوع الملف')}>
            {NEW_GROUPS.map((g) => {
              const items = types.filter((x) => x.group === g.id);
              if (!items.length) return null;
              return (
                <section key={g.id}>
                  <h4>{ar ? g.label.ar : g.label.en}</h4>
                  <div className="nf__grid">
                    {items.map((x) => (
                      <button key={x.id} type="button" role="option" aria-selected={x.id === type} className={x.id === type ? 'is-on' : ''} style={{ '--k': x.color }} onClick={() => pick(x.id)} onDoubleClick={submit} disabled={busy}>
                        <span className="nf__badge">{x.ext.toUpperCase()}</span>
                        <span className="nf__lbl"><b>{ar ? x.label.ar : x.label.en}</b><small>{ar ? x.hint.ar : x.hint.en}</small></span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {t && (
            <div className="nf__side">
              <label className="nf__field"><span>{tt('File name', 'اسم الملف')}</span>
                <span className="nf__name">
                  <input ref={nameRef} value={name} maxLength={120} dir="auto" onChange={(e) => { setName(e.target.value); setTouched(true); }} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} disabled={busy} />
                  <em dir="ltr">.{t.ext}</em>
                </span>
              </label>
              <div className="nf__field">
                <span>{tt('Start from', 'ابدأ من')}</span>
                <div className="nf__tpls" role="radiogroup">
                  {t.templates.map((x) => (
                    <button key={x.id} type="button" role="radio" aria-checked={x.id === template} className={x.id === template ? 'is-on' : ''} onClick={() => setTemplate(x.id)} disabled={busy}>
                      <i aria-hidden="true" />{ar ? x.label.ar : x.label.en}
                    </button>
                  ))}
                </div>
              </div>
              <p className="nf__note">{tt('It is saved in My PC and opens in the editor — you can edit it, then Save.', 'بيتحفظ في جهازي وبيتفتح في المحرر — تعدّل عليه وتدوس حفظ.')}</p>
            </div>
          )}
        </div>

        {error && <p className="nf__err" role="alert"><Icon name="alert-triangle" size={15} />{error}</p>}
        <footer className="nf__foot">
          <button type="button" className="nf__btn" onClick={onClose} disabled={busy}>{tt('Cancel', 'إلغاء')}</button>
          <button type="button" className="nf__btn nf__btn--primary" onClick={submit} disabled={busy || !cleanName(name)}>
            {busy ? <><span className="nf__spin" />{tt('Creating…', 'جارٍ الإنشاء…')}</> : tt('Create & open', 'إنشاء وفتح')}
          </button>
        </footer>
      </div>
    </div>
  );
}
