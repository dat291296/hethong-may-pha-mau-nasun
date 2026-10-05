import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocumentUrl, validateContactPhone, contactLinks } from '../src/lib/technicalResources.js';

test('document links accept public HTTPS URLs and reject unsafe targets', () => {
  assert.equal(validateDocumentUrl(' https://example.com/manual.pdf '), 'https://example.com/manual.pdf');
  for (const url of ['javascript:alert(1)', 'http://example.com/manual.pdf', 'https://user:password@example.com/file', 'https://127.0.0.1/file', 'https://192.168.1.1/file', 'https://localhost/file', 'https://[::1]/file', 'https://10.1.2.3/file']) {
    assert.throws(() => validateDocumentUrl(url));
  }
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
