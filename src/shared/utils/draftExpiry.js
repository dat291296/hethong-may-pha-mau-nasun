export function isDraftExpired(draft, now = Date.now()) {
  return !draft?.savedAt || now - draft.savedAt > 30 * 86400000;
}
