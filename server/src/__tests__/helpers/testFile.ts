// A minimal, valid buffer to attach as a receipt "file" upload in
// tests. Multer's fileFilter checks the reported mimetype (which
// Supertest derives from the filename extension), not the actual byte
// content, so this doesn't need to be a real image.
export const testFileBuffer = Buffer.from('fake-receipt-content');
export const testFileName = 'receipt.jpg';
