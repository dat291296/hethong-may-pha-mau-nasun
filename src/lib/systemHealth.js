import {searchText} from './teamWorkspace.js';
import {isUnknownSerial} from './deviceSerial.js';
export function repairCategory(value){const text=searchText(value);if(/may chiet|dispenser/.test(text))return 'dispenser';if(/may lac|mixer|shaker/.test(text))return 'mixer';if(/may in|printer|ql700/.test(text))return 'printer';if(/may tinh|^aio$|^case$|computer/.test(text))return 'computer';return 'other';}
const labels={computer:'Máy tính',dispenser:'Máy chiết',mixer:'Máy lắc',printer:'Máy in',other:'Khác / chưa rõ'};
const dateKey=value=>{const key=String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return '';const parsed=new Date(key+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===key?key:'';};
export function buildSystemHealth({machines=[],devices={},tickets=[],events=[],npps=[],from='',to='',category='ALL',nppId='ALL'}){
 const catalog=new Map();
 for(const [kind,list]of Object.entries(devices))for(const device of list)catalog.set(kind+':'+device.id,{...device,category:kind});
 for(const event of events)for(const [id,snapshot]of [[event.old_device_id,event.old_snapshot],[event.new_device_id,event.new_snapshot]])if(id&&!catalog.has(event.category+':'+id))catalog.set(event.category+':'+id,{...snapshot,id,category:event.category});
 const scoped=tickets.filter(ticket=>(category==='ALL'||repairCategory(ticket.productCategory)===category)&&(nppId==='ALL'||ticket.nppId===nppId));
 const inPeriod=ticket=>{const key=dateKey(ticket.date);return Boolean(key&&(!from||key>=from)&&(!to||key<=to));};
 const selected=scoped.filter(inPeriod);const identity=ticket=>{const kind=repairCategory(ticket.productCategory);const key=kind+':'+ticket.assetCode;return ticket.assetCode&&catalog.has(key)?key:null;};
 const group=(keyFor,labelFor)=>{const groups=new Map();for(const ticket of selected){const key=keyFor(ticket);if(!key)continue;const entry=groups.get(key)||{id:key,name:labelFor(ticket,key),repairs:0,exchanges:0,total:0,tickets:[]};entry.total++;entry[ticket.actionDirection==='Xuất đổi'?'exchanges':'repairs']++;entry.tickets.push(ticket);groups.set(key,entry);}return [...groups.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'vi'));};
 const distributors=group(ticket=>ticket.nppId||'unknown',ticket=>npps.find(npp=>npp.id===ticket.nppId)?.name||ticket.nppName||'NPP chưa xác định');
 const equipment=group(identity,(ticket,key)=>{const device=catalog.get(key);return `${device.model||device.type||labels[device.category]} · ${device.id} · ${device.serial||'Chưa có seri'}`;});
 const models=group(ticket=>repairCategory(ticket.productCategory)+':'+(ticket.machineModel||'Chưa rõ model'),ticket=>`${labels[repairCategory(ticket.productCategory)]} · ${ticket.machineModel||'Chưa rõ model'}`);
 const categories=group(ticket=>repairCategory(ticket.productCategory),ticket=>labels[repairCategory(ticket.productCategory)]).map(row=>({...row,share:selected.length?row.total/selected.length*100:0}));
 const trend=group(ticket=>dateKey(ticket.date).slice(0,4),(_ticket,key)=>key).sort((a,b)=>a.id.localeCompare(b.id));
 const byDevice=new Map();for(const ticket of scoped){const key=identity(ticket);if(key){const list=byDevice.get(key)||[];list.push(ticket);byDevice.set(key,list);}}
 let repeat30=0,repeat90=0;
 for(const list of byDevice.values()){
  const completed=list.filter(item=>item.processingStatus==='Đã xử lý'&&Number.isFinite(Date.parse(item.completedAt))).map(item=>({id:item.id,time:Date.parse(item.completedAt)})).sort((a,b)=>a.time-b.time);
  for(const ticket of list.filter(inPeriod)){
   const incident=Date.parse(ticket.date);let left=0,right=completed.length;
   while(left<right){const mid=(left+right)>>>1;if(completed[mid].time<incident)left=mid+1;else right=mid;}
   let prior=left-1;if(completed[prior]?.id===ticket.id)prior--;
   if(prior>=0){const gap=incident-completed[prior].time;if(gap<=30*86400000)repeat30++;if(gap<=90*86400000)repeat90++;}
  }
 }
 const openTickets=scoped.filter(ticket=>ticket.processingStatus!=='Đã xử lý');
 const affectedKeys=new Set(openTickets.map(identity).filter(Boolean));
 const visibleMachines=machines.filter(machine=>nppId==='ALL'||machine.nppId===nppId);
 const states=new Map([['Đang vận hành theo hồ sơ',0],['Cần bảo trì / có phiếu mở',0],['Trong kho / đã thu hồi',0],['Chưa đủ dữ liệu trạng thái',0]]);
 for(const machine of visibleMachines){let name='Chưa đủ dữ liệu trạng thái';if(['TRONG_KHO','DA_THU_HOI'].includes(machine.status))name='Trong kho / đã thu hồi';else if(['DA_LAP_DAT','BAO_THUONG_BAO_TRI'].includes(machine.status)){const unresolved=['computer','dispenser','mixer','printer'].some(kind=>affectedKeys.has(kind+':'+machine[kind+'Id']));name=machine.status==='BAO_THUONG_BAO_TRI'||unresolved?'Cần bảo trì / có phiếu mở':'Đang vận hành theo hồ sơ';}states.set(name,states.get(name)+1);}
 const operatingStats=[];
 for(const kind of ['computer','dispenser','mixer','printer']){
  if(category!=='ALL'&&category!==kind)continue;
  const list=devices[kind]||[];const byId=new Map(list.map(device=>[device.id,device]));const links=new Map();
  for(const device of list){if(!device.setCode)continue;const linked=links.get(device.setCode)||[];linked.push(device.id);links.set(device.setCode,linked);}
  const references=new Map();for(const machine of machines){const id=machine[kind+'Id'];if(id)references.set(id,(references.get(id)||0)+1);}
  const activeIds=new Set();let excluded=0;
  for(const machine of visibleMachines.filter(item=>item.status==='DA_LAP_DAT')){
   const id=machine[kind+'Id'];const device=byId.get(id);
   if(!machine.nppId||!device||device.setCode!==machine.setCode||!device.isAssigned||links.get(machine.setCode)?.length!==1||references.get(id)!==1){excluded++;continue;}
   activeIds.add(id);
  }
  const incidentTickets=selected.filter(ticket=>repairCategory(ticket.productCategory)===kind&&activeIds.has(ticket.assetCode));
  const faulty=new Set(incidentTickets.map(ticket=>ticket.assetCode)).size;
  operatingStats.push({id:kind,name:labels[kind],operating:activeIds.size,faulty,incidents:incidentTickets.length,rate:activeIds.size?faulty/activeIds.size*100:null,incidentsPer100:activeIds.size?incidentTickets.length/activeIds.size*100:null,excluded,tickets:incidentTickets});
 }
 const operatingTotal=operatingStats.reduce((sum,row)=>sum+row.operating,0);
 const faultyTotal=operatingStats.reduce((sum,row)=>sum+row.faulty,0);
 return {operatingStats,operatingTotal,faultyTotal,currentFailureRate:operatingTotal?faultyTotal/operatingTotal*100:null,tickets:selected,total:selected.length,distributors,equipment,models,categories,trend,states:[...states].map(([name,total])=>({name,total})),unlinked:selected.filter(ticket=>!identity(ticket)),unknownDates:scoped.filter(ticket=>!dateKey(ticket.date)).length,repeat30,repeat90,failureRate:null,rateReason:'Chưa đủ lịch sử vận hành toàn kỳ để xác định mẫu số. Không dùng số máy hiện tại thay cho số máy đã vận hành trong kỳ.',unknownSerials:[...catalog.values()].filter(device=>isUnknownSerial(device.serial)).length};
}
