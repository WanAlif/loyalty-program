import { useEffect, useState } from 'react';
import { api, apiErrorMessage, type Receipt } from '../api/client';
import { Header } from '../components/Header';

const TABS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
type Tab = (typeof TABS)[number];

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('PENDING');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadReceipts(status: Tab) {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/receipts', { params: { status } });
      setReceipts(res.data.receipts);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReceipts(tab);
  }, [tab]);

  async function handleApprove(id: string) {
    setActionError('');
    setBusyId(id);
    try {
      await api.post(`/admin/receipts/${id}/approve`);
      await loadReceipts(tab);
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    const reason = window.prompt('Reason for rejection (optional):') ?? undefined;
    setActionError('');
    setBusyId(id);
    try {
      await api.post(`/admin/receipts/${id}/reject`, reason ? { reason } : {});
      await loadReceipts(tab);
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <Header />
      <main className="container">
        <h1>Admin: receipt review</h1>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'tab tab-active' : 'tab'} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {actionError && <p className="form-error">{actionError}</p>}
        {error && <p className="form-error">{error}</p>}
        {loading && <p>Loading...</p>}
        {!loading && receipts.length === 0 && <p className="empty-state">No {tab.toLowerCase()} receipts.</p>}

        {receipts.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Order ID</th>
                <th>Amount</th>
                <th>Receipt</th>
                <th>Submitted</th>
                {tab === 'PENDING' && <th>Actions</th>}
                {tab === 'REJECTED' && <th>Reason</th>}
                {tab === 'APPROVED' && <th>Voucher</th>}
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.user?.name}
                    <br />
                    <span className="muted">{r.user?.email ?? r.user?.phone}</span>
                  </td>
                  <td>{r.orderId}</td>
                  <td>RM {Number(r.amount).toFixed(2)}</td>
                  <td>
                    <a href={`http://localhost:5000${r.fileUrl}`} target="_blank" rel="noreferrer">
                      View file
                    </a>
                  </td>
                  <td>{new Date(r.submittedAt).toLocaleDateString()}</td>
                  {tab === 'PENDING' && (
                    <td className="actions">
                      <button onClick={() => handleApprove(r.id)} disabled={busyId === r.id}>
                        Approve
                      </button>
                      <button onClick={() => handleReject(r.id)} disabled={busyId === r.id} className="btn-danger">
                        Reject
                      </button>
                    </td>
                  )}
                  {tab === 'REJECTED' && <td>{r.rejectionReason ?? '-'}</td>}
                  {tab === 'APPROVED' && (
                    <td className="voucher-code">{r.voucher?.code ?? '-'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
