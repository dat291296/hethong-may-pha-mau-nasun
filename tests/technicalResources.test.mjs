import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocumentUrl, validateContactPhone, contactLinks, validateDocumentFile } from '../src/lib/technicalResources.js';

test('document links accept public HTTPS URLs and reject unsafe targets', () => {
  assert.equal(validateDocumentUrl(' https://example.com/manual.pdf '), 'https://example.com/manual.pdf');
  for (const url of ['javascript:alert(1)', 'http://example.com/manual.pdf', 'https://user:password@example.com/file', 'https://127.0.0.1/file', 'https://192.168.1.1/file', 'https://localhost/file', 'https://[::1]/file', 'https://10.1.2.3/file']) {
    assert.throws(() => validateDocumentUrl(url));
  }
});

test('uploads check file signatures rather than trusting file extension or MIME', async () => {
  const file = (name, content) => Object.assign(new Blob([content]), { name });
  assert.equal((await validateDocumentFile(file('manual.pdf', '%PDF-1.7\n'))).mime, 'application/pdf');
  assert.equal((await validateDocumentFile(file('drawing.png', new Uint8Array([137,80,78,71,13,10,26,10])))).mime, 'image/png');
  await assert.rejects(validateDocumentFile(file('fake.pdf', '<script>alert(1)</script>')));
  await assert.rejects(validateDocumentFile(file('drawing.svg', '<svg/>')));
  await assert.rejects(validateDocumentFile(file('empty.pdf', '')));
  await assert.rejects(validateDocumentFile({ name: 'big.pdf', size: 20971521 }));
});

test('contact input supports removing phone numbers and validates phone syntax', () => {
  assert.equal(validateContactPhone(''), '');
  assert.equal(validateContactPhone(' +84 901-234-567 '), '+84 901-234-567');
  assert.throws(() => validateContactPhone('javascript:alert(1)'));
  assert.throws(() => validateContactPhone('123'));
});

test('contact links cannot inject mailto parameters or unsafe telephone handlers', () => {
  assert.deepEqual(contactLinks({ email: 'tech@example.com', phone: '+84 901-234-567' }), { email: 'mailto:tech%40example.com', phone: 'tel:+84901234567' });
  assert.deepEqual(contactLinks({ email: 'tech@example.com?bcc=attacker@example.com', phone: 'javascript:alert(1)' }), { email: null, phone: null });
});
