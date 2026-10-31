export function assignedSetsForNpp(sets, nppId) {
  if (!nppId) return [];
  return sets.filter(item => (item.nppId || item.npp_id) === nppId);
}

export function assertAdditionalSetConfirmed(sets, nppId, confirmed) {
  const assigned = assignedSetsForNpp(sets, nppId);
  if (assigned.length && confirmed !== true) {
    throw new Error(`NPP đã có ${assigned.length} bộ máy: ${assigned.map(item => item.setCode || item.set_code).join(', ')}. Hãy xác nhận rõ việc ghép thêm bộ mới.`);
  }
}
