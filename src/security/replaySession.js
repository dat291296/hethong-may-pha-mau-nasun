export async function requireReplaySession(client, ownerId, getOwner, checkTrustedSession) {
  const assertOwner = () => {
    if (!ownerId || getOwner() !== ownerId) throw Object.assign(new Error('OFFLINE_OWNER_CHANGED'), { code: 'OFFLINE_OWNER_CHANGED' });
  };
  assertOwner();
  const { data, error } = await client.auth.getUser();
  assertOwner();
  if (error) throw error;
  if (data?.user?.id !== ownerId) throw Object.assign(new Error('SESSION_REJECTED'), { code: 'SESSION_REJECTED' });
  const security = await client.rpc('get_session_security_state');
  assertOwner();
  if (security.error) throw security.error;
  if (security.data?.user_id && security.data.user_id !== ownerId || !security.data?.profile_found || !security.data?.is_active) {
    throw Object.assign(new Error('SESSION_REJECTED'), { code: 'SESSION_REJECTED' });
  }
  const trusted = await checkTrustedSession();
  assertOwner();
  if (!trusted.supported || trusted.state?.valid !== true) {
    throw Object.assign(new Error('SESSION_REJECTED'), { code: 'SESSION_REJECTED' });
  }
  return true;
}
