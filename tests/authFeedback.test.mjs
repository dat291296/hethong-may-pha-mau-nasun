import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthErrorMessage, getPasswordRuleState, shouldCountLoginFailure } from '../src/security/authFeedback.js';

test('network and provider failures never count as incorrect passwords', () => {
  assert.equal(shouldCountLoginFailure({ code: 'invalid_credentials' }), true);
  for (const error of [{ code: 'AUTH_RESPONSE_TIMEOUT' }, { status: 500 }, new TypeError('Failed to fetch'), { code: 'email_not_confirmed' }, { status: 429 }]) assert.equal(shouldCountLoginFailure(error), false);
  assert.match(getAuthErrorMessage({ code: 'AUTH_RESPONSE_TIMEOUT' }, 'login'), /Đăng nhập/);
  assert.doesNotMatch(getAuthErrorMessage({ code: 'AUTH_RESPONSE_TIMEOUT' }, 'recovery'), /đăng ký|email xác minh/);
  assert.match(getAuthErrorMessage({ code: 'same_password' }, 'update-password'), /khác mật khẩu/);
});

test('auth feedback never exposes empty provider payloads or internal messages', () => {
  for (const error of [{}, null, { message: '{}' }, { message: 'private SMTP credentials' }]) {
    const message = getAuthErrorMessage(error);
    assert.ok(message.length > 30);
    assert.doesNotMatch(message, /\{\}|private SMTP credentials/);
  }
  assert.match(getAuthErrorMessage({ status: 500, code: 'unexpected_failure' }), /cấu hình gửi email/);
  assert.match(getAuthErrorMessage({ status: 429 }), /chờ vài phút/);
  assert.match(getAuthErrorMessage({ code: 'weak_password' }), /12 ký tự/);
  assert.match(getAuthErrorMessage(new TypeError('Failed to fetch'), 'recovery'), /Kiểm tra mạng/);
  assert.match(getAuthErrorMessage(new TypeError('Failed to fetch')), /Chưa nhận được phản hồi đăng ký/);
});

test('password length is enforced independently of character variety', () => {
  assert.deepEqual(getPasswordRuleState('Example0903'), { length: false, uppercase: true, lowercase: true, number: true });
  assert.ok(Object.values(getPasswordRuleState('Example090312')).every(Boolean));
  assert.equal(getPasswordRuleState('abcdefghijkl').uppercase, false);
  assert.equal(getPasswordRuleState('ExampleLonger').number, false);
});
