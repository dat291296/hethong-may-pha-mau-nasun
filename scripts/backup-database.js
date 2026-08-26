/**
 * Automatic Supabase Local Backup Script
 * Usage: node scripts/backup-database.js
 * 
 * Set environment variables or create .env file with:
 * VITE_SUPABASE_URL=your_supabase_url
 * VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('⚠️ Warning: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set in environment.');
  console.log('💡 You can set them before running:');
  console.log('   $env:VITE_SUPABASE_URL="https://xxx.supabase.co"; $env:VITE_SUPABASE_ANON_KEY="eyJ..."; node scripts/backup-database.js');
  process.exit(1);
}

const TABLES = [
  'npps',
  'dispensers',
  'mixers',
  'computers',
  'printers',
  'system_sets',
  'maintenance_logs',
  'supplies'
];

async function backupTable(tableName) {
  const endpoint = `${supabaseUrl}/rest/v1/${tableName}?select=*`;
  const response = await fetch(endpoint, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${tableName}: ${response.statusText}`);
  }
  return await response.json();
}

async function runBackup() {
  console.log('📦 Bắt đầu tiến trình Backup dữ liệu từ Supabase về máy...');
  const backupData = {
    timestamp: new Date().toISOString(),
    tables: {}
  };

  for (const table of TABLES) {
    try {
      const data = await backupTable(table);
      backupData.tables[table] = data;
      console.log(`  ✓ Đã sao lưu bảng [${table}]: ${data.length} bản ghi.`);
    } catch (err) {
      console.error(`  ❌ Lỗi sao lưu bảng [${table}]:`, err.message);
    }
  }

  const outputDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `supabase_backup_${dateStr}.json`;
  const filePath = path.join(outputDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`\n🎉 BẢO VỆ DỮ LIỆU THÀNH CÔNG!`);
  console.log(`📁 Đã lưu file backup tại: ${filePath}`);
}

runBackup();
