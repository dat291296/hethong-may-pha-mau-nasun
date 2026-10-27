import { waitForAuthResponse } from './authEmailFlows.js';
import { requireCurrentReplayScope } from './offlineAccess.js';

export async function requireReplaySession(client, ownerId, getOwner, checkTrustedSession, timeoutMs = 20000, onVerifiedScope = null) {
  const assertOwner = () => {
    if (!ownerId || getOwner() !== ownerId) throw Object.assign(new Error('OFFLINE_OWNER_CHANGED'), { code: 'OFFLINE_OWNER_CHANGED' });
  };
  assertOwner();
  const { data, error } = await waitForAuthResponse(() => client.auth.getUser(), timeoutMs);
  assertOwner();
  if (error) throw error;
  if (data?.user?.id !== ownerId) throw Object.assign(new Error('SESSION_REJECTED'), { code: 'SESSION_REJECTED' });
  const security = await waitForAuthResponse(() => client.rpc('get_session_security_state'), timeoutMs);
  assertOwner();
  if (security.error) throw security.error;
  const scope=requireCurrentReplayScope(security.data,ownerId);
  const trusted = await waitForAuthResponse(checkTrustedSession, timeoutMs);
  assertOwner();
  if (!trusted.supported || trusted.state?.valid !== true) {
    throw Object.assign(new Error('SESSION_REJECTED'), { code: 'SESSION_REJECTED' });
  }
  assertOwner();
  if(onVerifiedScope)await onVerifiedScope(scope);
  assertOwner();
  return true;
}
