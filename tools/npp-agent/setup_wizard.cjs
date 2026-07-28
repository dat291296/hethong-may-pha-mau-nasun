/**
 * Interactive Setup Wizard for ColorMix Client Agent
 * Allows user to manually set custom Formula Update Directory & Tint History File Path
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_PATH = path.join(__dirname, 'config.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function runWizard() {
  console.log(`===================================================================`);
  console.log(`🛠️ COMPA TRÌNH CẤU HÌNH THƯ MỤC CÔNG THỨC & LỊCH SỬ MÁY NPP`);
  console.log(`===================================================================\n`);

  let currentConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      currentConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {}
  }

  // 1. Ask NPP ID
  const nppId = await askQuestion(`1. Nhập Mã Nhà Phân Phối (Mặc định: ${currentConfig.nppId || 'NPP-HN-001'}): `);
  const finalNppId = nppId.trim() || currentConfig.nppId || 'NPP-HN-001';

  // 2. Ask Software Type
  console.log(`\n2. Chọn Loại Phần Mềm Pha Màu Đang Cài Trên Máy Tính:`);
  console.log(`   [1] ColorExpert 2`);
  console.log(`   [2] ColorExpert 3`);
  console.log(`   [3] CorobTINT`);
  const swChoice = await askQuestion(`   Lựa chọn của bạn (1, 2, hoặc 3 - Mặc định 2): `);
  
  let swType = 'ColorExpert 3';
  if (swChoice.trim() === '1') swType = 'ColorExpert 2';
  if (swChoice.trim() === '3') swType = 'CorobTINT';

  const defaultSwConfig = currentConfig.softwareConfig && currentConfig.softwareConfig[swType] ? currentConfig.softwareConfig[swType] : {};

  // 3. Ask Custom Formula Update Directory
  console.log(`\n-------------------------------------------------------------------`);
  console.log(`📁 3. TỰ THIẾT LẬP THƯ MỤC CẬP NHẬT CÔNG THỨC MÀU (Formula Update Folder):`);
  console.log(`   (Nơi Agent sẽ tự động tải & ghi đè file công thức mới từ xa)`);
  const defaultFormulaDir = defaultSwConfig.formulaDir || `C:\\${swType.replace(/\s+/g, '')}\\Formulas`;
  const formulaDirInput = await askQuestion(`   Nhập đường dẫn thư mục công thức (Mặc định: ${defaultFormulaDir}): `);
  const finalFormulaDir = formulaDirInput.trim() || defaultFormulaDir;

  // 4. Ask Custom History File / DB Path
  console.log(`\n-------------------------------------------------------------------`);
  console.log(`📊 4. TỰ THIẾT LẬP ĐƯỜNG DẪN TỆP LỊCH SỬ PHA MÀU (Tint History DB File):`);
  console.log(`   (Nơi phần mềm pha màu lưu log, Agent sẽ đọc tệp này để trích xuất)`);
  const defaultHistoryDb = defaultSwConfig.historyDbFile || `C:\\${swType.replace(/\s+/g, '')}\\Data\\History.${swType === 'CorobTINT' ? 'xml' : 'db'}`;
  const historyDbInput = await askQuestion(`   Nhập đường dẫn tệp lịch sử (Mặc định: ${defaultHistoryDb}): `);
  const finalHistoryDb = historyDbInput.trim() || defaultHistoryDb;

  // Build new config
  const newConfig = {
    ...currentConfig,
    nppId: finalNppId,
    setCode: currentConfig.setCode || 'SET-2024-001',
    softwareType: swType,
    cloudServerUrl: currentConfig.cloudServerUrl || 'http://localhost:5173',
    pollIntervalSeconds: 10,
    softwareConfig: {
      ...(currentConfig.softwareConfig || {}),
      [swType]: {
        installDir: path.dirname(finalFormulaDir),
        formulaDir: finalFormulaDir,
        historyDbFile: finalHistoryDb,
        formulaFileFormat: swType === 'ColorExpert 2' ? '.mdb' : swType === 'CorobTINT' ? '.xml' : '.db'
      }
    }
  };

  // Save to config.json
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8');

  console.log(`\n===================================================================`);
  console.log(`✅ ĐÃ LƯU CẤU HÌNH TÙY CHỈNH THÀNH CÔNG VÀO config.json!`);
  console.log(`📌 Mã NPP: ${finalNppId}`);
  console.log(`📌 Phần Mềm: ${swType}`);
  console.log(`📌 Thư mục Update Công Thức: ${finalFormulaDir}`);
  console.log(`📌 Tệp DB Lịch Sử Pha Màu: ${finalHistoryDb}`);
  console.log(`===================================================================\n`);

  rl.close();

  // Launch Agent
  require('./agent_app.cjs');
}

runWizard();
