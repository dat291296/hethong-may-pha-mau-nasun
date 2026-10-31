const entries = [];
const counters = new Map();
const allowedCodes = new Set(['AUTH_REQUIRED','ACCOUNT_DISABLED','REVISION_REQUIRED','OFFLINE_QUEUE_WRITE_FAILED','OFFLINE_OWNER_CHANGED','DRAFT_WRITE_FAILED','QUOTA_EXCEEDED','NETWORK_ERROR']);
export function recordOperationalError(area, error) {
  const safeArea = ['auth','device','draft','runtime','sync'].includes(area) ? area : 'runtime';
  const code = allowedCodes.has(error?.code) ? error.code : 'OPERATION_FAILED';
  const entry = {area:safeArea, code, at:new Date().toISOString()};
  entries.push(entry);
  if (entries.length > 50) entries.shift();
  counters.set(safeArea, (counters.get(safeArea) || 0) + 1);
  // Never retain the original error, message, URL, stack or request payload.
  return entry;
}
export function getOperationalDiagnostics() { return {counts:Object.fromEntries(counters),recent:entries.map(item=>({...item}))}; }
export function startErrorMonitoring(target = window) {
  const onError = () => recordOperationalError('runtime');
  const onRejection = () => recordOperationalError('runtime');
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {target.removeEventListener('error',onError);target.removeEventListener('unhandledrejection',onRejection);};
}
