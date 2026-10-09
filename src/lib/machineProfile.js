import { findAssignedDevice } from './deviceEdit.js';

const CATEGORIES = ['dispenser', 'mixer', 'computer', 'printer'];
const normalized = value => String(value || '').trim();
export function sameMachine(machine, identity) {
  return Boolean(machine && identity && (identity.id ? machine.id === identity.id : identity.setCode && machine.setCode === identity.setCode));
}
export function resolveMachineProfile(machine, sets, equipment, npps, repairs, auditLogs) {
  const devices = CATEGORIES.map(category => ({category, device: findAssignedDevice(category, equipment[category] || [], machine)}));
  const npp = machine.nppId ? npps.find(item => item.id === machine.nppId) : null;
  const repairsForMachine = repairs.filter(ticket => {
    const setCode = normalized(ticket.setCode || ticket.set_code);
    if (setCode) return setCode === normalized(machine.setCode);
    if (ticket.deviceId) return devices.some(item => item.device?.id === ticket.deviceId);
    const serial = normalized(ticket.serialNumber);
    if (!serial || !machine.nppId || ticket.nppId !== machine.nppId) return false;
    const owners = sets.filter(set => set.nppId === ticket.nppId && CATEGORIES.some(category => normalized(set[category + 'Serial']) === serial));
    return owners.length === 1 && sameMachine(owners[0], machine);
  });
  const history = [
    ...repairsForMachine.map(item => ({key:'repair:'+item.id, title:item.ticketCode || 'Phiếu sửa chữa', at:item.date, detail:item.errorDescription, status:item.processingStatus})),
    ...auditLogs.filter(item => machine.setCode && item.setCode === machine.setCode).map(item => ({key:'audit:'+item.id, title:item.type || 'Nhật ký', at:item.timestamp, detail:item.notes, status:item.technician})),
  ].sort((a,b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  return {devices, npp, history};
}
