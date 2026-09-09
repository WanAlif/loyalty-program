import { useEffect, useState } from 'react';
import { api, apiErrorMessage, type Receipt, type Pagination } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/Header';

const TABS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const;
type Tab = (typeof TABS)[number];

const PAGE_SIZE = 5;

interface ReceiptStats {
  pendingReceipts: number;
  approvedReceipts: number;
  rejectedReceipts: number;
  totalReceipts: number;
}

interface VoucherStats {
  availableVouchers: number;
  redeemedVouchers: number;
  expiredVouchers: number;
  totalVouchers: number;
}

export function UserDashboard() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [receiptStats, setReceiptStats] = useState<ReceiptStats | null>(null);
  const [voucherStats, setVoucherStats] = useState<VoucherStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [receiptFilter, setReceiptFilter] = useState<Tab>('ALL');

  async function loadStats() {
    try {
      const [receiptStatsRes, voucherStatsRes] = await Promise.all([
        api.get('/receipts/me/stats'),
        api.get('/vouchers/me/stats'),
      ]);
      setReceiptStats(receiptStatsRes.data.stats);
      setVoucherStats(voucherStatsRes.data.stats);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function loadReceipts(t: Tab, p: number) {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/receipts/me', {
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
  }, [receiptFilter]);

  useEffect(() => {
    loadReceipts(receiptFilter, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptFilter, page]);

  const receiptCounts: Record<Tab, number> = {
    ALL: receiptStats?.totalReceipts ?? 0,
    PENDING: receiptStats?.pendingReceipts ?? 0,
    APPROVED: receiptStats?.approvedReceipts ?? 0,
    REJECTED: receiptStats?.rejectedReceipts ?? 0,
  };

  return (
    <div className="page">
      <Header />
      <main className="container">
        <h1>Welcome, {user?.name}</h1>

        <section className="stats-grid">
          <div className="stat-tile">
            <span className="stat-value">{receiptStats?.pendingReceipts ?? '-'}</span>
            <span className="stat-label">Pending receipts</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{receiptStats?.approvedReceipts ?? '-'}</span>
            <span className="stat-label">Approved receipts</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{receiptStats?.rejectedReceipts ?? '-'}</span>
            <span className="stat-label">Rejected receipts</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{voucherStats?.availableVouchers ?? '-'}</span>
            <span className="stat-label">Available vouchers</span>
          </div>
        </section>

        <section className="card">
          <h2>My receipts</h2>
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t}
                className={t === receiptFilter ? 'tab tab-active' : 'tab'}
                onClick={() => setReceiptFilter(t)}
              >
                {t.charAt(0) + t.slice(1).toLowerCase()} ({receiptCounts[t]})
              </button>
            ))}
          </div>
          <div className="table-area">
            {loading && <p>Loading...</p>}
            {error && <p className="form-error">{error}</p>}
            {!loading && receipts.length === 0 && (
              <p className="empty-state">
                No {receiptFilter === 'ALL' ? '' : receiptFilter.toLowerCase() + ' '}receipts
                {receiptFilter === 'ALL' ? ' submitted yet' : ''}.
              </p>
            )}
            {receipts.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Receipt ID</th>
                    <th>Amount</th>
                    <th>Receipt</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td>{r.orderId}</td>
                      <td>{r.receiptNumber}</td>
                      <td>RM {Number(r.amount).toFixed(2)}</td>
                      <td>
                        <a href={`http://localhost:5000${r.fileUrl}`} target="_blank" rel="noreferrer">
                          View file
                        </a>
                      </td>
                      <td>
                        <span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                      </td>
                      <td>{new Date(r.submittedAt).toLocaleDateString()}</td>
                      <td>{r.rejectionReason ?? '-'}</td>
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
        </section>
      </main>
    </div>
  );
}
