import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { Header } from '../components/Header';
import { useToast } from '../context/ToastContext';

const todayStr = new Date().toISOString().slice(0, 10);

export function UploadPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [orderId, setOrderId] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setUploadError('');
    setUploadSuccess(false);
    if (!file) {
      setUploadError('Please choose a receipt file');
      return;
    }
    if (purchaseDate && purchaseDate > todayStr) {
      setUploadError('Purchase date cannot be in the future');
      return;
    }
    if (/\s/.test(orderId)) {
      setUploadError('Order ID cannot contain spaces');
      return;
    }
    if (!/^\d{4}$/.test(receiptNumber)) {
      setUploadError('Receipt ID must be a 4 digit number');
      return;
    }
    if (Number(amount) > 2000) {
      setUploadError('Amount cannot exceed RM 2000');
      return;
    }

    const formData = new FormData();
    formData.append('orderId', orderId);
    formData.append('receiptNumber', receiptNumber);
    formData.append('purchaseDate', purchaseDate);
    formData.append('amount', amount);
    formData.append('file', file);

    setUploading(true);
    try {
      await api.post('/receipts', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setOrderId('');
      setReceiptNumber('');
      setPurchaseDate('');
      setAmount('');
      setFile(null);
      (document.getElementById('receipt-file') as HTMLInputElement).value = '';
      setUploadSuccess(true);
      showToast('Receipt submitted successfully');
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
        <h1>Upload a receipt</h1>

        <section className="card">
          <form onSubmit={handleUpload} className="upload-form">
            {uploadError && <p className="form-error">{uploadError}</p>}
            {uploadSuccess && (
              <p className="form-notice">
                Receipt submitted — it's now pending review. See it on your{' '}
                <button type="button" className="link-button" onClick={() => navigate('/')}>
                  dashboard
                </button>
                .
              </p>
            )}
            <label>
              Order ID
              <input
                value={orderId}
                onChange={(e) => { setOrderId(e.target.value); setUploadSuccess(false); }}
                pattern="\S+"
                title="Order ID cannot contain spaces"
                required
              />
            </label>
            <label>
              Receipt ID
              <input
                value={receiptNumber}
                onChange={(e) => {
                  // Strip anything that isn't a digit as the user types,
                  // rather than only rejecting on submit — keeps the
                  // field itself always a valid shape in progress.
                  setReceiptNumber(e.target.value.replace(/\D/g, '').slice(0, 4));
                  setUploadSuccess(false);
                }}
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                title="Receipt ID must be a 4 digit number"
                required
              />
            </label>
            <label>
              Purchase date
              <input
                type="date"
                value={purchaseDate}
                max={todayStr}
                onChange={(e) => { setPurchaseDate(e.target.value); setUploadSuccess(false); }}
                required
              />
            </label>
            <label>
              Amount (RM)
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="2000"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setUploadSuccess(false); }}
                required
              />
            </label>
            <label>
              Receipt file (JPEG/PNG/WEBP/PDF, max 5MB)
              <input
                id="receipt-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUploadSuccess(false); }}
                required
              />
            </label>
            <button type="submit" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Submit receipt'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
