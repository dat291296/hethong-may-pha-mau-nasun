// Keep React and encrypted cache snapshots ordered independently of render timing.
export function createRepairState({ initialRows, owner, publish, persist }) {
  let rows = initialRows;
  let epoch = 0;
  let request = 0;
  let activeWrites = 0;
  let dirty = false;
  let cacheTail = Promise.resolve();
  let rowsOwner = owner();

  function syncOwner() {
    if (rowsOwner === owner()) return;
    rowsOwner = owner();
    rows = [];
    epoch++;
    dirty = false;
    publish(rows);
  }

  function assertOwner(expectedOwner) {
    if (expectedOwner !== owner()) {
      throw Object.assign(new Error('OFFLINE_OWNER_CHANGED'), { code: 'OFFLINE_OWNER_CHANGED' });
    }
  }

  function save(snapshot, expectedOwner, version) {
    const pending = cacheTail.then(async () => {
      assertOwner(expectedOwner);
      if (await persist(snapshot) !== true) {
        throw Object.assign(new Error('REPAIR_CACHE_WRITE_FAILED'), { code: 'REPAIR_CACHE_WRITE_FAILED' });
      }
      assertOwner(expectedOwner);
      if (version === epoch) dirty = false;
      return true;
    });
    // A rejected write must not prevent the next complete snapshot from saving.
    cacheTail = pending.catch(() => {});
    return pending;
  }

  const state = {
    read: () => rows,
    captureRead() {
      syncOwner();
      return { epoch, request: ++request, owner: owner() };
    },
    canCommit: token => token.epoch === epoch && token.request === request
      && token.owner === owner() && activeWrites === 0 && !dirty,
    beginWrite() {
      syncOwner();
      const expectedOwner = owner();
      activeWrites++;
      epoch++;
      let finished = false;
      return {
        owner: expectedOwner,
        finish() {
          if (finished) return;
          finished = true;
          activeWrites--;
          // Starting a write already invalidates every previous read. Do not
          // change the snapshot version here while its cache write is pending.
        },
      };
    },
    update(updater, expectedOwner = owner(), cache = true) {
      assertOwner(expectedOwner);
      syncOwner();
      rows = typeof updater === 'function' ? updater(rows) : updater;
      epoch++;
      publish(rows);
      if (!cache) return Promise.resolve(true);
      dirty = true;
      return save(rows, expectedOwner, epoch);
    },
    async acceptRead(token, nextRows, cache = true) {
      if (!state.canCommit(token)) return false;
      const saved = state.update(nextRows, token.owner, cache);
      const version = epoch;
      await saved;
      return version === epoch && token.request === request
        && token.owner === owner() && activeWrites === 0 && !dirty;
    },
    async flush() {
      syncOwner();
      const expectedOwner = rowsOwner;
      await cacheTail;
      assertOwner(expectedOwner);
      if (dirty) return save(rows, expectedOwner, epoch);
      return true;
    },
  };
  return state;
}
