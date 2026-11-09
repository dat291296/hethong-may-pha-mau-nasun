export const REPAIR_SUMMARY_COLUMNS = 'id,ticket_code,date,technician,npp_id,npp_name,product_category,machine_model,serial_number,error_description,error_category,action_direction,replacement_condition,processing_status,customer_return_status,notes,asset_code,field_visit_status,service_checklist,materials_used,npp_confirmation,sla_due_at,completed_at,assigned_user_id,assignment_due_date,record_version,last_updated_at,last_updated_by';
export const REPAIR_DETAIL_COLUMNS = `${REPAIR_SUMMARY_COLUMNS},photos,before_photos,after_photos`;

export function mergeRepairSummary(summary, previous) {
  const currentDetails = previous?.detailsLoaded !== false && previous?.recordVersion === summary.recordVersion;
  return { ...summary, detailsLoaded: Boolean(currentDetails),
    photos: currentDetails ? previous.photos : [],
    beforePhotos: currentDetails ? previous.beforePhotos : [],
    afterPhotos: currentDetails ? previous.afterPhotos : [] };
}

export function requireRepairDetails(ticket) {
  if (!ticket || ticket.detailsLoaded === false) throw new Error('Chưa tải đủ ảnh của phiếu. Kết nối mạng và mở lại phiếu trước khi sửa hoặc sao lưu.');
  return ticket;
}
