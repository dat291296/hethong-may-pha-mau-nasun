import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { INITIAL_REPAIR_TICKETS } from '../data/mockData.js';
import { cacheOfflineData, getCachedOfflineData, enqueueOfflineAction, getOfflineQueue } from '../lib/offlineSync.js';

function normalizeProductCategory(category, machineModel = '') {
  const raw = String(category || '').trim();
  const allowed = ['Máy chiết', 'Máy lắc', 'Máy tính', 'Máy in', 'Phụ kiện', 'Linh kiện'];
  const exact = allowed.find(value => value.toLocaleLowerCase('vi') === raw.toLocaleLowerCase('vi'));
  if (exact) return exact;
  const hint = `${raw} ${machineModel || ''}`.toLocaleLowerCase('vi');
  if (/chiết|dispenser|satint|hero|first/.test(hint)) return 'Máy chiết';
  if (/lắc|mixer|shaker|ai88|ysa|kmc/.test(hint)) return 'Máy lắc';
  if (/máy tính|computer|\bpc\b|\baio\b|\bcase\b|laptop/.test(hint)) return 'Máy tính';
  if (/máy in|printer|ql700|brother/.test(hint)) return 'Máy in';
  if (/linh kiện|component|spare part/.test(hint)) return 'Linh kiện';
  return 'Phụ kiện';
}

export function filterRepairTicketsById(tickets, idToRemove) {
  return tickets.filter(ticket => String(ticket.id) !== String(idToRemove));
}

export function useRepairs() {
  const [repairTickets, setRepairTickets] = useState(INITIAL_REPAIR_TICKETS);
  const [loading, setLoading] = useState(false);

  const persistRepairTickets = useCallback((nextTickets) => {
    setRepairTickets(nextTickets);
    cacheOfflineData('repair_tickets', nextTickets);
  }, []);

  // Hydrate cache from IndexedDB on mount
  useEffect(() => {
    async function loadCached() {
      if (navigator.onLine) return;
      const cached = await getCachedOfflineData('repair_tickets', null);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setRepairTickets(cached);
      }
    }
    loadCached();
  }, []);

  const fetchRepairs = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const pendingQueue = await getOfflineQueue();
    if (pendingQueue.some(item => ['ADD_REPAIR', 'EDIT_REPAIR', 'DELETE_REPAIR'].includes(item.action))) {
      console.info('[useRepairs] Keeping local repair cache while changes are waiting to sync.');
      return;
    }
    setLoading(true);
    const { data, error } = await safeQuery(
      sb => sb.from('repair_tickets').select('*').order('date', { ascending: false }),
      'fetchRepairs'
    );
    if (error) {
      const cached = await getCachedOfflineData('repair_tickets', null);
      if (cached) setRepairTickets(cached);
    } else if (Array.isArray(data)) {
      const mapped = data.map(mapDbToRepair);
      persistRepairTickets(mapped);
    }
    setLoading(false);
  }, [persistRepairTickets]);

  useEffect(() => {
    fetchRepairs();
  }, [fetchRepairs]);

  // Realtime subscription
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const channel = supabase
      .channel('repair-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_tickets' }, () => fetchRepairs())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchRepairs]);

  const addTicket = useCallback(async (ticketData) => {
    const tempId = ticketData.id || `TICK-TEMP-${Date.now()}`;
    const localTicket = { ...ticketData, id: tempId };
    const dbPayload = { ...mapRepairToDb(localTicket), id: tempId };

    // Update local state immediately
    setRepairTickets(prev => {
      const updated = [localTicket, ...prev];
      cacheOfflineData('repair_tickets', updated);
      return updated;
    });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('repair_tickets').insert(dbPayload),
          'addTicket'
        );
        if (error) throw error;
        await fetchRepairs();
      } catch (err) {
        console.warn('[Offline] Failed online addTicket. Queueing.', err);
        enqueueOfflineAction('ADD_REPAIR', dbPayload);
      }
    } else {
      console.log('[Offline] Network down or dev mode. Enqueueing addTicket.');
      enqueueOfflineAction('ADD_REPAIR', dbPayload);
    }

    return localTicket;
  }, []);

  const editTicket = useCallback(async (id, updates) => {
    // Update local state immediately
    setRepairTickets(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      cacheOfflineData('repair_tickets', updated);
      return updated;
    });

    const dbUpdates = {};
    const fieldMap = {
      ticketCode: 'ticket_code',
      date: 'date',
      technician: 'technician',
      nppId: 'npp_id',
      nppName: 'npp_name',
      productCategory: 'product_category',
      machineModel: 'machine_model',
      serialNumber: 'serial_number',
      errorDescription: 'error_description',
      errorCategory: 'error_category',
      actionDirection: 'action_direction',
      replacementCondition: 'replacement_condition',
      processingStatus: 'processing_status',
      customerReturnStatus: 'customer_return_status',
      notes: 'notes',
      photos: 'photos'
    };

    for (const key in updates) {
      if (key === 'exchangeType' || key === 'exchange_type') continue;
      if (fieldMap[key]) dbUpdates[fieldMap[key]] = updates[key];
      else dbUpdates[key] = updates[key];
    }
    if ('product_category' in dbUpdates) {
      dbUpdates.product_category = normalizeProductCategory(dbUpdates.product_category, dbUpdates.machine_model);
    }
    const exchangeType = updates.exchangeType ?? updates.exchange_type;
    if (exchangeType !== undefined) {
      const exchangeText = String(exchangeType).toLocaleLowerCase('vi');
      dbUpdates.action_direction = exchangeText.includes('không') ? 'Sửa chữa' : 'Xuất đổi';
      dbUpdates.replacement_condition = exchangeText.includes('cũ')
        ? 'Cũ'
        : (exchangeText.includes('mới') ? 'Mới' : 'N/A');
    }

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('repair_tickets').update(dbUpdates).eq('id', id),
          'editTicket'
        );
        if (error) throw error;
      } catch (err) {
        console.warn('[Offline] Failed online editTicket. Queueing.', err);
        enqueueOfflineAction('EDIT_REPAIR', { id, ...dbUpdates });
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing editTicket.');
      enqueueOfflineAction('EDIT_REPAIR', { id, ...dbUpdates });
    }
  }, []);

  const deleteTicket = useCallback(async (id) => {
    // Update local state immediately
    setRepairTickets(prev => {
      const updated = filterRepairTicketsById(prev, id);
      cacheOfflineData('repair_tickets', updated);
      return updated;
    });

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('repair_tickets').delete().eq('id', id),
          'deleteTicket'
        );
        if (error) throw error;
      } catch (err) {
        console.warn('[Offline] Failed online deleteTicket. Queueing.', err);
        enqueueOfflineAction('DELETE_REPAIR', { id });
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing deleteTicket.');
      enqueueOfflineAction('DELETE_REPAIR', { id });
    }
  }, []);

  const importTickets = useCallback(async (items) => {
    const dbItems = items.map(mapRepairToDb).filter(item => item.id && item.ticket_code);
    if (dbItems.length !== items.length) throw new Error('Every imported repair ticket must include an ID and ticket code');

    setRepairTickets(prev => {
      const merged = new Map(prev.map(item => [item.id, item]));
      dbItems.map(mapDbToRepair).forEach(item => merged.set(item.id, item));
      const updated = Array.from(merged.values());
      cacheOfflineData('repair_tickets', updated);
      return updated;
    });

    if (!isSupabaseConfigured) return;
    if (!navigator.onLine) {
      dbItems.forEach(item => enqueueOfflineAction('ADD_REPAIR', item));
      return;
    }
    try {
      const { error } = await safeQuery(
        sb => sb.from('repair_tickets').upsert(dbItems, { onConflict: 'id' }),
        'importRepairTickets'
      );
      if (error) throw error;
      await fetchRepairs();
    } catch (err) {
      dbItems.forEach(item => enqueueOfflineAction('ADD_REPAIR', item));
    }
  }, [fetchRepairs]);

  return {
    repairTickets,
    setRepairTickets,
    loading,
    addTicket,
    editTicket,
    deleteTicket,
    importTickets,
    refetch: fetchRepairs
  };
}

