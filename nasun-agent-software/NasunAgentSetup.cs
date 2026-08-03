using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Drawing;
using System.Diagnostics;
using System.Xml;
using System.Collections.Generic;
using System.Reflection;
using System.Net.WebSockets;
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

            string appDir = @"C:\NasunAgent";
            string logFile = Path.Combine(appDir, "agent.log");
            string configFile = Path.Combine(appDir, "config.json");
            
            StartLocalWebServer(logFile);

            if (File.Exists(configFile))
            {
                try
                {
                    string json = File.ReadAllText(configFile, Encoding.UTF8);
                    string apiUrl = GetJsonVal(json, "api_url", "https://kythuat.nasun.workers.dev/api");
                    string apiKey = GetJsonVal(json, "api_key", "");
                    string softwareType = GetJsonVal(json, "software_type", "ColorExpert 3");
                    
                    StartRealtimeWebSocket(apiUrl, apiKey, softwareType, configFile, logFile);
                }
                catch { }
            }

            if (args.Length > 0 && (args[0].ToLower() == "/silent" || args[0].ToLower() == "-silent"))
            {
                RunSilentLoop();
            }
            else
            {
                Application.Run(new ConfigForm());
            }
        }

        public static void StartLocalWebServer(string logFile)
        {
            Thread serverThread = new Thread(() => {
                HttpListener listener = null;
                try
                {
                    listener = new HttpListener();
                    try
                    {
                        listener.Prefixes.Add("http://*:5055/");
                        listener.Start();
                        Log(logFile, "✓ Đã khởi động Diagnostics Web Server cổng 5055 (Chế độ LAN)...");
                    }
                    catch
                    {
                        // Fallback to localhost if no admin privileges for wildcard binding
                        if (listener != null) listener.Close();
                        listener = new HttpListener();
                        listener.Prefixes.Add("http://localhost:5055/");
                        listener.Start();
                        Log(logFile, "✓ Đã khởi động Diagnostics Web Server cổng 5055 (Chế độ Localhost)...");
                    }

                    while (listener.IsListening)
                    {
                        try
                        {
                            HttpListenerContext context = listener.GetContext();
                            HttpListenerResponse response = context.Response;
                            
                            string responseString = GetLocalWebResponse(logFile);
                            byte[] buffer = Encoding.UTF8.GetBytes(responseString);
                            
                            response.ContentLength64 = buffer.Length;
                            response.ContentType = "text/html; charset=utf-8";
                            response.OutputStream.Write(buffer, 0, buffer.Length);
                            response.OutputStream.Close();
                        }
                        catch (Exception ex)
                        {
                            // Ignore single request processing errors to prevent server crash
                            Log(logFile, "Lỗi xử lý request Local Web Server: " + ex.Message);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Log(logFile, "Lỗi khởi động Diagnostics Web Server: " + ex.Message);
                }
            });
            serverThread.IsBackground = true;
            serverThread.Start();
        }

        public static string GetLocalWebResponse(string logFile)
        {
            string logLinesHtml = "";
            try
            {
                if (File.Exists(logFile))
                {
                    string[] lines = File.ReadAllLines(logFile);
                    int start = Math.Max(0, lines.Length - 25);
                    for (int i = lines.Length - 1; i >= start; i--)
                    {
                        string color = "color: #38bdf8;"; // Cyan
                        if (lines[i].Contains("LỖI") || lines[i].Contains("CẢNH BÁO")) color = "color: #f43f5e;"; // Red
                        else if (lines[i].Contains("thành công")) color = "color: #34d399;"; // Green
                        
                        logLinesHtml += string.Format("<div style='margin-bottom:6px;{0}'>{1}</div>", color, HttpUtilityHtmlEncode(lines[i]));
                    }
                }
                else
                {
                    logLinesHtml = "<div style='color:#64748b;'>Không tìm thấy tệp nhật ký agent.log</div>";
                }
            }
            catch (Exception ex)
            {
                logLinesHtml = "Lỗi đọc log: " + ex.Message;
            }

            string html = string.Format(
                "<!DOCTYPE html>\r\n" +
                "<html>\r\n" +
                "<head>\r\n" +
                "  <title>NASUN Agent Diagnostics</title>\r\n" +
                "  <meta charset='utf-8'>\r\n" +
                "  <meta name='viewport' content='width=device-width, initial-scale=1.0'>\r\n" +
                "  <style>\r\n" +
                "    body {{ background: #0f172a; color: #f1f5f9; font-family: -apple-system, sans-serif; padding: 20px; margin: 0; }}\r\n" +
                "    .card {{ background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #334155; }}\r\n" +
                "    .title {{ font-size: 18px; font-weight: bold; color: #06b6d4; margin-bottom: 12px; }}\r\n" +
                "    .console {{ background: #020617; border-radius: 8px; padding: 16px; font-family: monospace; font-size: 12px; max-height: 350px; overflow-y: auto; border: 1px solid #1e293b; white-space: pre-wrap; }}\r\n" +
                "  </style>\r\n" +
                "</head>\r\n" +
                "<body>\r\n" +
                "  <div class='card'>\r\n" +
                "    <div class='title'>🛡️ NASUN PAINT AGENT DIAGNOSTICS</div>\r\n" +
                "    <div>Trạng thái: <span style='color:#10b981;font-weight:bold;'>Đang hoạt động ngầm (Online)</span></div>\r\n" +
                "    <div style='margin-top:8px;'>Thời gian máy trạm: {0:yyyy-MM-dd HH:mm:ss}</div>\r\n" +
                "    <div style='margin-top:8px;'>Tên máy: {1} | OS: {2}</div>\r\n" +
                "  </div>\r\n" +
                "  <div class='card'>\r\n" +
                "    <div class='title'>🖥️ NHẬT KÝ VẬN HÀNH (25 DÒNG MỚI NHẤT)</div>\r\n" +
                "    <div class='console'>{3}</div>\r\n" +
                "  </div>\r\n" +
                "</body>\r\n" +
                "</html>",
                DateTime.Now, Environment.MachineName, Environment.OSVersion, logLinesHtml
            );
            return html;
        }

        public static string HttpUtilityHtmlEncode(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";
            return text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;").Replace("'", "&#39;");
        }

        public static void SendTelemetry(string apiUrl, string apiKey, string setCode, string machineGuid, string logFile)
        {
            try
            {
                DriveInfo drive = new DriveInfo("C");
                double freeSpaceGb = (double)drive.AvailableFreeSpace / (1024 * 1024 * 1024);
                double totalSizeGb = (double)drive.TotalSize / (1024 * 1024 * 1024);
                
                string os = Environment.OSVersion.ToString();
                string pcName = Environment.MachineName;
                string username = Environment.UserName;
                
                string payload = string.Format(
                    "{{\r\n" +
                    "  \"set_code\": \"{0}\",\r\n" +
                    "  \"machine_guid\": \"{1}\",\r\n" +
                    "  \"os_version\": \"{2}\",\r\n" +
                    "  \"pc_name\": \"{3}\",\r\n" +
                    "  \"username\": \"{4}\",\r\n" +
                    "  \"free_space_gb\": {5:F2},\r\n" +
                    "  \"total_space_gb\": {6:F2},\r\n" +
                    "  \"timestamp\": \"{7:yyyy-MM-dd HH:mm:ss}\"\r\n" +
                    "}}",
                    setCode, machineGuid, os, pcName, username, freeSpaceGb, totalSizeGb, DateTime.Now
                );

                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
                using (WebClient client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    client.Headers["Authorization"] = "Bearer " + apiKey;
                    string url = apiUrl.TrimEnd('/') + "/telemetry";
                    
                    try
                    {
                        client.UploadString(url, "POST", payload);
                    }
                    catch (Exception ex)
                    {
                        // Ignore telemetry server endpoints failing in dev workers fallback
                        Log(logFile, "[Telemetry] Không thể gửi dữ liệu giám sát phần cứng lên Cloud: " + ex.Message);
                    }
                }
            }
            catch (Exception ex)
            {
                Log(logFile, "Lỗi thu thập dữ liệu giám sát phần cứng (telemetry): " + ex.Message);
            }
        }

        public static void StartRealtimeWebSocket(string apiUrl, string apiKey, string softwareType, string configFile, string logFile)
        {
            Thread wsThread = new Thread(() => {
                while (true)
                {
                    try
                    {
                        using (ClientWebSocket ws = new ClientWebSocket())
                        {
                            string wsUrl = apiUrl.Replace("https://", "wss://").Replace("http://", "ws://").TrimEnd('/') + "/realtime/v1/websocket?apikey=" + apiKey + "&vsn=1.0.0";
                            
                            Log(logFile, "Đang kết nối Realtime WebSocket tới Cloud...");
                            ws.ConnectAsync(new Uri(wsUrl), CancellationToken.None).Wait();
                            Log(logFile, "✓ Đã kết nối Realtime WebSocket thành công!");

                            string joinPayload = "{\"event\":\"phx_join\",\"topic\":\"realtime:public:formulas\",\"payload\":{},\"ref\":\"1\"}";
                            byte[] sendBuffer = Encoding.UTF8.GetBytes(joinPayload);
                            ws.SendAsync(new ArraySegment<byte>(sendBuffer), WebSocketMessageType.Text, true, CancellationToken.None).Wait();

                            DateTime lastHeartbeat = DateTime.Now;
                            byte[] receiveBuffer = new byte[4096];

                            while (ws.State == WebSocketState.Open)
                            {
                                if ((DateTime.Now - lastHeartbeat).TotalSeconds > 25)
                                {
                                    string ping = "{\"topic\":\"realtime:public:formulas\",\"event\":\"heartbeat\",\"payload\":{},\"ref\":\"" + DateTime.Now.Ticks + "\"}";
                                    ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(ping)), WebSocketMessageType.Text, true, CancellationToken.None).Wait();
                                    lastHeartbeat = DateTime.Now;
                                }

                                var result = ws.ReceiveAsync(new ArraySegment<byte>(receiveBuffer), CancellationToken.None);
                                result.Wait();

                                if (result.Result.MessageType == WebSocketMessageType.Text)
                                {
                                    string msg = Encoding.UTF8.GetString(receiveBuffer, 0, result.Result.Count);
                                    if (msg.Contains("insert") || msg.Contains("update") || msg.Contains("formulas"))
                                    {
                                        Log(logFile, "⚡ Nhận tín hiệu Realtime: Phát hiện công thức màu mới. Tự động kích hoạt đồng bộ...");
                                        SyncData(configFile, logFile);
                                    }
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Log(logFile, "Lỗi kết nối Realtime WebSocket: " + ex.Message + ". Sẽ thử lại sau 30 giây.");
                    }
                    Thread.Sleep(30000);
                }
            });
            wsThread.IsBackground = true;
            wsThread.Start();
        }

        public static void CheckAndExecuteRemoteCommands(string apiUrl, string apiKey, string setCode, string logFile)
        {
            try
            {
                string reqUrl = string.Format("{0}/commands/pending?set_code={1}", apiUrl.TrimEnd('/'), Uri.EscapeDataString(setCode));
                using (WebClient client = new WebClient())
                {
                    client.Headers["Authorization"] = "Bearer " + apiKey;
                    string jsonResponse = client.DownloadString(reqUrl);
                    
                    string cmdId = ExtractJsonStringValue(jsonResponse, "commandId");
                    string cmdText = ExtractJsonStringValue(jsonResponse, "commandText");

                    if (!string.IsNullOrEmpty(cmdId) && !string.IsNullOrEmpty(cmdText))
                    {
                        Log(logFile, string.Format("Nhận lệnh chẩn đoán từ xa: {0} (ID: {1}). Đang xử lý...", cmdText, cmdId));
                        
                        string output = "";
                        bool success = false;

                        if (cmdText == "ping")
                        {
                            output = "Pong! Dịch vụ Agent đang hoạt động bình thường.";
                            success = true;
                        }
                        else if (cmdText == "sysinfo")
                        {
                            output = string.Format("PC: {0} | OS: {1} | User: {2} | CPU Cores: {3}", 
                                Environment.MachineName, Environment.OSVersion, Environment.UserName, Environment.ProcessorCount);
                            success = true;
                        }
                        else if (cmdText == "clean-temp")
                        {
                            try
                            {
                                string tempPath = Path.GetTempPath();
                                string[] files = Directory.GetFiles(tempPath);
                                int count = 0;
                                foreach (var file in files)
                                {
                                    try { File.Delete(file); count++; } catch { }
                                }
                                output = string.Format("Đã dọn dẹp {0} tệp rác trong thư mục Temp.", count);
                                success = true;
                            }
                            catch (Exception ex) { output = "Lỗi dọn Temp: " + ex.Message; }
                        }
                        else if (cmdText == "restart-agent")
                        {
                            output = "Đang khởi động lại dịch vụ Agent...";
                            success = true;
                            ReportCommandResult(apiUrl, apiKey, setCode, cmdId, success, output, logFile);
                            
                            Process.Start(Assembly.GetEntryAssembly().Location, "/silent");
                            Environment.Exit(0);
                            return;
                        }
                        else
                        {
                            output = "Lệnh không hỗ trợ hoặc bị chặn vì lý do bảo mật.";
                        }

                        Log(logFile, string.Format("Xử lý lệnh {0}: {1}", cmdId, success ? "Thành công" : "Thất bại"));
                        ReportCommandResult(apiUrl, apiKey, setCode, cmdId, success, output, logFile);
                    }
                }
            }
            catch { }
        }

        public static void ReportCommandResult(string apiUrl, string apiKey, string setCode, string cmdId, bool success, string output, string logFile)
        {
            try
            {
                string payload = string.Format(
                    "{{\r\n  \"set_code\": \"{0}\",\r\n  \"command_id\": \"{1}\",\r\n  \"success\": {2},\r\n  \"output\": \"{3}\"\r\n}}",
                    setCode, cmdId, success ? "true" : "false", output.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "\\n")
                );

                using (WebClient client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    client.Headers["Authorization"] = "Bearer " + apiKey;
                    string url = apiUrl.TrimEnd('/') + "/commands/result";
                    client.UploadString(url, "POST", payload);
                }
            }
            catch (Exception ex)
            {
                Log(logFile, "Lỗi báo cáo kết quả thực thi lệnh: " + ex.Message);
            }
        }

        public static List<Dictionary<string, object>> LoadQueue(string queueFile)
        {
            List<Dictionary<string, object>> queue = new List<Dictionary<string, object>>();
            if (!File.Exists(queueFile)) return queue;
            try
            {
                string[] lines = File.ReadAllLines(queueFile);
                foreach (string line in lines)
                {
                    if (string.IsNullOrEmpty(line.Trim())) continue;
                    Dictionary<string, object> log = new Dictionary<string, object>();
                    log["id"] = GetJsonVal(line, "id", "");
                    log["nppId"] = GetJsonVal(line, "nppId", "");
                    log["setCode"] = GetJsonVal(line, "setCode", "");
                    log["timestamp"] = GetJsonVal(line, "timestamp", "");
                    log["colorCode"] = GetJsonVal(line, "colorCode", "");
                    log["productLine"] = GetJsonVal(line, "productLine", "");
                    log["base"] = GetJsonVal(line, "base", "");
                    log["containerSize"] = GetJsonVal(line, "containerSize", "");
                    
                    int qty = 1;
                    int.TryParse(GetJsonVal(line, "quantity", "1"), out qty);
                    log["quantity"] = qty;

                    double vol = 1.0;
                    double.TryParse(GetJsonVal(line, "totalVolumeLiters", "1"), out vol);
                    log["totalVolumeLiters"] = vol;

                    double pig = 0.0;
                    double.TryParse(GetJsonVal(line, "pigmentUsedMl", "0"), out pig);
                    log["pigmentUsedMl"] = pig;

                    log["operator"] = GetJsonVal(line, "operator", "");
                    log["status"] = GetJsonVal(line, "status", "");
                    
                    queue.Add(log);
                }
            }
            catch { }
            return queue;
        }

        public static void SaveQueue(List<Dictionary<string, object>> queue, string queueFile)
        {
            try
            {
                StringBuilder sb = new StringBuilder();
                foreach (var log in queue)
                {
                    sb.Append(SerializeSingleLog(log) + "\r\n");
                }
                File.WriteAllText(queueFile, sb.ToString(), Encoding.UTF8);
            }
            catch { }
        }

        public static string SerializeSingleLog(Dictionary<string, object> log)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("{");
            int count = 0;
            foreach (var kvp in log)
            {
                string val = "";
                if (kvp.Value is int || kvp.Value is double || kvp.Value is float)
                    val = kvp.Value.ToString().Replace(",", ".");
                else
                    val = "\"" + kvp.Value.ToString().Replace("\"", "\\\"") + "\"";
                
                sb.AppendFormat("\"{0}\":{1}{2}", kvp.Key, val, ++count < log.Count ? "," : "");
            }
            sb.Append("}");
            return sb.ToString();
        }

        public static void RotateBackups(string backupDir, string filename, string logFile)
        {
            try
            {
                if (!Directory.Exists(backupDir)) return;
                string[] files = Directory.GetFiles(backupDir, filename + "_*.bak");
                if (files.Length > 10)
                {
                    Array.Sort(files, (a, b) => File.GetCreationTime(a).CompareTo(File.GetCreationTime(b)));
                    int deleteCount = files.Length - 10;
                    for (int i = 0; i < deleteCount; i++)
                    {
                        File.Delete(files[i]);
                        Log(logFile, "Đã xóa bản sao lưu công thức cũ vượt giới hạn xoay vòng: " + Path.GetFileName(files[i]));
                    }
                }
            }
            catch (Exception ex)
            {
                Log(logFile, "Lỗi xoay vòng bản sao lưu: " + ex.Message);
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
                int intervalMin = 15;
                try
                {
                    if (File.Exists(configFile))
                    {
                        string json = File.ReadAllText(configFile, Encoding.UTF8);
                        int.TryParse(GetJsonVal(json, "sync_interval_minutes", "15"), out intervalMin);
                        
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

                if (intervalMin < 1) intervalMin = 1;
                Thread.Sleep(intervalMin * 60 * 1000);
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

        public static string GetJsonVal(string json, string key, string defVal)
        {
            try
            {
                string searchKey = "\"" + key + "\":";
                int idx = json.IndexOf(searchKey);
                if (idx != -1)
                {
                    int start = json.IndexOf("\"", idx + searchKey.Length);
                    if (start != -1)
                    {
                        // Check if it's a string (surrounded by quotes) or boolean/numeric
                        start += 1;
                        char quoteChar = json[start - 1];
                        if (quoteChar == '\"')
                        {
                            int end = json.IndexOf("\"", start);
                            return json.Substring(start, end - start).Replace("\\\\", "\\");
                        }
                        else
                        {
                            // Boolean or numeric
                            int startRaw = idx + searchKey.Length;
                            int endRaw = json.IndexOfAny(new char[] { ',', '}', '\r', '\n' }, startRaw);
                            if (endRaw != -1)
                            {
                                return json.Substring(startRaw, endRaw - startRaw).Trim().Replace("\"", "");
                            }
                        }
                    }
                }
            }
            catch { }
            return defVal;
        }

        public static string ExtractJsonStringValue(string json, string propertyName)
        {
            try
            {
                string search = "\"" + propertyName + "\":";
                int idx = json.IndexOf(search);
                if (idx == -1) return null;
                
                int start = json.IndexOf("\"", idx + search.Length);
                if (start == -1) return null;
                start += 1;
                
                int end = json.IndexOf("\"", start);
                if (end == -1) return null;
                
                return json.Substring(start, end - start).Replace("\\\\", "\\").Replace("\\/", "/");
            }
            catch
            {
                return null;
            }
        }

        public static string FindSqliteDll(string historyLogFile)
        {
            if (string.IsNullOrEmpty(historyLogFile)) return null;
            try
            {
                string dir1 = Path.GetDirectoryName(historyLogFile);
                if (!string.IsNullOrEmpty(dir1))
                {
                    string path1 = Path.Combine(dir1, "System.Data.SQLite.dll");
                    if (File.Exists(path1)) return path1;
                    
                    string dir2 = Path.GetDirectoryName(dir1);
                    if (!string.IsNullOrEmpty(dir2))
                    {
                        string path2 = Path.Combine(dir2, "System.Data.SQLite.dll");
                        if (File.Exists(path2)) return path2;
                    }
                }
                string appDir = @"C:\NasunAgent";
                string path3 = Path.Combine(appDir, "System.Data.SQLite.dll");
                if (File.Exists(path3)) return path3;
            }
            catch { }
            return null;
        }

        public static List<Dictionary<string, object>> ProcessSqliteLogs(string dbPath, ref int lastId, string setCode, string logFile)
        {
            List<Dictionary<string, object>> results = new List<Dictionary<string, object>>();
            if (!File.Exists(dbPath))
            {
                Log(logFile, "CẢNH BÁO: File database SQLite không tồn tại: " + dbPath);
                return results;
            }

            string dllPath = FindSqliteDll(dbPath);
            if (string.IsNullOrEmpty(dllPath))
            {
                Log(logFile, "LỖI: Không tìm thấy System.Data.SQLite.dll trong thư mục ColorExpert3 hoặc C:\\NasunAgent.");
                return results;
            }

            try
            {
                Assembly asm = Assembly.LoadFrom(dllPath);
                Type connType = asm.GetType("System.Data.SQLite.SQLiteConnection");
                Type cmdType = asm.GetType("System.Data.SQLite.SQLiteCommand");

                string connStr = string.Format("Data Source={0};Version=3;", dbPath);
                using (IDisposable conn = (IDisposable)Activator.CreateInstance(connType, new object[] { connStr }))
                {
                    connType.GetMethod("Open").Invoke(conn, null);
                    
                    string query = "SELECT id, timestamp, color_code, product_line, base, size, quantity, pigment_ml, operator " +
                                   "FROM TintHistory WHERE id > @lastId ORDER BY id ASC";
                    
                    using (IDisposable cmd = (IDisposable)Activator.CreateInstance(cmdType, new object[] { query, conn }))
                    {
                        object parameters = cmdType.GetProperty("Parameters").GetValue(cmd, null);
                        parameters.GetType().GetMethod("AddWithValue").Invoke(parameters, new object[] { "@lastId", lastId });

                        using (IDisposable reader = (IDisposable)cmdType.GetMethod("ExecuteReader", new Type[] { }).Invoke(cmd, null))
                        {
                            Type readerType = reader.GetType();
                            
                            while ((bool)readerType.GetMethod("Read").Invoke(reader, null))
                            {
                                int idVal = Convert.ToInt32(readerType.GetMethod("GetValue").Invoke(reader, new object[] { 0 }));
                                string timestamp = Convert.ToString(readerType.GetMethod("GetValue").Invoke(reader, new object[] { 1 }));
                                string color = Convert.ToString(readerType.GetMethod("GetValue").Invoke(reader, new object[] { 2 }));
                                string prod = Convert.ToString(readerType.GetMethod("GetValue").Invoke(reader, new object[] { 3 }));
                                string baseVal = Convert.ToString(readerType.GetMethod("GetValue").Invoke(reader, new object[] { 4 }));
                                string size = Convert.ToString(readerType.GetMethod("GetValue").Invoke(reader, new object[] { 5 }));
                                int qty = Convert.ToInt32(readerType.GetMethod("GetValue").Invoke(reader, new object[] { 6 }));
                                double pigment = Convert.ToDouble(readerType.GetMethod("GetValue").Invoke(reader, new object[] { 7 }));
                                string op = Convert.ToString(readerType.GetMethod("GetValue").Invoke(reader, new object[] { 8 }));

                                double sizeVol = 1.0;
                                string sizeClean = size.ToUpper().Replace("L", "").Trim();
                                double.TryParse(sizeClean, out sizeVol);

                                Dictionary<string, object> log = new Dictionary<string, object>();
                                log["id"] = string.Format("SQL-{0}-{1}", setCode, idVal);
                                log["nppId"] = setCode;
                                log["setCode"] = setCode;
                                log["timestamp"] = timestamp;
                                log["colorCode"] = color;
                                log["productLine"] = prod;
                                log["base"] = baseVal;
                                log["containerSize"] = size;
                                log["quantity"] = qty;
                                log["totalVolumeLiters"] = sizeVol * qty;
                                log["pigmentUsedMl"] = pigment;
                                log["operator"] = op;
                                log["status"] = "HOÀN THÀNH";

                                results.Add(log);
                                if (idVal > lastId) lastId = idVal;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Log(logFile, "Lỗi truy vấn database SQLite bằng Reflection: " + ex.Message);
            }

            return results;
        }

        public static List<Dictionary<string, object>> ProcessMdbLogs(string dbPath, ref int lastId, string setCode, string logFile)
        {
            List<Dictionary<string, object>> results = new List<Dictionary<string, object>>();
            if (!File.Exists(dbPath))
            {
                Log(logFile, "CẢNH BÁO: File database Access (.mdb) không tồn tại: " + dbPath);
                return results;
            }

            try
            {
                string connStr = string.Format("Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0};", dbPath);
                
                using (System.Data.OleDb.OleDbConnection conn = new System.Data.OleDb.OleDbConnection(connStr))
                {
                    conn.Open();
                    
                    string query = "SELECT id, timestamp, color_code, product_line, base, size, quantity, pigment_ml, operator " +
                                   "FROM TintHistory WHERE id > @lastId ORDER BY id ASC";
                    
                    using (System.Data.OleDb.OleDbCommand cmd = new System.Data.OleDb.OleDbCommand(query, conn))
                    {
                        cmd.Parameters.AddWithValue("@lastId", lastId);

                        using (System.Data.OleDb.OleDbDataReader reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                int idVal = Convert.ToInt32(reader.GetValue(0));
                                string timestamp = Convert.ToString(reader.GetValue(1));
                                string color = Convert.ToString(reader.GetValue(2));
                                string prod = Convert.ToString(reader.GetValue(3));
                                string baseVal = Convert.ToString(reader.GetValue(4));
                                string size = Convert.ToString(reader.GetValue(5));
                                int qty = Convert.ToInt32(reader.GetValue(6));
                                double pigment = Convert.ToDouble(reader.GetValue(7));
                                string op = Convert.ToString(reader.GetValue(8));

                                double sizeVol = 1.0;
                                string sizeClean = size.ToUpper().Replace("L", "").Trim();
                                double.TryParse(sizeClean, out sizeVol);

                                Dictionary<string, object> log = new Dictionary<string, object>();
                                log["id"] = string.Format("MDB-{0}-{1}", setCode, idVal);
                                log["nppId"] = setCode;
                                log["setCode"] = setCode;
                                log["timestamp"] = timestamp;
                                log["colorCode"] = color;
                                log["productLine"] = prod;
                                log["base"] = baseVal;
                                log["containerSize"] = size;
                                log["quantity"] = qty;
                                log["totalVolumeLiters"] = sizeVol * qty;
                                log["pigmentUsedMl"] = pigment;
                                log["operator"] = op;
                                log["status"] = "HOÀN THÀNH";

                                results.Add(log);
                                if (idVal > lastId) lastId = idVal;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Log(logFile, "Lỗi truy vấn database Access (.mdb) qua OLEDB: " + ex.Message + " (Có thể cần cài Access Database Engine 32-bit)");
            }

            return results;
        }

        public static List<Dictionary<string, object>> ProcessXmlLogs(string xmlPath, ref int lastIdx, string setCode, string logFile)
        {
            List<Dictionary<string, object>> results = new List<Dictionary<string, object>>();
            if (!File.Exists(xmlPath))
            {
                Log(logFile, "CẢNH BÁO: File log XML không tồn tại: " + xmlPath);
                return results;
            }

            try
            {
                XmlDocument doc = new XmlDocument();
                doc.Load(xmlPath);

                XmlNodeList logs = doc.SelectNodes("//Log");
                int maxIdx = lastIdx;

                foreach (XmlNode node in logs)
                {
                    if (node.Attributes == null) continue;
                    
                    int idx = 0;
                    if (node.Attributes["index"] != null)
                    {
                        int.TryParse(node.Attributes["index"].Value, out idx);
                    }

                    if (idx > lastIdx)
                    {
                        string timestamp = node.Attributes["timestamp"] != null ? node.Attributes["timestamp"].Value : DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                        string color = node.Attributes["color"] != null ? node.Attributes["color"].Value : "N/A";
                        string prod = node.Attributes["product"] != null ? node.Attributes["product"].Value : "Sơn Nasun";
                        string baseVal = node.Attributes["base"] != null ? node.Attributes["base"].Value : "Base A";
                        string size = node.Attributes["size"] != null ? node.Attributes["size"].Value : "1L";
                        
                        int qty = 1;
                        if (node.Attributes["qty"] != null) int.TryParse(node.Attributes["qty"].Value, out qty);

                        double pigment = 0.0;
                        if (node.Attributes["pigment"] != null) double.TryParse(node.Attributes["pigment"].Value, out pigment);

                        string op = node.Attributes["operator"] != null ? node.Attributes["operator"].Value : "KTV";

                        double sizeVol = 1.0;
                        string sizeClean = size.ToUpper().Replace("L", "").Trim();
                        double.TryParse(sizeClean, out sizeVol);

                        Dictionary<string, object> log = new Dictionary<string, object>();
                        log["id"] = string.Format("XML-{0}-{1}", setCode, idx);
                        log["nppId"] = setCode;
                        log["setCode"] = setCode;
                        log["timestamp"] = timestamp;
                        log["colorCode"] = color;
                        log["productLine"] = prod;
                        log["base"] = baseVal;
                        log["containerSize"] = size;
                        log["quantity"] = qty;
                        log["totalVolumeLiters"] = sizeVol * qty;
                        log["pigmentUsedMl"] = pigment;
                        log["operator"] = op;
                        log["status"] = "HOÀN THÀNH";

                        results.Add(log);
                        if (idx > maxIdx) maxIdx = idx;
                    }
                }
                lastIdx = maxIdx;
            }
            catch (Exception ex)
            {
                Log(logFile, "Lỗi phân tích cú pháp XML log: " + ex.Message);
            }

            return results;
        }

        public static string SerializeLogsPayload(List<Dictionary<string, object>> logs, string setCode)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("{\r\n");
            sb.AppendFormat("  \"set_code\": \"{0}\",\r\n", setCode);
            sb.Append("  \"logs\": [\r\n");
            
            for (int i = 0; i < logs.Count; i++)
            {
                var log = logs[i];
                sb.Append("    {\r\n");
                int count = 0;
                foreach (var kvp in log)
                {
                    string valueStr = "";
                    if (kvp.Value == null)
                    {
                        valueStr = "null";
                    }
                    else if (kvp.Value is bool)
                    {
                        valueStr = ((bool)kvp.Value) ? "true" : "false";
                    }
                    else if (kvp.Value is int || kvp.Value is long || kvp.Value is double || kvp.Value is float || kvp.Value is decimal)
                    {
                        valueStr = kvp.Value.ToString().Replace(",", ".");
                    }
                    else
                    {
                        valueStr = "\"" + kvp.Value.ToString().Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "\\n") + "\"";
                    }
                    
                    sb.AppendFormat("      \"{0}\": {1}{2}\r\n", kvp.Key, valueStr, ++count < log.Count ? "," : "");
                }
                sb.Append(i < logs.Count - 1 ? "    },\r\n" : "    }\r\n");
            }
            
            sb.Append("  ]\r\n");
            sb.Append("}");
            return sb.ToString();
        }

        public static bool PostLogsToCloud(string apiUrl, string apiKey, string setCode, List<Dictionary<string, object>> logs, string logFile)
        {
            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
                using (WebClient client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    client.Headers["Authorization"] = "Bearer " + apiKey;
                    
                    string payload = SerializeLogsPayload(logs, setCode);
                    string url = apiUrl.TrimEnd('/') + "/sync-logs";
                    
                    string response = client.UploadString(url, "POST", payload);
                    Log(logFile, "✓ Đã đồng bộ thành công nhật ký lên Cloud: " + (response.Length > 40 ? response.Substring(0, 40) + "..." : response));
                    return true;
                }
            }
            catch (Exception ex)
            {
                Log(logFile, "Lỗi tải nhật ký lên Cloud: " + ex.Message);
                return false;
            }
        }

        public static void CheckForFormulaUpdates(string apiUrl, string apiKey, string softwareType, string formulaOverrideDir, string backupDir, ref string formulaVersion, string logFile)
        {
            try
            {
                string reqUrl = string.Format("{0}/formulas/latest?software_type={1}", apiUrl.TrimEnd('/'), Uri.EscapeDataString(softwareType));
                using (WebClient client = new WebClient())
                {
                    client.Headers["Authorization"] = "Bearer " + apiKey;
                    string jsonResponse = client.DownloadString(reqUrl);
                    
                    string latestVersion = ExtractJsonStringValue(jsonResponse, "versionId");
                    string downloadUrl = ExtractJsonStringValue(jsonResponse, "downloadUrl");
                    string filename = ExtractJsonStringValue(jsonResponse, "filename");
                    
                    if (!string.IsNullOrEmpty(latestVersion) && latestVersion != formulaVersion && !string.IsNullOrEmpty(downloadUrl) && !string.IsNullOrEmpty(filename))
                    {
                        Log(logFile, string.Format("Phát hiện công thức màu mới: {0}. Đang tải về...", latestVersion));
                        
                        if (!Directory.Exists(formulaOverrideDir))
                        {
                            Directory.CreateDirectory(formulaOverrideDir);
                        }
                        
                        string targetPath = Path.Combine(formulaOverrideDir, filename);
                        string backupPath = Path.Combine(backupDir, filename + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".bak");
                        
                        if (File.Exists(targetPath))
                        {
                            if (!Directory.Exists(backupDir))
                            {
                                Directory.CreateDirectory(backupDir);
                            }
                            File.Copy(targetPath, backupPath, true);
                            Log(logFile, "Đã tạo bản sao lưu công thức cũ tại: " + backupPath);
                            RotateBackups(backupDir, filename, logFile);
                        }
                        
                        string tempFile = Path.Combine(Path.GetTempPath(), "nasun_formula_" + DateTime.Now.Ticks + ".tmp");
                        client.DownloadFile(downloadUrl, tempFile);
                        
                        if (File.Exists(targetPath)) File.Delete(targetPath);
                        File.Move(tempFile, targetPath);
                        
                        Log(logFile, string.Format("✓ Đã cập nhật công thức mới [{0}] thành công! 🟢", latestVersion));
                        formulaVersion = latestVersion;
                    }
                    else
                    {
                        Log(logFile, "Công thức màu hiện đã là phiên bản mới nhất.");
                    }
                }
            }
            catch (Exception ex)
            {
                Log(logFile, "Lỗi kiểm tra cập nhật công thức màu: " + ex.Message);
            }
        }

        public static void SyncData(string configFile, string logFile)
        {
            try
            {
                if (!File.Exists(configFile))
                {
                    Log(logFile, "Không tìm thấy file cấu hình: " + configFile);
                    return;
                }

                string json = File.ReadAllText(configFile, Encoding.UTF8);
                string apiUrl = GetJsonVal(json, "api_url", "https://kythuat.nasun.workers.dev/api");
                string apiKey = GetJsonVal(json, "api_key", "");
                string setCode = GetJsonVal(json, "set_code", "");
                string softwareType = GetJsonVal(json, "software_type", "ColorExpert 3");
                
                string formulaOverrideDir = GetJsonVal(json, "formula_override_dir", "");
                if (string.IsNullOrEmpty(formulaOverrideDir)) formulaOverrideDir = GetJsonVal(json, "formula_dir", ""); // compatibility fallback
                
                string historyLogFile = GetJsonVal(json, "history_log_file", "");
                string backupDir = GetJsonVal(json, "backup_dir", "");

                // Get or generate Machine GUID
                string machineGuid = GetJsonVal(json, "machine_guid", "");
                if (string.IsNullOrEmpty(machineGuid))
                {
                    machineGuid = Guid.NewGuid().ToString();
                    try
                    {
                        int lastBrace = json.LastIndexOf('}');
                        if (lastBrace != -1)
                        {
                            string newJson = json.Substring(0, lastBrace).TrimEnd();
                            if (newJson[newJson.Length - 1] != ',')
                            {
                                newJson += ",";
                            }
                            newJson += string.Format("\r\n  \"machine_guid\": \"{0}\"\r\n}}", machineGuid);
                            File.WriteAllText(configFile, newJson, Encoding.UTF8);
                            Log(logFile, "Đã tự động tạo và lưu Machine GUID: " + machineGuid);
                        }
                    }
                    catch (Exception ex)
                    {
                        Log(logFile, "Lỗi ghi đè lưu Machine GUID: " + ex.Message);
                    }
                }

                // Load state
                string appDir = Path.GetDirectoryName(configFile);
                string stateFile = Path.Combine(appDir, "last_sync.json");
                string queueFile = Path.Combine(appDir, "queue.json");
                
                int lastSqliteId = 0;
                int lastXmlIndex = 0;
                string formulaVersion = "v1.0";

                if (File.Exists(stateFile))
                {
                    try
                    {
                        string stateJson = File.ReadAllText(stateFile, Encoding.UTF8);
                        int.TryParse(GetJsonVal(stateJson, "last_sqlite_id", "0"), out lastSqliteId);
                        int.TryParse(GetJsonVal(stateJson, "last_xml_index", "0"), out lastXmlIndex);
                        formulaVersion = GetJsonVal(stateJson, "formula_version", "v1.0");
                    }
                    catch (Exception ex)
                    {
                        Log(logFile, "Lỗi đọc file state last_sync.json: " + ex.Message);
                    }
                }

                // 1. Parse log data based on softwareType
                List<Dictionary<string, object>> newLogs = new List<Dictionary<string, object>>();

                if (softwareType == "ColorExpert 3")
                {
                    newLogs = ProcessSqliteLogs(historyLogFile, ref lastSqliteId, setCode, logFile);
                }
                else if (softwareType == "ColorExpert 2")
                {
                    newLogs = ProcessMdbLogs(historyLogFile, ref lastSqliteId, setCode, logFile);
                }
                else if (softwareType == "CorobTINT")
                {
                    newLogs = ProcessXmlLogs(historyLogFile, ref lastXmlIndex, setCode, logFile);
                }

                // Load existing offline queue
                List<Dictionary<string, object>> uploadQueue = LoadQueue(queueFile);
                if (newLogs.Count > 0)
                {
                    uploadQueue.AddRange(newLogs);
                    Log(logFile, string.Format("Phát hiện {0} lượt pha màu mới. Đã lưu vào hàng đợi đệm cục bộ (Tổng hàng đợi: {1}).", newLogs.Count, uploadQueue.Count));
                }

                // 2. Upload queue if any logs exist in queue
                bool uploadSuccess = true;
                if (uploadQueue.Count > 0)
                {
                    Log(logFile, string.Format("Đang truyền gửi {0} bản ghi pha màu từ hàng đợi đệm...", uploadQueue.Count));
                    uploadSuccess = PostLogsToCloud(apiUrl, apiKey, setCode, uploadQueue, logFile);
                    
                    if (uploadSuccess)
                    {
                        // Clear the queue file if successful
                        if (File.Exists(queueFile)) File.Delete(queueFile);
                        Log(logFile, "✓ Đã làm trống hàng đợi đệm cục bộ sau khi đồng bộ thành công.");
                    }
                    else
                    {
                        // Save queue back to file to retry next time
                        SaveQueue(uploadQueue, queueFile);
                        Log(logFile, "CẢNH BÁO: Không thể đồng bộ, dữ liệu pha màu đã được lưu đệm offline để thử lại sau.");
                    }
                }
                else
                {
                    Log(logFile, "Không phát hiện lượt pha màu mới nào.");
                }

                // 3. Check for formula updates
                CheckForFormulaUpdates(apiUrl, apiKey, softwareType, formulaOverrideDir, backupDir, ref formulaVersion, logFile);

                // 3.5. Send hardware telemetry data
                SendTelemetry(apiUrl, apiKey, setCode, machineGuid, logFile);

                // 3.7. Check and execute remote diagnostic commands
                CheckAndExecuteRemoteCommands(apiUrl, apiKey, setCode, logFile);

                // 4. Save state if upload was successful (or if there were no new logs)
                if (uploadSuccess)
                {
                    string stateJson = string.Format(
                        "{{\r\n  \"last_sqlite_id\": {0},\r\n  \"last_xml_index\": {1},\r\n  \"formula_version\": \"{2}\"\r\n}}",
                        lastSqliteId, lastXmlIndex, formulaVersion
                    );
                    File.WriteAllText(stateFile, stateJson, Encoding.UTF8);
                }
            }
            catch (Exception ex)
            {
                Log(logFile, "Lỗi trong chu kỳ đồng bộ: " + ex.Message);
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
        
        // System Tray variables
        private NotifyIcon trayIcon;
        private ContextMenu trayMenu;

        public ConfigForm()
        {
            InitComponent();
            LoadConfig();
            InitTrayIcon();
            StartLogTimer();
        }

        private void InitTrayIcon()
        {
            trayMenu = new ContextMenu();
            trayMenu.MenuItems.Add("⚡ Đồng Bộ Ngay", BtnTest_Click);
            trayMenu.MenuItems.Add("⚙️ Cấu Hình Hệ Thống", (s, e) => {
                this.Show();
                this.WindowState = FormWindowState.Normal;
                this.BringToFront();
            });
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("❌ Thoát Hoàn Toàn", (s, e) => {
                if (trayIcon != null) trayIcon.Visible = false;
                Application.Exit();
            });

            trayIcon = new NotifyIcon();
            trayIcon.Text = "Nasun NPP Agent - Paint Tinting Manager";
            trayIcon.Icon = SystemIcons.Application;
            trayIcon.ContextMenu = trayMenu;
            trayIcon.Visible = true;

            // Double click tray icon to restore UI
            trayIcon.DoubleClick += (s, e) => {
                this.Show();
                this.WindowState = FormWindowState.Normal;
                this.BringToFront();
            };
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // If closed by user clicking "X", hide form and minimize to tray
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                this.Hide();
                if (trayIcon != null)
                {
                    trayIcon.ShowBalloonTip(3000, "Nasun NPP Agent", "Phần mềm đang chạy ẩn dưới khay hệ thống. Nhấp đúp chuột để cấu hình.", ToolTipIcon.Info);
                }
            }
            else
            {
                if (trayIcon != null) trayIcon.Visible = false;
                base.OnFormClosing(e);
            }
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
            return Program.GetJsonVal(json, key, defVal);
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
