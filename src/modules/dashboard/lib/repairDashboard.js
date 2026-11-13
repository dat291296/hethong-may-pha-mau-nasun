// Helper to match tickets for an NPP or Set
export const getTicketsForSetOrNpp = (repairTickets, setOrNpp) => {
  if (!setOrNpp) return [];
  const nppId = (setOrNpp.nppId || setOrNpp.id || '').trim().toLowerCase();
  const nppName = (setOrNpp.nppName || setOrNpp.name || '').trim().toLowerCase();
  const setCode = (setOrNpp.setCode || '').trim().toLowerCase();
  const dispenserSerial = (setOrNpp.dispenserSerial || '').trim().toLowerCase();
  const mixerSerial = (setOrNpp.mixerSerial || '').trim().toLowerCase();
  const pcSerial = (setOrNpp.pcSerial || '').trim().toLowerCase();
  const printerSerial = (setOrNpp.printerSerial || '').trim().toLowerCase();

  return repairTickets.filter(t => {
    const tNppId = (t.nppId || '').trim().toLowerCase();
    const tNppName = (t.nppName || '').trim().toLowerCase();
    const tSerial = (t.serialNumber || '').trim().toLowerCase();
    const tNotes = (t.notes || '').trim().toLowerCase();

    if (nppId && tNppId && tNppId === nppId) return true;
    if (nppName && tNppName && (tNppName.includes(nppName) || nppName.includes(tNppName))) return true;
    if (setCode && tNotes && tNotes.includes(setCode)) return true;
    if (dispenserSerial && dispenserSerial !== '—' && tSerial && tSerial === dispenserSerial) return true;
    if (mixerSerial && mixerSerial !== '—' && tSerial && tSerial === mixerSerial) return true;
    if (pcSerial && pcSerial !== '—' && tSerial && tSerial === pcSerial) return true;
    if (printerSerial && printerSerial !== '—' && tSerial && tSerial === printerSerial) return true;
    return false;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
};

// Helper to compute statistics for tickets of an NPP
export function getNppTicketStats(tickets = []) {
  const stats = { total: tickets.length, exchangeNew: 0, exchangeOld: 0,
    totalExchanges: 0, repairs: 0, dispenserTickets: [], mixerTickets: [],
    computerTickets: [], printerTickets: [] };
  for (const ticket of tickets) {
    if (ticket.actionDirection === 'Xuất đổi') {
      if (ticket.replacementCondition === 'Mới') stats.exchangeNew++;
      if (ticket.replacementCondition === 'Cũ') stats.exchangeOld++;
    }
    if (ticket.actionDirection === 'Sửa chữa' || !ticket.actionDirection) stats.repairs++;
    if (ticket.productCategory === 'Máy chiết') stats.dispenserTickets.push(ticket);
    if (ticket.productCategory === 'Máy lắc') stats.mixerTickets.push(ticket);
    if (['Case', 'AIO', 'Máy tính', 'Màn hình'].includes(ticket.productCategory)) stats.computerTickets.push(ticket);
    if (['Máy in', 'QL700'].includes(ticket.productCategory)) stats.printerTickets.push(ticket);
  }
  stats.totalExchanges = stats.exchangeNew + stats.exchangeOld;
  return stats;
}
