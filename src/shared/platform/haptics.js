const patterns = Object.freeze({
  light: [10],
  medium: [24],
  strong: [45, 30, 45],
});

export function triggerHaptic(kind = 'light') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  const pattern = patterns[kind] || patterns.light;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
