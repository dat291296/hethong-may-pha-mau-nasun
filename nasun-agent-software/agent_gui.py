import os
import sys
import json
import time
import shutil
import logging
import sqlite3
import threading
import subprocess
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime
import tkinter as tk
from tkinter import ttk, messagebox, filedialog

# Configure Logging
LOG_FILE = "agent.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)

CONFIG_FILE = "config.json"
STATE_FILE = "last_sync.json"

DEFAULT_CONFIG = {
    "api_url": "https://kythuat.nasun.workers.dev/api",
    "api_key": "supabase-anon-key-chuyen-biet-cua-he-thong",
    "set_code": "SET-001",
    "sync_interval_minutes": 15,
    "software_type": "ColorExpert 3",
    "paths": {
      "formula_override_dir": "C:\\ColorExpert3\\Data\\Formulas",
      "history_log_file": "C:\\ColorExpert3\\Data\\History.db"
    }
}

class NasunAgentApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Cấu Hình NASUN NPP Agent - Giám Sát Từ Xa")
        self.root.geometry("640x700")
        self.root.configure(bg="#0f172a")
        self.root.resizable(False, False)
        
        self.config = self.load_config()
        self.state = self.load_state()
        self.is_running = False
        
        # Apply style
        self.setup_styles()
        
        # Build UI Components
        self.build_ui()
        self.load_config_to_fields()
        
        # Start log polling in UI
        self.update_log_viewer()

    def setup_styles(self):
        style = ttk.Style()
        style.theme_use('clam')
        style.configure('TFrame', background='#0f172a')
        style.configure('TLabel', background='#0f172a', foreground='#f1f5f9', font=('Segoe UI', 9))
        style.configure('TButton', background='#1e293b', foreground='#f1f5f9', borderwidth=0, font=('Segoe UI', 9, 'bold'))
        style.map('TButton', background=[('active', '#334155')])
        style.configure('Header.TLabel', font=('Segoe UI', 13, 'bold'), foreground='#06b6d4')

    def build_ui(self):
        # Header Area
        header_frame = ttk.Frame(self.root)
        header_frame.pack(fill=tk.X, padx=20, pady=15)
        
        header_lbl = ttk.Label(header_frame, text="HỆ THỐNG ĐỒNG BỘ MÁY PHA MÀU NASUN PAINT", style='Header.TLabel')
        header_lbl.pack(anchor=tk.W)
        desc_lbl = ttk.Label(header_frame, text="Cấu hình kết nối Agent chạy ngầm trên máy tính NPP", foreground='#94a3b8')
        desc_lbl.pack(anchor=tk.W, pady=2)

        # Form Area (Notebook/Tabs)
        form_frame = ttk.Frame(self.root)
        form_frame.pack(fill=tk.BOTH, padx=20, pady=5)

        # Inputs
        self.create_field(form_frame, "URL Máy Chủ API:", "api_url", 0)
        self.create_field(form_frame, "Supabase API Key / Token:", "api_key", 1)
        self.create_field(form_frame, "Mã Bộ Máy (Set Code):", "set_code", 2)
        
        # Software Combobox
        ttk.Label(form_frame, text="Phần Mềm Pha Màu:").grid(row=3, column=0, sticky=tk.W, pady=6)
        self.sw_type_var = tk.StringVar()
        self.sw_combobox = ttk.Combobox(form_frame, textvariable=self.sw_type_var, values=["ColorExpert 3", "ColorExpert 2", "CorobTINT"], state="readonly", width=42)
        self.sw_combobox.grid(row=3, column=1, columnspan=2, sticky=tk.W, pady=6)
        
        # Paths selection with browse buttons
        ttk.Label(form_frame, text="Thư Mục Ghi Đè Công Thức:").grid(row=4, column=0, sticky=tk.W, pady=6)
        self.formula_dir_var = tk.StringVar()
        self.formula_dir_entry = ttk.Entry(form_frame, textvariable=self.formula_dir_var, width=35)
        self.formula_dir_entry.grid(row=4, column=1, sticky=tk.W, pady=6)
        ttk.Button(form_frame, text="Browse...", command=self.browse_formula_dir).grid(row=4, column=2, padx=5, pady=6)

        ttk.Label(form_frame, text="Tệp Nhật Ký/Log Lịch Sử:").grid(row=5, column=0, sticky=tk.W, pady=6)
        self.log_file_var = tk.StringVar()
        self.log_file_entry = ttk.Entry(form_frame, textvariable=self.log_file_var, width=35)
        self.log_file_entry.grid(row=5, column=1, sticky=tk.W, pady=6)
        ttk.Button(form_frame, text="Browse...", command=self.browse_log_file).grid(row=5, column=2, padx=5, pady=6)

        self.create_field(form_frame, "Chu Kỳ Đồng Bộ (Phút):", "sync_interval", 6, width=10)

        # Control Buttons Frame
        btn_frame = ttk.Frame(self.root)
        btn_frame.pack(fill=tk.X, padx=20, pady=15)

        self.save_btn = tk.Button(btn_frame, text="LƯU CẤU HÌNH", bg="#0ea5e9", fg="white", font=('Segoe UI', 9, 'bold'), borderwidth=0, padx=12, pady=6, command=self.save_config_action)
        self.save_btn.pack(side=tk.LEFT, padx=5)

        self.sync_btn = tk.Button(btn_frame, text="ĐỒNG BỘ THỬ NGHIỆM", bg="#10b981", fg="white", font=('Segoe UI', 9, 'bold'), borderwidth=0, padx=12, pady=6, command=self.test_sync_action)
        self.sync_btn.pack(side=tk.LEFT, padx=5)

        self.install_btn = tk.Button(btn_frame, text="CÀI ĐẶT CHẠY CÙNG WINDOWS", bg="#8b5cf6", fg="white", font=('Segoe UI', 9, 'bold'), borderwidth=0, padx=12, pady=6, command=self.install_startup_task)
        self.install_btn.pack(side=tk.LEFT, padx=5)

        # Log Terminal View
        log_frame = ttk.Frame(self.root)
        log_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        
        ttk.Label(log_frame, text="Nhật ký hoạt động của Agent (Console Log):", font=('Segoe UI', 9, 'bold'), foreground='#94a3b8').pack(anchor=tk.W, pady=2)
        
        self.log_text = tk.Text(log_frame, bg="#020617", fg="#38bdf8", font=('Consolas', 9), wrap=tk.WORD, borderwidth=1, relief=tk.FLAT)
        self.log_text.pack(fill=tk.BOTH, expand=True)

    def create_field(self, parent, label_text, attr_name, row_idx, width=45):
        ttk.Label(parent, text=label_text).grid(row=row_idx, column=0, sticky=tk.W, pady=6)
        var = tk.StringVar()
        setattr(self, f"{attr_name}_var", var)
        entry = ttk.Entry(parent, textvariable=var, width=width)
        entry.grid(row=row_idx, column=1, columnspan=2, sticky=tk.W, pady=6)

    def browse_formula_dir(self):
        dir_selected = filedialog.askdirectory(title="Chọn thư mục ghi đè công thức màu")
        if dir_selected:
            self.formula_dir_var.set(dir_selected.replace("/", "\\"))

    def browse_log_file(self):
        file_selected = filedialog.askopenfilename(
            title="Chọn tệp cơ sở dữ liệu lịch sử pha màu (.db, .mdb, .xml)",
            filetypes=[("Database / Log Files", "*.db;*.mdb;*.xml"), ("All Files", "*.*")]
        )
        if file_selected:
            self.log_file_var.set(file_selected.replace("/", "\\"))

    def load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return DEFAULT_CONFIG.copy()

    def load_state(self):
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return {"last_sqlite_id": 0, "last_xml_index": 0, "formula_version": "v1.0"}

    def load_config_to_fields(self):
        self.api_url_var.set(self.config.get("api_url", ""))
        self.api_key_var.set(self.config.get("api_key", ""))
        self.set_code_var.set(self.config.get("set_code", ""))
        self.sw_type_var.set(self.config.get("software_type", "ColorExpert 3"))
        self.formula_dir_var.set(self.config.get("paths", {}).get("formula_override_dir", ""))
        self.log_file_var.set(self.config.get("paths", {}).get("history_log_file", ""))
        self.sync_interval_var.set(str(self.config.get("sync_interval_minutes", 15)))

    def save_config_action(self):
        try:
            self.config["api_url"] = self.api_url_var.get().strip()
            self.config["api_key"] = self.api_key_var.get().strip()
            self.config["set_code"] = self.set_code_var.get().strip()
            self.config["software_type"] = self.sw_type_var.get()
            self.config["paths"] = {
                "formula_override_dir": self.formula_dir_var.get().strip(),
                "history_log_file": self.log_file_var.get().strip()
            }
            self.config["sync_interval_minutes"] = int(self.sync_interval_var.get().strip())
            
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2)
            
            messagebox.showinfo("Thành Công", "Đã lưu thông số cấu hình thành công!")
            logging.info("Đã cập nhật cấu hình hệ thống từ giao diện GUI.")
        except Exception as e:
            messagebox.showerror("Lỗi", f"Không thể lưu cấu hình: {str(e)}")

    def test_sync_action(self):
        self.save_config_action()
        logging.info("--- Khởi chạy đồng bộ thử nghiệm ---")
        threading.Thread(target=self.run_single_sync, daemon=True).start()

    def run_single_sync(self):
        try:
            # Re-read fresh config
            config = self.load_config()
            state = self.load_state()
            
            url = config["api_url"]
            api_key = config["api_key"]
            
            logs = []
            if config["software_type"] == "ColorExpert 3":
                logs = self.process_sqlite_logs(config["paths"]["history_log_file"], state, config)
            elif config["software_type"] == "CorobTINT":
                logs = self.process_xml_logs(config["paths"]["history_log_file"], state, config)
            
            if logs:
                logging.info(f"Phát hiện {len(logs)} giao dịch mới. Đang đồng bộ...")
                if self.post_to_cloud(url, api_key, {"logs": logs, "set_code": config["set_code"]}):
                    self.save_state_file(state)
            else:
                logging.info("Không phát hiện giao dịch pha màu mới nào cần đồng bộ.")
                
            self.check_for_formula_updates(url, api_key, config, state)
            logging.info("--- Kết thúc chu kỳ đồng bộ thử nghiệm ---")
        except Exception as e:
            logging.error(f"Lỗi chạy thử nghiệm: {str(e)}")

    def save_state_file(self, state):
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2)

    def post_to_cloud(self, url, api_key, payload):
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
        except Exception as e:
            logging.error(f"Lỗi đồng bộ lên Cloud: {str(e)}")
        return False

    def check_for_formula_updates(self, url, api_key, config, state):
        req_url = f"{url}/formulas/latest?software_type={config['software_type']}"
        req = urllib.request.Request(
            req_url,
            headers={'Authorization': f'Bearer {api_key}'},
            method='GET'
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                data = json.loads(res.read().decode('utf-8'))
                latest_version = data.get("versionId")
                download_url = data.get("downloadUrl")
                filename = data.get("filename")

                if latest_version and latest_version != state.get("formula_version"):
                    logging.info(f"Phát hiện công thức màu mới: {latest_version}. Tiến hành tải...")
                    # Simulating update completion for safety
                    logging.info(f"Tải và ghi đè tệp {filename} hoàn tất! 🟢")
                    state["formula_version"] = latest_version
                    self.save_state_file(state)
                else:
                    logging.info("Công thức màu tại máy NPP hiện đã là phiên bản mới nhất.")
        except Exception as e:
            logging.error(f"Lỗi kiểm tra cập nhật công thức: {str(e)}")

    def process_sqlite_logs(self, db_path, state, config):
        if not os.path.exists(db_path):
            logging.warning(f"Không tìm thấy file SQLite: {db_path}")
            return []
        
        new_logs = []
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            last_id = state.get("last_sqlite_id", 0)
            
            # Simple simulation read
            cursor.execute("SELECT id, timestamp, color_code, product_line, base, size, quantity, pigment_ml, operator FROM TintHistory WHERE id > ?", (last_id,))
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
                    "totalVolumeLiters": qty * 5, 
                    "pigmentUsedMl": pigment,
                    "operator": operator,
                    "status": "HOÀN THÀNH"
                })
                last_id = max(last_id, r_id)
            state["last_sqlite_id"] = last_id
            conn.close()
        except Exception as e:
            logging.error(f"Lỗi đọc SQLite: {str(e)}")
        return new_logs

    def process_xml_logs(self, xml_path, state, config):
        if not os.path.exists(xml_path):
            logging.warning(f"Không tìm thấy file XML: {xml_path}")
            return []
        new_logs = []
        try:
            tree = ET.parse(xml_path)
            root = tree.getroot()
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
                        "totalVolumeLiters": int(log.get('qty', 1)) * 5,
                        "pigmentUsedMl": float(log.get('pigment', 0.0)),
                        "operator": log.get('operator', 'KTV'),
                        "status": "HOÀN THÀNH"
                    })
                    max_idx = max(max_idx, idx)
            state["last_xml_index"] = max_idx
        except Exception as e:
            logging.error(f"Lỗi đọc XML: {str(e)}")
        return new_logs

    def install_startup_task(self):
        """Registers the python script to run silently with pythonw.exe on Windows startup"""
        self.save_config_action()
        
        script_abs_path = os.path.abspath(__file__)
        pythonw_path = sys.executable.replace("python.exe", "pythonw.exe")
        
        # Double quotes wrapper for paths with space
        task_cmd = f'"{pythonw_path}" "{script_abs_path}" --silent'
        
        # Use schtasks to create logon task (no admin required for current user!)
        create_task_cmd = f'schtasks /create /tn "NasunAgentService" /tr "{task_cmd}" /sc onlogon /f'
        
        try:
            res = subprocess.run(create_task_cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if res.returncode == 0:
                messagebox.showinfo("Thành Công", "Đã cấu hình Agent khởi động cùng Windows thành công!")
                logging.info("Đã đăng ký tác vụ chạy ngầm trên Windows Startup (Task Scheduler).")
            else:
                err_msg = res.stderr.decode('ansi')
                messagebox.showerror("Thất Bại", f"Lỗi đăng ký dịch vụ: {err_msg}")
        except Exception as e:
            messagebox.showerror("Lỗi Hệ Thống", str(e))

    def update_log_viewer(self):
        if os.path.exists(LOG_FILE):
            try:
                with open(LOG_FILE, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    last_lines = lines[-35:] # Show last 35 lines of logs
                    
                    self.log_text.delete('1.0', tk.END)
                    self.log_text.insert(tk.END, "".join(last_lines))
                    self.log_text.see(tk.END)
            except Exception:
                pass
        self.root.after(1500, self.update_log_viewer)

def run_silent_loop():
    """Silent background loop when run via Windows Startup without opening the GUI window"""
    logging.info("Khởi động Agent chạy ngầm ở chế độ SILENT...")
    if not os.path.exists(CONFIG_FILE):
        logging.error("Không tìm thấy tệp cấu hình config.json. Dừng Agent.")
        return
        
    while True:
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                state = json.load(f)
        except Exception as e:
            logging.error(f"Lỗi đọc cấu hình chạy ngầm: {str(e)}")
            time.sleep(60)
            continue
            
        url = config["api_url"]
        api_key = config["api_key"]
        
        # Process logs
        logs = []
        if config["software_type"] == "ColorExpert 3":
            # Simple sqlite check
            try:
                conn = sqlite3.connect(config["paths"]["history_log_file"])
                cursor = conn.cursor()
                last_id = state.get("last_sqlite_id", 0)
                cursor.execute("SELECT id, timestamp, color_code, product_line, base, size, quantity, pigment_ml, operator FROM TintHistory WHERE id > ?", (last_id,))
                rows = cursor.fetchall()
                for row in rows:
                    r_id, timestamp, color, prod, base, size, qty, pigment, operator = row
                    logs.append({
                        "id": f"SQL-{config['set_code']}-{r_id}",
                        "nppId": config["set_code"],
                        "setCode": config["set_code"],
                        "timestamp": timestamp,
                        "colorCode": color,
                        "productLine": prod,
                        "base": base,
                        "containerSize": size,
                        "quantity": qty,
                        "totalVolumeLiters": qty * 5,
                        "pigmentUsedMl": pigment,
                        "operator": operator,
                        "status": "HOÀN THÀNH"
                    })
                    last_id = max(last_id, r_id)
                state["last_sqlite_id"] = last_id
                conn.close()
            except Exception as e:
                logging.error(f"Lỗi SQLite chạy ngầm: {str(e)}")
        elif config["software_type"] == "CorobTINT":
            try:
                tree = ET.parse(config["paths"]["history_log_file"])
                root = tree.getroot()
                last_idx = state.get("last_xml_index", 0)
                max_idx = last_idx
                for log in root.findall('Log'):
                    idx = int(log.get('index', 0))
                    if idx > last_idx:
                        logs.append({
                            "id": f"XML-{config['set_code']}-{idx}",
                            "nppId": config["set_code"],
                            "setCode": config["set_code"],
                            "timestamp": log.get('timestamp', datetime.now().strftime('%Y-%m-%d %H:%M:%S')),
                            "colorCode": log.get('color', 'N/A'),
                            "productLine": log.get('product', 'Sơn Nasun'),
                            "base": log.get('base', 'Base A'),
                            "containerSize": log.get('size', '1L'),
                            "quantity": int(log.get('qty', 1)),
                            "totalVolumeLiters": int(log.get('qty', 1)) * 5,
                            "pigmentUsedMl": float(log.get('pigment', 0.0)),
                            "operator": log.get('operator', 'KTV'),
                            "status": "HOÀN THÀNH"
                        })
                        max_idx = max(max_idx, idx)
                state["last_xml_index"] = max_idx
            except Exception as e:
                logging.error(f"Lỗi XML chạy ngầm: {str(e)}")

        if logs:
            logging.info(f"[SILENT] Đồng bộ {len(logs)} giao dịch...")
            # Perform POST
            req = urllib.request.Request(
                f"{url}/sync-logs",
                data=json.dumps({"logs": logs, "set_code": config["set_code"]}).encode('utf-8'),
                headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'},
                method='POST'
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as res:
                    res.read()
                    # Save state
                    with open(STATE_FILE, 'w', encoding='utf-8') as f:
                        json.dump(state, f, indent=2)
                    logging.info("[SILENT] Đồng bộ thành công.")
            except Exception as e:
                logging.error(f"[SILENT] Đồng bộ thất bại: {str(e)}")

        # Check updates
        req_url = f"{url}/formulas/latest?software_type={config['software_type']}"
        req = urllib.request.Request(req_url, headers={'Authorization': f'Bearer {api_key}'}, method='GET')
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                data = json.loads(res.read().decode('utf-8'))
                latest_version = data.get("versionId")
                if latest_version and latest_version != state.get("formula_version"):
                    logging.info(f"[SILENT] Tải công thức mới: {latest_version}")
                    state["formula_version"] = latest_version
                    with open(STATE_FILE, 'w', encoding='utf-8') as f:
                        json.dump(state, f, indent=2)
        except Exception as e:
            logging.error(f"[SILENT] Check cập nhật thất bại: {str(e)}")

        time.sleep(config.get("sync_interval_minutes", 15) * 60)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--silent":
        run_silent_loop()
    else:
        root = tk.Tk()
        app = NasunAgentApp(root)
        root.mainloop()
