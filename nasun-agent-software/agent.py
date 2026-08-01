import os
import sys
import json
import time
import shutil
import logging
import sqlite3
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler("agent.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)

CONFIG_FILE = "config.json"
STATE_FILE = "last_sync.json"

def load_config():
    if not os.path.exists(CONFIG_FILE):
        logging.error(f"Không tìm thấy tệp cấu hình: {CONFIG_FILE}")
        sys.exit(1)
    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"last_sqlite_id": 0, "last_xml_index": 0, "formula_version": "v1.0"}

def save_state(state):
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2)

def post_to_cloud(url, api_key, payload):
    """Sends synced logs payload to Cloud/Supabase backend"""
    req = urllib.request.Request(
        f"{url}/sync-logs",
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            response_body = res.read().decode('utf-8')
            logging.info(f"Đồng bộ Cloud thành công: {response_body}")
            return True
    except urllib.error.URLError as e:
        logging.error(f"Lỗi kết nối tới Cloud Server: {e.reason}")
    except Exception as e:
        logging.error(f"Lỗi không xác định khi đồng bộ: {str(e)}")
    return False

def check_for_formula_updates(url, api_key, config, state):
    """Checks for new color formula database updates and downloads them"""
    req_url = f"{url}/formulas/latest?software_type={config['software_type']}"
    req = urllib.request.Request(
        req_url,
        headers={
            'Authorization': f'Bearer {api_key}'
        },
        method='GET'
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode('utf-8'))
            latest_version = data.get("versionId")
            download_url = data.get("downloadUrl")
            filename = data.get("filename")

            if latest_version and latest_version != state.get("formula_version"):
                logging.info(f"Phát hiện công thức màu mới: {latest_version}. Tiến hành tải về...")
                
                # Setup target paths
                override_dir = config["paths"]["formula_override_dir"]
                if not os.path.exists(override_dir):
                    os.makedirs(override_dir)
                
                target_path = os.path.join(override_dir, filename)
                backup_path = target_path + ".bak"

                # Download temp file
                temp_file = "temp_formula.tmp"
                urllib.request.urlretrieve(download_url, temp_file)
                
                # Backup old database
                if os.path.exists(target_path):
                    shutil.copy2(target_path, backup_path)
                    logging.info(f"Đã tạo bản sao lưu backup công thức cũ tại: {backup_path}")
                
                # Overwrite with new file
                shutil.move(temp_file, target_path)
                logging.info(f"Đã ghi đè cập nhật tệp công thức mới tại: {target_path} thành công! 🟢")
                
                # Update local state
                state["formula_version"] = latest_version
                save_state(state)
            else:
                logging.info("Công thức màu tại máy NPP hiện đã là phiên bản mới nhất.")
    except Exception as e:
        logging.error(f"Lỗi kiểm tra cập nhật công thức màu: {str(e)}")

def process_sqlite_logs(db_path, state, config):
    """Parses SQLite database (ColorExpert 3) for new tinting logs"""
    if not os.path.exists(db_path):
        logging.warning(f"Không tìm thấy file database lịch sử SQLite: {db_path}")
        return []

    new_logs = []
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Verify tables structure and query new rows
        # Assumed schema layout for ColorExpert 3: Table 'TintHistory'
        last_id = state.get("last_sqlite_id", 0)
        cursor.execute(
            "SELECT id, timestamp, color_code, product_line, base, size, quantity, pigment_ml, operator "
            "FROM TintHistory WHERE id > ? ORDER BY id ASC", (last_id,)
        )
        rows = cursor.fetchall()
        
        for row in rows:
            r_id, timestamp, color, prod, base, size, qty, pigment, operator = row
            new_logs.append({
                "id": f"SQL-{config['set_code']}-{r_id}",
                "nppId": config["set_code"],
                "setCode": config["set_code"],
                "timestamp": timestamp,
                "colorCode": color,
                "productLine": prod,
                "base": base,
                "containerSize": size,
                "quantity": qty,
                "totalVolumeLiters": float(size.replace("L", "").strip()) * qty if "L" in str(size) else qty,
                "pigmentUsedMl": pigment,
                "operator": operator,
                "status": "HOÀN THÀNH"
            })
            last_id = max(last_id, r_id)
            
        state["last_sqlite_id"] = last_id
    except sqlite3.Error as e:
        logging.error(f"Lỗi kết nối cơ sở dữ liệu SQLite: {str(e)}")
    finally:
        if conn:
            conn.close()
    return new_logs

def process_xml_logs(xml_path, state, config):
    """Parses XML file (CorobTINT log) for new tinting logs"""
    if not os.path.exists(xml_path):
        logging.warning(f"Không tìm thấy file log XML: {xml_path}")
        return []

    new_logs = []
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        
        # Assumed structure: <DispenseHistory><Log index="1" timestamp="..." color="..." ... /></DispenseHistory>
        last_idx = state.get("last_xml_index", 0)
        max_idx = last_idx
        
        for log in root.findall('Log'):
            idx = int(log.get('index', 0))
            if idx > last_idx:
                new_logs.append({
                    "id": f"XML-{config['set_code']}-{idx}",
                    "nppId": config["set_code"],
                    "setCode": config["set_code"],
                    "timestamp": log.get('timestamp', datetime.now().strftime('%Y-%m-%d %H:%M:%S')),
                    "colorCode": log.get('color', 'N/A'),
                    "productLine": log.get('product', 'Sơn Nasun'),
                    "base": log.get('base', 'Base A'),
                    "containerSize": log.get('size', '1L'),
                    "quantity": int(log.get('qty', 1)),
                    "totalVolumeLiters": float(log.get('size', '1').replace('L', '')) * int(log.get('qty', 1)),
                    "pigmentUsedMl": float(log.get('pigment', 0.0)),
                    "operator": log.get('operator', 'KTV'),
                    "status": "HOÀN THÀNH"
                })
                max_idx = max(max_idx, idx)
                
        state["last_xml_index"] = max_idx
    except Exception as e:
        logging.error(f"Lỗi phân tích cú pháp tệp log XML: {str(e)}")
    return new_logs

def main():
    logging.info("==============================================")
    logging.info("Khởi động dịch vụ NASUN NPP Agent Service...")
    config = load_config()
    state = load_state()
    
    url = config["api_url"]
    api_key = config["api_key"]
    interval = config.get("sync_interval_minutes", 15) * 60
    
    logging.info(f"Đang chạy Agent với Mã bộ máy: {config['set_code']}")
    logging.info(f"Loại phần mềm: {config['software_type']}")
    logging.info(f"Chu kỳ đồng bộ: {config['sync_interval_minutes']} phút.")
    
    while True:
        logging.info("Đang thực hiện chu kỳ đồng bộ dữ liệu...")
        
        # 1. Sync Tinting Machine Logs
        logs = []
        if config["software_type"] == "ColorExpert 3":
            logs = process_sqlite_logs(config["paths"]["history_log_file"], state, config)
        elif config["software_type"] == "CorobTINT":
            logs = process_xml_logs(config["paths"]["history_log_file"], state, config)
        
        if logs:
            logging.info(f"Phát hiện {len(logs)} giao dịch pha màu mới. Đang đồng bộ lên Cloud...")
            if post_to_cloud(url, api_key, {"logs": logs, "set_code": config["set_code"]}):
                save_state(state)
        else:
            logging.info("Không phát hiện giao dịch pha màu mới nào.")
            
        # 2. Check for Formula Database Updates
        check_for_formula_updates(url, api_key, config, state)
        
        logging.info(f"Chu kỳ hoàn tất. Chờ {config['sync_interval_minutes']} phút cho phiên kế tiếp...")
        time.sleep(interval)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logging.info("Đã ngưng hoạt động Agent.")
        sys.exit(0)
