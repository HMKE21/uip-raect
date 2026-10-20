import { useEffect, useState } from 'react';
import { Btn } from './EditorUI';
import '../../styles/css/editor.css';
import '../../styles/css/office.css';

/**
 * Shared frame for the Office editors: title, save / download / cancel, unsaved-changes guard and 409 conflict handling.
 *   build() -> Promise<Blob>   (called for both Save and Download)
 */
export default function OfficeShell({ fileName, tt, guardRef, onSave, onClose, dirty, build, onSaved, tools, children, status }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [conflict, setConflict] = useState(false);
  const ask = () => window.confirm(tt('Discard your unsaved changes?', 'تتجاهل التعديلات اللي لسه ما اتحفظتش؟'));

  useEffect(() => {
    if (!guardRef) return undefined;
    guardRef.current = () => !dirty || ask();
    return () => { guardRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, guardRef]);
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const doSave = async (force) => {
    if (saving) return;
    setSaving(true); setErr(''); setConflict(false);
    try {
      const out = await build();
      await onSave(out, { name: fileName, force: force === true });
      onSaved?.();
    } catch (e) { if (e?.status === 409) setConflict(true); else setErr(e?.message || String(e)); } finally { setSaving(false); }
  };
  const download = async () => {
    try {
      const out = await build();
      const a = document.createElement('a'); a.href = URL.createObjectURL(out); a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { setErr(e?.message || String(e)); }
  };

  return (
    <div className="ed ed--office">
      <div className="ed__top">
        <Btn icon="x" label={tt('Cancel', 'إلغاء')} onClick={() => { if (!dirty || ask()) onClose(); }} />
        <strong className="ed__title" dir="auto">{fileName}</strong>
        {dirty && <span className="ed__pagecount">●&nbsp;{tt('unsaved', 'غير محفوظ')}</span>}
        <span className="ed__sp" />
        {conflict && (
          <span className="ed__warn">{tt('A newer version was saved by someone else.', 'حد تاني حفظ نسخة أحدث.')}
            <Btn label={tt('Save over it', 'احفظ فوقها')} onClick={() => doSave(true)} /></span>
        )}
        {err && <span className="ed__err" title={err}>{err}</span>}
        <Btn icon="download" label={tt('Download', 'تنزيل')} onClick={download} />
        <Btn icon="save" label={saving ? tt('Saving…', 'جارٍ الحفظ…') : tt('Save', 'حفظ')} onClick={() => doSave(false)} disabled={!dirty || saving} primary />
      </div>
      {tools}
      <div className="ed__office-body">{children}</div>
      {status}
    </div>
  );
}
