import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { INITIAL_NPPS } from '../data/mockData.js';
import { cacheOfflineData, getCachedOfflineData, enqueueOfflineAction } from '../lib/offlineSync.js';

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
      const cached = await getCachedOfflineData('npps', null);
      if (cached && cached.length > 0) {
        setNpps(cached);
      }
    }
    loadCached();
  }, []);

  // ── Fetch all NPPs ─────────────────────────────────────────────────────────
  const fetchNpps = useCallback(async () => {
    if (!isSupabaseConfigured) return; // use mock data
    setLoading(true);
    const { data, error: err } = await safeQuery(
      (sb) => sb.from('distributors').select('*').order('created_at', { ascending: false }),
      'fetchNpps'
    );
    if (err) { 
      setError(err.message); 
      // Loading cached data on network error
      const cached = await getCachedOfflineData('npps', null);
      if (cached) setNpps(cached);
    }
    else if (data && data.length > 0) { 
      const mapped = data.map(mapDbToNpp);
      setNpps(mapped); 
      cacheOfflineData('npps', mapped);
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

    // Update local state instantly for latency compensation / offline availability
    setNpps(prev => {
      const updated = [localNpp, ...prev];
      cacheOfflineData('npps', updated);
      return updated;
    });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { data, error: err } = await safeQuery(
          (sb) => sb.from('distributors').insert(mapped).select().single(),
          'addNpp'
        );
        if (err) throw err;
        
        // Update local state with official DB record if different (e.g. database serial ID)
        if (data) {
          setNpps(prev => {
            const updated = prev.map(item => item.id === tempId ? mapDbToNpp(data) : item);
            cacheOfflineData('npps', updated);
            return updated;
          });
        }
      } catch (err) {
        console.warn('[Offline] Failed online addNpp. Queueing action.', err);
        enqueueOfflineAction('ADD_NPP', mapped);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing addNpp.');
      enqueueOfflineAction('ADD_NPP', mapped);
    }

    return localNpp;
  }, []);

  const editNpp = useCallback(async (id, updates) => {
    // Update local state immediately
    setNpps(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, ...updates } : n);
      cacheOfflineData('npps', updated);
      return updated;
    });

    const mappedUpdates = {};
    if ('name' in updates) mappedUpdates.name = updates.name;
    if ('phone' in updates) mappedUpdates.phone = updates.phone;
    if ('contactPerson' in updates) mappedUpdates.contact_person = updates.contactPerson;
    if ('contact_person' in updates) mappedUpdates.contact_person = updates.contact_person;
    if ('region' in updates) mappedUpdates.region = updates.region;
    if ('province' in updates) mappedUpdates.province = updates.province;
    if ('address' in updates) mappedUpdates.address = updates.address;
    if ('locationCoordinates' in updates) mappedUpdates.location_coordinates = updates.locationCoordinates;
    if ('location_coordinates' in updates) mappedUpdates.location_coordinates = updates.location_coordinates;
    if ('googleMapsUrl' in updates) mappedUpdates.google_maps_url = updates.googleMapsUrl;
    if ('google_maps_url' in updates) mappedUpdates.google_maps_url = updates.google_maps_url;
    if ('status' in updates) mappedUpdates.status = updates.status;
    if ('photos' in updates) mappedUpdates.photos = updates.photos;

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error: err } = await safeQuery(
          (sb) => sb.from('distributors').update(mappedUpdates).eq('id', id),
          'editNpp'
        );
        if (err) throw err;
      } catch (err) {
        console.warn('[Offline] Failed online editNpp. Queueing action.', err);
        enqueueOfflineAction('EDIT_NPP', { id, ...mappedUpdates });
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing editNpp.');
      enqueueOfflineAction('EDIT_NPP', { id, ...mappedUpdates });
    }
  }, []);

  const deleteNpp = useCallback(async (id) => {
    // Update local state immediately
    setNpps(prev => {
      const updated = prev.filter(n => n.id !== id);
      cacheOfflineData('npps', updated);
      return updated;
    });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error: err } = await safeQuery(
          (sb) => sb.from('distributors').delete().eq('id', id),
          'deleteNpp'
        );
        if (err) throw err;
      } catch (err) {
        console.warn('[Offline] Failed online deleteNpp. Queueing action.');
        // We delete by id
        enqueueOfflineAction('DELETE_NPP', { id });
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing deleteNpp.');
      enqueueOfflineAction('DELETE_NPP', { id });
    }
  }, []);

  const importNpps = useCallback(async (newNpps) => {
    setNpps(prev => {
      const updated = [...newNpps, ...prev];
      cacheOfflineData('npps', updated);
      return updated;
    });

    if (isSupabaseConfigured) {
      const mapped = newNpps.map(mapNppToDb);
      if (navigator.onLine) {
        try {
          const { error: err } = await safeQuery(
            (sb) => sb.from('distributors').insert(mapped),
            'importNpps'
          );
          if (err) throw err;
          await fetchNpps();
        } catch (err) {
          mapped.forEach(item => enqueueOfflineAction('ADD_NPP', item));
        }
      } else {
        mapped.forEach(item => enqueueOfflineAction('ADD_NPP', item));
      }
    }
  }, [fetchNpps]);

  return { npps, setNpps, loading, error, addNpp, editNpp, deleteNpp, importNpps, refetch: fetchNpps };
}

// ─── Field Mappers ─────────────────────────────────────────────────────────────
function mapDbToNpp(row) {
  return {
    id:                   row.id,
    name:                 row.name,
    phone:                row.phone,
    contactPerson:        row.contact_person,
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
    region:               npp.region,
    province:             npp.province || '',
    address:              npp.address || '',
    location_coordinates: npp.locationCoordinates || '',
    google_maps_url:      npp.googleMapsUrl || '',
    status:               npp.status || 'Đang hợp tác',
    photos:               npp.photos || [],
  };
}
