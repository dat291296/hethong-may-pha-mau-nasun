import {fetchAllRows} from './paginatedQuery.js';
export const EQUIPMENT_SLOTS=[{category:'computer',label:'Máy tính',table:'computers'},{category:'dispenser',label:'Máy chiết',table:'dispensers'},{category:'mixer',label:'Máy lắc',table:'mixers'},{category:'printer',label:'Máy in',table:'printers'}];
export const READY_STATUSES=new Set(['Mới 100%','Đang chạy tốt','Đã đổi trả máy mới','Đổi trả máy cũ','Đã đổi trả máy cũ']);
export function resolveEquipmentSlot(machine,category,devices){
 const pointer=machine[category+'Id'];const linked=devices.filter(device=>device.setCode===machine.setCode);
 const matches=pointer?devices.filter(device=>device.id===pointer):linked;
 if(matches.length===1 && linked.length===1 && matches[0].setCode===machine.setCode)return {state:'linked',device:matches[0],pointer};
 return {state:!pointer&&!linked.length?'empty':'conflict',device:null,pointer,candidates:linked};
}
export function replacementCandidates(devices,machine,action='replace'){
 const linked=devices.filter(device=>device.setCode===machine.setCode);
 if(action==='relink'&&linked.length)return linked;
 return devices.filter(device=> (!device.isAssigned&&!device.setCode&&READY_STATUSES.has(device.status)) || (action==='relink'&&device.setCode===machine.setCode));
}
export function equipmentFields(category,device){
 const fields={[category+'Id']:device.id,[category+'Serial']:device.serial||''};
 if(['dispenser','mixer'].includes(category))fields[category+'Model']=device.model||'';
 if(category==='computer')Object.assign(fields,{computerType:device.type||'',pcType:device.type||'',computerSerial:device.serial||'',tintingSoftware:device.tintingSoftware||'',softwareVersion:device.softwareVersion||''});
 return fields;
}
export async function saveEquipmentReplacement(runQuery,payload){
 const result=await runQuery(client=>client.rpc('replace_machine_equipment',payload));
 if(['42883','PGRST202'].includes(result.error?.code))throw Object.assign(new Error('Database chưa có giao dịch thay thiết bị. Bản nháp được giữ nguyên.'),{code:'SCHEMA_MIGRATION_REQUIRED'});
 if(result.error){
 const messages={PT409:'Hồ sơ hoặc thiết bị đã thay đổi. Hãy tải lại hồ sơ và chọn lại thiết bị; bản nháp vẫn được giữ.', '42501':'Tài khoản không có quyền thay thiết bị trong miền này.', '23514':'Thông tin hoặc tình trạng thiết bị chưa phù hợp để ghép.', '55P03':'Thiết bị đang được người khác cập nhật. Vui lòng thử lại.', '40P01':'Có cập nhật đồng thời. Giao dịch chưa được lưu; vui lòng thử lại.'};
 throw Object.assign(new Error(messages[result.error.code]||'Chưa lưu được thay thiết bị. Bản nháp được giữ để thử lại.'),{code:result.error.code});
 }
 if(!result.data?.ok || result.data.setCode!==payload.p_set_code || result.data.newDeviceId!==payload.p_device_id)throw Object.assign(new Error('Server chưa xác nhận đúng thiết bị. Giữ bản nháp để đối chiếu.'),{code:'PERSISTENCE_DENIED'});
 return result.data;
}

export async function readReplacementEvents(runQuery){
 const result=await fetchAllRows(client=>client.from('equipment_replacement_events').select('*',{count:'exact'}).order('changed_at',{ascending:false}).order('operation_id'),runQuery,'equipmentReplacementEvents',{key:'operation_id'});
 if(result.error)throw result.error;
 return result.data;
}
