export function assignedNppSets(npp, sets) {
  return sets.filter(set => String(set.nppId || '') === String(npp.id) && !['DA_THU_HOI', 'TRONG_KHO'].includes(set.status));
}
export function nppCoverage(npps, sets) {
  const assigned = npps.filter(npp => assignedNppSets(npp, sets).length > 0);
  const unassigned = npps.filter(npp => !assignedNppSets(npp, sets).length);
  return { assigned, unassigned };
}
