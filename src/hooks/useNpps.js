import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { INITIAL_NPPS } from '../data/mockData.js';

/**
 * useNpps – NPP (Nhà Phân Phối) data hook.
 * Uses Supabase when configured, falls back to mock data locally.
 */
export function useNpps() {
  const [npps, setNpps] = useState(INITIAL_NPPS);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  // ── Fetch all NPPs ─────────────────────────────────────────────────────────
  const fetchNpps = useCallback(async () => {
    if (!isSupabaseConfigured) return; // use mock data
    setLoading(true);
    const { data, error: err } = await safeQuery(
      (sb) => sb.from('distributors').select('*').order('created_at', { ascending: false }),
      'fetchNpps'
    );
    if (err) { setError(err.message); }
    else if (data) { setNpps(data.map(mapDbToNpp)); }
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
    const mapped = mapNppToDb(nppData);
    if (isSupabaseConfigured) {
      const { data, error: err } = await safeQuery(
        (sb) => sb.from('distributors').insert(mapped).select().single(),
        'addNpp'
      );
      if (err) throw new Error(err.message);
      setNpps(prev => [mapDbToNpp(data), ...prev]);
      return mapDbToNpp(data);
    } else {
      const newNpp = { ...nppData, id: nppData.id || `NPP-${Date.now()}` };
      setNpps(prev => [newNpp, ...prev]);
      return newNpp;
    }
  }, []);

  const editNpp = useCallback(async (id, updates) => {
    if (isSupabaseConfigured) {
      const { error: err } = await safeQuery(
        (sb) => sb.from('distributors').update(mapNppToDb(updates)).eq('id', id),
        'editNpp'
      );
      if (err) throw new Error(err.message);
    }
    setNpps(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  const deleteNpp = useCallback(async (id) => {
    if (isSupabaseConfigured) {
      const { error: err } = await safeQuery(
        (sb) => sb.from('distributors').delete().eq('id', id),
        'deleteNpp'
      );
      if (err) throw new Error(err.message);
    }
    setNpps(prev => prev.filter(n => n.id !== id));
  }, []);

  const importNpps = useCallback(async (newNpps) => {
    if (isSupabaseConfigured) {
      const mapped = newNpps.map(mapNppToDb);
      const { error: err } = await safeQuery(
        (sb) => sb.from('distributors').insert(mapped),
        'importNpps'
      );
      if (err) throw new Error(err.message);
      await fetchNpps();
    } else {
      setNpps(prev => [...newNpps, ...prev]);
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
