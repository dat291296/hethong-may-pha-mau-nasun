import {getSystemSetMissingFields} from '../utils/systemSetValidation.js';
import {isUnknownSerial} from './deviceSerial.js';
import {inManagedRegion} from './teamWorkspace.js';
export function missingNppFields(npp){return [['name','Tên NPP'],['region','Miền'],['province','Tỉnh/thành'],['address','Địa chỉ'],['phone','Số điện thoại'],['contactPerson','Người liên hệ']].filter(([key])=>!String(npp[key]||'').trim()).map(([,label])=>label);}
export function missingSystemSetFields(machine){
 const fields=getSystemSetMissingFields(machine);
 for(const [key,label] of [['region','Miền'],['province','Tỉnh/thành'],['computerSerial','Seri máy tính'],['tintingSoftware','Phần mềm pha màu'],['softwareVersion','Phiên bản phần mềm']])if(!String(machine[key]||'').trim()||isUnknownSerial(machine[key]))fields.push(label);
 if(['DA_LAP_DAT','BAO_THUONG_BAO_TRI'].includes(machine.status)&&!machine.nextMaintenanceDue)fields.push('Hạn bảo trì');
 return [...new Set(fields)];
}
export function missingDeviceFields(device,category,machine){
 const fields=[];if(!String(device.model||device.type||'').trim())fields.push('Model/loại máy');
 if(isUnknownSerial(device.serial || (category==='computer'?machine?.computerSerial:'')))fields.push('Số seri');
 if(!String(device.status||'').trim())fields.push('Tình trạng');
 if(category==='computer')for(const [key,label] of [['os','Hệ điều hành'],['specs','Cấu hình'],['network','Kết nối mạng']])if(!String(device[key]||'').trim())fields.push(label);
 return fields;
}
export function dataCompletenessAlerts({npps=[],systemSets=[],devices={},user}){
 const visible=item=>user?.managedRegion==='Toàn Quốc'||inManagedRegion(item,user,npps,systemSets);
 const alerts=npps.filter(visible).map(npp=>({id:'npp:'+npp.id,entityId:npp.id,label:npp.name||npp.id,region:npp.region,tab:'npp',missing:missingNppFields(npp)}));
 for(const machine of systemSets.filter(visible))alerts.push({id:'machine:'+machine.setCode,entityId:machine.setCode,label:(machine.nppName||'Bộ máy')+' · '+machine.setCode,region:machine.region,tab:'assets',missing:missingSystemSetFields(machine)});
 for(const [category,list] of Object.entries(devices))for(const device of list){
  const machine=systemSets.find(item=>item.setCode===device.setCode||item[category+'Id']===device.id);
  const context={...device,region:machine?.region||device.region,nppId:machine?.nppId};
  if(visible(context))alerts.push({id:category+':'+device.id,entityId:machine?.setCode||device.id,label:(machine?.nppName?machine.nppName+' · ':'')+(device.model||device.type||device.id)+' · '+device.id,region:context.region||'Chưa gán miền',tab:'assets',missing:missingDeviceFields(device,category,machine)});
 }
 return alerts.filter(item=>item.missing.length);
}
