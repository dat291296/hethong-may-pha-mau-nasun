import { updateWithRevision } from '../lib/guardedWrite.js';
import { fetchAllRows } from '../lib/paginatedQuery.js';
import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { persistMutation } from '../lib/durableMutation.js';
import { INITIAL_NPPS } from '../data/mockData.js';
import { cacheOfflineData, getCachedOfflineData, enqueueOfflineAction, getOfflineQueue } from '../lib/offlineSync.js';

/**
 * useNpps – NPP (Nhà Phân Phối) data hook.
 * Uses Supabase when configured, falls back to mock data locally, with offline caching & queuing.
 */
export function useNpps() {
  const [npps, setNpps] = useState(INITIAL_NPPS);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  // Hydrate cache from IndexedDB on mount
  useEffect(() => {
    async function loadCached() {
      if (navigator.onLine) return;
      const cached = await getCachedOfflineData('npps', null);
      if (cached && cached.length > 0) {
        persistNpps(cached, setNpps);
      }
    }
    loadCached();
  }, []);

  // ── Fetch all NPPs ─────────────────────────────────────────────────────────
  const fetchNpps = useCallback(async () => {
    if (!isSupabaseConfigured) {
      const cached = await getCachedOfflineData('npps', null);
      if (cached && cached.length > 0) persistNpps(cached, setNpps);
      return;
    }
    const pendingQueue = await getOfflineQueue();
    if (pendingQueue.some(item => ['ADD_NPP', 'EDIT_NPP', 'DELETE_NPP'].includes(item.action))) {
      console.info('[useNpps] Keeping local NPP cache while changes are waiting to sync.');
      return;
    }
    setLoading(true);
    const { data, error: err } = await fetchAllRows(
      sb => sb.from('distributors').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id'),
      safeQuery, 'fetchNpps', { key: 'id' }
    );
    if (err) { 
      setError(err.message); 
      // Loading cached data on network error
      const cached = await getCachedOfflineData('npps', null);
      if (cached && cached.length > 0) setNpps(cached);
    }
    else if (data) { 
      const mapped = data.map(mapDbToNpp);
      // Supabase is authoritative while online, including an empty table.
      persistNpps(mapped, setNpps);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNpps(); }, [fetchNpps]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const channel = supabase
      .channel('distributors-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distributors' },
        () => fetchNpps()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchNpps]);

  // ── CRUD Operations ────────────────────────────────────────────────────────
  const addNpp = useCallback(async (nppData) => {
    const tempId = nppData.id || `NPP-TEMP-${Date.now()}`;
    const localNpp = { ...nppData, id: tempId, createdAt: new Date().toISOString().split('T')[0] };
    const mapped = { ...mapNppToDb(localNpp), id: tempId };

    const result = await persistMutation({
      online: isSupabaseConfigured && navigator.onLine,
      write: () => safeQuery(sb => sb.from('distributors').insert(mapped).select('id'), 'addNpp'),
      queue: () => enqueueOfflineAction('ADD_NPP', mapped)
    });
    setNpps(prev => {
      const updated = [localNpp, ...prev.filter(item => item.id !== tempId)];
      persistNpps(updated, setNpps, false);
      return updated;
    });
    if (!result.queued) await fetchNpps();
    localNpp.queued = result.queued;
    return localNpp;
  }, [fetchNpps]);

  const editNpp = useCallback(async (id, updates) => {
    const mappedUpdates = {};
    if ('name' in updates) mappedUpdates.name = updates.name;
    if ('phone' in updates) mappedUpdates.phone = updates.phone;
    if ('contactPerson' in updates) mappedUpdates.contact_person = updates.contactPerson;
    if ('contact_person' in updates) mappedUpdates.contact_person = updates.contact_person;
    if ('salesperson' in updates) mappedUpdates.salesperson = updates.salesperson;
    if ('brand' in updates) mappedUpdates.brand = updates.brand;
    if ('region' in updates) mappedUpdates.region = updates.region;
    if ('province' in updates) mappedUpdates.province = updates.province;
    if ('address' in updates) mappedUpdates.address = updates.address;
    if ('locationCoordinates' in updates) mappedUpdates.location_coordinates = updates.locationCoordinates;
    if ('location_coordinates' in updates) mappedUpdates.location_coordinates = updates.location_coordinates;
    if ('googleMapsUrl' in updates) mappedUpdates.google_maps_url = updates.googleMapsUrl;
    if ('google_maps_url' in updates) mappedUpdates.google_maps_url = updates.google_maps_url;
    if ('status' in updates) mappedUpdates.status = updates.status;
    if ('photos' in updates) mappedUpdates.photos = updates.photos;

    const result = await persistMutation({
      online: isSupabaseConfigured && navigator.onLine,
      write: () => updateWithRevision({
        runQuery: query => safeQuery(query, 'editNpp'), table: 'distributors', id,
        updates: mappedUpdates, expectedRevision: updates.dbRevision
      }),
      queue: () => enqueueOfflineAction('EDIT_NPP', { id, ...mappedUpdates })
    });
    setNpps(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, ...updates, dbRevision: result.data?.[0]?.updated_at || n.dbRevision, isUpdated: true } : n);
      persistNpps(updated, setNpps, false);
      return updated;
    });
    return result;
  }, []);

  const deleteNpp = useCallback(async (id) => {
    const result = await persistMutation({
      online: isSupabaseConfigured && navigator.onLine,
      write: () => safeQuery(sb => sb.from('distributors').delete().eq('id', id).select('id'), 'deleteNpp'),
      queue: () => enqueueOfflineAction('DELETE_NPP', { id })
    });
    setNpps(prev => {
      const updated = prev.filter(n => n.id !== id);
      persistNpps(updated, setNpps, false);
      return updated;
    });
    return result;
  }, []);
  const importNpps = useCallback(async (newNpps) => {
    const mapped = newNpps.map(npp => ({ ...mapNppToDb(npp), id: npp.id || `NPP-${crypto.randomUUID()}` }));
    const result = await persistMutation({
      online: isSupabaseConfigured && navigator.onLine,
      write: () => safeQuery(sb => sb.from('distributors').upsert(mapped, { onConflict: 'id' }).select('id'), 'importNpps'),
      queue: async () => {
        for (const item of mapped) await enqueueOfflineAction('ADD_NPP', item);
      }
    });
    setNpps(prev => {
      const importedIds = new Set(mapped.map(item => item.id));
      const updated = [...newNpps.map((item, index) => ({ ...item, id: mapped[index].id })), ...prev.filter(item => !importedIds.has(item.id))];
      persistNpps(updated, setNpps, false);
      return updated;
    });
    if (!result.queued) await fetchNpps();
    return result;
  }, [fetchNpps]);
  return { npps, setNpps, loading, error, addNpp, editNpp, deleteNpp, importNpps, refetch: fetchNpps };
}