function mapDbToRepair(row) {
  return {
    id:                    row.id,
    ticketCode:           row.ticket_code,
    date:                 row.date,
    technician:           row.technician,
    nppId:                row.npp_id,
    nppName:              row.npp_name,
    productCategory:      row.product_category,
    machineModel:         row.machine_model,
    serialNumber:         row.serial_number,
    errorDescription:     row.error_description,
    errorCategory:        row.error_category,
    actionDirection:      row.action_direction,
    replacementCondition: row.replacement_condition,
    processingStatus:     row.processing_status,
    customerReturnStatus: row.customer_return_status,
    notes:                 row.notes,
    photos:                row.photos || [],
  };
}

function mapRepairToDb(r) {
  return {
    ...(r.id ? { id: r.id } : {}),
    ticket_code:            r.ticketCode,
    date:                   r.date,
    technician:             r.technician,
    npp_id:                 r.nppId,
    npp_name:               r.nppName,
    product_category:       normalizeProductCategory(r.productCategory, r.machineModel),
    machine_model:          r.machineModel,
    serial_number:          r.serialNumber,
    error_description:      r.errorDescription || '',
    error_category:         r.errorCategory || '',
    action_direction:       r.actionDirection || 'Sửa chữa',
    replacement_condition:  r.replacementCondition || 'N/A',
    processing_status:      r.processingStatus || 'Chưa xử lý',
    customer_return_status: r.customerReturnStatus || 'Chưa gửi trả',
    notes:                  r.notes || '',
    photos:                 r.photos || [],
  };
}
