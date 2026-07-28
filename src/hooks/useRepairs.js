import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { INITIAL_REPAIR_TICKETS } from '../data/mockData.js';

export function useRepairs() {
  const [repairTickets, setRepairTickets] = useState(INITIAL_REPAIR_TICKETS);
  const [loading, setLoading] = useState(false);

  const fetchRepairs = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error } = await safeQuery(
      sb => sb.from('repair_tickets').select('*').order('date', { ascending: false }),
      'fetchRepairs'
    );
    if (data) {
      setRepairTickets(data.map(mapDbToRepair));
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
    if (isSupabaseConfigured) {
      const { data, error } = await safeQuery(
        sb => sb.from('repair_tickets').insert(mapRepairToDb(ticketData)).select().single(),
        'addTicket'
      );
      if (error) throw new Error(error.message);
      setRepairTickets(prev => [mapDbToRepair(data), ...prev]);
      return mapDbToRepair(data);
    } else {
      const newTicket = { ...ticketData, id: ticketData.id || `TICK-${Date.now()}` };
      setRepairTickets(prev => [newTicket, ...prev]);
      return newTicket;
    }
  }, []);

  const editTicket = useCallback(async (id, updates) => {
    if (isSupabaseConfigured) {
      const { error } = await safeQuery(
        sb => sb.from('repair_tickets').update(mapRepairToDb(updates)).eq('id', id),
        'editTicket'
      );
      if (error) throw new Error(error.message);
    }
    setRepairTickets(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const deleteTicket = useCallback(async (id) => {
    if (isSupabaseConfigured) {
      const { error } = await safeQuery(
        sb => sb.from('repair_tickets').delete().eq('id', id),
        'deleteTicket'
      );
      if (error) throw new Error(error.message);
    }
    setRepairTickets(prev => prev.filter(t => t.id !== id));
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