function persistNpps(nextNpps, setNpps, shouldSetState = true) {
  if (shouldSetState) setNpps(nextNpps);
  cacheOfflineData('npps', nextNpps);
}

// ─── Field Mappers ─────────────────────────────────────────────────────────────
function mapDbToNpp(row) {
  return {
    id:                   row.id,
    dbRevision:           row.updated_at || null,
    name:                 row.name,
    phone:                row.phone,
    contactPerson:        row.contact_person,
    salesperson:          row.salesperson || '',
    brand:                row.brand || 'Nasun',
    region:               row.region,
    province:             row.province,
    address:              row.address,
    locationCoordinates:  row.location_coordinates,
    googleMapsUrl:        row.google_maps_url,
    status:               row.status,
    createdAt:            row.created_at?.split('T')[0] || '',
    photos:               row.photos || [],
  };
}

function mapNppToDb(npp) {
  return {
    name:                 npp.name,
    phone:                npp.phone,
    contact_person:       npp.contactPerson || '',
    salesperson:          npp.salesperson || '',
    brand:                npp.brand || 'Nasun',
    region:               npp.region,
    province:             npp.province || '',
    address:              npp.address || '',
    location_coordinates: npp.locationCoordinates || '',
    google_maps_url:      npp.googleMapsUrl || '',
    status:               npp.status || 'Đang hợp tác',
    photos:               npp.photos || [],
  };
}

