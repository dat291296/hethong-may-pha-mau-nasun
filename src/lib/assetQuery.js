export const ASSET_TABLES = ['dispensers', 'mixers', 'computers', 'printers', 'system_sets'];
export const DEVICE_TABLES = ASSET_TABLES.filter(table => table !== 'system_sets');

const deviceBase = 'id,serial,status,is_assigned,set_code,created_at,updated_at';
const setSummary = 'set_code,npp_id,npp_name,region,province,status,dispenser_id,dispenser_model,dispenser_serial,mixer_id,mixer_model,mixer_serial,computer_id,computer_type,computer_serial,printer_id,printer_serial,tinting_software,software_version,agent_status,install_date,last_maintenance_date,next_maintenance_due,technician,salesperson,stabilizer,created_at,updated_at';
const summaryColumns = {
  dispensers: `${deviceBase},model`,
  mixers: `${deviceBase},model,type`,
  computers: `${deviceBase},type`,
  printers: `${deviceBase},model`,
  system_sets: setSummary,
};
const detailColumns = {
  ...summaryColumns,
  computers: `${summaryColumns.computers},os,specs,network,stabilizer,tinting_software,software_version`,
  printers: `${summaryColumns.printers},connection`,
  system_sets: `${setSummary},notes,installation_photos`,
};

export function assetColumns(table, details = false) {
  const columns = (details ? detailColumns : summaryColumns)[table];
  if (!columns) throw new Error('UNKNOWN_ASSET_TABLE');
  return columns;
}

// Summary snapshots must never replace authoritative offline editing data.
export function assetCacheKey(table, details) {
  assetColumns(table, details);
  return details ? table : `${table}:summary`;
}

export function cachedAssetSnapshot(full, summary) {
  // A newer summary can contain deletions or new revisions absent from full data.
  if (summary?.fullSnapshot === false && Array.isArray(summary.rows)) return { rows: summary.rows, details: false };
  return { rows: Array.isArray(full) ? full : null, details: Array.isArray(full) };
}

// Every caller waits for all batches, including changes received during a fetch.
export function createAssetRefreshQueue(runBatch) {
  const pending = new Set();
  let inFlight = null;
  return (tables = ASSET_TABLES) => {
    for (const table of tables) {
      assetColumns(table);
      pending.add(table);
    }
    if (inFlight) return inFlight;
    inFlight = (async () => {
      let success = true;
      while (pending.size) {
        const batch = [...pending];
        pending.clear();
        const result = await runBatch(batch);
        success = result !== false && success;
      }
      return success;
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
}
