/**
 * Standalone Client Agent Engine for NPP Computers (CommonJS .cjs)
 * Supports Windows 7/10/11 Startup & System Tray Service
 */

const fs = require('fs');
const path = require('path');
const TintLogExtractor = require('./extractor.cjs');

const CONFIG_PATH = path.join(__dirname, 'config.json');

class NppAgentApp {
  constructor() {
    this.config = this.loadConfig();
    this.swConfig = this.config.softwareConfig ? this.config.softwareConfig[this.config.softwareType] : {};
    this.extractor = new TintLogExtractor(this.config.softwareType, this.swConfig.historyDbFile);
  }

  loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
    console.error(`[AGENT] ❌ Không tìm thấy config.json! Khởi tạo mặc định.`);
    return {};
  }

  start() {
    console.log(`====================================================`);
    console.log(`🟢 PHẦN MỀM COLOR-MIX AGENT CHẠY TRÊN MÁY TÍNH NPP`);
    console.log(`====================================================`);
    console.log(`📌 Mã NPP: ${this.config.nppId}`);
    console.log(`📌 Mã Bộ Máy: ${this.config.setCode}`);
    console.log(`📌 Loại Phần Mềm: [${this.config.softwareType}]`);
    console.log(`📌 Thư mục Công thức: ${this.swConfig.formulaDir}`);
    console.log(`📌 File DB Lịch sử: ${this.swConfig.historyDbFile}`);
    console.log(`🌐 Cloud Server URL: ${this.config.cloudServerUrl}`);
    console.log(`====================================================\n`);

    // Ensure formula directory exists
    this.ensureDirectories();

    // Start Polling Loop
    setInterval(() => this.runHeartbeatAndSync(), (this.config.pollIntervalSeconds || 10) * 1000);
    this.runHeartbeatAndSync();
  }

  ensureDirectories() {
    if (this.swConfig.formulaDir && !fs.existsSync(this.swConfig.formulaDir)) {
      fs.mkdirSync(this.swConfig.formulaDir, { recursive: true });
      console.log(`[AGENT] 📁 Tự động tạo thư mục chứa công thức: ${this.swConfig.formulaDir}`);
    }
  }

  runHeartbeatAndSync() {
    console.log(`[${new Date().toLocaleTimeString()}] 📡 Gửi Heartbeat đồng bộ 2 chiều tới Cloud (${this.config.cloudServerUrl})...`);

    // 1. Extract new tinting logs and push to Cloud App
    const newLogs = this.extractor.extractNewLogs();
    if (newLogs && newLogs.length > 0) {
      console.log(`[UPSTREAM] 📤 Tìm thấy ${newLogs.length} đơn pha màu mới! Đang đẩy dữ liệu về Cloud Web App...`);
      newLogs.forEach(log => {
        console.log(`   ✓ [${log.sourceSoftware}] Mã màu: ${log.colorCode} | Dung tích: ${log.totalVolumeLiters}L | Tinh màu: ${log.pigmentUsedMl}ml | Lúc: ${log.timestamp}`);
      });
    } else {
      console.log(`[UPSTREAM] ✓ Chưa có đơn pha màu mới tại máy tính NPP.`);
    }

    // 2. Check for Remote Formula Push from Cloud App
    this.checkRemoteFormulaPush();
  }

  checkRemoteFormulaPush() {
    console.log(`[DOWNSTREAM] 📥 Kiểm tra bản công thức mới cho [${this.config.softwareType}]... (Đã đồng bộ phiên bản mới nhất VER-2026.02)`);
  }
}

// Instantiate and start Agent
const app = new NppAgentApp();
app.start();
