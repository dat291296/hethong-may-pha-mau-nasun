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

def post_to_cloud(url, api_key, logs):
    """Sends synced logs payload to Cloud/Supabase backend"""
    req = urllib.request.Request(
        f"{url}/rest/v1/tinting_logs",
        data=json.dumps(logs).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'apikey': api_key,
            'Authorization': f'Bearer {api_key}',
            'Prefer': 'resolution=merge-duplicates'
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            logging.info(f"Đồng bộ {len(logs)} nhật ký lên Supabase thành công!")
            return True
    except urllib.error.URLError as e:
        logging.error(f"Lỗi kết nối tới Supabase Cloud: {e.reason}")
    except Exception as e:
        logging.error(f"Lỗi không xác định khi đồng bộ: {str(e)}")
    return False

def check_for_formula_updates(url, api_key, config, state):
    """Checks for new color formula database updates and downloads them"""
    req_url = f"{url}/rest/v1/formula_versions?software_type=eq.{config['software_type']}&order=release_date.desc&limit=1"
    req = urllib.request.Request(
        req_url,
        headers={
            'apikey': api_key,
            'Authorization': f'Bearer {api_key}',
            'Accept': 'application/json'
        },
        method='GET'
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode('utf-8'))
            if data and len(data) > 0:
                item = data[0]
                latest_version = item.get("version_id")
                download_url = item.get("download_url")
                filename = item.get("filename")

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
            else:
                logging.info("Chưa có phiên bản công thức màu nào được phát hành cho phần mềm này.")
    except Exception as e:
        logging.error(f"Lỗi kiểm tra cập nhật công thức màu: {str(e)}")

def process_sqlite_logs(db_path, state, config, npp_id, npp_name):
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
                "npp_id": npp_id,
                "npp_name": npp_name,
                "set_code": config["set_code"],
                "dispenser_serial": "",
                "timestamp": timestamp,
                "color_code": color,
                "product_line": prod,
                "base": base,
                "container_size": size,
                "quantity": qty,
                "total_volume_liters": float(size.replace("L", "").strip()) * qty if "L" in str(size) else qty,
                "pigment_used_ml": pigment,
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

def process_xml_logs(xml_path, state, config, npp_id, npp_name):
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
                    "npp_id": npp_id,
                    "npp_name": npp_name,
                    "set_code": config["set_code"],
                    "dispenser_serial": "",
                    "timestamp": log.get('timestamp', datetime.now().strftime('%Y-%m-%d %H:%M:%S')),
                    "color_code": log.get('color', 'N/A'),
                    "product_line": log.get('product', 'Sơn Nasun'),
                    "base": log.get('base', 'Base A'),
                    "container_size": log.get('size', '1L'),
                    "quantity": int(log.get('qty', 1)),
                    "total_volume_liters": float(log.get('size', '1').replace('L', '')) * int(log.get('qty', 1)),
                    "pigment_used_ml": float(log.get('pigment', 0.0)),
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

    # 0. Query npp_id and npp_name from Supabase on startup
    npp_id = config["set_code"]
    npp_name = "NPP Nasun"
    try:
        req_url = f"{url}/rest/v1/system_sets?set_code=eq.{config['set_code']}&select=npp_id,npp_name"
        req = urllib.request.Request(
            req_url,
            headers={
                'apikey': api_key,
                'Authorization': f'Bearer {api_key}',
                'Accept': 'application/json'
            },
            method='GET'
        )
        with urllib.request.urlopen(req, timeout=10) as res:
            sys_set = json.loads(res.read().decode('utf-8'))
            if sys_set and len(sys_set) > 0:
                npp_id = sys_set[0].get("npp_id", npp_id)
                npp_name = sys_set[0].get("npp_name", npp_name)
                logging.info(f"✓ Đã liên kết thành công với NPP: {npp_name} (ID: {npp_id})")
    except Exception as e:
        logging.warning(f"Không thể lấy thông tin NPP từ Supabase: {str(e)}. Sử dụng mặc định.")
    
    while True:
        logging.info("Đang thực hiện chu kỳ đồng bộ dữ liệu...")
        
        # 1. Sync Tinting Machine Logs
        logs = []
        if config["software_type"] == "ColorExpert 3":
            logs = process_sqlite_logs(config["paths"]["history_log_file"], state, config, npp_id, npp_name)
        elif config["software_type"] == "CorobTINT":
            logs = process_xml_logs(config["paths"]["history_log_file"], state, config, npp_id, npp_name)
        
        upload_success = True
        if logs:
            logging.info(f"Phát hiện {len(logs)} giao dịch pha màu mới. Đang đồng bộ lên Cloud...")
            upload_success = post_to_cloud(url, api_key, logs)
            if upload_success:
                save_state(state)
        else:
            logging.info("Không phát hiện giao dịch pha màu mới nào.")
            
        # 2. Update heartbeat status to Online on system_sets
        try:
            heartbeat_url = f"{url}/rest/v1/system_sets?set_code=eq.{config['set_code']}"
            req_hb = urllib.request.Request(
                heartbeat_url,
                data=json.dumps({"agent_status": "Online", "updated_at": datetime.utcnow().isoformat() + "Z"}).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'apikey': api_key,
                    'Authorization': f'Bearer {api_key}'
                },
                method='PATCH'
            )
            with urllib.request.urlopen(req_hb, timeout=10) as hb_res:
                pass
        except Exception as e:
            logging.warning(f"Không thể cập nhật trạng thái hoạt động (Heartbeat): {str(e)}")

        # 3. Check for Formula Database Updates
        if upload_success:
            check_for_formula_updates(url, api_key, config, state)
        
        logging.info(f"Chu kỳ hoàn tất. Chờ {config['sync_interval_minutes']} phút cho phiên kế tiếp...")
        time.sleep(interval)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logging.info("Đã ngưng hoạt động Agent.")
        sys.exit(0)
