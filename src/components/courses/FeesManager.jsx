import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import Icon from '../Icon';
import { useLanguage } from '../../context/LanguageContext';
import { EmptyState, Skeleton } from '../student/stUi';
import { downloadAuthed } from '../../lib/download';
import { FEE_STATUS, KINDS, METHODS, money } from './StudentFees';

/**
 * المصاريف (الجامعة / الكلية): بنود الرسوم وإصدارها لكل طلاب النطاق، سجل المستحقات، تأكيد/رفض إخطارات الدفع،
 * تسجيل دفعة مباشرة (كاش/تحويل)، الإعفاء، وإيصال PDF. الجامعة بتشوف كل شيء، والكلية بتشوف بنودها وطلابها بس.
 * Backend: /api/v1/fees/items (+ /{id}/issue) · /ledger (+ /{id}/payments, /{id}/waive) · /payments/{id}/confirm|reject|receipt.
 */

const EMPTY = { name: '', kind: 'tuition', amount: '', due_on: '' };

export default function FeesManager({ role = 'university' }) {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const [tab, setTab] = useState('ledger');
  const [items, setItems] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState({ status: '', item_id: '', q: '', overdue: false });
  const [rowOpen, setRowOpen] = useState(null);
  const [pay, setPay] = useState({ amount: '', method: 'cash', reference: '', note: '' });
  const [notes, setNotes] = useState({});

  const loadItems = useCallback(() => api.get('/api/v1/fees/items', { locale }).then((j) => setItems(j.data || [])), [locale]);
  const loadLedger = useCallback(() => api.get('/api/v1/fees/ledger', {
    locale, ...(filter.status ? { status: filter.status } : {}), ...(filter.item_id ? { item_id: filter.item_id } : {}),
    ...(filter.q.trim() ? { q: filter.q.trim() } : {}), ...(filter.overdue ? { overdue: 1 } : {}),
  }).then((j) => setLedger(j.data || [])), [locale, filter]);

  useEffect(() => { loadItems().catch((e) => setError(errorMessage(e))); }, [loadItems]);
  useEffect(() => { loadLedger().catch((e) => setError(errorMessage(e))); }, [loadLedger]);

  const run = async (fn) => {
    setBusy(true); setError(null); setNotice(null);
    try { const j = await fn(); setNotice(j?.message || null); await Promise.all([loadItems(), loadLedger()]); return true; } catch (e) { setError(errorMessage(e)); return false; } finally { setBusy(false); }
  };

  const startEdit = (it) => {
    if (!it) { setEditing('new'); setForm(EMPTY); return; }
    setEditing(it.id); setForm({ name: it.name, kind: it.kind, amount: String(it.amount), due_on: it.due_on || '' });
  };
  const saveItem = async (e) => {
    e.preventDefault();
    const body = { ...form, amount: Number(form.amount), due_on: form.due_on || null, locale };
    const ok = await run(() => (editing === 'new' ? api.post('/api/v1/fees/items', body) : api.put(`/api/v1/fees/items/${editing}`, body)));
    if (ok) setEditing(null);
  };
  const issue = (it) => {
    const msg = ar ? `إصدار "${it.name}" لكل الطلاب المستهدفين؟` : `Issue "${it.name}" to all targeted students?`;
    if (window.confirm(msg)) run(() => api.post(`/api/v1/fees/items/${it.id}/issue`, { locale }));
  };
  const removeItem = (it) => {
    if (window.confirm(ar ? `حذف البند "${it.name}"؟` : `Delete "${it.name}"?`)) run(() => api.delete(`/api/v1/fees/items/${it.id}`, { locale }));
  };
  const openRow = (r) => {
    if (rowOpen === r.id) { setRowOpen(null); return; }
    setRowOpen(r.id); setPay({ amount: String(r.balance.toFixed(2)), method: 'cash', reference: '', note: '' });
  };
  const record = (r) => run(() => api.post(`/api/v1/fees/ledger/${r.id}/payments`, { ...pay, amount: Number(pay.amount), locale }));
  const waive = (r) => {
    const note = (notes[r.id] || '').trim();
    if (!note) { setError(ar ? 'اكتب سبب الإعفاء.' : 'Please give a reason for the waiver.'); return; }
    run(() => api.post(`/api/v1/fees/ledger/${r.id}/waive`, { note, locale }));
  };
  const decide = (p, what) => {
    const note = (notes[`p${p.id}`] || '').trim();
    if (what === 'reject' && !note) { setError(ar ? 'اكتب سبب الرفض.' : 'Please give a reason for the rejection.'); return; }
    run(() => api.post(`/api/v1/fees/payments/${p.id}/${what}`, { note, locale }));
  };
  const receipt = (p) => downloadAuthed(`/api/v1/fees/payments/${p.id}/receipt`, `${p.receipt_no}.pdf`, { locale }).catch((e) => setError(errorMessage(e)));

  const pendingCount = (ledger || []).reduce((a, r) => a + r.pending_payments.length, 0);
  const totals = (items || []).reduce((a, i) => ({ total: a.total + i.total, collected: a.collected + i.collected }), { total: 0, collected: 0 });

  return (
    <div className="ex-page">
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{ar ? 'المصاريف' : 'Fees'}</h1>
        <p className="is-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {role === 'faculty'
            ? (ar ? 'أضف بنود رسوم لطلاب كليتك، أصدرها، وراجع إخطارات الدفع وسجّل الدفعات.' : "Define fee items for your faculty's students, issue them, review payment notices and record payments.")
            : (ar ? 'أضف بنود رسوم للجامعة كلها، أصدرها للطلاب، وراجع إخطارات الدفع وسجّل الدفعات.' : 'Define university-wide fee items, issue them to students, review payment notices and record payments.')}
        </p>
      </div>
      {error && <div className="st-alert st-alert--danger"><Icon name="alert-triangle" size={16} /><span>{error}</span></div>}
      {notice && <div className="st-alert st-alert--success"><Icon name="check-circle" size={16} /><span>{notice}</span></div>}

      <div className="st-grid st-grid--3">
        <div className="st-kpi"><span className="st-kpi__label">{ar ? 'إجمالي المُصدَر' : 'Total issued'}</span><span className="st-kpi__value">{money(totals.total)}</span></div>
        <div className="st-kpi"><span className="st-kpi__label">{ar ? 'المُحصَّل' : 'Collected'}</span><span className="st-kpi__value">{money(totals.collected)}</span></div>
        <div className="st-kpi"><span className="st-kpi__label">{ar ? 'إخطارات بانتظار المراجعة' : 'Notices to review'}</span><span className="st-kpi__value">{pendingCount}</span></div>
      </div>

      <div className="ex-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'ledger'} className={`ex-tab${tab === 'ledger' ? ' is-active' : ''}`} onClick={() => setTab('ledger')}>{ar ? 'مستحقات الطلاب' : 'Student ledger'}{pendingCount > 0 && <small>({pendingCount})</small>}</button>
        <button type="button" role="tab" aria-selected={tab === 'items'} className={`ex-tab${tab === 'items' ? ' is-active' : ''}`} onClick={() => setTab('items')}>{ar ? 'بنود الرسوم' : 'Fee items'}</button>
      </div>

      {tab === 'items' && (
        <div className="ex-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <b>{ar ? 'بنود الرسوم' : 'Fee items'}</b>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => startEdit(null)}><Icon name="plus" size={14} /> {ar ? 'بند جديد' : 'New item'}</button>
          </div>

          {editing !== null && (
            <form onSubmit={saveItem} style={{ display: 'grid', gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-subtle, #e5e7eb)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <input className="input" required maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={ar ? 'اسم البند' : 'Item name'} />
                <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{ar ? v[0] : v[1]}</option>)}
                </select>
                <input className="input" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={ar ? 'المبلغ' : 'Amount'} />
                <input className="input" type="date" value={form.due_on} onChange={(e) => setForm({ ...form, due_on: e.target.value })} aria-label={ar ? 'تاريخ الاستحقاق' : 'Due date'} />
              </div>
              {editing !== 'new' && <div className="is-muted" style={{ fontSize: 12 }}>{ar ? 'تعديل المبلغ لا يغيّر المستحقات المُصدَرة بالفعل.' : 'Changing the amount does not affect fees already issued.'}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{ar ? 'حفظ' : 'Save'}</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>{ar ? 'إلغاء' : 'Cancel'}</button>
              </div>
            </form>
          )}

          {!items && !error ? <Skeleton h={50} count={3} /> : items && items.length === 0 ? <EmptyState icon="dollar" title={ar ? 'لا توجد بنود رسوم' : 'No fee items yet'} /> : items && (
            <div className="ex-table-wrap">
              <table className="ex-table">
                <thead><tr><th>{ar ? 'البند' : 'Item'}</th><th>{ar ? 'النوع' : 'Type'}</th><th>{ar ? 'المبلغ' : 'Amount'}</th><th>{ar ? 'الاستحقاق' : 'Due'}</th><th>{ar ? 'المُصدَر' : 'Issued'}</th><th>{ar ? 'المسدّدون' : 'Paid'}</th><th>{ar ? 'المُحصَّل' : 'Collected'}</th><th /></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}{role === 'university' && i.faculty_id && <span className="is-muted" style={{ fontSize: 11 }}> · {ar ? 'كلية' : 'Faculty'} #{i.faculty_id}</span>}</td>
                      <td>{ar ? KINDS[i.kind]?.[0] : KINDS[i.kind]?.[1]}</td>
                      <td>{money(i.amount, i.currency)}</td><td>{i.due_on || '—'}</td>
                      <td>{i.issued}</td><td>{i.paid_students}</td><td>{money(i.collected, i.currency)}</td>
                      <td style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => issue(i)}>{ar ? 'إصدار' : 'Issue'}</button>{' '}
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => startEdit(i)}>{ar ? 'تعديل' : 'Edit'}</button>{' '}
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => removeItem(i)}>{ar ? 'حذف' : 'Delete'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'ledger' && (
        <div className="ex-card">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <input className="input" style={{ flex: '1 1 200px' }} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder={ar ? 'بحث بالاسم أو الرقم الجامعي' : 'Search name or student number'} />
            <select className="input" style={{ width: 'auto' }} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
              <option value="">{ar ? 'كل الحالات' : 'All statuses'}</option>
              {Object.entries(FEE_STATUS).map(([k, v]) => <option key={k} value={k}>{ar ? v[0] : v[1]}</option>)}
            </select>
            <select className="input" style={{ width: 'auto' }} value={filter.item_id} onChange={(e) => setFilter({ ...filter, item_id: e.target.value })}>
              <option value="">{ar ? 'كل البنود' : 'All items'}</option>
              {(items || []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={filter.overdue} onChange={(e) => setFilter({ ...filter, overdue: e.target.checked })} /> {ar ? 'المتأخرة فقط' : 'Overdue only'}
            </label>
          </div>

          {!ledger && !error ? <Skeleton h={50} count={4} /> : ledger && ledger.length === 0 ? <EmptyState icon="dollar" title={ar ? 'لا توجد مستحقات' : 'No fees found'} /> : ledger && (
            <div style={{ display: 'grid', gap: 10 }}>
              {ledger.map((r) => {
                const st = FEE_STATUS[r.status] || FEE_STATUS.unpaid;
                const settled = r.status === 'paid' || r.status === 'waived';
                return (
                  <div key={r.id} style={{ border: '1px solid var(--border-subtle, #e5e7eb)', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <b>{r.student.name}</b> <span className="is-muted" style={{ fontSize: 12 }}>({r.student.number || '—'})</span>
                        <div style={{ fontSize: 13 }}>{r.name}{r.due_on ? <span className="is-muted" style={{ fontSize: 12 }}> · {ar ? 'الاستحقاق' : 'Due'} {r.due_on}</span> : null}</div>
                        <div className="att-nums"><span>{ar ? 'الإجمالي' : 'Total'} <b>{money(r.amount, r.currency)}</b></span><span>{ar ? 'المدفوع' : 'Paid'} <b>{money(r.paid, r.currency)}</b></span><span>{ar ? 'المتبقي' : 'Balance'} <b>{money(r.balance, r.currency)}</b></span></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {r.overdue && <span className="st-pill st-pill--warning">{ar ? 'متأخر' : 'Overdue'}</span>}
                        <span className={`st-pill${st[2] ? ` st-pill--${st[2]}` : ''}`}>{ar ? st[0] : st[1]}</span>
                        {!settled && <button type="button" className="btn btn-outline btn-sm" onClick={() => openRow(r)}>{ar ? 'تسجيل دفعة / إعفاء' : 'Record / waive'}</button>}
                      </div>
                    </div>

                    {r.pending_payments.map((p) => (
                      <div key={p.id} style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(var(--color-primary-rgb), .06)' }}>
                        <div style={{ fontSize: 13 }}>
                          <b>{ar ? 'إخطار دفع: ' : 'Payment notice: '}{money(p.amount, r.currency)}</b>
                          <span className="is-muted"> · {ar ? METHODS[p.method]?.[0] : METHODS[p.method]?.[1]} · {ar ? 'المرجع' : 'Ref'} {p.reference || '—'}</span>
                        </div>
                        {p.note && <div className="is-muted" style={{ fontSize: 12 }}>{p.note}</div>}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                          <input className="input" style={{ flex: '1 1 200px' }} value={notes[`p${p.id}`] || ''} onChange={(e) => setNotes({ ...notes, [`p${p.id}`]: e.target.value })} placeholder={ar ? 'سبب الرفض (إلزامي عند الرفض)' : 'Reason (required when rejecting)'} />
                          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide(p, 'confirm')}>{ar ? 'تأكيد' : 'Confirm'}</button>
                          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => decide(p, 'reject')}>{ar ? 'رفض' : 'Reject'}</button>
                        </div>
                      </div>
                    ))}

                    {rowOpen === r.id && !settled && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle, #e5e7eb)', display: 'grid', gap: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                          <input className="input" type="number" min="0.01" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder={ar ? 'المبلغ' : 'Amount'} />
                          <select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                            {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{ar ? v[0] : v[1]}</option>)}
                          </select>
                          <input className="input" maxLength={120} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder={ar ? 'المرجع (اختياري)' : 'Reference (optional)'} />
                          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => record(r)}>{ar ? 'تسجيل الدفعة' : 'Record payment'}</button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input className="input" style={{ flex: '1 1 220px' }} value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder={ar ? 'سبب الإعفاء' : 'Waiver reason'} />
                          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => waive(r)}>{ar ? 'إعفاء' : 'Waive'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
