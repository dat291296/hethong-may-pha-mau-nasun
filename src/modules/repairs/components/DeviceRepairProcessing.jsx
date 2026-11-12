import RepairEditorDialog from './RepairEditorDialog.jsx';
import RepairDetailDialog from './RepairDetailDialog.jsx';
import { DataLoadingState, EmptyState } from '../../../shared/components/DataState.jsx';
import { SERVICE_CHECKLIST, failureComponents, summarizeFailureComponents, requiresRepairReturn, isRepairAwaitingReturn } from '../lib/repairClassification.js';
import { userErrorMessage } from '../../../shared/security/userError.js';
import { repairListPage, repairStringList, hasMalformedRepairLists, uniqueAssignedMachine, getRepairTicketYear } from '../lib/repairList.js';
import { validateDocumentFile } from '../../handbook/lib/technicalResources.js';
import { compressImage } from '../../../shared/utils/imageCompressor.js';
import { mapWithConcurrency } from '../../../shared/utils/mapWithConcurrency.js';
import { validateRepairReturn } from '../lib/repairLifecycle.js';
import { repairMissingFields } from '../lib/repairCompleteness.js';
import { getOwnedCacheEntries } from '../../../shared/sync/offlineDb.js';
import { isDraftExpired } from '../../fieldwork/lib/teamWorkspace.js';
import WorkspaceFilterBar from '../../../shared/components/WorkspaceFilterBar.jsx';
import { matchesSearch, matchesDateRange, uniqueOptions, canEditRegion } from '../../../shared/workspace/workspaceFilters.js';
import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { formatDateVN, getTodayIsoDate } from '../../../shared/utils/dateUtils.js';
import { Wrench, Eye, Edit3, Trash2, Clock, RefreshCw, PackageCheck, BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { sanitizeFormData, validateSerial } from '../../../shared/security/sanitize.js';
import { confirmAction } from '../../../shared/utils/confirmDialog.js';

export const MACHINE_MODELS = [
  'AI88',
  'AIO',
  'Case máy tính',
  'Màn hình máy tính',
  'QL700',
  'Satint A2',
  'Satint A2-100',
  'Hero',
  'D200',
  'Khác / Linh kiện'
];

export const PRODUCT_CATEGORIES = [
  'Máy chiết',
  'Máy lắc',
  'Case',
  'AIO',
  'QL700',
  'Màn hình',
  'Khác / Linh kiện'
];

const EMPTY_SERVICE_CHECKLIST = Object.freeze(Object.fromEntries(SERVICE_CHECKLIST.map(([key]) => [key, false])));

function createFieldWorkflowDefaults() {
  return {
    assetCode: '',
    fieldVisitStatus: 'scheduled',
    serviceChecklist: { ...EMPTY_SERVICE_CHECKLIST },
    materialsUsed: [],
    beforePhotos: [],
    afterPhotos: [],
    nppConfirmation: { confirmed: false, confirmedBy: '', confirmedAt: null },
    slaDueAt: null,
    completedAt: null
  };
}

import { useAuth } from '../../../shared/context/AuthContext.jsx';
import { useModalScrollLock } from '../../../shared/hooks/useModalScrollLock.js';
import { exportExcel } from '../../../shared/utils/excelExport.js';
import { useFormDraft } from '../../../shared/hooks/useFormDraft';
import { useWorkspaceState, useWorkspaceScroll } from '../../../shared/hooks/useWorkspaceState';
import FloatingActionButton from '../../../shared/components/FloatingActionButton.jsx';

export default function DeviceRepairProcessing({ globalSearch = '', initialFilter = 'ALL',
  repairTickets = [],
  npps = [],
  systemSets = [],
  qcUsers = [],
  ticketCatalog,
  loading=false,
  loadError='',
  onReload,
  onLoadTicket,
  onAddTicket,
  onEditTicket,
  onDeleteTicket,
  onPrintTicket,
  prefilledTicket,
  onClearPrefill,
  onReturnToProfile,
  onOpenImportModal,
  isDateLocked = () => false
}) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [photoBusy,setPhotoBusy]=useState(false);
  const errorPhotoInput = React.useRef(null);
  async function addErrorPhotos(event){
    const files=Array.from(event.target.files||[]);event.target.value='';setSaveError('');setPhotoBusy(true);
    try {
      if(files.length+repairStringList(formData.photos).length>6)throw new Error('Tối đa 6 ảnh lỗi cho mỗi phiếu.');
      const images=await mapWithConcurrency(files,2,async file=>{if(!file.type.startsWith('image/'))throw new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP.');await validateDocumentFile(file);return compressImage(file);});
      setFormData(previous=>({...previous,photos:[...(previous.photos||[]),...images]}));
    }catch(error){setSaveError(userErrorMessage(error));}finally{setPhotoBusy(false);}
  }
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [activeTab, setActiveTab] = useWorkspaceState('repairs:state', 'ALL'); // ALL | PENDING | NOT_RETURNED | REPLACED
  const [searchTerm, setSearchTerm] = useWorkspaceState('repairs:search', '');
  useEffect(() => { if (globalSearch) setSearchTerm(globalSearch); }, [globalSearch, setSearchTerm]);
  const [nppSearchTerm, setNppSearchTerm] = useState('');

  const nppById=useMemo(()=>new Map(npps.map(item=>[item.id,item])),[npps]);
  const deferredSearch=useDeferredValue(searchTerm);
  const [listPage,setListPage]=useWorkspaceState('repairs:page',1);
  const [listSize,setListSize]=useWorkspaceState('repairs:page-size',20);
  const isTicketAllowed = ticketNppId => canEditRegion(user, nppById.get(ticketNppId)?.region);
  useWorkspaceScroll('repairs');
  const [categoryFilter, setCategoryFilter] = useWorkspaceState('repairs:category', 'ALL');
  const [modelFilter, setModelFilter] = useWorkspaceState('repairs:model', 'ALL');
  const [provinceFilter, setProvinceFilter] = useWorkspaceState('repairs:province', 'ALL');
  const [ownerFilter, setOwnerFilter] = useWorkspaceState('repairs:owner', 'ALL');
  const [dateFrom, setDateFrom] = useWorkspaceState('repairs:from', '');
  const [dateTo, setDateTo] = useWorkspaceState('repairs:to', '');
  const availableYears = useMemo(() => [...new Set(repairTickets.map(ticket => getRepairTicketYear(ticket.date)).filter(Boolean))].sort((a,b)=>Number(b)-Number(a)), [repairTickets]);
  const [selectedYear, setSelectedYear] = useWorkspaceState('repairs:year', String(new Date().getFullYear()));

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const openedSearch = React.useRef('');
  const detailRequest = React.useRef(0);
  useEffect(() => () => { detailRequest.current++; }, []);
  const loadTicket = async ticket => {
    if (onLoadTicket) return onLoadTicket(ticket.id);
    if (ticket.detailsLoaded === false) throw new Error('Chưa tải đủ chi tiết phiếu. Kết nối mạng và thử lại.');
    return ticket;
  };
  const openDetail = async ticket => {
    const request = ++detailRequest.current;
    setSaveError(''); setSaveNotice('Đang tải chi tiết phiếu…');
    try {
      const fullTicket = await loadTicket(ticket);
      if (request === detailRequest.current) { setSelectedTicket(fullTicket); setSaveNotice(''); }
    } catch (error) {
      if (request === detailRequest.current) { setSaveNotice(''); setSaveError(userErrorMessage(error)); }
    }
  };
  React.useEffect(() => {
    if (!globalSearch) { openedSearch.current = ''; return; }
    if (openedSearch.current === globalSearch) return;
    const ticket = repairTickets.find(item => item.ticketCode === globalSearch);
    if (ticket) { openedSearch.current = globalSearch; void openDetail(ticket); }
  }, [globalSearch, repairTickets]);

  // Only visible dialogs may lock page scrolling. `editingTicket` is retained
  // as form context and can outlive a dismissed editor while its draft remains.
  useModalScrollLock(showModal || !!selectedTicket);

  const yearTickets = useMemo(
    () => selectedYear === 'ALL' ? repairTickets : repairTickets.filter(ticket => getRepairTicketYear(ticket.date) === selectedYear),
    [repairTickets, selectedYear]
  );

  // Failure statistics follow the selected year.
  const failureStats = useMemo(() => {
    const categoryCount = {};
    const errorTypeCount = {};

    yearTickets.forEach(t => {
      const cat = t.productCategory || 'Khác';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;

      const err = t.errorCategory || (t.errorDescription ? t.errorDescription.slice(0, 20) : 'Sự cố chung');
      errorTypeCount[err] = (errorTypeCount[err] || 0) + 1;
    });

    const categoryData = Object.keys(categoryCount).map(name => ({
      name,
      count: categoryCount[name]
    })).sort((a, b) => b.count - a.count);

    const colors = ['#f43f5e', '#f59e0b', '#3b82f6', '#10b981', '#a855f7', '#64748b'];
    const pieData = Object.keys(categoryCount).map((name, idx) => ({
      name,
      value: categoryCount[name],
      color: colors[idx % colors.length]
    }));

    return { categoryData, pieData };
  }, [yearTickets]);

  const componentStats = useMemo(() => summarizeFailureComponents(yearTickets), [yearTickets]);

  // Form State
  const defaultTechnician = (user && ['admin', 'manager', 'technician', 'qc'].includes(user.role))
    ? (user.name || user.full_name)
    : (qcUsers && qcUsers.length > 0 ? qcUsers[0].name : 'Nguyễn Văn Hùng');

  const getDeviceFromCombo = (assignedSet, category) => {
    if (!assignedSet) return { model: '', serial: '', assetCode: '' };
    switch (category) {
      case 'Máy chiết':
      case 'Máy Chiết Sơn':
        return {
          model: assignedSet.dispenserModel || 'Satint A2',
          serial: assignedSet.dispenserSerial || '',
          assetCode: assignedSet.dispenserId || ''
        };
      case 'Máy lắc':
      case 'Máy Lắc Sơn':
        return {
          model: assignedSet.mixerModel || 'Satint ST-50',
          serial: assignedSet.mixerSerial || '',
          assetCode: assignedSet.mixerId || ''
        };
      case 'Case':
        return {
          model: assignedSet.pcType === 'Case' ? (assignedSet.pcOs || 'Case PC') : 'Case PC',
          serial: assignedSet.pcType === 'Case' ? (assignedSet.pcSerial || '') : (assignedSet.pcSerial || ''),
          assetCode: assignedSet.computerId || ''
        };
      case 'AIO':
        return {
          model: assignedSet.pcType === 'AIO' ? (assignedSet.pcOs || 'AIO PC') : 'AIO PC',
          serial: assignedSet.pcType === 'AIO' ? (assignedSet.pcSerial || '') : (assignedSet.pcSerial || ''),
          assetCode: assignedSet.computerId || ''
        };
      case 'QL700':
      case 'Máy In Tem QL700':
        return {
          model: assignedSet.printerModel || 'QL700',
          serial: assignedSet.printerSerial || '',
          assetCode: assignedSet.printerId || ''
        };
      case 'Màn hình':
        return {
          model: 'Màn hình',
          serial: '',
          assetCode: ''
        };
      default:
        return {
          model: '',
          serial: '',
          assetCode: ''
        };
    }
  };

  const [formData, setFormData] = useState({
    ...createFieldWorkflowDefaults(),
    date: getTodayIsoDate(),
    technician: defaultTechnician,
    assignedUserId: user?.id || null,
    assignmentDueDate: '',
    nppId: '',
    nppName: '',
    productCategory: 'Máy chiết',
    machineModel: 'Satint A2',
    serialNumber: '',
    errorCategory: '',
    errorDescription: '',
    photos: [],
    actionDirection: 'Sửa chữa',
    exchangeType: 'Không xuất đổi',
    replacementCondition: 'Mới',
    processingStatus: 'Chưa xử lý',
    customerReturnStatus: 'Chưa gửi trả',
    notes: ''
  });
  const [handbookErrors, setHandbookErrors] = useState([]);
  useEffect(() => { let active = true; import('../../../shared/sync/offlineSync.js').then(({ getCachedOfflineData }) => getCachedOfflineData('tech_handbook_errors', [])).then(rows => { if (active && Array.isArray(rows)) setHandbookErrors(rows); }).catch(() => {}); return () => { active = false; }; }, []);
  const draft = useFormDraft(`${user.id}:repair:${editingTicket?.id || 'new'}`, formData, showModal, saved => setFormData(saved));
  const [savedDrafts, setSavedDrafts] = useState([]);
  const [resumeRequested, setResumeRequested] = useState(false);
  useEffect(() => {
    let active = true;
    if (!showModal) getOwnedCacheEntries(`form-draft:${user.id}:repair:`).then(entries => {
      if (active) setSavedDrafts(entries.filter(entry => entry.value && !isDraftExpired(entry.value)).sort((a, b) => b.value.savedAt - a.value.savedAt));
    }).catch(() => { if (active) setSaveError('Không đọc được danh sách bản nháp trên thiết bị.'); });
    return () => { active = false; };
  }, [showModal, user.id]);
  useEffect(() => {
    if (resumeRequested && draft.existing) { draft.resume(); setResumeRequested(false); }
  }, [resumeRequested, draft.existing]);
  const closeForm = async () => {
    if (saving || photoBusy) return;
    try {
      await draft.flush();
      setShowModal(false);
      setEditingTicket(null);
      onReturnToProfile?.();
    }
    catch { setSaveError('Chưa lưu được nháp. Hãy giữ phiếu mở và thử lại.'); }
  };

  // Auto-fill from Handbook if prefilledTicket is provided
  React.useEffect(() => {
    if (prefilledTicket) {
      setEditingTicket(null);
      setNppSearchTerm('');
      setFormData({
        ...createFieldWorkflowDefaults(),
        date: getTodayIsoDate(),
        technician: defaultTechnician,
    assignedUserId: user?.id || null,
    assignmentDueDate: '',
        nppId: prefilledTicket.nppId || (npps.length > 0 ? npps[0].id : ''),
        nppName: prefilledTicket.nppName || (npps.length > 0 ? npps[0].name : ''),
        productCategory: prefilledTicket.productCategory || 'Máy chiết',
        machineModel: prefilledTicket.machineModel || 'Satint A2',
        serialNumber: prefilledTicket.serialNumber || '',
        assetCode: prefilledTicket.assetCode || '',
        errorCategory: prefilledTicket.errorCategory || '',
        errorDescription: prefilledTicket.errorDescription || '',
        photos: [],
        actionDirection: prefilledTicket.actionDirection || 'Sửa chữa',
        exchangeType: prefilledTicket.exchangeType || 'Không xuất đổi',
        replacementCondition: 'Mới',
        processingStatus: 'Chưa xử lý',
        customerReturnStatus: 'Chưa gửi trả',
        notes: ''
      });
      setShowModal(true);
      if (onClearPrefill) onClearPrefill();
    }
  }, [prefilledTicket]);


  const handleOpenAdd = () => {
    setEditingTicket(null);
    setNppSearchTerm('');
    setFormData({
      ...createFieldWorkflowDefaults(),
      date: getTodayIsoDate(),
      technician: defaultTechnician,
    assignedUserId: user?.id || null,
    assignmentDueDate: '',
      nppId: '',
      nppName: '',
      productCategory: 'Máy chiết',
      machineModel: 'Satint A2',
      serialNumber: '',
      errorCategory: '',
      errorDescription: '',
      photos: [],
      actionDirection: 'Sửa chữa',
      exchangeType: 'Không xuất đổi',
      replacementCondition: 'Mới',
      processingStatus: 'Chưa xử lý',
      customerReturnStatus: 'Chưa gửi trả',
      notes: ''
    });
    setShowModal(true);
  };

  const exportRepairs = () => {
    exportExcel(yearTickets, [
      { key: 'ticketCode', label: 'Mã Phiếu' }, { key: 'date', label: 'Ngày (YYYY-MM-DD)' },
      { key: 'nppName', label: 'Nhà Phân Phối' }, { key: 'productCategory', label: 'Loại Thiết Bị' },
      { key: 'machineModel', label: 'Model' }, { key: 'serialNumber', label: 'Số Seri' },
      { key: 'errorCategory', label: 'Bộ Phận / Linh Kiện Lỗi' }, { key: 'errorDescription', label: 'Diễn Giải Lỗi' }, { key: 'technician', label: 'Kỹ Thuật Viên' },
      { key: 'processingStatus', label: 'Trạng Thái Xử Lý' }, { key: 'assetCode', label: 'Mã QR / Mã QL' },
      { key: 'fieldVisitStatus', label: 'Trạng Thái Công Tác' }, { key: 'slaDueAt', label: 'Hạn SLA' },
      { key: 'notes', label: 'Ghi Chú' }
    ], 'Phieu_Sua_Chua', 'PhieuSuaChua');
  };

  const handleOpenEdit = async (ticket) => {
    const request = ++detailRequest.current;
    setSaveError(''); setSaveNotice('Đang tải phiếu để sửa…');
    try { ticket = await loadTicket(ticket); }
    catch (error) {
      if (request === detailRequest.current) { setSaveNotice(''); setSaveError(userErrorMessage(error)); }
      return;
    }
    if (request !== detailRequest.current) return;
    setSaveNotice('');
    if (isDateLocked(ticket.date)) {
      alert(`Thao tác bị khóa: Phiếu thuộc tháng ${ticket.date.substring(0, 7)} đã chốt sổ kế toán!`);
      return;
    }
    if (!isTicketAllowed(ticket.nppId)) {
      alert('Bạn không có quyền chỉnh sửa phiếu sửa chữa ở khu vực này!');
      return;
    }
    if(hasMalformedRepairLists(ticket)){setSaveError('Phiếu có dữ liệu ảnh hoặc vật tư cũ sai định dạng. Chưa mở sửa để tránh ghi mất dữ liệu; báo quản trị viên đối chiếu.');return;}
    if(ticket.syncPending){setSaveNotice('Phiếu còn trong hàng chờ. Đồng bộ và đối chiếu trước khi sửa tiếp.');return;}
    setEditingTicket(ticket);
    setNppSearchTerm('');
    setFormData({
      ...createFieldWorkflowDefaults(),
      ...ticket,
      productCategory: ticket.productCategory === 'Máy tính' ? (/aio|all in one/i.test(ticket.machineModel || '') ? 'AIO' : 'Case') : ticket.productCategory === 'Máy in' ? 'QL700' : ['Phụ kiện','Linh kiện'].includes(ticket.productCategory) ? 'Khác / Linh kiện' : ticket.productCategory,
      exchangeType: ticket.exchangeType || (ticket.actionDirection === 'Xuất đổi' ? 'Xuất đổi máy mới 100%' : 'Không xuất đổi')
    });
    setShowModal(true);
  };

  // Helper when NPP is chosen: auto detect linked system set
  const currentAssignedSet = useMemo(() => {
    if (!formData.nppId) return null;
    return uniqueAssignedMachine(systemSets,formData.nppId);
  }, [systemSets, formData.nppId]);

  const filteredNpps = useMemo(() => {
    if (!nppSearchTerm.trim()) return npps;
    return npps.filter(n => matchesSearch(nppSearchTerm,[n.name,n.id,n.region,n.province,n.phone]));
  }, [npps, nppSearchTerm]);

  const handleCategoryChange = (newCat) => {
    const assignedSet = uniqueAssignedMachine(systemSets,formData.nppId);
    const { model, serial, assetCode } = getDeviceFromCombo(assignedSet, newCat);
    setFormData(prev => ({
      ...prev,
      productCategory: newCat,
      handbookErrorCode: '',
      machineModel: model !== undefined && model !== '' ? model : (newCat === 'Màn hình' ? 'Màn hình' : ''),
      serialNumber: serial !== undefined ? serial : prev.serialNumber,
      assetCode: assetCode || '',
      actionDirection: ['Máy chiết', 'Máy lắc'].includes(newCat) ? 'Sửa chữa' : prev.actionDirection,
      exchangeType: ['Máy chiết', 'Máy lắc'].includes(newCat) ? 'Không xuất đổi' : prev.exchangeType
    }));
  };

  const handleSelectNpp = (selectedId) => {
    const targetNpp = npps.find(n => n.id === selectedId);
    const assignedSet = uniqueAssignedMachine(systemSets,selectedId);
    const currentCat = formData.productCategory || 'Máy chiết';
    const { model, serial, assetCode } = getDeviceFromCombo(assignedSet, currentCat);

    setFormData(prev => ({
      ...prev,
      nppId: selectedId,
      nppName: targetNpp ? targetNpp.name : '',
      machineModel: model || '',
      serialNumber: serial !== undefined ? serial : prev.serialNumber,
      assetCode: assetCode || ''
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || photoBusy || draft.existing) return;
    setSaveError('');
    if(hasMalformedRepairLists(formData)){setSaveError('Dữ liệu ảnh hoặc vật tư trong bản nháp chưa đúng định dạng. Bản gốc được giữ nguyên; cần đối chiếu trước khi lưu.');return;}

    // Sanitize input form data
    const sanitized = sanitizeFormData({
      ...formData,
      ...(['Máy chiết', 'Máy lắc'].includes(formData.productCategory)
        ? { actionDirection: 'Sửa chữa', exchangeType: 'Không xuất đổi' }
        : {})
    });

    if (!sanitized.nppId || !sanitized.date) { setSaveError('Vui lòng chọn NPP và ngày xử lý. Các nội dung khác có thể bổ sung sau.'); return; }
    sanitized.materialsUsed=repairStringList(formData.materialsUsed).map(item=>item.trim()).filter(Boolean);
    sanitized.photos = formData.photos || [];
    sanitized.beforePhotos = formData.beforePhotos || [];
    sanitized.afterPhotos = formData.afterPhotos || [];
    sanitized.ticketCode = String(formData.ticketCode || '').trim();
    if (editingTicket && !sanitized.ticketCode) { setSaveError('Vui lòng nhập mã phiếu.'); return; }
    const duplicateCode = repairTickets.find(ticket => ticket.id !== editingTicket?.id && ticket.ticketCode?.trim().toLowerCase() === sanitized.ticketCode.toLowerCase());
    if (sanitized.ticketCode && duplicateCode) { setSaveError(`Mã phiếu đã được dùng tại ${duplicateCode.nppName || 'NPP khác'}: ${duplicateCode.ticketCode}`); return; }
    // Format validation (chỉ kiểm tra nếu có nhập serial)
    if (sanitized.serialNumber && sanitized.serialNumber.trim() && sanitized.serialNumber !== 'Không có seri') {
      const serialCheck = validateSerial(sanitized.serialNumber);
      if (!serialCheck.valid) {
        alert(serialCheck.error);
        return;
      }
    }

    // Check monthly closing locks
    if (isDateLocked(sanitized.date)) {
      alert(`Thao tác bị khóa: Tháng ${sanitized.date.substring(0, 7)} đã chốt sổ kế toán!`);
      return;
    }
    if (editingTicket && isDateLocked(editingTicket.date)) {
      alert(`Thao tác bị khóa: Phiếu cũ thuộc tháng ${editingTicket.date.substring(0, 7)} đã chốt sổ kế toán!`);
      return;
    }

    // Check region permission
    if (!isTicketAllowed(sanitized.nppId)) {
      alert('Bạn không có quyền tạo hoặc chỉnh sửa phiếu sửa chữa ở khu vực này!');
      return;
    }

    if (sanitized.nppConfirmation?.confirmed) {
      sanitized.nppConfirmation = {
        ...sanitized.nppConfirmation,
        confirmedAt: sanitized.nppConfirmation.confirmedAt || new Date().toISOString()
      };
      sanitized.fieldVisitStatus = 'customer_confirmed';
    }

    if (!requiresRepairReturn(sanitized)) sanitized.customerReturnStatus = 'Chưa gửi trả';
    try {validateRepairReturn(sanitized);} catch(error){setSaveError(userErrorMessage(error));return;}
    const isCompleted = ['completed', 'customer_confirmed'].includes(sanitized.fieldVisitStatus);
    if (sanitized.fieldVisitStatus === 'customer_confirmed' && !sanitized.nppConfirmation?.confirmed) {
      alert('Vui lòng tích xác nhận hoàn thành của đại diện NPP.');
      return;
    }

    if (isCompleted) {
      sanitized.completedAt = sanitized.completedAt || new Date().toISOString();
    }

    const selectedNppObj = npps.find(n => n.id === sanitized.nppId);
    const finalNppName = selectedNppObj ? selectedNppObj.name : sanitized.nppName || 'NPP Khác';

    setSaving(true);
    try {
    if (editingTicket) {
      await draft.flush();
      await onEditTicket({
        ...sanitized,
        id: editingTicket.id,
        recordVersion: formData.recordVersion,
        nppName: finalNppName
      });
    } else {
      const now = new Date();
      const codePrefix = `TICK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
      const sequence = (ticketCatalog || repairTickets).reduce((max, ticket) => {
        const match = String(ticket.ticketCode || ticket.id || '').match(new RegExp(`^${codePrefix}(\\d+)$`));
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0) + 1;
      const newTicketCode = sanitized.ticketCode || `${codePrefix}${String(sequence).padStart(3, '0')}-${crypto.randomUUID().slice(0, 8)}`;
      const ticketId = sanitized.id || crypto.randomUUID();
      setFormData(previous => ({ ...previous, id: ticketId, ticketCode: newTicketCode }));
      await draft.flush({...formData,id:ticketId,ticketCode:newTicketCode});
      await onAddTicket({
        ...sanitized,
        id: ticketId,
        ticketCode: newTicketCode,
        nppName: finalNppName
      });
    }

    await draft.clear().catch(() => console.warn('[Repair] Draft cleanup failed'));
    const missing = repairMissingFields(sanitized);
    setSaveNotice(`${navigator.onLine ? 'Đã tiếp nhận phiếu; kiểm tra hàng chờ nếu chưa có xác nhận server.' : 'Đã lưu trên thiết bị, đang chờ đồng bộ.'}${missing.length ? ` Cần bổ sung: ${missing.join(' · ')}` : ''}`);
    setShowModal(false);
    setEditingTicket(null);
    setFormData(previous => ({ ...previous, id: undefined, ticketCode: '' }));
    onReturnToProfile?.();
    } catch (error) { console.error('[Repair] Save failed', error.code || error.name); setSaveError(userErrorMessage(error) || 'Chưa lưu được phiếu. Bản nháp vẫn được giữ.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (ticket) => {
    if (isDateLocked(ticket.date)) {
      alert(`Thao tác bị khóa: Phiếu thuộc tháng ${ticket.date.substring(0, 7)} đã chốt sổ kế toán!`);
      return;
    }
    if (!isTicketAllowed(ticket.nppId)) {
      alert('Bạn không có quyền xóa phiếu sửa chữa ở khu vực này!');
      return;
    }
    if (await confirmAction(`Bạn có chắc chắn muốn xóa Phiếu xử lý máy [${ticket.ticketCode}]?`, { title: 'Xác nhận xóa phiếu sửa chữa', confirmLabel: 'Xóa phiếu', danger: true })) {
      try { await onDeleteTicket(ticket.id); } catch { alert('Không xóa được phiếu. Dữ liệu được giữ nguyên; kiểm tra quyền và kết nối rồi thử lại.'); }
    }
  };

  React.useEffect(() => { if (initialFilter !== 'ALL') setActiveTab(initialFilter === 'RETURN' ? 'NOT_RETURNED' : initialFilter); }, [initialFilter]);
  // Filtered Tickets
  const filteredTickets = useMemo(()=>yearTickets.filter(t => {
    const distributor = nppById.get(t.nppId);
    const found = matchesSearch(deferredSearch,[t.ticketCode,t.nppName,t.serialNumber,t.technician,t.errorDescription,distributor?.province,distributor?.region]);
    if (provinceFilter !== 'ALL' && distributor?.province !== provinceFilter) return false;
    if (ownerFilter !== 'ALL' && (t.assignedUserId || t.technician) !== ownerFilter) return false;
    if (!matchesDateRange(t.date,dateFrom,dateTo)) return false;

    const matchesCategory = categoryFilter === 'ALL' || t.productCategory === categoryFilter;
    const matchesModel = modelFilter === 'ALL' || t.machineModel === modelFilter;

    let matchesTab = true;
    if (activeTab === 'PENDING') matchesTab = t.processingStatus === 'Chưa xử lý';
    if (activeTab === 'NOT_RETURNED') matchesTab = isRepairAwaitingReturn(t);
    if (activeTab === 'REPLACED') matchesTab = t.actionDirection === 'Xuất đổi';

    return found && matchesCategory && matchesModel && matchesTab;
  }),[yearTickets,nppById,deferredSearch,provinceFilter,ownerFilter,dateFrom,dateTo,categoryFilter,modelFilter,activeTab]);
  useEffect(()=>setListPage(1),[deferredSearch,provinceFilter,ownerFilter,dateFrom,dateTo,categoryFilter,modelFilter,activeTab,selectedYear,listSize,setListPage]);
  const pageData=repairListPage(filteredTickets,listPage,listSize);

  // Calculate statistics
  const pendingCount = yearTickets.filter(t => t.processingStatus === 'Chưa xử lý').length;
  const notReturnedCount = yearTickets.filter(t => isRepairAwaitingReturn(t)).length;
  const replacedCount = yearTickets.filter(t => t.actionDirection === 'Xuất đổi').length;

  return (
    <div className="workspace-screen devicerepairprocessing-screen" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {loading && (repairTickets.length === 0 ? <DataLoadingState label="Đang tải phiếu sửa chữa…" /> : <p role="status">Đang tải phiếu xử lý máy; dữ liệu đã có vẫn được giữ để xem.</p>)}
      {loadError&&<div className="resource-error" role="alert">{loadError}<button className="btn btn-secondary" disabled={loading} onClick={onReload}>Thử tải lại</button></div>}
      {saveError&&!showModal&&<p role="alert" className="resource-error">{saveError}</p>}
      {saveNotice && <p role="status" className="repair-save-notice">{saveNotice}</p>}

      {savedDrafts.length > 0 && <section className="glass-panel repair-draft-list" aria-label="Phiếu nháp đã lưu"><h3>Phiếu nháp trên thiết bị ({savedDrafts.length})</h3><p>Chỉ tài khoản này có thể mở các bản nháp trên thiết bị này.</p>{savedDrafts.map(entry => <div className="workspace-task-row" key={entry.key}><div><strong>{entry.value.value.nppName || 'Chưa chọn NPP'} · {entry.value.value.serialNumber || entry.value.value.productCategory}</strong><p>Lưu lúc {new Date(entry.value.savedAt).toLocaleString('vi-VN')}</p></div><button className="btn btn-primary" onClick={() => {
        const id = entry.key.slice(`form-draft:${user.id}:repair:`.length);
        if (id === 'new') handleOpenAdd();
        else { const ticket = repairTickets.find(item => item.id === id); if (!ticket) { alert('Phiếu gốc chưa có trong dữ liệu đã tải. Hãy tải lại trước khi mở nháp.'); return; } if (!isTicketAllowed(ticket.nppId) || isDateLocked(ticket.date)) { alert('Phiếu này không còn cho phép chỉnh sửa.'); return; } handleOpenEdit(ticket); }
        setResumeRequested(true);
      }}>Mở bản nháp</button></div>)}</section>}
      <WorkspaceFilterBar search={searchTerm} onSearch={setSearchTerm} placeholder="Tìm mã phiếu, NPP, seri…" count={filteredTickets.length} fields={[{key:'province',label:'Tỉnh / thành',value:provinceFilter,onChange:setProvinceFilter,options:uniqueOptions(npps.map(item=>item.province))},{key:'owner',label:'Người phụ trách',value:ownerFilter,onChange:setOwnerFilter,options:[...qcUsers.map(item=>({value:item.id,label:item.name || item.full_name || item.id})),...uniqueOptions(repairTickets.filter(item=>!item.assignedUserId).map(item=>item.technician))]},{key:'category',label:'Loại thiết bị',value:categoryFilter,onChange:setCategoryFilter,options:uniqueOptions(PRODUCT_CATEGORIES)},{key:'model',label:'Model',value:modelFilter,onChange:setModelFilter,options:uniqueOptions(MACHINE_MODELS)},{key:'from',label:'Ngày tiếp nhận · từ',type:'date',defaultValue:'',value:dateFrom,onChange:setDateFrom},{key:'to',label:'Ngày tiếp nhận · đến',type:'date',defaultValue:'',value:dateTo,onChange:setDateTo}]} inlineControl={<label className="filter-inline-control">Năm<select className="form-select" aria-label="Chọn năm sửa chữa" value={selectedYear} onChange={event=>setSelectedYear(event.target.value)}>{<option value="ALL">Tất cả năm</option>}{availableYears.map(year=><option key={year} value={String(year)}>{year}</option>)}</select></label>} quick={[{value:'ALL',label:'Tất cả',count:yearTickets.length},{value:'PENDING',label:'Chờ sửa',count:pendingCount},{value:'NOT_RETURNED',label:'Chờ trả',count:notReturnedCount},{value:'REPLACED',label:'Xuất đổi',count:replacedCount}]} quickValue={activeTab} onQuick={setActiveTab} onReset={() => { setSearchTerm(''); setActiveTab('ALL'); setCategoryFilter('ALL'); setModelFilter('ALL'); setProvinceFilter('ALL'); setOwnerFilter('ALL'); setDateFrom(''); setDateTo(''); setSelectedYear(String(new Date().getFullYear())); }} actions={<><details className="filter-more-actions"><summary>Thao tác khác</summary><div><button className="btn btn-secondary" onClick={()=>onOpenImportModal?.()}>Nhập Excel</button><button className="btn btn-secondary" onClick={exportRepairs}>Xuất Excel</button></div></details><button className="btn btn-primary" onClick={handleOpenAdd}>Tạo phiếu</button></>}/>

      <details className="glass-panel repair-component-summary"><summary>Thống kê bộ phận / linh kiện hay hỏng · {componentStats.length} nhóm · {selectedYear === 'ALL' ? 'tất cả năm' : `năm ${selectedYear}`}</summary><p>Số phiếu có ghi nhận từng linh kiện, chia theo loại thiết bị; một phiếu có thể có nhiều linh kiện. Phạm vi theo miền và năm đang xem. Chưa phân loại: {yearTickets.filter(ticket=>!failureComponents(ticket).length).length} phiếu.</p>{componentStats.length ? <div className="data-table-container"><table className="data-table"><thead><tr><th>Thiết bị</th><th>Bộ phận / linh kiện</th><th>Số phiếu</th></tr></thead><tbody>{componentStats.map(row=><tr key={row.key}><td>{row.category}</td><td>{row.component}</td><td>{row.count}</td></tr>)}</tbody></table></div> : <p>Chưa có phân loại linh kiện. Bổ sung khi chỉnh sửa phiếu.</p>}</details>
      {/* 1-YEAR FAILURE ANALYSIS DASHBOARD CHARTS */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)' }}>
              <BarChart2 size={20} /> Biểu Đồ Thống Kê Thiết Bị & Sự Cố Hay Hỏng Nhất Trong 1 Năm
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Phân tích tần suất hỏng hóc theo chủng loại thiết bị và linh kiện để chuẩn bị vật tư dự phòng.
            </p>
          </div>
          <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>{selectedYear === 'ALL' ? 'Tất cả năm' : `Năm ${selectedYear}`}: {yearTickets.length} phiếu sửa chữa</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {/* Chart 1: Failure Count by Product Category */}
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--accent-cyan)', display: 'block', marginBottom: '8px' }}>
              📊 Số Lượng Sự Cố Theo Thiết Bị
            </span>
            <div style={{ height: '180px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={failureStats.categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }} />
                  <Bar dataKey="count" name="Số lần sự cố" fill="#f43f5e" radius={[4, 4, 0, 0]}>
                    {failureStats.categoryData.map((entry, index) => {
                      const colors = ['#f43f5e', '#f59e0b', '#3b82f6', '#10b981', '#a855f7'];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Proportion Pie Chart */}
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--accent-emerald)', display: 'block', marginBottom: '8px' }}>
              🥧 Tỷ Lệ Hỏng Hóc Theo Chủng Loại
            </span>
            <div style={{ height: '180px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={failureStats.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {failureStats.pieData.map((entry, index) => (
                      <Cell key={`pie-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }} />
                  <Legend
                    verticalAlign="bottom"
                    height={26}
                    formatter={(val) => <span style={{ fontSize: '0.725rem', color: 'var(--text-main)' }}>{val}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>

        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-cyan)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Tổng Phiếu Năm {selectedYear}</span>
            <Wrench size={20} color="var(--accent-cyan)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '6px' }}>{yearTickets.length}</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-amber)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Chưa Xử Lý (Cần Gấp)</span>
            <Clock size={20} color="var(--accent-amber)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '6px', color: 'var(--accent-amber)' }}>{pendingCount}</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-rose)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Chưa Gửi Trả NPP</span>
            <PackageCheck size={20} color="var(--accent-rose)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '6px', color: 'var(--accent-rose)' }}>{notReturnedCount}</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-purple)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Phiếu Xuất Đổi Máy</span>
            <RefreshCw size={20} color="var(--accent-purple)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '6px', color: 'var(--accent-purple)' }}>{replacedCount}</div>
        </div>

      </div>

      <details className="filter-accounting-note"><summary>Quy định phiếu đã chốt sổ</summary><p>Không thể thêm, sửa hoặc xóa phiếu trong tháng đã chốt sổ kế toán.</p></details>

      {/* Tickets Data Table */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        {/* Desktop View Table */}
        <div className="desktop-only data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã Phiếu</th>
                <th>Ngày Xử Lý</th>
                <th>Kỹ Thuật Viên</th>
                <th>Nhà Phân Phối</th>
                <th>Sản Phẩm / Loại Máy</th>
                <th>Số Seri</th>
                <th>Diễn Giải Lỗi</th>
                <th>Hướng Xử Lý</th>
                <th>Tình Trạng Sửa</th>
                <th>Gửi Trả Khách</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    <EmptyState title="Chưa có phiếu phù hợp" description="Bỏ bộ lọc để tìm phiếu, hoặc chọn Tạo phiếu để ghi nhận công việc mới." onAction={() => { setSearchTerm(''); setActiveTab('ALL'); setCategoryFilter('ALL'); setModelFilter('ALL'); setProvinceFilter('ALL'); setOwnerFilter('ALL'); setDateFrom(''); setDateTo(''); }} />
                  </td>
                </tr>
              ) : (
                pageData.rows.map(ticket => (
                  <tr key={ticket.id}>
                    <td style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {ticket.ticketCode}
                    </td>
                    <td>{formatDateVN(ticket.date)}</td>
                    <td style={{ fontWeight: '600' }}>{ticket.technician}</td>
                    <td>{ticket.nppName}</td>
                    <td>
                      <div style={{ fontWeight: '700' }}>{ticket.machineModel}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ticket.productCategory}</div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>{ticket.serialNumber}</td>
                    <td style={{ maxWidth: '220px', fontSize: '0.825rem' }}>
                      <div style={{ color: 'var(--text-main)', fontWeight: '500' }}>{ticket.errorCategory && <strong>Linh kiện lỗi: {ticket.errorCategory} · </strong>}{ticket.errorDescription}</div><div className="repair-inline-photos">{repairStringList(ticket.photos).slice(0,3).map((url,index)=><button type="button" key={index} onClick={()=>void openDetail(ticket)} aria-label={`Xem ảnh lỗi ${index+1}`}><img loading="lazy" src={url} alt={ticket.errorCategory||'Ảnh lỗi thiết bị'}/></button>)}</div>{repairMissingFields(ticket).length > 0 && <p className="repair-missing-fields">⚠ Cần bổ sung: {repairMissingFields(ticket).join(' · ')}</p>}
                      {ticket.errorCategory && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>[{ticket.errorCategory}]</span>
                      )}
                    </td>
                    <td>
                      {ticket.actionDirection === 'Xuất đổi' ? (
                        <div>
                          <span className="badge badge-purple">🔄 Xuất Đổi</span>
                          <div style={{ fontSize: '0.725rem', marginTop: '2px', color: 'var(--accent-purple)' }}>Máy {ticket.replacementCondition}</div>
                        </div>
                      ) : (
                        <span className="badge badge-info">🛠️ Sửa Chữa</span>
                      )}
                    </td>
                    <td>
                      {ticket.processingStatus === 'Đã xử lý' ? (
                        <span className="badge badge-success">✓ Đã xử lý</span>
                      ) : (
                        <span className="badge badge-warning">⏳ Chưa xử lý</span>
                      )}
                    </td>
                    <td>
                      {!requiresRepairReturn(ticket) ? <span className="badge badge-neutral">Không cần gửi trả</span> : ticket.customerReturnStatus === 'Đã gửi trả' ? (
                        <span className="badge badge-success">✓ Đã gửi trả</span>
                      ) : (
                        <span className="badge badge-danger">📦 Chưa gửi trả</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} title="Xem chi tiết" onClick={() => void openDetail(ticket)}>
                          <Eye size={14} color="var(--accent-cyan)" />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', opacity: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 0.4 : 1, cursor: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 'not-allowed' : 'pointer' }}
                          title={isDateLocked(ticket.date) ? "Tháng đã chốt sổ" : !isTicketAllowed(ticket.nppId) ? "Bạn không phụ trách khu vực này" : "Chỉnh sửa phiếu"}
                          onClick={() => {
                            if (!isDateLocked(ticket.date) && isTicketAllowed(ticket.nppId)) {
                              handleOpenEdit(ticket);
                            }
                          }}
                        >
                          <Edit3 size={14} color={(isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? "var(--text-muted)" : "var(--accent-amber)"} />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', opacity: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 0.4 : 1, cursor: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 'not-allowed' : 'pointer' }}
                          title={isDateLocked(ticket.date) ? "Tháng đã chốt sổ" : !isTicketAllowed(ticket.nppId) ? "Bạn không phụ trách khu vực này" : "Xóa phiếu"}
                          onClick={() => {
                            if (!isDateLocked(ticket.date) && isTicketAllowed(ticket.nppId)) {
                              handleDelete(ticket);
                            }
                          }}
                        >
                          <Trash2 size={14} color={(isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? "var(--text-muted)" : "#ef4444"} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards */}
        <div className="mobile-only mobile-card-list">
          {filteredTickets.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <EmptyState title="Chưa có phiếu phù hợp" description="Bỏ bộ lọc để tìm phiếu, hoặc chọn Tạo phiếu để ghi nhận công việc mới." onAction={() => { setSearchTerm(''); setActiveTab('ALL'); setCategoryFilter('ALL'); setModelFilter('ALL'); setProvinceFilter('ALL'); setOwnerFilter('ALL'); setDateFrom(''); setDateTo(''); }} />
            </div>
          ) : (
            pageData.rows.map(ticket => (
              <div className="mobile-card" key={ticket.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-card-title" style={{ color: 'var(--accent-cyan)' }}>{ticket.ticketCode}</span>
                    <div className="mobile-card-subtitle">{ticket.nppName}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                    {ticket.processingStatus === 'Đã xử lý' ? (
                      <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>✓ Đã xử lý</span>
                    ) : (
                      <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>⏳ Chưa xử lý</span>
                    )}
                    {!requiresRepairReturn(ticket) ? <span className="badge badge-neutral">Không cần gửi trả</span> : ticket.customerReturnStatus === 'Đã gửi trả' ? (
                      <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>✓ Đã trả</span>
                    ) : (
                      <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>📦 Chưa trả</span>
                    )}
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Sản phẩm:</span>
                    <span className="mobile-card-value">{ticket.machineModel} ({ticket.productCategory})</span>
                  </div>
                  {ticket.serialNumber && <div className="mobile-card-row">
                    <span className="mobile-card-label">Số Seri:</span>
                    <span className="mobile-card-value" style={{ fontFamily: 'var(--font-mono)' }}>{ticket.serialNumber}</span>
                  </div>}
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Lỗi:</span>
                    <span className="mobile-card-value">{ticket.errorCategory && <strong>Linh kiện lỗi: {ticket.errorCategory} · </strong>}{ticket.errorDescription}<span className="repair-inline-photos">{repairStringList(ticket.photos).slice(0,3).map((url,index)=><button type="button" key={index} onClick={()=>void openDetail(ticket)} aria-label={`Xem ảnh lỗi ${index+1}`}><img loading="lazy" src={url} alt={ticket.errorCategory||'Ảnh lỗi thiết bị'}/></button>)}</span></span>{repairMissingFields(ticket).length > 0 && <p className="repair-missing-fields">⚠ Cần bổ sung: {repairMissingFields(ticket).join(' · ')}</p>}
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Kỹ thuật viên:</span>
                    <span className="mobile-card-value">{ticket.technician}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Ngày xử lý:</span>
                    <span className="mobile-card-value">{formatDateVN(ticket.date)}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Hướng xử lý:</span>
                    <span className="mobile-card-value">
                      {ticket.actionDirection === 'Xuất đổi' ? (
                        <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>🔄 Xuất đổi ({ticket.replacementCondition})</span>
                      ) : (
                        <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>🛠️ Sửa chữa</span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => void openDetail(ticket)}>
                    <Eye size={14} color="var(--accent-cyan)" />
                    <span>Xem</span>
                  </button>
                   <button
                    className="btn btn-secondary btn-sm"
                    disabled={isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)}
                    style={{ opacity: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 0.4 : 1 }}
                    onClick={() => {
                      if (!isDateLocked(ticket.date) && isTicketAllowed(ticket.nppId)) {
                        handleOpenEdit(ticket);
                      }
                    }}
                  >
                    <Edit3 size={14} color={(isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? "var(--text-muted)" : "var(--accent-amber)"} />
                    <span>Sửa</span>
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)}
                    style={{ opacity: (isDateLocked(ticket.date) || !isTicketAllowed(ticket.nppId)) ? 0.4 : 1 }}
                    onClick={() => {
                      if (!isDateLocked(ticket.date) && isTicketAllowed(ticket.nppId)) {
                        handleDelete(ticket);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <nav className="repair-pagination" aria-label="Phân trang phiếu xử lý máy"><label>Số phiếu mỗi trang<select className="form-select" value={pageData.size} onChange={event=>setListSize(Number(event.target.value))}>{[10,20,50].map(size=><option key={size} value={size}>{size}</option>)}</select></label><span>{pageData.total?((pageData.page-1)*pageData.size+1):0}–{Math.min(pageData.page*pageData.size,pageData.total)} / {pageData.total} phiếu · Trang {pageData.page}/{pageData.pages}</span><button className="btn btn-secondary" disabled={pageData.page<=1} onClick={()=>setListPage(pageData.page-1)}>‹ Trước</button><button className="btn btn-secondary" disabled={pageData.page>=pageData.pages} onClick={()=>setListPage(pageData.page+1)}>Sau ›</button></nav>
      <RepairEditorDialog PRODUCT_CATEGORIES={PRODUCT_CATEGORIES} addErrorPhotos={addErrorPhotos} closeForm={closeForm} currentAssignedSet={currentAssignedSet} draft={draft} editingTicket={editingTicket} errorPhotoInput={errorPhotoInput} filteredNpps={filteredNpps} formData={formData} handbookErrors={handbookErrors} handleCategoryChange={handleCategoryChange} handleSelectNpp={handleSelectNpp} handleSubmit={handleSubmit} nppSearchTerm={nppSearchTerm} npps={npps} onReturnToProfile={onReturnToProfile} photoBusy={photoBusy} qcUsers={qcUsers} saveError={saveError} saving={saving} setFormData={setFormData} setNppSearchTerm={setNppSearchTerm} setSaveError={setSaveError} showModal={showModal} user={user} />

      <RepairDetailDialog EMPTY_SERVICE_CHECKLIST={EMPTY_SERVICE_CHECKLIST} qcUsers={qcUsers} selectedTicket={selectedTicket} setSelectedTicket={setSelectedTicket} />

      <FloatingActionButton icon={Wrench} label="Tạo phiếu sửa chữa" onClick={handleOpenAdd} />

          </div>
  );
}
