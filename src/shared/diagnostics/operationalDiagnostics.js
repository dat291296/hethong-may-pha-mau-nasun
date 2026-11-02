import { diagnosticCode } from './remoteReporting.js';
const entries = [];
const counters = new Map();
let remoteReporter = null;
export function configureOperationalReporting(reporter) {
  remoteReporter = reporter?.enabled && typeof reporter.capture === 'function' ? reporter : null;
}
export function recordOperationalError(area, error) {
  const safeArea = ['auth','device','draft','runtime','sync'].includes(area) ? area : 'runtime';
  const code = diagnosticCode(error?.code);
  const entry = {area:safeArea, code, at:new Date().toISOString()};
  entries.push(entry);
  if (entries.length > 50) entries.shift();
  counters.set(safeArea, (counters.get(safeArea) || 0) + 1);
  // Never retain the original error, message, URL, stack or request payload.
  if (remoteReporter) {
    try { Promise.resolve(remoteReporter.capture(entry, error)).catch(() => {}); }
    catch { /* Reporting failures must never interrupt a business operation. */ }
  }
  return entry;
}
export function getOperationalDiagnostics() { return {counts:Object.fromEntries(counters),recent:entries.map(item=>({...item}))}; }
export function startErrorMonitoring(target = window) {
  const onError = event => recordOperationalError('runtime', event?.error);
  const onRejection = event => recordOperationalError('runtime', event?.reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {target.removeEventListener('error',onError);target.removeEventListener('unhandledrejection',onRejection);};
}
