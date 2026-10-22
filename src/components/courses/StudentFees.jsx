import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import Icon from '../Icon';
import { useLanguage } from '../../context/LanguageContext';
import { EmptyState, Skeleton } from '../student/stUi';
import { downloadAuthed } from '../../lib/download';

/**
 * المصاريف (الطالب): المستحقات، المتبقي، وإخطار الدفع (مرجع التحويل) اللي الإدارة بتأكّده، وتحميل إيصال PDF لكل دفعة مؤكَّدة.
 * مفيش دفع أونلاين: الطالب بيحوّل/يدفع بره المنصة ويبعت المرجع هنا.
 * Backend: GET /api/v1/fees/mine · POST /api/v1/fees/{id}/notice · DELETE /api/v1/fees/notices/{id} · GET /api/v1/fees/payments/{id}/receipt.
 */

export const FEE_STATUS = {
  unpaid: ['غير مسدّد', 'Unpaid', 'warning'],
  partial: ['مسدّد جزئياً', 'Partially paid', ''],
  paid: ['مسدّد', 'Paid', 'success'],
  waived: ['معفي', 'Waived', 'neutral'],
};
export const PAY_STATUS = {
  pending: ['قيد المراجعة', 'Pending', ''],
  confirmed: ['مؤكَّدة', 'Confirmed', 'success'],
  rejected: ['مرفوضة', 'Rejected', 'warning'],
};
export const METHODS = {
  bank_transfer: ['تحويل بنكي', 'Bank transfer'],
  cash: ['نقدي', 'Cash'],
  card: ['بطاقة', 'Card'],
  other: ['أخرى', 'Other'],
};
export const KINDS = {
  tuition: ['مصروفات دراسية', 'Tuition'],
  registration: ['رسوم تسجيل', 'Registration'],
  service: ['خدمات', 'Service'],
  other: ['أخرى', 'Other'],
};
export const money = (n, cur = 'EGP') => `${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
const fmt = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '');

export default function StudentFees() {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [form, setForm] = useState({ amount: '', reference: '', method: 'bank_transfer', note: '' });

  const load = useCallback(() => api.get('/api/v1/fees/mine', { locale }).then((j) => setData(j.data || { summary: {}, fees: [] })), [locale]);
  useEffect(() => { load().catch((e) => setError(errorMessage(e))); }, [load]);

  const run = async (fn) => {
    setBusy(true); setError(null); setNotice(null);
    try { const j = await fn(); setNotice(j?.message || null); await load(); return true; } catch (e) { setError(errorMessage(e)); return false; } finally { setBusy(false); }
  };

  const openPay = (f) => {
    const pending = f.payments.filter((p) => p.status === 'pending').reduce((a, p) => a + p.amount, 0);
    setPayFor(f.id);
    setForm({ amount: String(Math.max(0, f.balance - pending).toFixed(2)), reference: '', method: 'bank_transfer', note: '' });
  };
  const submit = async (e, f) => {
    e.preventDefault();
    if (await run(() => api.post(`/api/v1/fees/${f.id}/notice`, { ...form, amount: Number(form.amount), locale }))) setPayFor(null);
  };
  const receipt = (p) => downloadAuthed(`/api/v1/fees/payments/${p.id}/receipt`, `${p.receipt_no}.pdf`, { locale }).catch((e) => setError(errorMessage(e)));

  const s = data?.summary || {};
  const cur = data?.fees?.[0]?.currency || 'EGP';

  return (
    <div className="ex-page">
      <div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{ar ? 'المصاريف' : 'Fees'}</h1>
        <p className="is-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {ar ? 'ادفع من خلال قنوات الجامعة (تحويل بنكي أو الخزينة)، ثم أرسل رقم المرجع هنا ليتم تأكيد الدفعة وإصدار الإيصال.' : 'Pay through the university channels (bank transfer or cashier), then send the reference here so the payment is confirmed and a receipt issued.'}
        </p>
      </div>
      {error && <div className="st-alert st-alert--danger"><Icon name="alert-triangle" size={16} /><span>{error}</span></div>}
      {notice && <div className="st-alert st-alert--success"><Icon name="check-circle" size={16} /><span>{notice}</span></div>}

      {!data && !error ? <Skeleton h={90} count={3} /> : data && (
        <>
          <div className="st-grid st-grid--3">
            <div className="st-kpi"><span className="st-kpi__label">{ar ? 'المتبقي عليك' : 'Balance due'}</span><span className="st-kpi__value">{money(s.total_due, cur)}</span></div>
            <div className="st-kpi"><span className="st-kpi__label">{ar ? 'المدفوع' : 'Paid'}</span><span className="st-kpi__value">{money(s.paid, cur)}</span></div>
            <div className="st-kpi"><span className="st-kpi__label">{ar ? 'متأخرة' : 'Overdue'}</span><span className="st-kpi__value">{s.overdue || 0}</span></div>
          </div>

          {data.fees.length === 0 ? (
            <div className="ex-card"><EmptyState icon="dollar" title={ar ? 'لا توجد مصروفات مستحقة' : 'No fees issued to you'} /></div>
          ) : data.fees.map((f) => {
            const st = FEE_STATUS[f.status] || FEE_STATUS.unpaid;
            const canPay = (f.status === 'unpaid' || f.status === 'partial');
            return (
              <div className="ex-card" key={f.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <b>{f.name}</b>
                    <div className="is-muted" style={{ fontSize: 12 }}>
                      {ar ? KINDS[f.kind]?.[0] : KINDS[f.kind]?.[1]}{f.due_on ? ` · ${ar ? 'الاستحقاق' : 'Due'} ${f.due_on}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {f.overdue && <span className="st-pill st-pill--warning">{ar ? 'متأخر' : 'Overdue'}</span>}
                    <span className={`st-pill${st[2] ? ` st-pill--${st[2]}` : ''}`}>{ar ? st[0] : st[1]}</span>
                    {canPay && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => (payFor === f.id ? setPayFor(null) : openPay(f))}>{ar ? 'إرسال إخطار دفع' : 'Send payment notice'}</button>}
                  </div>
                </div>
                <div className="att-nums" style={{ marginTop: 8 }}>
                  <span>{ar ? 'الإجمالي' : 'Total'} <b>{money(f.amount, f.currency)}</b></span>
                  <span>{ar ? 'المدفوع' : 'Paid'} <b>{money(f.paid, f.currency)}</b></span>
                  <span>{ar ? 'المتبقي' : 'Balance'} <b>{money(f.balance, f.currency)}</b></span>
                </div>
                {f.status === 'waived' && f.waive_note && <div className="is-muted" style={{ fontSize: 12, marginTop: 6 }}>{ar ? 'سبب الإعفاء: ' : 'Waiver reason: '}{f.waive_note}</div>}

                {payFor === f.id && (
                  <form onSubmit={(e) => submit(e, f)} style={{ display: 'grid', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle, #e5e7eb)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                      <input className="input" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={ar ? 'المبلغ' : 'Amount'} />
                      <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                        {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{ar ? v[0] : v[1]}</option>)}
                      </select>
                      <input className="input" required maxLength={120} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder={ar ? 'رقم مرجع التحويل / الإيصال' : 'Transfer / receipt reference'} />
                    </div>
                    <textarea className="input" rows={2} maxLength={2000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={ar ? 'ملاحظات (اختياري)' : 'Notes (optional)'} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{ar ? 'إرسال' : 'Send'}</button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setPayFor(null)}>{ar ? 'إلغاء' : 'Cancel'}</button>
                    </div>
                  </form>
                )}

                {f.payments.length > 0 && (
                  <div className="ex-table-wrap" style={{ marginTop: 12 }}>
                    <table className="ex-table">
                      <thead><tr><th>{ar ? 'التاريخ' : 'Date'}</th><th>{ar ? 'المبلغ' : 'Amount'}</th><th>{ar ? 'الطريقة' : 'Method'}</th><th>{ar ? 'المرجع' : 'Reference'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th /></tr></thead>
                      <tbody>
                        {f.payments.map((p) => {
                          const ps = PAY_STATUS[p.status] || PAY_STATUS.pending;
                          return (
                            <tr key={p.id}>
                              <td>{fmt(p.created_at)}</td><td>{money(p.amount, f.currency)}</td>
                              <td>{ar ? METHODS[p.method]?.[0] : METHODS[p.method]?.[1]}</td><td>{p.reference || '—'}</td>
                              <td>
                                <span className={`st-pill${ps[2] ? ` st-pill--${ps[2]}` : ''}`}>{ar ? ps[0] : ps[1]}</span>
                                {p.status === 'rejected' && p.decision_note && <div className="is-muted" style={{ fontSize: 11 }}>{p.decision_note}</div>}
                              </td>
                              <td style={{ textAlign: 'end' }}>
                                {p.status === 'confirmed' && p.receipt_no && <button type="button" className="btn btn-outline btn-sm" onClick={() => receipt(p)}><Icon name="download" size={14} /> {ar ? 'الإيصال' : 'Receipt'}</button>}
                                {p.status === 'pending' && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => api.delete(`/api/v1/fees/notices/${p.id}`, { locale }))}>{ar ? 'سحب' : 'Withdraw'}</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
