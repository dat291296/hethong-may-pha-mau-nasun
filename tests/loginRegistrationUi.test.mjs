import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const loginUrl = new URL('../src/components/LoginModal.jsx', import.meta.url);

test('registration requires matching password confirmation', async () => {
  const source = await readFile(loginUrl, 'utf8');
  assert.match(source, /if \(password !== confirmPassword\)/);
  assert.match(source, /Mật khẩu xác nhận không khớp/);
  assert.match(source, /renderConfirmPasswordInput\(\)/);
});

test('signup and password reset provide a return-to-login action', async () => {
  const source = await readFile(loginUrl, 'utf8');
  const matches = source.match(/Quay lại đăng nhập/g) || [];
  assert.ok(matches.length >= 2);
  assert.match(source, /onClick=\{\(\) => changeMode\('login'\)\}/);
});
