import React, { useState } from 'react';
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

import {
  INITIAL_FORMULA_VERSIONS,
  INITIAL_TINTING_LOGS
} from './data/mockData';

import { useNpps } from './hooks/useNpps.js';
import { useAssets } from './hooks/useAssets.js';
import { useRepairs } from './hooks/useRepairs.js';
import { useAuditLogs } from './hooks/useAuditLogs.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [globalSearch, setGlobalSearch] = useState('');

  // Main State via Supabase hooks
  const { npps, addNpp, editNpp, deleteNpp } = useNpps();
  const {
    dispensers, setDispensers, mixers, setMixers, computers, setComputers, printers, setPrinters, systemSets, setSystemSets,
    addStockDevice, editDevice, deleteDevice, assembleSet, updateSystemSet
  } = useAssets();
  const { repairTickets, addTicket, editTicket, deleteTicket } = useRepairs();
  const { auditLogs, addAuditLog } = useAuditLogs();

  const [formulaVersions, setFormulaVersions] = useState(INITIAL_FORMULA_VERSIONS);
  const [tintingLogs, setTintingLogs] = useState(INITIAL_TINTING_LOGS);

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

  // Repair Tickets Handlers
  const handleAddTicket = async (newTicket) => {
    try {
      const added = await addTicket(newTicket);
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
      await editDevice(category === 'computer' ? 'computers' : category === 'dispenser' ? 'dispensers' : category === 'mixer' ? 'mixers' : 'printers', updatedData.id, updatedData);
    } catch (err) {
      console.error(err);
      alert('Lỗi sửa thiết bị: ' + err.message);
    }
  };

  const handleDeleteDevice = async (category, deviceId) => {
    try {
      await deleteDevice(category === 'computer' ? 'computers' : category === 'dispenser' ? 'dispensers' : category === 'mixer' ? 'mixers' : 'printers', deviceId);
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

    const setCode = `SET-2026-00${systemSets.length + 1}`;

    const newSetObj = {
      set_code: setCode,
      npp_id: null,
      npp_name: 'Kho Tổng Trung Tâm',
      region: 'Kho Tổng',
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
      status: 'TRONG_KHO',
      install_date: null,
      last_maintenance_date: null,
      next_maintenance_due: null,
      technician: 'Quản lý Kho',
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
          className="sidebar-backdrop"
          onClick={() => setIsMobileSidebarOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(8px)',
            zIndex: 999
          }}
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
        />

        {/* Dynamic View Content */}
        <main style={{ flex: 1, padding: '28px', overflowY: 'auto' }}>
          
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
              dispensers={dispensers}
              mixers={mixers}
              computers={computers}
              printers={printers}
              onAssembleSet={handleAssembleSet}
              onAddStockDevice={handleAddStockDevice}
              onEditDevice={handleEditDevice}
              onDeleteDevice={handleDeleteDevice}
              onOpenImportModal={openImportModal}
            />
          )}

          {activeTab === 'repairs' && (
            <DeviceRepairProcessing
              repairTickets={repairTickets}
              npps={npps}
              onAddTicket={handleAddTicket}
              onEditTicket={handleEditTicket}
              onDeleteTicket={handleDeleteTicket}
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
              <AuditLogs auditLogs={auditLogs} />
            </div>
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceSchedule
              systemSets={systemSets}
              onCompleteMaintenance={handleCompleteMaintenance}
            />
          )}

          {activeTab === 'remoteFormula' && (
            <RemoteFormulaUpdates
              formulaVersions={formulaVersions}
              systemSets={systemSets}
              onTriggerRemotePush={handleTriggerRemotePush}
            />
          )}

          {activeTab === 'tintingLogs' && (
            <TintingAnalytics
              tintingLogs={tintingLogs}
              npps={npps}
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
            <AuditLogs auditLogs={auditLogs} />
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
          onImportNpps={(newItems) => {
            setNpps(prev => [...prev, ...newItems]);
            setAuditLogs(prev => [{
              id: `AUDIT-IMP-${Date.now()}`,
              type: 'IMPORT EXCEL – NPP',
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
              setCode: '—',
              nppId: '—',
              nppName: `Đã import ${newItems.length} NPP từ Excel`,
              serialList: newItems.map(n => n.name).join(', '),
              technician: 'Hệ thống – Import Excel',
              reason: 'Nhập hàng loạt từ file Excel',
              notes: `Tổng ${newItems.length} NPP mới được thêm vào danh sách`
            }, ...prev]);
          }}
          onImportDispensers={(newItems) => {
            setDispensers(prev => [...prev, ...newItems]);
            setAuditLogs(prev => [{
              id: `AUDIT-IMP-${Date.now()}`,
              type: 'IMPORT EXCEL – MÁY CHIẾT',
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
              setCode: '—', nppId: '—',
              nppName: `Đã import ${newItems.length} Máy Chiết từ Excel`,
              serialList: newItems.map(d => d.serial).join(', '),
              technician: 'Hệ thống – Import Excel',
              reason: 'Nhập hàng loạt từ file Excel',
              notes: `Tổng ${newItems.length} Máy Chiết mới vào kho`
            }, ...prev]);
          }}
          onImportMixers={(newItems) => {
            setMixers(prev => [...prev, ...newItems]);
            setAuditLogs(prev => [{
              id: `AUDIT-IMP-${Date.now()}`,
              type: 'IMPORT EXCEL – MÁY LẮC',
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
              setCode: '—', nppId: '—',
              nppName: `Đã import ${newItems.length} Máy Lắc từ Excel`,
              serialList: newItems.map(m => m.serial).join(', '),
              technician: 'Hệ thống – Import Excel',
              reason: 'Nhập hàng loạt từ file Excel',
              notes: `Tổng ${newItems.length} Máy Lắc mới vào kho`
            }, ...prev]);
          }}
          onImportComputers={(newItems) => {
            setComputers(prev => [...prev, ...newItems]);
            setAuditLogs(prev => [{
              id: `AUDIT-IMP-${Date.now()}`,
              type: 'IMPORT EXCEL – MÁY TÍNH',
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
              setCode: '—', nppId: '—',
              nppName: `Đã import ${newItems.length} Máy Tính từ Excel`,
              serialList: newItems.map(c => c.serial).join(', '),
              technician: 'Hệ thống – Import Excel',
              reason: 'Nhập hàng loạt từ file Excel',
              notes: `Tổng ${newItems.length} Máy Tính mới vào kho`
            }, ...prev]);
          }}
          onImportPrinters={(newItems) => {
            setPrinters(prev => [...prev, ...newItems]);
            setAuditLogs(prev => [{
              id: `AUDIT-IMP-${Date.now()}`,
              type: 'IMPORT EXCEL – MÁY IN',
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
              setCode: '—', nppId: '—',
              nppName: `Đã import ${newItems.length} Máy In từ Excel`,
              serialList: newItems.map(p => p.serial).join(', '),
              technician: 'Hệ thống – Import Excel',
              reason: 'Nhập hàng loạt từ file Excel',
              notes: `Tổng ${newItems.length} Máy In QL700 mới vào kho`
            }, ...prev]);
          }}
          onClose={() => setShowImportModal(false)}
        />
      )}

    </div>
  );
}

