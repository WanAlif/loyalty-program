import { useEffect, useState, type FormEvent } from 'react';
import { api, apiErrorMessage, type Receipt, type Voucher } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/Header';

export function UserDashboard() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [orderId, setOrderId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const [receiptsRes, vouchersRes] = await Promise.all([
        api.get('/receipts/me'),
        api.get('/vouchers/me'),
      ]);
      setReceipts(receiptsRes.data.receipts);
      setVouchers(vouchersRes.data.vouchers);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setUploadError('');
    if (!file) {
      setUploadError('Please choose a receipt file');
      return;
    }

    const formData = new FormData();
    formData.append('orderId', orderId);
    formData.append('purchaseDate', purchaseDate);
    formData.append('amount', amount);
    formData.append('file', file);

    setUploading(true);
    try {
      await api.post('/receipts', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setOrderId('');
      setPurchaseDate('');
      setAmount('');
      setFile(null);
      (document.getElementById('receipt-file') as HTMLInputElement).value = '';
      await loadData();
    } catch (err) {
      setUploadError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="page">
      <Header />
      <main className="container">
        <h1>Welcome, {user?.name}</h1>

        <section className="card">
          <h2>Upload a receipt</h2>
          <form onSubmit={handleUpload} className="upload-form">
            {uploadError && <p className="form-error">{uploadError}</p>}
            <label>
              Order ID
              <input value={orderId} onChange={(e) => setOrderId(e.target.value)} required />
            </label>
            <label>
              Purchase date
              <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
            </label>
            <label>
              Amount (RM)
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label>
              Receipt file (JPEG/PNG/WEBP/PDF, max 5MB)
              <input
                id="receipt-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </label>
            <button type="submit" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Submit receipt'}
            </button>
          </form>
        </section>

        <section className="card">
          <h2>My receipts</h2>
          {loading && <p>Loading...</p>}
          {error && <p className="form-error">{error}</p>}
          {!loading && receipts.length === 0 && <p className="empty-state">No receipts submitted yet.</p>}
          {receipts.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td>{r.orderId}</td>
                    <td>RM {Number(r.amount).toFixed(2)}</td>
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
        </section>

        <section className="card">
          <h2>My vouchers</h2>
          {!loading && vouchers.length === 0 && <p className="empty-state">No vouchers earned yet.</p>}
          {vouchers.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Amount</th>
                  <th>From order</th>
                  <th>Issued</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id}>
                    <td className="voucher-code">{v.code}</td>
                    <td>RM {Number(v.amount).toFixed(2)}</td>
                    <td>{v.receipt?.orderId}</td>
                    <td>{new Date(v.issuedAt).toLocaleDateString()}</td>
                    <td>{v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
