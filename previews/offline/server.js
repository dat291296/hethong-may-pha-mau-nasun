import { getCacheStrict, setCache } from '../../src/shared/sync/offlineDb.js';
export const machines = [
  {setCode:'NS-DEMO-001',nppId:'DEMO-N1',nppName:'NPP Minh An · dữ liệu mẫu',region:'Miền Bắc',status:'DA_LAP_DAT',dispenserModel:'Hero 23',dispenserSerial:'DEMO-C01',mixerModel:'Gyro',mixerSerial:'DEMO-L01',computerModel:'Dell Optiplex',computerSerial:'DEMO-PC01',printerModel:'Brother',printerSerial:'DEMO-P01',nextMaintenanceDue:'2026-11-26'},
  {setCode:'NS-DEMO-002',nppId:'DEMO-N2',nppName:'NPP Hòa Bình · dữ liệu mẫu',region:'Miền Bắc',status:'DA_LAP_DAT',dispenserModel:'Satint',dispenserSerial:'DEMO-C02',mixerModel:'Shaker',mixerSerial:'',computerModel:'HP',computerSerial:'DEMO-PC02',printerModel:'Brother',printerSerial:'DEMO-P02'},
];
export const npps = machines.map(row=>({id:row.nppId,name:row.nppName,region:row.region,address:'Địa chỉ minh họa'}));
export function createDemoServer(owner, controls) {
  const key='demo-server:v1';
  const load=async()=>await getCacheStrict(key)||{rows:Object.fromEntries(machines.map(row=>[row.setCode,{id:row.setCode,version:0,notes:'Dữ liệu server mô phỏng ban đầu'}])),receipts:{},audit:[],cursor:0};
  const store=async state=>{if(!await setCache(key,state))throw Error('Không lưu được server mô phỏng.');};
  return {
    snapshot:load,
    modify:async id=>{const state=await load();state.rows[id].version++;state.rows[id].notes='Đồng nghiệp vừa cập nhật trên server mô phỏng';state.cursor++;await store(state);},
    send:async operation=>{
      const account=owner();
      if(controls.mode==='offline')throw Error('NETWORK_ERROR');
      if(controls.mode==='expired')return {status:401};
      if(controls.mode==='forbidden'||account!==operation.owner)return {status:403};
      const state=await load();
      if(Object.hasOwn(state.receipts,operation.id))return state.receipts[operation.id];
      const row=state.rows[operation.entityId];
      if(!row)return {status:422};
      if(row.version!==operation.baseVersion)return {status:409,version:row.version};
      row.notes=operation.payload.notes;row.version++;state.cursor++;
      const receipt={operationId:operation.id,ok:true,version:row.version};
      state.receipts[operation.id]=receipt;state.audit.push({operationId:operation.id,kind:operation.kind,at:Date.now()});
      await store(state);
      if(controls.mode==='lost'){controls.mode='online';throw Error('RESPONSE_LOST');}
      return receipt;
    },
    pull:async()=>{
      if(['offline','expired','forbidden'].includes(controls.mode))throw Error('Chưa kết nối hoặc xác minh được phiên.');
      const state=await load();return {cursor:state.cursor,rows:Object.values(state.rows).map(row=>({...row,owner:owner()}))};
    },
  };
}
