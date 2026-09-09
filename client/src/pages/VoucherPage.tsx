import { useEffect, useState } from 'react';
import { api, apiErrorMessage, type Voucher, type Pagination } from '../api/client';
import { Header } from '../components/Header';
import { useToast } from '../context/ToastContext';

const TABS = ['ALL', 'AVAILABLE', 'REDEEMED', 'EXPIRED'] as const;
type Tab = (typeof TABS)[number];

const PAGE_SIZE = 5;

interface VoucherStats {
  availableVouchers: number;
  redeemedVouchers: number;
  expiredVouchers: number;
  totalVouchers: number;
}

export function VoucherPage() {
  const { showToast } = useToast();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<VoucherStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState('');
  const [voucherFilter, setVoucherFilter] = useState<Tab>('ALL');

  async function loadStats() {
    try {
      const res = await api.get('/vouchers/me/stats');
      setStats(res.data.stats);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function loadVouchers(t: Tab, p: number) {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/vouchers/me', {
        params: { ...(t === 'ALL' ? {} : { status: t }), page: p, limit: PAGE_SIZE },
      });
      setVouchers(res.data.vouchers);
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
  }, [voucherFilter]);

  useEffect(() => {
    loadVouchers(voucherFilter, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherFilter, page]);

  async function refreshAfterAction() {
    await Promise.all([loadVouchers(voucherFilter, page), loadStats()]);
  }

  function voucherStatus(v: Voucher): 'ACTIVE' | 'REDEEMED' | 'EXPIRED' {
    if (v.redeemedAt) return 'REDEEMED';
    if (v.expiresAt && new Date(v.expiresAt) < new Date()) return 'EXPIRED';
    return 'ACTIVE';
  }

  const voucherCounts: Record<Tab, number> = {
    ALL: stats?.totalVouchers ?? 0,
    AVAILABLE: stats?.availableVouchers ?? 0,
    REDEEMED: stats?.redeemedVouchers ?? 0,
    EXPIRED: stats?.expiredVouchers ?? 0,
  };

  async function handleRedeem(voucherId: string) {
    setRedeemError('');
    setRedeemingId(voucherId);
    try {
      const res = await api.post(`/vouchers/${voucherId}/redeem`);
      await refreshAfterAction();
      // The code is only ever shown once the user has actually redeemed
      // — surface it here in the confirmation, in addition to it now
      // being revealed in the table row, since that's the one moment
      // the user actually needs it (e.g. to show/quote at checkout).
      const code = res.data?.voucher?.code;
      showToast(code ? `Voucher redeemed! Code: ${code}` : 'Voucher redeemed successfully');
    } catch (err) {
      setRedeemError(apiErrorMessage(err));
    } finally {
      setRedeemingId(null);
    }
  }

  return (
    <div className="page">
      <Header />
      <main className="container">
        <h1>My vouchers</h1>

        <section className="card">
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t}
                className={t === voucherFilter ? 'tab tab-active' : 'tab'}
                onClick={() => setVoucherFilter(t)}
              >
                {t.charAt(0) + t.slice(1).toLowerCase()} ({voucherCounts[t]})
              </button>
            ))}
          </div>
          <div className="table-area">
            {error && <p className="form-error">{error}</p>}
            {redeemError && <p className="form-error">{redeemError}</p>}
            {loading && <p>Loading...</p>}
            {!loading && vouchers.length === 0 && (
              <p className="empty-state">
                No {voucherFilter === 'ALL' ? '' : voucherFilter.toLowerCase() + ' '}vouchers
                {voucherFilter === 'ALL' ? ' earned yet' : ''}.
              </p>
            )}
            {vouchers.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Amount</th>
                    <th>Order ID</th>
                    <th>Issued</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => {
                    const status = voucherStatus(v);
                    return (
                      <tr key={v.id}>
                        <td className="voucher-code">
                          {v.redeemedAt ? v.code : <span className="voucher-code-hidden" title="Redeem to reveal the code">Hidden</span>}
                        </td>
                        <td>RM {Number(v.amount).toFixed(2)}</td>
                        <td>{v.receipt?.orderId}</td>
                        <td>{new Date(v.issuedAt).toLocaleDateString()}</td>
                        <td>{v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : '-'}</td>
                        <td>
                          <span className={`badge badge-voucher-${status.toLowerCase()}`}>{status}</span>
                        </td>
                        <td>
                          {status === 'ACTIVE' && (
                            <button onClick={() => handleRedeem(v.id)} disabled={redeemingId === v.id}>
                              {redeemingId === v.id ? 'Redeeming...' : 'Redeem'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
