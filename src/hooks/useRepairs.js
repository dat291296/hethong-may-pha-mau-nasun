import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { INITIAL_REPAIR_TICKETS } from '../data/mockData.js';
import { cacheOfflineData, getCachedOfflineData, enqueueOfflineAction } from '../lib/offlineSync.js';

export function useRepairs() {
  const [repairTickets, setRepairTickets] = useState(() => getCachedOfflineData('repair_tickets', INITIAL_REPAIR_TICKETS));
  const [loading, setLoading] = useState(false);

  const fetchRepairs = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error } = await safeQuery(
      sb => sb.from('repair_tickets').select('*').order('date', { ascending: false }),
      'fetchRepairs'
    );
    if (error) {
      const cached = getCachedOfflineData('repair_tickets', null);
      if (cached) setRepairTickets(cached);
    } else if (data && data.length > 0) {
      const mapped = data.map(mapDbToRepair);
      setRepairTickets(mapped);
      cacheOfflineData('repair_tickets', mapped);
    }
    setLoading(false);
  }, []);

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
        const { data, error } = await safeQuery(
          sb => sb.from('repair_tickets').insert(dbPayload).select().single(),
          'addTicket'
        );
        if (error) throw error;
        if (data) {
          setRepairTickets(prev => {
            const updated = prev.map(item => item.id === tempId ? mapDbToRepair(data) : item);
            cacheOfflineData('repair_tickets', updated);
            return updated;
          });
        }
      } catch (err) {
        console.warn('[Offline] Failed online addTicket. Queueing.', err);
        enqueueOfflineAction('ADD_REPAIR', dbPayload);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing addTicket.');
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

    const dbUpdates = { ...mapRepairToDb({ ...updates }), id };

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        const { error } = await safeQuery(
          sb => sb.from('repair_tickets').update(dbUpdates).eq('id', id),
          'editTicket'
        );
        if (error) throw error;
      } catch (err) {
        console.warn('[Offline] Failed online editTicket. Queueing.', err);
        enqueueOfflineAction('EDIT_REPAIR', dbUpdates);
      }
    } else if (isSupabaseConfigured && !navigator.onLine) {
      console.log('[Offline] Network down. Enqueueing editTicket.');
      enqueueOfflineAction('EDIT_REPAIR', dbUpdates);
    }
  }, []);

  const deleteTicket = useCallback(async (id) => {
    // Update local state immediately
    setRepairTickets(prev => {
      const updated = prev.filter(t => t.id !== id);
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

  return {
    repairTickets,
    setRepairTickets,
    loading,
    addTicket,
    editTicket,
    deleteTicket,
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
    ticket_code:            r.ticketCode,
    date:                   r.date,
    technician:             r.technician,
    npp_id:                 r.nppId,
    npp_name:               r.nppName,
    product_category:       r.productCategory,
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
