import { getOfflineOwner } from '../../../shared/sync/offlineDb.js';
import { recordDataLoadMetric } from '../../../shared/diagnostics/performanceMetrics.js';
import { updateWithRevision } from '../../../shared/data-access/guardedWrite.js';
import { fetchAllRows } from '../../../shared/data-access/paginatedQuery.js';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../../../shared/data-access/supabase.js';
import { persistMutation, persistBatchMutation } from '../../../shared/data-access/durableMutation.js';
import { INITIAL_NPPS } from '../../../shared/data/mockData.js';
import { cacheOfflineData, getCachedOfflineData, enqueueOfflineAction, getOfflineQueue } from '../../../shared/sync/offlineSync.js';
import { recordOperationalError } from '../../../shared/diagnostics/operationalDiagnostics.js';
import { userErrorMessage } from '../../../shared/security/userError.js';
import { generateQrToken } from '../lib/qrPayload.js';

/**
 * useNpps – NPP (Nhà Phân Phối) data hook.
 * Uses Supabase when configured, falls back to mock data locally, with offline caching & queuing.
 */
export function useNpps() {
  const [npps, setNpps] = useState(() => isSupabaseConfigured ? [] : INITIAL_NPPS.map(item => ({ ...item, qrToken: item.qrToken || generateQrToken() })));
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError]   = useState(null);
  const fetchVersion = useRef(0);
  const cacheHydrated = useRef(false);
  const nppsRef = useRef(npps);
  nppsRef.current = npps;

  // ── Fetch all NPPs ─────────────────────────────────────────────────────────
  const fetchNpps = useCallback(async () => {
    const startedAt = performance.now();
    const requestOwner = getOfflineOwner();
    const version = ++fetchVersion.current;
    if (!isSupabaseConfigured) {
      try {
        const cached = await getCachedOfflineData('npps', null);
        if (Array.isArray(cached) && version === fetchVersion.current && requestOwner === getOfflineOwner()) setNpps(cached);
      } catch (cacheError) {
        recordOperationalError('runtime', cacheError);
      }
      return;
    }
    setError(null);
    try {
      const pendingQueue = await getOfflineQueue();
      if (version !== fetchVersion.current || requestOwner !== getOfflineOwner()) return false;
      if (pendingQueue.some(item => ['ADD_NPP', 'EDIT_NPP', 'DELETE_NPP'].includes(item.action))) {
        const cached = await getCachedOfflineData('npps', null);
        if (version !== fetchVersion.current || requestOwner !== getOfflineOwner()) return false;
        if (Array.isArray(cached)) setNpps(cached);
        setError(Array.isArray(cached)
          ? 'NPP đang có thay đổi chờ đồng bộ. Đang hiển thị bản lưu trên thiết bị; hãy xử lý hàng chờ trước khi tải lại từ máy chủ.'
          : 'NPP đang có thay đổi chờ đồng bộ nhưng chưa có bản lưu trên thiết bị. Không tải đè dữ liệu; kiểm tra hàng chờ đồng bộ.');
        return false;
      }
      const columns = 'id,npp_code,qr_token,updated_at,name,phone,contact_person,salesperson,brand,region,province,address,location_coordinates,google_maps_url,status,created_at';
      const { data, error: fetchError } = await fetchAllRows(
        sb => sb.from('distributors').select(columns).order('created_at', { ascending: false }).order('id'),
        safeQuery, 'fetchNpps', { key: 'id' }
      );
      if (version !== fetchVersion.current || requestOwner !== getOfflineOwner()) return false;
      if (fetchError) throw fetchError;
      if (!Array.isArray(data)) throw Object.assign(new Error('INCOMPLETE_NPP_RESPONSE'), { code: 'INCOMPLETE_QUERY' });
      const previousById = new Map(nppsRef.current.map(npp => [npp.id, npp]));
      const mapped = data.map(row => ({ ...mapDbToNpp(row), photos: previousById.get(row.id)?.photos || [] }));
      const cacheSaved = await persistNpps(mapped, setNpps);
      if (version === fetchVersion.current && requestOwner === getOfflineOwner()) {
        setError(cacheSaved ? null : 'Đã tải NPP nhưng chưa lưu được bản ngoại tuyến trên thiết bị.');
      }
      return cacheSaved;
    } catch (fetchError) {
      recordOperationalError('runtime', fetchError);
      if (version !== fetchVersion.current || requestOwner !== getOfflineOwner()) return false;
      setError(userErrorMessage(fetchError, 'Chưa tải được NPP. Dữ liệu trên thiết bị được giữ nguyên; kiểm tra phiên đăng nhập, quyền truy cập và kết nối.'));
      try {
        const cached = await getCachedOfflineData('npps', null);
        if (version === fetchVersion.current && requestOwner === getOfflineOwner() && Array.isArray(cached)) setNpps(cached);
      } catch (cacheError) {
        recordOperationalError('runtime', cacheError);
      }
      return false;
    } finally {
      if (version === fetchVersion.current) setLoading(false);
      recordDataLoadMetric(performance.now() - startedAt, 'NPP_DATA_LOAD');
    }
  }, []);

  // Hydrate local data first, then refresh it in the background.
  useEffect(() => {
    let disposed = false;
    async function loadCached() {
      const owner = getOfflineOwner();
      try {
        const cached = await getCachedOfflineData('npps', null);
        if (!disposed && owner === getOfflineOwner() && Array.isArray(cached)) {
          setNpps(cached);
          setLoading(false);
        }
      } catch (cacheError) {
        recordOperationalError('runtime', cacheError);
      } finally {
        if (!disposed) {
          cacheHydrated.current = true;
          void fetchNpps();
        }
      }
    }
    void loadCached();
    return () => { disposed = true; };
  }, [fetchNpps]);

  // ── CRUD Operations ────────────────────────────────────────────────────────
  const addNpp = useCallback(async (nppData) => {
    const tempId = nppData.id || `NPP-TEMP-${Date.now()}`;
    const localNpp = { ...nppData, qrToken: nppData.qrToken || generateQrToken(), code: nppData.code || nppData.previewCode || null, id: tempId, createdAt: new Date().toISOString().split('T')[0] };
    const mapped = { ...mapNppToDb(localNpp), npp_code: nppData.code || null, qr_token: localNpp.qrToken, id: tempId };

    const result = !isSupabaseConfigured ? { queued: false } : await persistMutation({
      online: isSupabaseConfigured && navigator.onLine,
      write: () => safeQuery(sb => sb.from('distributors').insert(mapped).select('id'), 'addNpp'),
      queue: () => enqueueOfflineAction('ADD_NPP', mapped)
    });
    setNpps(prev => {
      const updated = [localNpp, ...prev.filter(item => item.id !== tempId)];
      persistNpps(updated, setNpps, false);
      return updated;
    });
    if (isSupabaseConfigured && !result.queued) await fetchNpps();
    localNpp.queued = result.queued;
    return localNpp;
  }, [fetchNpps]);

  const editNpp = useCallback(async (id, updates) => {
    const mappedUpdates = {};
    if ('code' in updates) mappedUpdates.npp_code = updates.code || null;
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

    if (isSupabaseConfigured && !navigator.onLine && ('code' in updates || 'region' in updates)) throw new Error('Cần kết nối mạng để xác nhận mã NPP và khu vực. Nội dung chưa được lưu.');
    const result = !isSupabaseConfigured ? { queued: false } : await persistMutation({
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
    if (isSupabaseConfigured && !result.queued) await fetchNpps();
    return result;
  }, [fetchNpps]);

  const deleteNpp = useCallback(async (id) => {
    const result = !isSupabaseConfigured ? { queued: false } : await persistMutation({
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
  const reissueQrToken = useCallback(async id => {
    if (!isSupabaseConfigured) {
      const token = generateQrToken();
      setNpps(previous => {
        const updated = previous.map(item => item.id === id ? { ...item, qrToken: token } : item);
        persistNpps(updated, setNpps, false);
        return updated;
      });
      return token;
    }
    if (!navigator.onLine) throw new Error('Cần kết nối mạng để cấp lại mã QR.');
    const { data, error: tokenError } = await supabase.rpc('reissue_distributor_qr_token', { p_distributor_id: id });
    if (tokenError) throw tokenError;
    if (typeof data !== 'string' || !/^[0-9A-HJKMNP-TV-Z]{10}$/.test(data)) throw new Error('Máy chủ trả về mã QR không hợp lệ.');
    setNpps(previous => {
      const updated = previous.map(item => item.id === id ? { ...item, qrToken: data } : item);
      persistNpps(updated, setNpps, false);
      return updated;
    });
    await fetchNpps();
    return data;
  }, [fetchNpps]);
  const importNpps = useCallback(async (newNpps) => {
    const mapped = newNpps.map(npp => {
      const existing = nppsRef.current.find(item => item.id === npp.id || (npp.code && item.code === npp.code));
      return { ...mapNppToDb(npp), qr_token: npp.qrToken || existing?.qrToken || generateQrToken(), id: npp.id || `NPP-${crypto.randomUUID()}` };
    });
    const result = !isSupabaseConfigured ? {queued:false} : await persistBatchMutation({items:mapped,
      online:navigator.onLine,
      write:rows=>safeQuery(sb=>sb.from('distributors').upsert(rows,{onConflict:'id'}).select('id'),'importNpps'),
      queue:item=>enqueueOfflineAction('ADD_NPP',item),
    });
    setNpps(prev => {
      const importedIds = new Set(mapped.map(item => item.id));
      const updated = [...newNpps.map((item, index) => ({ ...item, id: mapped[index].id, qrToken: mapped[index].qr_token })), ...prev.filter(item => !importedIds.has(item.id))];
      persistNpps(updated, setNpps, false);
      return updated;
    });
    if (isSupabaseConfigured && !result.queued) await fetchNpps();
    return result;
  }, [fetchNpps]);
  const fetchNppPhotos = useCallback(async id => {
    const owner = getOfflineOwner();
    const cachedPhotos = nppsRef.current.find(npp => npp.id === id)?.photos;
    if (!isSupabaseConfigured) return cachedPhotos || [];
    const { data, error: photoError } = await safeQuery(sb => sb.from('distributors').select('id,photos').eq('id', id).maybeSingle(), 'fetchNppPhotos');
    if (owner !== getOfflineOwner()) throw new Error('SESSION_CHANGED');
    if (photoError || !data) throw photoError || new Error('NPP_NOT_FOUND');
    const photos = Array.isArray(data.photos) ? data.photos : [];
    const updated = nppsRef.current.map(npp => npp.id === id ? { ...npp, photos } : npp);
    nppsRef.current = updated;
    setNpps(updated);
    await persistNpps(updated, setNpps);
    return photos;
  }, []);

  return { npps, setNpps, loading, error, addNpp, editNpp, deleteNpp, importNpps, fetchNppPhotos, reissueQrToken, refetch: fetchNpps };
}

function persistNpps(nextNpps, setNpps, shouldSetState = true) {
  if (shouldSetState) setNpps(nextNpps);
  return cacheOfflineData('npps', nextNpps);
}

// ─── Field Mappers ─────────────────────────────────────────────────────────────
function mapDbToNpp(row) {
  return {
    id:                   row.id,
    code:                 row.npp_code || row.id,
    storedCode:           row.npp_code || null,
    qrToken:              row.qr_token || null,
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
    npp_code:             npp.code || null,
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

