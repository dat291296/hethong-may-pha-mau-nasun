import {normalizeDateFields} from '../utils/dateUtils.js';
import {requireCompleteWrite} from './guardedWrite.js';
export async function saveSystemSetEdit(runQuery,setCode,updates,revision) {
 if(!revision || !Number.isFinite(Date.parse(revision))) throw Object.assign(new Error('Giữ bản nháp và tải lại hồ sơ máy để lấy phiên bản mới trước khi lưu.'),{code:'REVISION_REQUIRED'});
 if(updates.set_code && updates.set_code!==setCode) throw Object.assign(new Error('Không được đổi mã bộ máy.'),{code:'PERSISTENCE_DENIED'});
 const {set_code:_code,...payload}=normalizeDateFields(updates,{install_date:'Ngày lắp đặt',last_maintenance_date:'Ngày bảo trì gần nhất',next_maintenance_due:'Hạn bảo trì'});
 return requireCompleteWrite(await runQuery(client=>client.from('system_sets').update(payload).eq('set_code',setCode).eq('updated_at',revision).select('set_code,updated_at')));
}
