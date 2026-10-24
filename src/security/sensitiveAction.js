export async function authorizeSensitiveAction(client) {
  if (!client) throw new Error('Cần kết nối máy chủ để xác thực thao tác.');
  const { data, error } = await client.rpc('require_recent_authentication');
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) {
      throw Object.assign(new Error('Database chưa có chức năng xác thực thao tác admin. Cần áp dụng migration sensitive_action_reauthentication.sql; quyền tài khoản chưa được thay đổi.'), { code: 'SCHEMA_MIGRATION_REQUIRED' });
    }
    if (String(error.message).includes('REAUTHENTICATION_REQUIRED')) {
      throw Object.assign(new Error('Vui lòng xác thực lại trước khi thao tác.'), { code: 'REAUTHENTICATION_REQUIRED' });
    }
    if (String(error.message).includes('ADMIN_REQUIRED')) {
      throw Object.assign(new Error('Máy chủ chưa xác nhận quyền admin. Hãy kiểm tra tài khoản đang hoạt động và hoàn tất xác thực hai lớp nếu được yêu cầu.'), { code: 'ADMIN_REQUIRED' });
    }
    throw new Error('Không kết nối được chức năng xác thực quyền admin. Vui lòng thử lại; quyền tài khoản chưa được thay đổi.');
  }
  if (data !== true) throw new Error('Máy chủ chưa xác nhận quyền thao tác.');
}

export async function reauthenticateSensitiveAction(client, password, registerSession) {
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity?.user?.email) throw new Error('Phiên đăng nhập không hợp lệ.');
  const { data, error } = await client.auth.signInWithPassword({ email: identity.user.email, password });
  if (error) throw new Error('Xác thực không thành công. Vui lòng kiểm tra mật khẩu.');
  if (data?.user?.id !== identity.user.id) {
    await client.auth.signOut({ scope: 'local' });
    throw new Error('Danh tính phiên thay đổi. Vui lòng đăng nhập lại.');
  }
  if (typeof registerSession !== 'function') throw new Error('Chưa xác minh được phiên đăng nhập mới.');
  const registration = await registerSession();
  if (!registration?.supported || registration.state?.valid !== true) throw new Error('Phiên đăng nhập mới chưa được máy chủ chấp nhận.');
  await authorizeSensitiveAction(client);
}
