using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Drawing;
using System.Diagnostics;
using System.Xml;
using Microsoft.Win32;

namespace NasunAgent
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (args.Length > 0 && (args[0].ToLower() == "/silent" || args[0].ToLower() == "-silent"))
            {
                RunSilentLoop();
            }
            else
            {
                Application.Run(new ConfigForm());
            }
        }

        static void RunSilentLoop()
        {
            string appDir = @"C:\NasunAgent";
            string configFile = Path.Combine(appDir, "config.json");
            string logFile = Path.Combine(appDir, "agent.log");

            Log(logFile, "=========================================================");
            Log(logFile, "Khởi động NASUN Agent chạy ngầm ở chế độ SILENT...");

            while (true)
            {
                try
                {
                    if (File.Exists(configFile))
                    {
                        Log(logFile, "Đang kiểm tra chu kỳ đồng bộ dữ liệu...");
                        SyncData(configFile, logFile);
                    }
                    else
                    {
                        Log(logFile, "CẢNH BÁO: Không tìm thấy file C:\\NasunAgent\\config.json");
                    }
                }
                catch (Exception ex)
                {
                    Log(logFile, "LỖI CHẠY NGẦM: " + ex.Message);
                }

                Thread.Sleep(15 * 60 * 1000);
            }
        }

        public static void Log(string logPath, string message)
        {
            try
            {
                string line = string.Format("[{0:yyyy-MM-dd HH:mm:ss}] {1}\r\n", DateTime.Now, message);
                File.AppendAllText(logPath, line, Encoding.UTF8);
            }
            catch { }
        }

        public static void SyncData(string configFile, string logFile)
        {
            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
                using (WebClient client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    string response = client.DownloadString("https://kythuat.nasun.workers.dev/api");
                    Log(logFile, "Đồng bộ kết nối Cloud thành công: " + (response.Length > 40 ? response.Substring(0, 40) + "..." : response));
                }
            }
            catch (Exception ex)
            {
                Log(logFile, "Lỗi kết nối Cloud: " + ex.Message);
            }
        }
    }

    public class ConfigForm : Form
    {
        private TextBox txtApiUrl;
        private TextBox txtApiKey;
        private TextBox txtSetCode;
        private ComboBox cbSoftwareType;
        private TextBox txtFormulaDir;
        private TextBox txtLogFile;
        private TextBox txtBackupDir;
        private NumericUpDown numInterval;
        private TextBox txtLogConsole;
        private System.Windows.Forms.Timer timerLogs;

        public ConfigForm()
        {
            InitComponent();
            LoadConfig();
            StartLogTimer();
        }

        private void InitComponent()
        {
            this.Text = "Cấu Hình NASUN NPP Agent - Hệ Thống Pha Màu NASUN PAINT";
            this.Size = new Size(620, 720);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(15, 23, 42); // Dark Theme #0f172a
            this.ForeColor = Color.White;
            this.Font = new Font("Segoe UI", 9F, FontStyle.Regular);

            // Header Banner
            Label lblHeader = new Label
            {
                Text = "HỆ THỐNG ĐỒNG BỘ MÁY PHA MÀU NASUN PAINT",
                Font = new Font("Segoe UI", 12F, FontStyle.Bold),
                ForeColor = Color.FromArgb(6, 182, 212),
                Location = new Point(20, 15),
                AutoSize = true
            };
            this.Controls.Add(lblHeader);

            Label lblSubHeader = new Label
            {
                Text = "Phần mềm cài đặt chạy ngầm tại máy tính Nhà Phân Phối (NPP)",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Regular),
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(20, 42),
                AutoSize = true
            };
            this.Controls.Add(lblSubHeader);

            int startY = 80;
            int gapY = 38;

            // Inputs
            AddLabel("URL Máy Chủ API:", 20, startY);
            txtApiUrl = AddTextBox(200, startY, 380);

            AddLabel("Supabase API Key / Token:", 20, startY + gapY);
            txtApiKey = AddTextBox(200, startY + gapY, 380);

            AddLabel("Mã Bộ Máy (Set Code):", 20, startY + gapY * 2);
            txtSetCode = AddTextBox(200, startY + gapY * 2, 380);

            AddLabel("Phần Mềm Pha Màu:", 20, startY + gapY * 3);
            cbSoftwareType = new ComboBox
            {
                Location = new Point(200, startY + gapY * 3),
                Size = new Size(380, 25),
                DropDownStyle = ComboBoxStyle.DropDownList,
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            cbSoftwareType.Items.AddRange(new string[] { "ColorExpert 3", "ColorExpert 2", "CorobTINT" });
            cbSoftwareType.SelectedIndex = 0;
            this.Controls.Add(cbSoftwareType);

            AddLabel("Thư Mục Ghi Đè Công Thức:", 20, startY + gapY * 4);
            txtFormulaDir = AddTextBox(200, startY + gapY * 4, 290);
            Button btnBrowseFormula = AddButton("Browse...", 500, startY + gapY * 4 - 2, 80, 27);
            btnBrowseFormula.Click += (s, e) => {
                using (FolderBrowserDialog dlg = new FolderBrowserDialog())
                {
                    if (dlg.ShowDialog() == DialogResult.OK) txtFormulaDir.Text = dlg.SelectedPath;
                }
            };

            AddLabel("Tệp Nhật Ký/Log Lịch Sử:", 20, startY + gapY * 5);
            txtLogFile = AddTextBox(200, startY + gapY * 5, 290);
            Button btnBrowseLog = AddButton("Browse...", 500, startY + gapY * 5 - 2, 80, 27);
            btnBrowseLog.Click += (s, e) => {
                using (OpenFileDialog dlg = new OpenFileDialog())
                {
                    dlg.Filter = "Log / Database Files (*.db;*.mdb;*.xml)|*.db;*.mdb;*.xml|All Files (*.*)|*.*";
                    if (dlg.ShowDialog() == DialogResult.OK) txtLogFile.Text = dlg.FileName;
                }
            };

            // NEW: Backup Folder Input & Selector
            AddLabel("Thư Mục Sao Lưu (Backup):", 20, startY + gapY * 6);
            txtBackupDir = AddTextBox(200, startY + gapY * 6, 290);
            Button btnBrowseBackup = AddButton("Browse...", 500, startY + gapY * 6 - 2, 80, 27);
            btnBrowseBackup.Click += (s, e) => {
                using (FolderBrowserDialog dlg = new FolderBrowserDialog())
                {
                    if (dlg.ShowDialog() == DialogResult.OK) txtBackupDir.Text = dlg.SelectedPath;
                }
            };

            AddLabel("Chu Kỳ Đồng Bộ (Phút):", 20, startY + gapY * 7);
            numInterval = new NumericUpDown
            {
                Location = new Point(200, startY + gapY * 7),
                Size = new Size(100, 25),
                Minimum = 1,
                Maximum = 120,
                Value = 15,
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White
            };
            this.Controls.Add(numInterval);

            // Action Buttons
            int btnY = startY + gapY * 8 + 10;
            Button btnSave = AddButton("💾 LƯU CẤU HÌNH", 20, btnY, 170, 36);
            btnSave.BackColor = Color.FromArgb(14, 165, 233);
            btnSave.Click += BtnSave_Click;

            Button btnTest = AddButton("⚡ ĐỒNG BỘ & BACKUP THỬ", 205, btnY, 185, 36);
            btnTest.BackColor = Color.FromArgb(16, 185, 129);
            btnTest.Click += BtnTest_Click;

            Button btnInstall = AddButton("🚀 CÀI CHẠY CÙNG WINDOWS", 400, btnY, 180, 36);
            btnInstall.BackColor = Color.FromArgb(139, 92, 246);
            btnInstall.Click += BtnInstall_Click;

            // Console Log View
            Label lblConsole = new Label
            {
                Text = "Nhật ký vận hành thực tế (C:\\NasunAgent\\agent.log):",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(20, btnY + 44),
                AutoSize = true
            };
            this.Controls.Add(lblConsole);

            txtLogConsole = new TextBox
            {
                Location = new Point(20, btnY + 64),
                Size = new Size(560, 130),
                Multiline = true,
                ScrollBars = ScrollBars.Vertical,
                ReadOnly = true,
                BackColor = Color.FromArgb(2, 6, 23),
                ForeColor = Color.FromArgb(56, 189, 248),
                Font = new Font("Consolas", 8.5F, FontStyle.Regular)
            };
            this.Controls.Add(txtLogConsole);
        }

        private void AddLabel(string text, int x, int y)
        {
            Label lbl = new Label
            {
                Text = text,
                Location = new Point(x, y + 3),
                AutoSize = true,
                ForeColor = Color.FromArgb(241, 245, 249)
            };
            this.Controls.Add(lbl);
        }

        private TextBox AddTextBox(int x, int y, int width)
        {
            TextBox txt = new TextBox
            {
                Location = new Point(x, y),
                Size = new Size(width, 25),
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };
            this.Controls.Add(txt);
            return txt;
        }

        private Button AddButton(string text, int x, int y, int width, int height)
        {
            Button btn = new Button
            {
                Text = text,
                Location = new Point(x, y),
                Size = new Size(width, height),
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                ForeColor = Color.White,
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderSize = 0;
            this.Controls.Add(btn);
            return btn;
        }

        private void LoadConfig()
        {
            string appDir = @"C:\NasunAgent";
            string configFile = Path.Combine(appDir, "config.json");

            if (File.Exists(configFile))
            {
                try
                {
                    string json = File.ReadAllText(configFile, Encoding.UTF8);
                    txtApiUrl.Text = GetJsonVal(json, "api_url", "https://kythuat.nasun.workers.dev/api");
                    txtApiKey.Text = GetJsonVal(json, "api_key", "supabase-anon-key");
                    txtSetCode.Text = GetJsonVal(json, "set_code", "SET-001");
                    txtFormulaDir.Text = GetJsonVal(json, "formula_override_dir", @"C:\ColorExpert3\Data\Formulas");
                    txtLogFile.Text = GetJsonVal(json, "history_log_file", @"C:\ColorExpert3\Data\History.db");
                    txtBackupDir.Text = GetJsonVal(json, "backup_dir", @"C:\NasunAgent\Backups");
                    return;
                }
                catch { }
            }

            txtApiUrl.Text = "https://kythuat.nasun.workers.dev/api";
            txtApiKey.Text = "supabase-anon-key-chuyen-biet-cua-he-thong";
            txtSetCode.Text = "SET-001";
            txtFormulaDir.Text = @"C:\ColorExpert3\Data\Formulas";
            txtLogFile.Text = @"C:\ColorExpert3\Data\History.db";
            txtBackupDir.Text = @"C:\NasunAgent\Backups";
        }

        private string GetJsonVal(string json, string key, string defVal)
        {
            try
            {
                string searchKey = "\"" + key + "\":";
                int idx = json.IndexOf(searchKey);
                if (idx != -1)
                {
                    int start = json.IndexOf("\"", idx + searchKey.Length) + 1;
                    int end = json.IndexOf("\"", start);
                    return json.Substring(start, end - start).Replace("\\\\", "\\");
                }
            }
            catch { }
            return defVal;
        }

        private void BtnSave_Click(object sender, EventArgs e)
        {
            try
            {
                string appDir = @"C:\NasunAgent";
                if (!Directory.Exists(appDir)) Directory.CreateDirectory(appDir);

                string backupDir = txtBackupDir.Text.Trim();
                if (!string.IsNullOrEmpty(backupDir) && !Directory.Exists(backupDir))
                {
                    Directory.CreateDirectory(backupDir);
                }

                string json = string.Format(
                    "{{\r\n  \"api_url\": \"{0}\",\r\n  \"api_key\": \"{1}\",\r\n  \"set_code\": \"{2}\",\r\n  \"sync_interval_minutes\": {3},\r\n  \"software_type\": \"{4}\",\r\n  \"paths\": {{\r\n    \"formula_override_dir\": \"{5}\",\r\n    \"history_log_file\": \"{6}\",\r\n    \"backup_dir\": \"{7}\"\r\n  }}\r\n}}",
                    txtApiUrl.Text.Replace("\\", "\\\\"),
                    txtApiKey.Text.Replace("\\", "\\\\"),
                    txtSetCode.Text.Replace("\\", "\\\\"),
                    numInterval.Value,
                    cbSoftwareType.SelectedItem.ToString(),
                    txtFormulaDir.Text.Replace("\\", "\\\\"),
                    txtLogFile.Text.Replace("\\", "\\\\"),
                    txtBackupDir.Text.Replace("\\", "\\\\")
                );

                File.WriteAllText(Path.Combine(appDir, "config.json"), json, Encoding.UTF8);
                MessageBox.Show("Đã lưu thông số cấu hình và thư mục sao lưu thành công!", "Thành Công", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Program.Log(Path.Combine(appDir, "agent.log"), "Đã cập nhật cấu hình & thư mục sao lưu: " + txtBackupDir.Text);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Lỗi lưu file: " + ex.Message, "Lỗi", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void BtnTest_Click(object sender, EventArgs e)
        {
            BtnSave_Click(sender, e);
            string appDir = @"C:\NasunAgent";
            string logFile = Path.Combine(appDir, "agent.log");
            Program.Log(logFile, "=== KHỞI CHẠY THỬ NGHIỆM ĐỒNG BỘ & BACKUP ===");
            
            // Backup simulation test
            try
            {
                string bDir = txtBackupDir.Text.Trim();
                if (!string.IsNullOrEmpty(bDir) && Directory.Exists(bDir))
                {
                    string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                    string bFile = Path.Combine(bDir, "backup_log_snapshot_" + timestamp + ".bak");
                    if (File.Exists(txtLogFile.Text))
                    {
                        File.Copy(txtLogFile.Text, bFile, true);
                        Program.Log(logFile, "✓ Đã tạo bản sao lưu snapshot tệp nhật ký tại: " + bFile);
                    }
                }
            }
            catch (Exception ex)
            {
                Program.Log(logFile, "Lỗi tạo bản sao lưu backup: " + ex.Message);
            }

            Program.SyncData(Path.Combine(appDir, "config.json"), logFile);
            Program.Log(logFile, "=== KẾT THÚC THỬ NGHIỆM ===");
        }

        private void BtnInstall_Click(object sender, EventArgs e)
        {
            BtnSave_Click(sender, e);
            try
            {
                string appDir = @"C:\NasunAgent";
                string currentExe = Process.GetCurrentProcess().MainModule.FileName;
                string targetExe = Path.Combine(appDir, "NasunAgentSetup.exe");

                if (!currentExe.Equals(targetExe, StringComparison.OrdinalIgnoreCase))
                {
                    File.Copy(currentExe, targetExe, true);
                }

                RegistryKey rkey = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", true);
                rkey.SetValue("NasunAgentService", "\"" + targetExe + "\" /silent");

                MessageBox.Show("Đã đăng ký phần mềm tự động chạy ngầm cùng Windows thành công!\r\n\r\nĐường dẫn: " + targetExe, "Thành Công", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Program.Log(Path.Combine(appDir, "agent.log"), "Đã đăng ký Registry Startup cho NasunAgentService.");
            }
            catch (Exception ex)
            {
                MessageBox.Show("Lỗi cài đặt khởi động: " + ex.Message, "Lỗi", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void StartLogTimer()
        {
            timerLogs = new System.Windows.Forms.Timer();
            timerLogs.Interval = 1500;
            timerLogs.Tick += (s, e) => {
                try
                {
                    string logFile = @"C:\NasunAgent\agent.log";
                    if (File.Exists(logFile))
                    {
                        string text = File.ReadAllText(logFile, Encoding.UTF8);
                        if (txtLogConsole.Text != text)
                        {
                            txtLogConsole.Text = text;
                            txtLogConsole.SelectionStart = txtLogConsole.TextLength;
                            txtLogConsole.ScrollToCaret();
                        }
                    }
                }
                catch { }
            };
            timerLogs.Start();
        }
    }
}
