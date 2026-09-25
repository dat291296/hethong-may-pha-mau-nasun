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

test('signup and password recovery enforce visible password rules', async () => {
  const source = await readFile(loginUrl, 'utf8');
  assert.match(source, /Ít nhất 12 ký tự/);
  assert.match(source, /Có chữ hoa/);
  assert.match(source, /Có chữ thường/);
  assert.match(source, /Có chữ số/);
  assert.match(source, /if \(!passwordIsStrong\)/);
  assert.match(source, /Caps Lock đang bật/);
});

test('unverified users can resend a verification email with cooldown', async () => {
  const source = await readFile(loginUrl, 'utf8');
  assert.match(source, /resendSignupVerification\(supabase\.auth/);
  assert.match(source, /RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(source, /email_not_confirmed/);
  assert.match(source, /Gửi lại email xác minh/);
});

test('password confirmation, reset cooldown, and privacy notice are visible', async () => {
  const source = await readFile(loginUrl, 'utf8');
  assert.match(source, /Mật khẩu đã khớp/);
  assert.match(source, /Mật khẩu chưa khớp/);
  assert.match(source, /setResetCooldown\(RESEND_COOLDOWN_SECONDS\)/);
  assert.match(source, /Gửi lại sau \$\{resetCooldown\}s/);
  assert.match(source, /Chính sách quyền riêng tư/);
  assert.match(source, /Camera và vị trí chỉ được truy cập/);
});
