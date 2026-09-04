import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import NppManagement from './components/NppManagement';
import AssetManagement from './components/AssetManagement';
import WorkflowModal from './components/WorkflowModal';
import MaintenanceSchedule from './components/MaintenanceSchedule';
import RemoteFormulaUpdates from './components/RemoteFormulaUpdates';
import TintingAnalytics from './components/TintingAnalytics';
import SerialLookup from './components/SerialLookup';
import AuditLogs from './components/AuditLogs';
import HandoverPrintModal from './components/HandoverPrintModal';
import MobileBottomNav from './components/MobileBottomNav';
import DeviceRepairProcessing from './components/DeviceRepairProcessing';
import ExcelImportModal from './components/ExcelImportModal';
import LoginModal from './components/LoginModal';
import UserManagement from './components/UserManagement';
import TechHandbook from './components/TechHandbook';
import FieldRouteMap from './components/FieldRouteMap';
import { useAuth } from './context/AuthContext';
import { supabase, isSupabaseConfigured } from './lib/supabase';

import {
  INITIAL_FORMULA_VERSIONS,
  INITIAL_TINTING_LOGS
} from './data/mockData';

import { useNpps } from './hooks/useNpps.js';
import { useAssets, generateNextSetCode } from './hooks/useAssets.js';
import { useRepairs } from './hooks/useRepairs.js';
import { useAuditLogs } from './hooks/useAuditLogs.js';
import { useLockedMonths } from './hooks/useLockedMonths.js';
import { useTintingLogs } from './hooks/useTintingLogs.js';
import { useFormulaVersions } from './hooks/useFormulaVersions.js';


