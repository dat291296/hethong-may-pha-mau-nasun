export async function authorizeSensitiveAction(client) {
  if (!client) throw new Error('Cần kết nối máy chủ để xác thực thao tác.');
  const { data, error } = await client.rpc('require_recent_authentication');
  if (error) {
    if (String(error.message).includes('REAUTHENTICATION_REQUIRED')) {
      throw Object.assign(new Error('Vui lòng xác thực lại trước khi thao tác.'), { code: 'REAUTHENTICATION_REQUIRED' });
    }
    throw new Error('Chưa xác minh được quyền thao tác. Kiểm tra kết nối và migration bảo mật.');
  }
  if (data !== true) throw new Error('Máy chủ chưa xác nhận quyền thao tác.');
}

export async function reauthenticateSensitiveAction(client, password) {
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity?.user?.email) throw new Error('Phiên đăng nhập không hợp lệ.');
  const { data, error } = await client.auth.signInWithPassword({ email: identity.user.email, password });
  if (error) throw new Error('Xác thực không thành công. Vui lòng kiểm tra mật khẩu.');
  if (data?.user?.id !== identity.user.id) {
    await client.auth.signOut({ scope: 'local' });
    throw new Error('Danh tính phiên thay đổi. Vui lòng đăng nhập lại.');
  }
  await authorizeSensitiveAction(client);
}
