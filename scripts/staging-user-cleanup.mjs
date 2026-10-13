export async function retireStagingUser(client, id) {
  // Only caller-created staging fixtures are passed here. Preserve audit foreign keys.
  const { error: banError } = await client.auth.admin.updateUserById(id, { ban_duration: '876000h' });
  if (banError) throw new Error('STAGING_FIXTURE_BAN_FAILED');
  const { error } = await client.auth.admin.deleteUser(id, true);
  if (error) throw new Error('STAGING_FIXTURE_SOFT_DELETE_FAILED');
}
