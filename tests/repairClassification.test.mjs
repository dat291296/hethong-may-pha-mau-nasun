import test from 'node:test';
import assert from 'node:assert/strict';
import {SERVICE_CHECKLIST,failureComponents,summarizeFailureComponents,requiresRepairReturn,isRepairAwaitingReturn,repairReturnLabel} from '../src/lib/repairClassification.js';
import {repairMissingFields} from '../src/lib/repairCompleteness.js';
import {repairNeedsAction} from '../src/lib/teamWorkspace.js';
test('local service never creates a return backlog, exchanges and explicit collections do',()=>{
 const local={actionDirection:'Sửa chữa',processingStatus:'Đã xử lý',customerReturnStatus:'Chưa gửi trả'};
 assert.equal(requiresRepairReturn(local),false);assert.equal(isRepairAwaitingReturn(local),false);assert.equal(repairReturnLabel(local),'Không cần gửi trả');assert.equal(repairNeedsAction(local),false);
 assert.equal(isRepairAwaitingReturn({...local,actionDirection:'Xuất đổi'}),true);
 assert.equal(isRepairAwaitingReturn({...local,serviceChecklist:{returnRequired:true}}),true);
 assert.equal(isRepairAwaitingReturn({...local,actionDirection:'Xuất đổi',customerReturnStatus:'Đã gửi trả'}),false);
 assert.equal(repairReturnLabel({...local,customerReturnStatus:'Đã gửi trả'}),'Đã gửi trả');
});
test('component incidents count once per ticket and remain separate by equipment category',()=>{
 assert.deepEqual(failureComponents({errorCategory:'Main; SSD; Main'}),['Main','SSD']);
 const rows=summarizeFailureComponents([{productCategory:'Case',errorCategory:'SSD; Main; SSD'},{productCategory:'Case',errorCategory:'SSD'},{productCategory:'AIO',errorCategory:'SSD'},{}]);
 assert.equal(rows[0].category,'Case');assert.equal(rows[0].component,'SSD');assert.equal(rows[0].count,2);assert.equal(rows.length,3);
});
test('only inspection and functional test contribute to required service checklist',()=>{
 assert.deepEqual(SERVICE_CHECKLIST.map(([key])=>key),['inspection','functionalTest']);
 const ticket={fieldVisitStatus:'completed',serviceChecklist:{inspection:true,functionalTest:true,returnRequired:true}};
 assert.ok(!repairMissingFields(ticket).includes('Checklist công tác'));
 assert.ok(repairMissingFields({...ticket,serviceChecklist:{inspection:true}}).includes('Checklist công tác'));
});
