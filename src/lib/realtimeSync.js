import { supabase, isSupabaseConfigured } from './supabase.js';
import { pullChangeFeed } from './changeFeed.js';

function normalizeTopicRegion(region) {
  return String(region || 'none').trim().toLocaleLowerCase('vi').replace(/\s+/g, '_');
}

export function startPrivateRealtimeSync(user) {
  if (!isSupabaseConfigured || !supabase || !user?.id) return () => {};
  const topics = new Set(['nasun:sync:global']);
  if (user.role === 'admin') topics.add('nasun:sync:admin');
  else topics.add(`nasun:sync:${normalizeTopicRegion(user.managedRegion)}`);

  const channels = [...topics].map(topic => supabase
    .channel(topic, { config: { private: true, broadcast: { self: false } } })
    .on('broadcast', { event: 'sync_changed' }, () => pullChangeFeed())
    .subscribe((status, error) => {
      window.dispatchEvent(new CustomEvent('nasun-sync-transport', {
        detail: { transport: 'realtime', topic, status, error: error?.message || null, at: Date.now() }
      }));
    }));

  return () => {
    for (const channel of channels) supabase.removeChannel(channel);
  };
}
