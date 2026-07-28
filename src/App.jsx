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
  INITIAL_NPPS,
  INITIAL_DISPENSERS,
  INITIAL_MIXERS,
  INITIAL_COMPUTERS,
  INITIAL_PRINTERS,
  INITIAL_SYSTEM_SETS,
  INITIAL_FORMULA_VERSIONS,
  INITIAL_TINTING_LOGS,
  INITIAL_AUDIT_LOGS,
  INITIAL_REPAIR_TICKETS
} from './data/mockData';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [globalSearch, setGlobalSearch] = useState('');

  // Main State
  const [npps, setNpps] = useState(INITIAL_NPPS);
  const [dispensers, setDispensers] = useState(INITIAL_DISPENSERS);
  const [mixers, setMixers] = useState(INITIAL_MIXERS);
  const [computers, setComputers] = useState(INITIAL_COMPUTERS);
  const [printers, setPrinters] = useState(INITIAL_PRINTERS);
  const [systemSets, setSystemSets] = useState(INITIAL_SYSTEM_SETS);
  const [formulaVersions, setFormulaVersions] = useState(INITIAL_FORMULA_VERSIONS);
  const [tintingLogs, setTintingLogs] = useState(INITIAL_TINTING_LOGS);
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);
  const [repairTickets, setRepairTickets] = useState(INITIAL_REPAIR_TICKETS);

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
  const handleAddTicket = (newTicket) => {
    setRepairTickets(prev => [newTicket, ...prev]);
    const newAudit = {
      id: `AUDIT-00${auditLogs.length + 1}`,
      type: 'TẠO PHIẾU SỬA CHỮA',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      setCode: newTicket.serialNumber,
      nppId: newTicket.nppId,
      nppName: newTicket.nppName,
      serialList: `${newTicket.productCategory}: ${newTicket.machineModel} (${newTicket.serialNumber})`,
      technician: newTicket.technician,
      reason: `Tạo phiếu xử lý máy [${newTicket.ticketCode}]`,
      notes: newTicket.errorDescription
    };
    setAuditLogs(prev => [newAudit, ...prev]);
  };

  const handleEditTicket = (updatedTicket) => {
    setRepairTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t));
  };

  const handleDeleteTicket = (ticketId) => {
    setRepairTickets(prev => prev.filter(t => t.id !== ticketId));
  };

  // NPP CRUD Handlers
  const handleAddNpp = (newNpp) => {
    setNpps(prev => [newNpp, ...prev]);
  };

  const handleEditNpp = (updatedNpp) => {
    setNpps(prev => prev.map(n => n.id === updatedNpp.id ? updatedNpp : n));
    setSystemSets(prev => prev.map(s => s.nppId === updatedNpp.id ? { ...s, nppName: updatedNpp.name, region: updatedNpp.region } : s));
  };

  const handleDeleteNpp = (nppId) => {
    const hasAssignedSets = systemSets.some(s => s.nppId === nppId && s.status === 'DA_LAP_DAT');
    if (hasAssignedSets) {
      alert('Không thể xóa NPP này vì vẫn còn bộ máy đang lắp đặt. Vui lòng thu hồi bộ máy trước!');
      return;
    }
    setNpps(prev => prev.filter(n => n.id !== nppId));
  };

  // Device CRUD Handlers
  const handleEditDevice = (category, updatedData) => {
    if (category === 'dispenser') setDispensers(prev => prev.map(d => d.id === updatedData.id ? updatedData : d));
    if (category === 'mixer') setMixers(prev => prev.map(m => m.id === updatedData.id ? updatedData : m));
    if (category === 'computer') setComputers(prev => prev.map(c => c.id === updatedData.id ? updatedData : c));
    if (category === 'printer') setPrinters(prev => prev.map(p => p.id === updatedData.id ? updatedData : p));
  };

  const handleDeleteDevice = (category, deviceId) => {
    if (category === 'dispenser') setDispensers(prev => prev.filter(d => d.id !== deviceId));
    if (category === 'mixer') setMixers(prev => prev.filter(m => m.id !== deviceId));
    if (category === 'computer') setComputers(prev => prev.filter(c => c.id !== deviceId));
    if (category === 'printer') setPrinters(prev => prev.filter(p => p.id !== deviceId));
  };

  const handleAddStockDevice = (category, newDeviceData) => {
    const prefix = category === 'dispenser' ? 'DISP' : category === 'mixer' ? 'MIX' : category === 'computer' ? 'PC' : 'PRN';
    const newObj = {
      ...newDeviceData,
      id: `${prefix}-STOCK-00${Date.now().toString().slice(-3)}`,
      isAssigned: false,
      setCode: null
    };

    if (category === 'dispenser') setDispensers(prev => [newObj, ...prev]);
    if (category === 'mixer') setMixers(prev => [newObj, ...prev]);
    if (category === 'computer') setComputers(prev => [newObj, ...prev]);
    if (category === 'printer') setPrinters(prev => [newObj, ...prev]);
  };

  const handleAssembleSet = (newCombo) => {
    const disp = dispensers.find(d => d.id === newCombo.dispenserId);
    const mix = mixers.find(m => m.id === newCombo.mixerId);
    const pc = computers.find(c => c.id === newCombo.computerId);
    const prn = printers.find(p => p.id === newCombo.printerId);

    const setCode = `SET-2026-00${systemSets.length + 1}`;

    const newSetObj = {
      id: setCode,
      setCode,
      nppId: null,
      nppName: 'Kho Tổng Trung Tâm',
      region: 'Kho Tổng',
      dispenserSerial: disp?.serial || 'N/A',
      dispenserModel: disp?.model || 'N/A',
      mixerSerial: mix?.serial || 'N/A',
      mixerModel: mix?.model || 'N/A',
      pcSerial: pc?.serial || 'N/A',
      pcType: pc?.type || 'N/A',
      pcOs: pc?.os || 'N/A',
      printerSerial: prn?.serial || 'N/A',
      printerModel: prn?.model || 'QL700',
      stabilizer: 'NPP tự trang bị khi lắp đặt',
      status: 'TRONG_KHO',
      installedDate: null,
      lastMaintenanceDate: null,
      nextMaintenanceDue: null,
      technician: 'Quản lý Kho',
      tintingSoftware: 'ColorExpert 3',
      softwareVersion: 'Standard Stock',
      agentStatus: 'Offline',
      installationPhotos: []
    };

    setSystemSets(prev => [newSetObj, ...prev]);

    if (disp) setDispensers(prev => prev.map(d => d.id === disp.id ? { ...d, isAssigned: true, setCode } : d));
    if (mix) setMixers(prev => prev.map(m => m.id === mix.id ? { ...m, isAssigned: true, setCode } : m));
    if (pc) setComputers(prev => prev.map(c => c.id === pc.id ? { ...c, isAssigned: true, setCode } : c));
    if (prn) setPrinters(prev => prev.map(p => p.id === prn.id ? { ...p, isAssigned: true, setCode } : p));
  };

  const handleInstallSubmit = (data) => {
    const targetNpp = npps.find(n => n.id === data.nppId);

    setSystemSets(prev => prev.map(s => {
      if (s.setCode === data.setCode) {
        return {
          ...s,
          nppId: data.nppId,
          nppName: targetNpp ? targetNpp.name : 'NPP',
          region: targetNpp ? targetNpp.region : 'Việt Nam',
          status: 'DA_LAP_DAT',
          installedDate: data.installedDate,
          lastMaintenanceDate: data.installedDate,
          nextMaintenanceDue: data.nextMaintenanceDue,
          stabilizer: data.stabilizer,
          technician: data.technician,
          agentStatus: 'Online',
          installationPhotos: data.installationPhotos || []
        };
      }
      return s;
    }));

    if (data.installationPhotos && data.installationPhotos.length > 0 && targetNpp) {
      setNpps(prev => prev.map(n => n.id === data.nppId ? { ...n, photos: [...(n.photos || []), ...data.installationPhotos] } : n));
    }

    const newAudit = {
      id: `AUDIT-00${auditLogs.length + 1}`,
      type: 'LẮP ĐẶT MỚI',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      setCode: data.setCode,
      nppId: data.nppId,
      nppName: targetNpp ? targetNpp.name : 'NPP',
      serialList: `Bộ máy ${data.setCode}`,
      technician: data.technician,
      reason: 'Lắp mới bộ máy pha màu cho NPP',
      notes: data.notes || 'Bàn giao chạy thử tốt.'
    };
    setAuditLogs(prev => [newAudit, ...prev]);
  };

  const handleWithdrawSubmit = (data) => {
    const targetSet = systemSets.find(s => s.setCode === data.setCode);

    setSystemSets(prev => prev.map(s => {
      if (s.setCode === data.setCode) {
        return {
          ...s,
          status: 'DA_THU_HOI',
          nppId: null,
          nppName: 'Kho Tổng (Đã thu hồi)',
          agentStatus: 'Offline'
        };
      }
      return s;
    }));

    const newAudit = {
      id: `AUDIT-00${auditLogs.length + 1}`,
      type: 'THU HỒI',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      setCode: data.setCode,
      nppId: targetSet?.nppId || 'NPP',
      nppName: targetSet?.nppName || 'NPP',
      serialList: `Bộ máy ${data.setCode}`,
      technician: data.technician,
      reason: data.reason,
      notes: `${data.deviceCondition} | ${data.notes}`
    };
    setAuditLogs(prev => [newAudit, ...prev]);
  };

  const handleTransferSubmit = (data) => {
    const targetNpp = npps.find(n => n.id === data.newNppId);
    const targetSet = systemSets.find(s => s.setCode === data.setCode);

    setSystemSets(prev => prev.map(s => {
      if (s.setCode === data.setCode) {
        return {
          ...s,
          nppId: data.newNppId,
          nppName: targetNpp ? targetNpp.name : 'NPP Mới',
          region: targetNpp ? targetNpp.region : s.region
        };
      }
      return s;
    }));

    const newAudit = {
      id: `AUDIT-00${auditLogs.length + 1}`,
      type: 'ĐIỀU CHUYỂN NPP',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      setCode: data.setCode,
      nppId: data.newNppId,
      nppName: `Từ ${targetSet?.nppName} sang ${targetNpp?.name}`,
      serialList: `Bộ máy ${data.setCode}`,
      technician: data.technician,
      reason: data.reason || 'Điều chuyển tối ưu',
      notes: data.notes
    };
    setAuditLogs(prev => [newAudit, ...prev]);
  };

  const handleCompleteMaintenance = (maintData) => {
    setSystemSets(prev => prev.map(s => {
      if (s.setCode === maintData.setCode) {
        return {
          ...s,
          lastMaintenanceDate: maintData.lastMaintenanceDate,
          nextMaintenanceDue: maintData.nextMaintenanceDue,
          status: 'DA_LAP_DAT'
        };
      }
      return s;
    }));

    const targetSet = systemSets.find(s => s.setCode === maintData.setCode);
    const newAudit = {
      id: `AUDIT-00${auditLogs.length + 1}`,
      type: 'BẢO TRÌ / SỬA CHỮA',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      setCode: maintData.setCode,
      nppId: targetSet?.nppId,
      nppName: targetSet?.nppName,
      serialList: `Bảo trì bộ máy ${maintData.setCode}`,
      technician: 'Kỹ thuật viên bảo trì',
      reason: 'Bảo trì định kỳ 1 năm / lần',
      notes: maintData.notes || 'Đã vệ sinh ống chiết và kiểm tra máy lắc.'
    };
    setAuditLogs(prev => [newAudit, ...prev]);
  };

  const handleTriggerRemotePush = (pushInfo) => {
    console.log('Remote push triggered:', pushInfo);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      
      {/* Sidebar Navigation for Desktop */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        maintenanceCount={maintenanceAlerts.length}
        pendingRepairCount={pendingRepairCount}
      />

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

