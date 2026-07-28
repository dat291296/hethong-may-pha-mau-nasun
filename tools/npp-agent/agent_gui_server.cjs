/**
 * Standalone Desktop GUI Control Server for ColorMix NPP Agent
 * Runs local GUI at http://localhost:9999 (with EADDRINUSE graceful auto-open & fallback handling)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let PORT = 9999;
const GUI_HTML_PATH = path.join(__dirname, 'gui', 'index.html');
const CONFIG_PATH = path.join(__dirname, 'config.json');

function autoOpenBrowser(url) {
  const startCmd = process.platform === 'win32' ? `start ${url}` : `open ${url}`;
  exec(startCmd, (err) => {
    if (err) console.log(`👉 Vui lòng mở trình duyệt và truy cập: ${url}`);
  });
}

function startServer(portToTry) {
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      fs.readFile(GUI_HTML_PATH, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading GUI');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    } else if (req.url === '/api/save-config' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          let currentConfig = {};
          if (fs.existsSync(CONFIG_PATH)) {
            currentConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
          }

          currentConfig.nppId = payload.nppId;
          currentConfig.setCode = payload.setCode;
          currentConfig.softwareType = payload.softwareType;

          if (!currentConfig.softwareConfig) currentConfig.softwareConfig = {};
          currentConfig.softwareConfig[payload.softwareType] = {
            formulaDir: payload.formulaDir,
            historyDbFile: payload.historyDbFile
          };

          fs.writeFileSync(CONFIG_PATH, JSON.stringify(currentConfig, null, 2), 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', message: 'Config saved' }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`===================================================================`);
      console.log(`ℹ️ CỔNG ${portToTry} ĐÃ ĐANG CHẠY SẮN TRÊN MÁY TÍNH!`);
      console.log(`🌐 ĐANG TỰ ĐỘNG MỞ TRÌNH DUYỆT TẠI: http://localhost:${portToTry}`);
      console.log(`===================================================================`);
      autoOpenBrowser(`http://localhost:${portToTry}`);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(portToTry, () => {
    console.log(`===================================================================`);
    console.log(`🟢 GIAO DIỆN DESKTOP GUI AGENT ĐANG CHẠY TẠI: http://localhost:${portToTry}`);
    console.log(`===================================================================`);
    autoOpenBrowser(`http://localhost:${portToTry}`);
  });
}

startServer(PORT);
