export function assignedNppSets(npp, sets) {
  return sets.filter(set => String(set.nppId || '') === String(npp.id) && !['DA_THU_HOI', 'TRONG_KHO'].includes(set.status));
}
export function nppCoverage(npps, sets) {
  const assignedNppIds = new Set();
  for (const set of sets) {
    if (!['DA_THU_HOI', 'TRONG_KHO'].includes(set.status) && set.nppId != null) {
      assignedNppIds.add(String(set.nppId));
    }
  }
  const assigned = npps.filter(npp => assignedNppIds.has(String(npp.id)));
  const unassigned = npps.filter(npp => !assignedNppIds.has(String(npp.id)));
  return { assigned, unassigned };
}
