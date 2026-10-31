import { isSupabaseConfigured, safeQuery } from '../../../shared/lib/supabase.js';
import { enqueueOfflineAction } from '../../../shared/lib/offlineSync.js';
import { isTransientMutationError } from '../../../shared/lib/durableMutation.js';
import {submitFieldCommand} from '../../fieldwork/lib/fieldCommandClient.js';

function createOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function isRpcUnavailable(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST202' || message.includes('execute_equipment_workflow') && message.includes('schema cache');
}

function isRetryable(error) {
  return isTransientMutationError(error);
}

export async function executeWorkflowTransaction(workflow, data) {
  if(isSupabaseConfigured){
    if(!navigator.onLine||data.confirmedOnline!==true)throw Object.assign(new Error('Kết nối mạng và xác nhận lại bộ máy/NPP trước khi thực hiện.'),{code:'ONLINE_CONFIRMATION_REQUIRED'});
    const {operationId,expectedRevision,confirmedOnline,...payload}=data;
    return submitFieldCommand({kind:workflow,entityId:data.setCode,expected:expectedRevision,payload,operationId},{confirmed:confirmedOnline});
  }
  const operationId = data.operationId || createOperationId();
  const queuePayload = { operationId, workflow, data };

  if (!isSupabaseConfigured || !navigator.onLine) {
    await enqueueOfflineAction('EXECUTE_WORKFLOW', queuePayload);
    return { queued: true, operationId };
  }

  const { data: result, error } = await safeQuery(
    sb => sb.rpc('execute_equipment_workflow', {
      p_operation_id: operationId,
      p_workflow: workflow,
      p_payload: data
    }),
    `executeWorkflow:${workflow}`
  );

  if (!error) return { queued: false, operationId, result };
  if (isRpcUnavailable(error)) {
    throw Object.assign(new Error('Chưa có RPC giao dịch trên Supabase. Cần áp dụng workflow_transactions_migration.sql trước khi thực hiện.'), { code: 'WORKFLOW_MIGRATION_REQUIRED' });
  }
  if (isRetryable(error)) {
    await enqueueOfflineAction('EXECUTE_WORKFLOW', queuePayload);
    return { queued: true, operationId, error };
  }
  throw error;
}
