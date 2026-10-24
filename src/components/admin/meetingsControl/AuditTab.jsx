import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import { Pager } from '../adminUi';
import { ErrorState, EmptyState, Skeleton } from '../AdminPage';
import { BASE, fmtDate, useL } from './shared';

const PER = 30;

export default function AuditTab() {
  const { ar, L } = useL();
  const [scope, setScope] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    return api.get(`${BASE}/audit`, { page, per_page: PER, action: scope || undefined })
      .then((j) => { setRows(j.data.items); setTotal(j.data.meta.total); })
      .catch((e) => setErr(errorMessage(e)));
  }, [page, scope]);
  useEffect(() => { load(); }, [load]);

  if (err) return <ErrorState error={err} onRetry={load} />;

  return (
    <div className="mtc-stack">
      <div className="adm-filters">
        <select className="form-select" value={scope} onChange={(e) => { setScope(e.target.value); setPage(1); }}>
          <option value="">{L('All meeting activity', 'كل نشاط الاجتماعات')}</option>
          <option value="admin.meetings.">{L('Admin actions only', 'إجراءات الأدمن فقط')}</option>
          <option value="meetings.">{L('User activity only', 'نشاط المستخدمين فقط')}</option>
        </select>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>{L('Refresh', 'تحديث')}</button>
      </div>
      {!rows ? <Skeleton rows={8} cols={4} /> : rows.length === 0 ? <EmptyState icon="inbox" title={L('No activity yet', 'مفيش نشاط بعد')} /> : (
        <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr><th>{L('When', 'الوقت')}</th><th>{L('Who', 'مين')}</th><th>{L('Action', 'الإجراء')}</th><th>{L('Target', 'الهدف')}</th><th>{L('Details', 'تفاصيل')}</th></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id}>
              <td>{fmtDate(a.created_at, ar)}</td>
              <td>{a.user_name || (a.user_id ? `#${a.user_id}` : '—')}</td>
              <td><span className={`badge ${a.action.startsWith('admin.') ? 'badge-primary' : 'badge-neutral'}`}>{a.action}</span></td>
              <td>{a.subject_type ? `${a.subject_type} #${a.subject_id ?? ''}` : '—'}</td>
              <td>{(a.old_values || a.new_values) ? <button type="button" className="mtc-link" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? L('Hide', 'إخفاء') : L('Show', 'عرض')}</button> : '—'}
                {open === a.id && <pre className="mtc-json" dir="ltr">{JSON.stringify({ before: a.old_values, after: a.new_values }, null, 2)}</pre>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Pager page={page} setPage={setPage} total={total} perPage={PER} />
    </div>
  );
}
