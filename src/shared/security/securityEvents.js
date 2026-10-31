const secretKey = /password|passwd|token|secret|authorization|cookie|apikey|credential|privatekey/i;

export function redactSecurityDetails(value, depth = 0) {
  if (depth > 12) return '[REDACTED]';
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redactSecurityDetails(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
      key,
      secretKey.test(key.replace(/[^a-z0-9]/gi, '')) ? '[REDACTED]' : redactSecurityDetails(item, depth + 1),
    ]));
  }
  return typeof value === 'string' ? value.slice(0, 1000) : value;
}
