export async function retireStagingUser(client, id) {
  // Only caller-created staging fixtures are passed here. Preserve audit foreign keys.
  const { error: profileError } = await client.from('profiles').update({ is_active: false }).eq('id', id);
  if (profileError) throw new Error('STAGING_FIXTURE_DEACTIVATION_FAILED');
  const { error } = await client.auth.admin.deleteUser(id, true);
  if (error) throw new Error('STAGING_FIXTURE_SOFT_DELETE_FAILED');
}
