import { useEffect, useState } from 'react';
import { api, apiErrorMessage, type Receipt, type Pagination } from '../api/client';
import { Header } from '../components/Header';
import { useToast } from '../context/ToastContext';

const TABS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const;
type Tab = (typeof TABS)[number];

const PAGE_SIZE = 5;

interface Stats {
  pendingReceipts: number;
  approvedReceipts: number;
  rejectedReceipts: number;
  totalReceipts: number;
  vouchersIssued: number;
}

export function AdminDashboard() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('ALL');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadStats() {
    try {
      const res = await api.get('/admin/stats');
      setStats(res.data.stats);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function loadReceipts(t: Tab, p: number) {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/receipts', {
        params: { ...(t === 'ALL' ? {} : { status: t }), page: p, limit: PAGE_SIZE },
      });
      setReceipts(res.data.receipts);
      setPagination(res.data.pagination);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  // Changing tabs starts back at page 1 — the old page number rarely
  // makes sense against a different, differently-sized filtered list.
  useEffect(() => {
    setPage(1);
  }, [tab]);

  useEffect(() => {
    loadReceipts(tab, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  async function refreshAfterAction() {
    await Promise.all([loadReceipts(tab, page), loadStats()]);
  }

  async function handleApprove(id: string) {
    setActionError('');
    setBusyId(id);
    try {
      await api.post(`/admin/receipts/${id}/approve`);
      await refreshAfterAction();
      showToast('Receipt approved successfully');
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
      await refreshAfterAction();
      showToast('Receipt rejected successfully');
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const tabCounts: Record<Tab, number> = {
    ALL: stats?.totalReceipts ?? 0,
    PENDING: stats?.pendingReceipts ?? 0,
    APPROVED: stats?.approvedReceipts ?? 0,
    REJECTED: stats?.rejectedReceipts ?? 0,
  };

  return (
    <div className="page">
      <Header />
      <main className="container">
        <h1>Admin Dashboard</h1>

        <section className="stats-grid">
          <div className="stat-tile">
            <span className="stat-value">{stats?.pendingReceipts ?? '-'}</span>
            <span className="stat-label">Pending receipts</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{stats?.approvedReceipts ?? '-'}</span>
            <span className="stat-label">Approved receipts</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{stats?.rejectedReceipts ?? '-'}</span>
            <span className="stat-label">Rejected receipts</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{stats?.vouchersIssued ?? '-'}</span>
            <span className="stat-label">Vouchers issued</span>
          </div>
        </section>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'tab tab-active' : 'tab'} onClick={() => setTab(t)}>
              {t.charAt(0) + t.slice(1).toLowerCase()} ({tabCounts[t]})
            </button>
          ))}
        </div>

        <div className="table-area">
          {actionError && <p className="form-error">{actionError}</p>}
          {error && <p className="form-error">{error}</p>}
          {loading && <p>Loading...</p>}
          {!loading && receipts.length === 0 && (
            <p className="empty-state">No {tab === 'ALL' ? '' : tab.toLowerCase() + ' '}receipts.</p>
          )}

          {receipts.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Order ID</th>
                  <th>Receipt ID</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Details</th>
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
                    <td>{r.receiptNumber}</td>
                    <td>RM {Number(r.amount).toFixed(2)}</td>
                    <td>
                      <a href={`http://localhost:5000${r.fileUrl}`} target="_blank" rel="noreferrer">
                        View file
                      </a>
                    </td>
                    <td>{new Date(r.submittedAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                    </td>
                    <td>
                      {r.status === 'PENDING' && (
                        <span className="actions">
                          <button onClick={() => handleApprove(r.id)} disabled={busyId === r.id}>
                            Approve
                          </button>
                          <button onClick={() => handleReject(r.id)} disabled={busyId === r.id} className="btn-danger">
                            Reject
                          </button>
                        </span>
                      )}
                      {r.status === 'REJECTED' && (r.rejectionReason ?? '-')}
                      {r.status === 'APPROVED' && (
                        <span className="voucher-code">{r.voucher?.code ?? '-'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage((p) => p - 1)} disabled={loading || page <= 1}>
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={loading || page >= pagination.totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
