import assert from 'node:assert/strict';

export async function verifyDeviceEdit(admin, viewer) {
  const tag = `NASUN-STAGING-EDIT-${crypto.randomUUID()}`;
  const sets = [tag + '-A', tag + '-B'];
  const tables = ['dispensers', 'mixers', 'computers', 'printers'];
  const ids = [];
  const check = result => { assert.ifError(result.error); return result.data; };
  const read = async (table, id) => check(await admin.from(table).select('*').eq('id', id).single());
  const edit = (client, table, row, updates) => client.rpc('edit_device_atomic', {
    p_table: table, p_id: row.id, p_updates: updates, p_expected_updated_at: row.updated_at,
  });
  try {
    check(await admin.from('system_sets').insert(sets.map(set_code => ({ set_code, region: 'Miền Bắc', status: 'TRONG_KHO' }))));
    for (const table of tables) {
      const id = tag + '-' + table;
      ids.push({ table, id });
      check(await admin.from(table).insert({ id, serial: id, ...(table === 'computers' ? { type: 'Case', network: 'Có mạng LAN' } : { model: 'STAGING-ONLY' }) }));
      const original = await read(table, id);
      check(await edit(admin, table, original, { status: 'Cần bảo trì' }));
      const stock = await read(table, id);
      assert.equal(stock.status, 'Cần bảo trì');
      assert.equal(stock.serial, original.serial);
      assert.ok((await edit(admin, table, original, { status: 'Đang chạy tốt' })).error, 'Stale writes must fail');
      assert.ok((await edit(viewer, table, stock, { status: 'Đang chạy tốt' })).error, 'Viewer must not edit');
      check(await edit(admin, table, stock, { is_assigned: true, set_code: sets[0] }));
      const assigned = await read(table, id);
      const prefix = table === 'computers' ? 'computer' : table.slice(0, -1);
      const firstSet = check(await admin.from('system_sets').select('*').eq('set_code', sets[0]).single());
      assert.equal(firstSet[prefix + '_id'], id);
      assert.equal(firstSet[prefix + '_serial'], original.serial);
      if (table !== 'computers') assert.ok((await edit(admin, table, assigned, { status: 'INVALID-STATUS', set_code: sets[1] })).error);
      // An inaccessible/nonexistent target must roll back the device update too.
      const current = await read(table, id);
      assert.ok((await edit(admin, table, current, { set_code: tag + '-MISSING', status: 'Đang chạy tốt' })).error);
      assert.equal((await read(table, id)).status, current.status);
      check(await edit(admin, table, current, { set_code: sets[1], status: 'Đang chạy tốt' }));
      const moved = await read(table, id);
      check(await edit(admin, table, moved, { is_assigned: false, set_code: null }));
      assert.equal((await read(table, id)).set_code, null);
      const secondSet = check(await admin.from('system_sets').select('*').eq('set_code', sets[1]).single());
      assert.equal(secondSet[prefix + '_id'], null);
    }
  } finally {
    for (const { table, id } of ids) check(await admin.from(table).delete().eq('id', id));
    for (const set_code of sets) check(await admin.from('system_sets').delete().eq('set_code', set_code));
  }
}
