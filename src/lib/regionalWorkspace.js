import { normalizeRegion } from './teamWorkspace.js';

export const WORKSPACE_REGIONS = ['Miền Bắc', 'Miền Trung', 'Miền Nam'];
export function defaultWorkspaceRegion(user) {
  return user?.role === 'technician' ? normalizeRegion(user.managedRegion) || 'ALL' : 'ALL';
}

export function resolveWorkspaceRegion(item, npps = [], systemSets = []) {
  const machine = systemSets.find(set => (item.setCode && set.setCode === item.setCode) || ['dispenserId', 'mixerId', 'computerId', 'printerId'].some(key => item.id && set[key] === item.id));
  const distributor = npps.find(npp => npp.id === (item.nppId || machine?.nppId));
  // The distributor owns the current region after a move between regions.
  return normalizeRegion(distributor?.region || machine?.region || item.region) || 'UNASSIGNED';
}

export function scopeWorkspace(data, region) {
  if (region === 'ALL') return data;
  const { npps = [], systemSets = [] } = data;
  const distributors = new Map(npps.map(item => [item.id, item]));
  const machines = new Map(systemSets.map(item => [item.setCode, item]));
  const devices = new Map();
  for (const machine of systemSets) {
    for (const key of ['dispenserId', 'mixerId', 'computerId', 'printerId']) {
      if (machine[key]) devices.set(machine[key], machine);
    }
  }
  const matches = item => {
    const machine = machines.get(item.setCode) || devices.get(item.id);
    const distributor = distributors.get(item.nppId || machine?.nppId);
    return (normalizeRegion(distributor?.region || machine?.region || item.region) || 'UNASSIGNED') === region;
  };
  return Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.filter(matches)]));
}