export default function App() {
  const { user, isDevMode } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [globalSearch, setGlobalSearch] = useState('');
  const [qcUsers, setQcUsers] = useState([]);

  useEffect(() => {
    async function loadQcProfiles() {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, role, managed_region')
            .in('role', ['qc', 'admin']);

          if (data && !error && data.length > 0) {
            const mapped = data.map(p => ({
              id: p.id,
              name: p.full_name || p.id,
              role: p.role,
              region: p.managed_region || 'Toàn Quốc'
            }));
            setQcUsers(mapped);
            return;
          }
        } catch (err) {
          console.warn('[App] Error loading QC profiles:', err);
        }
      }

      // Fallback
      const fallbackList = [];
      if (user && (user.name || user.full_name)) {
        fallbackList.push({
          id: user.id || 'current-user',
          name: user.name || user.full_name,
          role: user.role || 'qc',
          region: user.managedRegion || 'Toàn Quốc'
        });
      }
      fallbackList.push({
        id: 'qc-hung',
        name: 'Nguyễn Văn Hùng',
        role: 'qc',
        region: 'Miền Bắc'
      });
      setQcUsers(fallbackList);
    }
    loadQcProfiles();
  }, [user]);

  // Main State via Supabase hooks
  const { npps, addNpp, editNpp, deleteNpp, importNpps } = useNpps();
  const {
    dispensers, setDispensers, mixers, setMixers, computers, setComputers, printers, setPrinters, systemSets, setSystemSets,
    addStockDevice, editDevice, deleteDevice, deleteSystemSet, assembleSet, updateSystemSet, importDevices
  } = useAssets();
  const { repairTickets, addTicket, editTicket, deleteTicket } = useRepairs();
  const { auditLogs, addAuditLog, editAuditLog, deleteAuditLog } = useAuditLogs();
  const { lockedMonths, lockMonth, unlockMonth, isDateLocked, loading: lockLoading, error: lockError } = useLockedMonths();
  const { tintingLogs, setTintingLogs } = useTintingLogs();
  const { formulaVersions } = useFormulaVersions();

  // Excel Import Modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModalType, setImportModalType] = useState('npp');

  const openImportModal = (type) => {
    setImportModalType(type);
    setShowImportModal(true);
  };

  // Workflow Modal state
  const [workflowMode, setWorkflowMode] = useState(null); // 'INSTALL' | 'WITHDRAW' | 'TRANSFER' | null
  const [printProtocolData, setPrintProtocolData] = useState(null);

  // Tech Handbook -> Repair Ticket Prefill State
  const [prefilledRepairData, setPrefilledRepairData] = useState(null);

  const handleSelectErrorForRepair = (errorObj) => {
    let cat = errorObj.category;
    if (cat === 'Phần mềm') cat = 'Case';
    else if (cat === 'Máy tính') cat = 'Case';
    else if (cat === 'Máy in') cat = 'QL700';

    setPrefilledRepairData({
      productCategory: cat,
      machineModel: errorObj.machineModel,
      errorCategory: errorObj.category === 'Phần mềm' ? 'Lỗi phần mềm' : 'Lỗi phần cứng',
      errorDescription: `[${errorObj.code}] ${errorObj.title}\n- Dấu hiệu: ${Array.isArray(errorObj.symptoms) ? errorObj.symptoms.join('; ') : errorObj.symptoms}\n- Nguyên nhân: ${errorObj.rootCause}`
    });
    setActiveTab('repairs');
  };

  // Calculate alerts
  const today = new Date('2026-07-26');
  const maintenanceAlerts = systemSets.filter(s => {
    if (!s.nextMaintenanceDue || s.status !== 'DA_LAP_DAT') return false;
    const dueDate = new Date(s.nextMaintenanceDue);
    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    return diffDays <= 30; // Due within 1 month (30 days rule)
  });

  const unstabilizedAlerts = systemSets.filter(s => {
    return s.status === 'DA_LAP_DAT' && (s.stabilizer?.includes('Chưa') || s.stabilizer?.includes('Không'));
  });

  const pendingRepairCount = repairTickets.filter(t => t.processingStatus === 'Chưa xử lý').length;

  // Helper for Dev/Mock mode local sync of device status
  const updateLocalDeviceStatus = (cat, serial, newStatus) => {
    if (cat === 'Máy chiết') {
      setDispensers(prev => prev.map(d => d.serial === serial ? { ...d, status: newStatus } : d));
    } else if (cat === 'Máy lắc') {
      setMixers(prev => prev.map(m => m.serial === serial ? { ...m, status: newStatus } : m));
    } else if (cat === 'Máy in') {
      setPrinters(prev => prev.map(p => p.serial === serial ? { ...p, status: newStatus } : p));
    }
  };

  // Repair Tickets Handlers
  const handleAddTicket = async (newTicket) => {
    try {
      const added = await addTicket(newTicket);

      // Local status sync for offline mock dev mode
      if (isDevMode) {
        const newStatus = added.processingStatus === 'Đã xử lý' ? 'Đang chạy tốt' : 'Cần bảo trì';
        updateLocalDeviceStatus(added.productCategory, added.serialNumber, newStatus);
      }

      await addAuditLog({
        type: 'TẠO PHIẾU SỬA CHỮA',
        setCode: added.serialNumber,
        nppId: added.nppId,
        nppName: added.nppName,
        serialList: `${added.productCategory}: ${added.machineModel} (${added.serialNumber})`,
        technician: added.technician,
        reason: `Tạo phiếu xử lý máy [${added.ticketCode}]`,
        notes: added.errorDescription
      });
    } catch (err) {
      console.error(err);
      alert('Lỗi tạo phiếu sửa chữa: ' + err.message);
    }
  };

  const handleEditTicket = async (updatedTicket) => {
    try {
      await editTicket(updatedTicket.id, updatedTicket);

      // Local status sync for offline mock dev mode
      if (isDevMode) {
        const newStatus = updatedTicket.processingStatus === 'Đã xử lý' ? 'Đang chạy tốt' : 'Cần bảo trì';
        updateLocalDeviceStatus(updatedTicket.productCategory, updatedTicket.serialNumber, newStatus);
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi cập nhật phiếu sửa chữa: ' + err.message);
    }
  };

  const handleDeleteTicket = async (ticketId) => {
    try {
      await deleteTicket(ticketId);
    } catch (err) {
      console.error(err);
      alert('Lỗi xóa phiếu sửa chữa: ' + err.message);
    }
  };

  // NPP CRUD Handlers
  const handleAddNpp = async (newNpp) => {
    try {
      await addNpp(newNpp);
    } catch (err) {
      console.error(err);
      alert('Lỗi thêm NPP: ' + err.message);
    }
  };

  const handleEditNpp = async (updatedNpp) => {
    try {
      await editNpp(updatedNpp.id, updatedNpp);
      // Let backend real-time updates propagate the changes
    } catch (err) {
      console.error(err);
      alert('Lỗi sửa NPP: ' + err.message);
    }
  };

  const handleDeleteNpp = async (nppId) => {
    const hasAssignedSets = systemSets.some(s => s.nppId === nppId && s.status === 'DA_LAP_DAT');
    if (hasAssignedSets) {
      alert('Không thể xóa NPP này vì vẫn còn bộ máy đang lắp đặt. Vui lòng thu hồi bộ máy trước!');
      return;
    }
    try {
      await deleteNpp(nppId);
    } catch (err) {
      console.error(err);
      alert('Lỗi xóa NPP: ' + err.message);
    }
  };

  // Device CRUD Handlers
  const handleEditDevice = async (category, updatedData) => {
    try {
      const pluralCat = category === 'computer' ? 'computers' : category === 'dispenser' ? 'dispensers' : category === 'mixer' ? 'mixers' : 'printers';
      const deviceList = category === 'dispenser' ? dispensers : category === 'mixer' ? mixers : category === 'computer' ? computers : printers;
      const oldDevice = deviceList.find(d => d.id === updatedData.id);

      await editDevice(pluralCat, updatedData.id, updatedData);

      const oldSetCode = oldDevice?.setCode;
      const newSetCode = updatedData.isAssigned ? updatedData.setCode : null;

      if (oldSetCode !== newSetCode) {
        if (oldSetCode) {
          const oldSet = systemSets.find(s => s.setCode === oldSetCode);
          if (oldSet) {
            const updates = {};
            if (category === 'dispenser') { updates.dispenserId = null; updates.dispenserSerial = null; updates.dispenserModel = null; }
            if (category === 'mixer') { updates.mixerId = null; updates.mixerSerial = null; updates.mixerModel = null; }
            if (category === 'computer') { updates.computerId = null; updates.computerSerial = null; updates.computerType = null; }
            if (category === 'printer') { updates.printerId = null; updates.printerSerial = null; }
            await updateSystemSet(oldSetCode, updates);
          }
        }
        if (newSetCode) {
          const newSet = systemSets.find(s => s.setCode === newSetCode);
          if (newSet) {
            const updates = {};
            if (category === 'dispenser') {
              updates.dispenserId = updatedData.id;
              updates.dispenserSerial = updatedData.serial;
              updates.dispenserModel = updatedData.model;
            } else if (category === 'mixer') {
              updates.mixerId = updatedData.id;
              updates.mixerSerial = updatedData.serial;
              updates.mixerModel = updatedData.model;
            } else if (category === 'computer') {
              updates.computerId = updatedData.id;
              updates.computerSerial = updatedData.serial;
              updates.computerType = updatedData.type;
            } else if (category === 'printer') {
              updates.printerId = updatedData.id;
              updates.printerSerial = updatedData.serial;
            }
            await updateSystemSet(newSetCode, updates);
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi sửa thiết bị: ' + err.message);
    }
  };

  const handleDeleteDevice = async (category, deviceId, setCode) => {
    try {
      const pluralCat = category === 'computer' ? 'computers' : category === 'dispenser' ? 'dispensers' : category === 'mixer' ? 'mixers' : 'printers';
      await deleteDevice(pluralCat, deviceId);

      const targetSetCode = setCode || systemSets.find(s => s.dispenserId === deviceId || s.mixerId === deviceId || s.computerId === deviceId || s.printerId === deviceId)?.setCode;
      if (targetSetCode) {
        const targetSet = systemSets.find(s => s.setCode === targetSetCode);
        if (targetSet) {
          const updates = {};
          if (category === 'dispenser' && targetSet.dispenserId === deviceId) {
            updates.dispenserId = null; updates.dispenserSerial = null; updates.dispenserModel = null;
          } else if (category === 'mixer' && targetSet.mixerId === deviceId) {
            updates.mixerId = null; updates.mixerSerial = null; updates.mixerModel = null;
          } else if (category === 'computer' && targetSet.computerId === deviceId) {
            updates.computerId = null; updates.computerSerial = null; updates.computerType = null;
          } else if (category === 'printer' && targetSet.printerId === deviceId) {
            updates.printerId = null; updates.printerSerial = null;
          }
          if (Object.keys(updates).length > 0) {
            await updateSystemSet(targetSetCode, updates);
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi xóa thiết bị: ' + err.message);
    }
  };

  const handleAddStockDevice = async (category, newDeviceData) => {
    try {
      await addStockDevice(category, newDeviceData);
    } catch (err) {
      console.error(err);
      alert('Lỗi thêm thiết bị: ' + err.message);
    }
  };

  const handleAssembleSet = async (newCombo) => {
    const disp = dispensers.find(d => d.id === newCombo.dispenserId);
    const mix = mixers.find(m => m.id === newCombo.mixerId);
    const pc = computers.find(c => c.id === newCombo.computerId);
    const prn = printers.find(p => p.id === newCombo.printerId);

    const setCode = newCombo.setCode?.trim() || generateNextSetCode(systemSets);

    const newSetObj = {
      set_code: setCode,
      npp_id: newCombo.nppId || null,
      npp_name: newCombo.nppName || 'Kho Tổng Trung Tâm',
      region: newCombo.region || 'Kho Tổng',
      province: newCombo.province || '',
      dispenser_id: disp?.id || null,
      dispenser_serial: disp?.serial || 'N/A',
      dispenser_model: disp?.model || 'N/A',
      mixer_id: mix?.id || null,
      mixer_serial: mix?.serial || 'N/A',
      mixer_model: mix?.model || 'N/A',
      computer_id: pc?.id || null,
      computer_serial: pc?.serial || 'N/A',
      computer_type: pc?.type || 'N/A',
      printer_id: prn?.id || null,
      printer_serial: prn?.serial || 'N/A',
      printer_model: prn?.model || 'QL700',
      stabilizer: 'NPP tự trang bị khi lắp đặt',
      status: newCombo.status || (newCombo.nppId ? 'DA_LAP_DAT' : 'TRONG_KHO'),
      install_date: newCombo.nppId ? new Date().toISOString().split('T')[0] : null,
      last_maintenance_date: null,
      next_maintenance_due: null,
      technician: newCombo.technician || 'Quản lý Kho',
      salesperson: newCombo.salesperson || '',
      notes: newCombo.notes || '',
      tinting_software: 'ColorExpert 3',
      software_version: 'Standard Stock',
      agent_status: 'Offline',
      installation_photos: []
    };

    try {
      await assembleSet(newSetObj);
      if (disp) await editDevice('dispensers', disp.id, { is_assigned: true, set_code: setCode });
      if (mix) await editDevice('mixers', mix.id, { is_assigned: true, set_code: setCode });
      if (pc) await editDevice('computers', pc.id, { is_assigned: true, set_code: setCode });
      if (prn) await editDevice('printers', prn.id, { is_assigned: true, set_code: setCode });
    } catch (err) {
      console.error(err);
      alert('Lỗi ráp bộ máy: ' + err.message);
    }
  };

  const handleInstallSubmit = async (data) => {
    const targetNpp = npps.find(n => n.id === data.nppId);

    try {
      await updateSystemSet(data.setCode, {
        npp_id: data.nppId,
        npp_name: targetNpp ? targetNpp.name : 'NPP',
        region: targetNpp ? targetNpp.region : 'Việt Nam',
        status: 'DA_LAP_DAT',
        install_date: data.installedDate,
        last_maintenance_date: data.installedDate,
        next_maintenance_due: data.nextMaintenanceDue,
        stabilizer: data.stabilizer,
        technician: data.technician,
        agent_status: 'Online',
        installation_photos: data.installationPhotos || []
      });

      if (data.installationPhotos && data.installationPhotos.length > 0 && targetNpp) {
        await editNpp(data.nppId, { photos: [...(targetNpp.photos || []), ...data.installationPhotos] });
      }

      await addAuditLog({
        type: 'LẮP ĐẶT MỚI',
        setCode: data.setCode,
        nppId: data.nppId,
        nppName: targetNpp ? targetNpp.name : 'NPP',
        serialList: `Bộ máy ${data.setCode}`,
        technician: data.technician,
        reason: 'Lắp mới bộ máy pha màu cho NPP',
        notes: data.notes || 'Bàn giao chạy thử tốt.'
      });
    } catch (err) {
      console.error(err);
      alert('Lỗi lắp đặt máy: ' + err.message);
    }
  };

  const handleWithdrawSubmit = async (data) => {
    const targetSet = systemSets.find(s => s.setCode === data.setCode);

    try {
      await updateSystemSet(data.setCode, {
        status: 'DA_THU_HOI',
        npp_id: null,
        npp_name: 'Kho Tổng (Đã thu hồi)',
        agent_status: 'Offline'
      });

      await addAuditLog({
        type: 'THU HỒI',
        setCode: data.setCode,
        nppId: targetSet?.nppId || 'NPP',
        nppName: targetSet?.nppName || 'NPP',
        serialList: `Bộ máy ${data.setCode}`,
        technician: data.technician,
        reason: data.reason,
        notes: `${data.deviceCondition} | ${data.notes}`
      });
    } catch (err) {
      console.error(err);
      alert('Lỗi thu hồi máy: ' + err.message);
    }
  };

  const handleTransferSubmit = async (data) => {
    const targetNpp = npps.find(n => n.id === data.newNppId);
    const targetSet = systemSets.find(s => s.setCode === data.setCode);

    try {
      await updateSystemSet(data.setCode, {
        npp_id: data.newNppId,
        npp_name: targetNpp ? targetNpp.name : 'NPP Mới',
        region: targetNpp ? targetNpp.region : targetSet.region
      });

      await addAuditLog({
        type: 'ĐIỀU CHUYỂN NPP',
        setCode: data.setCode,
        nppId: data.newNppId,
        nppName: `Từ ${targetSet?.nppName} sang ${targetNpp?.name}`,
        serialList: `Bộ máy ${data.setCode}`,
        technician: data.technician,
        reason: data.reason || 'Điều chuyển tối ưu',
        notes: data.notes
      });
    } catch (err) {
      console.error(err);
      alert('Lỗi điều chuyển máy: ' + err.message);
    }
  };

  const handleCompleteMaintenance = async (maintData) => {
    const targetSet = systemSets.find(s => s.setCode === maintData.setCode);
    try {
      await updateSystemSet(maintData.setCode, {
        last_maintenance_date: maintData.lastMaintenanceDate,
        next_maintenance_due: maintData.nextMaintenanceDue,
        status: 'DA_LAP_DAT'
      });

      await addAuditLog({
        type: 'BẢO TRÌ / SỬA CHỮA',
        setCode: maintData.setCode,
        nppId: targetSet?.nppId,
        nppName: targetSet?.nppName,
        serialList: `Bảo trì bộ máy ${maintData.setCode}`,
        technician: 'Kỹ thuật viên bảo trì',
        reason: 'Bảo trì định kỳ 1 năm / lần',
        notes: maintData.notes || 'Đã vệ sinh ống chiết và kiểm tra máy lắc.'
      });
    } catch (err) {
      console.error(err);
      alert('Lỗi hoàn tất bảo trì: ' + err.message);
    }
  };

  const handleTriggerRemotePush = (pushInfo) => {
    console.log('Remote push triggered:', pushInfo);
  };

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleImportData = async (importedPackage) => {
    if (!importedPackage) return;
    if (importedPackage.npps && Array.isArray(importedPackage.npps)) {
      await importNpps(importedPackage.npps);
    }
    if (importedPackage.dispensers && Array.isArray(importedPackage.dispensers)) {
      await importDevices('dispensers', importedPackage.dispensers);
    }
    if (importedPackage.mixers && Array.isArray(importedPackage.mixers)) {
      await importDevices('mixers', importedPackage.mixers);
    }
    if (importedPackage.computers && Array.isArray(importedPackage.computers)) {
      await importDevices('computers', importedPackage.computers);
    }
    if (importedPackage.printers && Array.isArray(importedPackage.printers)) {
      await importDevices('printers', importedPackage.printers);
    }
  };

  if (!user) {
    return <LoginModal />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      
      {/* Sidebar Navigation for Desktop & Mobile sliding drawer */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        maintenanceCount={maintenanceAlerts.length}
        pendingRepairCount={pendingRepairCount}
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Sidebar Backdrop Overlay on Mobile */}
      {isMobileSidebarOpen && (
        <div 
          className="sidebar-backdrop mobile-only"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Main Container */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
          onOpenNewInstallation={() => setWorkflowMode('INSTALL')}
          maintenanceAlerts={maintenanceAlerts}
          unstabilizedAlerts={unstabilizedAlerts}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          npps={npps}
          dispensers={dispensers}
          mixers={mixers}
          computers={computers}
          printers={printers}
          systemSets={systemSets}
          repairTickets={repairTickets}
          auditLogs={auditLogs}
          tintingLogs={tintingLogs}
          onImportData={handleImportData}
        />

        {/* Dynamic View Content */}
        <main key={activeTab} className="page-transition" style={{ flex: 1, padding: '28px', overflowY: 'auto' }}>
          
          {activeTab === 'dashboard' && (
            <Dashboard
              systemSets={systemSets}
              npps={npps}
              dispensers={dispensers}
              mixers={mixers}
              computers={computers}
              printers={printers}
              maintenanceAlerts={maintenanceAlerts}
              unstabilizedAlerts={unstabilizedAlerts}
              setActiveTab={setActiveTab}
              onOpenNewInstallation={() => setWorkflowMode('INSTALL')}
            />
          )}

          {activeTab === 'npp' && (
            <NppManagement
              npps={npps}
              systemSets={systemSets}
              onAddNpp={handleAddNpp}
              onEditNpp={handleEditNpp}
              onDeleteNpp={handleDeleteNpp}
              onOpenImportModal={() => openImportModal('npp')}
            />
          )}

          {activeTab === 'assets' && (
            <AssetManagement
              systemSets={systemSets}
              npps={npps}
              dispensers={dispensers}
              mixers={mixers}
              computers={computers}
              printers={printers}
              onAssembleSet={handleAssembleSet}
              onAddStockDevice={handleAddStockDevice}
              onEditDevice={handleEditDevice}
              onDeleteDevice={handleDeleteDevice}
              onOpenImportModal={openImportModal}
              onEditSet={updateSystemSet}
              onDeleteSet={deleteSystemSet}
            />
          )}

          {activeTab === 'repairs' && (
            <DeviceRepairProcessing
              repairTickets={repairTickets}
              npps={npps}
              systemSets={systemSets}
              qcUsers={qcUsers}
              onAddTicket={handleAddTicket}
              onEditTicket={handleEditTicket}
              onDeleteTicket={handleDeleteTicket}
              prefilledTicket={prefilledRepairData}
              onClearPrefill={() => setPrefilledRepairData(null)}
              isDateLocked={isDateLocked}
            />
          )}

          {activeTab === 'techHandbook' && (
            <TechHandbook
              onSelectErrorForRepair={handleSelectErrorForRepair}
            />
          )}

          {activeTab === 'routeMap' && (
            <FieldRouteMap
              npps={npps}
              systemSets={systemSets}
              repairTickets={repairTickets}
              onAddAuditLog={addAuditLog}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'workflows' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '8px' }}>
                  Trung Tâm Nghiệp Vụ Cấp Phát, Thu Hồi & Điều Chuyển Thiết Bị
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  Thực hiện các tác nghiệp trực quan với quy trình tự động thiết lập hạn bảo trì 1 năm và xuất biên bản bàn giao.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                  <button className="btn btn-primary" style={{ padding: '20px', flexDirection: 'column', gap: '8px', fontSize: '1rem' }} onClick={() => setWorkflowMode('INSTALL')}>
                    <span style={{ fontSize: '1.5rem' }}>📦</span>
                    <span>1. Cấp Phát / Lắp Đặt Mới</span>
                  </button>

                  <button className="btn btn-danger" style={{ padding: '20px', flexDirection: 'column', gap: '8px', fontSize: '1rem' }} onClick={() => setWorkflowMode('WITHDRAW')}>
                    <span style={{ fontSize: '1.5rem' }}>🔴</span>
                    <span>2. Thu Hồi Bộ Máy Từ NPP</span>
                  </button>

                  <button className="btn btn-secondary" style={{ padding: '20px', flexDirection: 'column', gap: '8px', fontSize: '1rem' }} onClick={() => setWorkflowMode('TRANSFER')}>
                    <span style={{ fontSize: '1.5rem' }}>🔄</span>
                    <span>3. Điều Chuyển Trực Tiếp NPP A ➔ B</span>
                  </button>
                </div>
              </div>

              {/* Show Audit Trail Log */}
              <AuditLogs 
                auditLogs={auditLogs} 
                onEditLog={editAuditLog} 
                onDeleteLog={deleteAuditLog} 
              />
            </div>
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceSchedule
              systemSets={systemSets}
              onCompleteMaintenance={handleCompleteMaintenance}
              onUpdateSystemSet={updateSystemSet}
              onDeleteSystemSet={deleteSystemSet}
            />
          )}

          {activeTab === 'remoteFormula' && (
            <RemoteFormulaUpdates
              formulaVersions={formulaVersions}
              systemSets={systemSets}
              onTriggerRemotePush={handleTriggerRemotePush}
              onSyncLogs={setTintingLogs}
            />
          )}

          {activeTab === 'tintingLogs' && (
            <TintingAnalytics
              tintingLogs={tintingLogs}
              npps={npps}
              onSyncLogs={setTintingLogs}
            />
          )}

          {activeTab === 'serialLookup' && (
            <SerialLookup
              dispensers={dispensers}
              mixers={mixers}
              computers={computers}
              printers={printers}
              systemSets={systemSets}
              auditLogs={auditLogs}
            />
          )}

          {activeTab === 'auditLogs' && (
            <AuditLogs 
              auditLogs={auditLogs} 
              onEditLog={editAuditLog} 
              onDeleteLog={deleteAuditLog} 
            />
          )}

          {activeTab === 'users' && (
            <UserManagement
              lockedMonths={lockedMonths}
              lockMonth={lockMonth}
              unlockMonth={unlockMonth}
              lockLoading={lockLoading}
              lockError={lockError}
            />
          )}

        </main>
      </div>

      {/* Mobile Bottom Navigation Bar for Mobile Phones */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        maintenanceCount={maintenanceAlerts.length}
        pendingRepairCount={pendingRepairCount}
        onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
      />

      {/* Workflow Execution Modal */}
      {workflowMode && (
        <WorkflowModal
          mode={workflowMode}
          systemSets={systemSets}
          npps={npps}
          onClose={() => setWorkflowMode(null)}
          onSubmitInstall={handleInstallSubmit}
          onSubmitWithdraw={handleWithdrawSubmit}
          onSubmitTransfer={handleTransferSubmit}
          onPrintProtocol={(pData) => setPrintProtocolData(pData)}
          isDateLocked={isDateLocked}
        />
      )}

      {/* Handover Printable Protocol Modal */}
      {printProtocolData && (
        <HandoverPrintModal
          protocolData={printProtocolData}
          onClose={() => setPrintProtocolData(null)}
        />
      )}

      {/* Excel Import Modal */}
      {showImportModal && (
        <ExcelImportModal
          importType={importModalType}
          existingNpps={npps}
          existingDispensers={dispensers}
          existingMixers={mixers}
          existingComputers={computers}
          existingPrinters={printers}
          onImportNpps={async (newItems) => {
            await importNpps(newItems);
            await addAuditLog({
              type: 'IMPORT EXCEL – NPP',
              setCode: '—',
              nppId: '—',
              nppName: `Đã import ${newItems.length} NPP từ Excel`,
              serialList: newItems.map(n => n.name).join(', '),
              technician: 'Hệ thống – Import Excel',
              reason: 'Nhập hàng loạt từ file Excel',
              notes: `Tổng ${newItems.length} NPP mới được thêm vào danh sách`
            });
          }}
          onImportDispensers={async (newItems) => {
            await importDevices('dispenser', newItems);
            await addAuditLog({
              type: 'IMPORT EXCEL – MÁY CHIẾT',
              setCode: '—', nppId: '—',
              nppName: `Đã import ${newItems.length} Máy Chiết từ Excel`,
              serialList: newItems.map(d => d.serial).join(', '),
              technician: 'Hệ thống – Import Excel',
              reason: 'Nhập hàng loạt từ file Excel',
              notes: `Tổng ${newItems.length} Máy Chiết mới vào kho`
            });
          }}
          onImportMixers={async (newItems) => {
            await importDevices('mixer', newItems);
            await addAuditLog({
              type: 'IMPORT EXCEL – MÁY LẮC',
              setCode: '—', nppId: '—',
              nppName: `Đã import ${newItems.length} Máy Lắc từ Excel`,
              serialList: newItems.map(m => m.serial).join(', '),
              technician: 'Hệ thống – Import Excel',
              reason: 'Nhập hàng loạt từ file Excel',
              notes: `Tổng ${newItems.length} Máy Lắc mới vào kho`
            });
          }}
          onImportComputers={async (newItems) => {
            await importDevices('computer', newItems);
            await addAuditLog({
              type: 'IMPORT EXCEL – MÁY TÍNH',
              setCode: '—', nppId: '—',
              nppName: `Đã import ${newItems.length} Máy Tính từ Excel`,
              serialList: newItems.map(c => c.serial).join(', '),
              technician: 'Hệ thống – Import Excel',
              reason: 'Nhập hàng loạt từ file Excel',
              notes: `Tổng ${newItems.length} Máy Tính mới vào kho`
            });
          }}
          onImportPrinters={async (newItems) => {
            await importDevices('printer', newItems);
            await addAuditLog({
              type: 'IMPORT EXCEL – MÁY IN',
              setCode: '—', nppId: '—',
              nppName: `Đã import ${newItems.length} Máy In từ Excel`,
              serialList: newItems.map(p => p.serial).join(', '),
              technician: 'Hệ thống – Import Excel',
              reason: 'Nhập hàng loạt từ file Excel',
              notes: `Tổng ${newItems.length} Máy In QL700 mới vào kho`
            });
          }}
          onClose={() => setShowImportModal(false)}
        />
      )}

    </div>
  );
}

