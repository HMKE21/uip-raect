import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import Icon from '../../Icon';
import { ConfirmModal } from '../adminUi';
import { Skeleton } from '../AdminPage';
import { BASE, GROUP_META, ROLE_LABELS, SETTING_META, Switch, useBanner, useL } from './shared';

const UNIT = { min: ['min', 'دقيقة'], sec: ['sec', 'ثانية'], hour: ['hours', 'ساعة'], day: ['days', 'يوم'], KB: ['KB', 'كيلوبايت'] };

/**
 * Renders the settings catalog (GET /control/settings) for the given groups.
 * Used twice: "Features & system" (system + features) and "Rules & limits" (the rest).
 * Everything saves at once with the Save button; each overridden value can be reset on its own.
 */
export default function SettingsTab({ groups }) {
  const { ar, L } = useL();
  const { banner, setNotice, setError, clear } = useBanner();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, message, danger, run }

  const apply = (d) => { setData(d); setDraft({}); };
  const load = useCallback(() => api.get(`${BASE}/settings`).then((j) => apply(j.data)), []);
  useEffect(() => { load().catch((e) => setError(errorMessage(e))).finally(() => setLoading(false)); }, [load, setError]);

  const meta = (k) => data.values[k];
  const val = (k) => (k in draft ? draft[k] : meta(k).value);
  const set = (k, v) => setDraft((d) => {
    const next = { ...d };
    if (JSON.stringify(v) === JSON.stringify(meta(k).value)) delete next[k]; else next[k] = v;
    return next;
  });
  const dirty = Object.keys(draft).length > 0;

  async function run(fn, done) {
    clear();
    try { const j = await fn(); apply(j.data); setNotice(done || j.message); } catch (e) { setError(errorMessage(e)); }
  }

  const keysIn = (g) => (data ? Object.keys(data.values).filter((k) => data.values[k].group === g && data.values[k].type !== 'list_int') : []);

  // Turning the master switch off (or a feature off) asks for confirmation; everything else is just a draft change.
  function toggle(k, v) {
    if (k === 'feature_meetings' && v === false) {
      setConfirm({
        title: L('Turn the whole meetings system off?', 'قفل نظام الاجتماعات بالكامل؟'),
        message: L('Nobody will be able to create, start or join meetings after you save. Meetings already live keep running until you end them from the Meetings tab.', 'محدش هيقدر ينشئ أو يبدأ أو يدخل اجتماعات بعد الحفظ. الاجتماعات الشغالة هتكمل لحد ما تنهيها من تاب الاجتماعات.'),
        danger: true,
        run: () => { set(k, false); setConfirm(null); },
      });
      return;
    }
    set(k, v);
  }

  async function save() {
    setSaving(true);
    await run(() => api.put(`${BASE}/settings`, { values: draft }), L('Settings saved. They apply immediately.', 'تم الحفظ. التغيير بيسري فورًا.'));
    setSaving(false);
  }

  const resetOne = (k) => run(() => api.put(`${BASE}/settings`, { values: { [k]: null } }), L('Reset to default.', 'تم الرجوع للافتراضي.'));

  function resetAll() {
    setConfirm({
      title: L('Reset ALL meeting settings?', 'إرجاع كل إعدادات الاجتماعات للافتراضي؟'),
      message: L('Every override (including the block list) goes back to the default values.', 'كل التعديلات (بما فيها قايمة الحظر) هترجع للقيم الافتراضية.'),
      danger: true,
      run: async () => { setConfirm(null); setSaving(true); await run(() => api.del(`${BASE}/settings`)); setSaving(false); },
    });
  }

  function renderControl(k) {
    const m = meta(k);
    const v = val(k);
    if (m.type === 'bool') {
      return <Switch id={`mtc-${k}`} checked={!!v} onChange={(x) => toggle(k, x)} label={(SETTING_META[k] || {}).en} />;
    }
    if (m.type === 'int') {
      const u = UNIT[(SETTING_META[k] || {}).unit];
      return (
        <div className="mtc-inline">
          <input id={`mtc-${k}`} className="form-input mtc-num" type="number" min={m.min} max={m.max} value={v}
            onChange={(e) => set(k, e.target.value === '' ? '' : Number(e.target.value))} />
          {u && <span className="mtc-muted">{ar ? u[1] : u[0]}</span>}
          <span className="mtc-muted mtc-range">{m.min}–{m.max}</span>
        </div>
      );
    }
    if (m.type === 'string') {
      return <input id={`mtc-${k}`} className="form-input" maxLength={m.max_length || 300} value={v} onChange={(e) => set(k, e.target.value)} />;
    }
    // list_str = roles
    const roles = data.available_roles || [];
    return (
      <div className="mtc-checks">
        {roles.map((r) => {
          const on = (v || []).includes(r);
          const lbl = ROLE_LABELS[r] ? ROLE_LABELS[r][ar ? 1 : 0] : r;
          return (
            <label key={r} className={`mtc-check${on ? ' is-on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => set(k, on ? v.filter((x) => x !== r) : [...v, r])} /> {lbl}
            </label>
          );
        })}
      </div>
    );
  }

  function defaultText(k) {
    const m = meta(k);
    if (m.type === 'bool') return m.default ? L('On', 'مفعّل') : L('Off', 'مقفول');
    if (m.type === 'list_str') return (m.default || []).length ? m.default.join(', ') : L('Everyone', 'الكل');
    return m.default === '' ? L('empty', 'فاضي') : String(m.default);
  }

  if (loading || !data) return <>{banner}<Skeleton rows={6} cols={3} /></>;

  const master = groups.includes('system') && meta('feature_meetings');
  const masterOn = master ? !!val('feature_meetings') : true;

  return (
    <div className="mtc-stack">
      {banner}
      {master && !masterOn && (
        <div className="st-alert st-alert--danger mtc-banner"><Icon name="alert-triangle" size={16} /><span>{L('The meetings system is OFF (after you save).', 'نظام الاجتماعات مقفول (بعد ما تحفظ).')}</span></div>
      )}

      <div className="mtc-savebar">
        <span className="mtc-muted">{dirty ? L(`${Object.keys(draft).length} unsaved change(s)`, `${Object.keys(draft).length} تغيير غير محفوظ`) : L('All changes saved', 'مفيش تغييرات غير محفوظة')}</span>
        <div className="mtc-actions">
          <button type="button" className="btn btn-outline btn-sm" disabled={saving} onClick={resetAll}><Icon name="refresh" size={14} /> {L('Reset all to default', 'إرجاع الكل للافتراضي')}</button>
          {dirty && <button type="button" className="btn btn-outline btn-sm" disabled={saving} onClick={() => setDraft({})}>{L('Discard', 'تجاهل')}</button>}
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || saving} onClick={save}><Icon name="check" size={14} /> {saving ? L('Saving…', 'جارٍ الحفظ…') : L('Save', 'حفظ')}</button>
        </div>
      </div>

      {groups.map((g) => {
        const keys = keysIn(g);
        if (!keys.length) return null;
        const gm = GROUP_META[g];
        return (
          <section className="sa-card mtc-card" key={g}>
            <h2 className="mtc-card__title"><Icon name={gm.icon} size={16} /> {ar ? gm.ar : gm.en}</h2>
            <div className="mtc-settings">
              {keys.map((k) => {
                const sm = SETTING_META[k] || { en: k, ar: k };
                const m = meta(k);
                const changed = k in draft;
                const wide = m.type === 'string' || m.type === 'list_str';
                return (
                  <div key={k} className={`mtc-setting${wide ? ' mtc-setting--wide' : ''}${changed ? ' is-changed' : ''}`}>
                    <div className="mtc-setting__text">
                      <label htmlFor={`mtc-${k}`} className="mtc-setting__label">{ar ? sm.ar : sm.en}</label>
                      {(ar ? sm.hint_ar : sm.hint_en) && <small className="mtc-muted">{ar ? sm.hint_ar : sm.hint_en}</small>}
                      {m.overridden && !changed && (
                        <button type="button" className="mtc-link" onClick={() => resetOne(k)}>
                          <Icon name="refresh" size={11} /> {L('Default', 'الافتراضي')}: {defaultText(k)}
                        </button>
                      )}
                    </div>
                    <div className="mtc-setting__control">{renderControl(k)}</div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {confirm && <ConfirmModal title={confirm.title} message={confirm.message} danger={confirm.danger} onConfirm={confirm.run} onClose={() => setConfirm(null)} />}
    </div>
  );
}
