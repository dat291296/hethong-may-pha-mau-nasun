import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthErrorMessage, getPasswordRuleState } from '../src/security/authFeedback.js';

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
