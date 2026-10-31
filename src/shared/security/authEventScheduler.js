// Supabase auth listeners must release the auth lock before making API calls.
export function createAuthEventScheduler(handleEvent, reportError) {
  const pending = new Set();
  let disposed = false;
  let chain = Promise.resolve();
  const listener = (event, session) => {
    const timer = setTimeout(() => {
      pending.delete(timer);
      chain = chain.then(() => disposed ? undefined : handleEvent(event, session)).catch(reportError);
    }, 0);
    pending.add(timer);
  };
  const dispose = () => {
    disposed = true;
    pending.forEach(clearTimeout);
    pending.clear();
  };
  return { listener, dispose };
}
