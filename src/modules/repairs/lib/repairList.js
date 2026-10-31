export function repairListPage(rows, requestedPage = 1, requestedSize = 20) {
  const size = [10,20,50].includes(Number(requestedSize)) ? Number(requestedSize) : 20;
  const pages = Math.max(1,Math.ceil(rows.length/size));
  const page = Math.min(pages,Math.max(1,Number.isSafeInteger(Number(requestedPage)) ? Number(requestedPage) : 1));
  return {page,size,pages,total:rows.length,rows:rows.slice((page-1)*size,page*size)};
}
export function repairStringList(value) {
  return Array.isArray(value) ? value.filter(item=>typeof item==='string') : [];
}
export function hasMalformedRepairLists(ticket) {
  return ['photos','beforePhotos','afterPhotos','materialsUsed'].some(key=>ticket[key]!=null&&(!Array.isArray(ticket[key])||ticket[key].some(item=>typeof item!=='string')));
}

export function uniqueAssignedMachine(machines,nppId) {
  if(!nppId)return null;
  const matches=machines.filter(machine=>machine.nppId===nppId&&['DA_LAP_DAT','BAO_THUONG_BAO_TRI'].includes(machine.status));
  return matches.length===1?matches[0]:null;
}
