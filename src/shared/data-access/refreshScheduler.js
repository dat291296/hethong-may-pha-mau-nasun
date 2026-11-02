// Realtime is an accelerator; durable change-feed acknowledgements remain separate.
export function createRefreshScheduler(refresh, { delay = 500, setTimer = setTimeout,
  clearTimer = clearTimeout, onError = () => {} } = {}) {
  let timer = null, running = false, pending = false, disposed = false;
  async function run() {
    timer = null;
    if (disposed || running) return;
    pending = false;
    running = true;
    try { await refresh(); }
    catch (error) { onError(error); }
    finally {
      running = false;
      if (pending && !disposed) timer = setTimer(run, delay);
    }
  }
  return {
    schedule() {
      if (disposed) return;
      pending = true;
      if (running) return;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(run, delay);
    },
    dispose() {
      disposed = true; pending = false;
      if (timer !== null) clearTimer(timer);
    },
  };
}
