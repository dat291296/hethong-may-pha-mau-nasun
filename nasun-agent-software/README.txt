========================================================================
             NASUN PAINT TINTING MACHINE SYNC AGENT (WINDOWS)
========================================================================

Thu mục này chứa toàn bộ mã nguồn và công cụ đóng gói phần mềm chạy ngầm
cho máy tính Windows tại Nhà Phân Phối (NPP) để tự động cập nhật công thức
màu và trích xuất lịch sử pha máy chiết lên hệ thống Cloud NASUN PAINT.

------------------------------------------------------------------------
I. THÀNH PHẦN MÃ NGUỒN TRONG THƯ MỤC:
------------------------------------------------------------------------
1. agent.py:
   Mã nguồn Python chính của phần mềm. Thực hiện:
   - Đọc config.json khi khởi động.
   - Nhận diện loại phần mềm máy pha (ColorExpert 3 sử dụng cơ sở dữ liệu
     SQLite, hoặc CorobTINT sử dụng XML log).
   - Tự động quét và chỉ trích xuất các lượt pha mới phát sinh (sử dụng
     tệp lưu vết trạng thái last_sync.json để không bị trùng lặp).
   - Gửi yêu cầu HTTPS POST tới Cloud API để đồng bộ sản lượng sơn.
   - Định kỳ gọi Cloud để xem có phiên bản công thức màu mới nào không.
     Nếu có, tự động tải xuống, sao lưu tệp cũ (.bak) và ghi đè tệp mới
     vào đúng thư mục phần mềm máy chiết.

2. config.json:
   Tệp cấu hình của Agent. Cần điều chỉnh set_code (Mã bộ máy), loại phần
   mềm pha màu, và đường dẫn thư mục database tương ứng trên máy tính đó.

3. setup_service.bat:
   Tập lệnh cài đặt tự động bằng quyền Admin (Windows Batch Script):
   - Tự động nâng cấp pip, cài đặt thư viện biên dịch.
   - Biên dịch tệp agent.py thành tệp thực thi duy nhất NasunAgentService.exe.
   - Tạo thư mục C:\NasunAgent và copy file cấu hình cùng file chạy vào ổ đĩa.
   - Đăng ký chương trình chạy ngầm với Windows Task Scheduler (Chạy cùng hệ
     thống dưới quyền SYSTEM không cần người dùng đăng nhập).

------------------------------------------------------------------------
II. HƯỚNG DẪN BIÊN DỊCH VÀ CÀI ĐẶT:
------------------------------------------------------------------------
Bước 1: Chỉnh sửa tệp config.json
- Mở tệp config.json bằng Notepad.
- Cập nhật đúng các thông số:
  + "set_code": Mã bộ máy tương ứng của NPP.
  + "paths" -> "history_log_file": Đường dẫn tới file History.db hoặc
    DispenseHistory.xml trên máy tính NPP.

Bước 2: Chạy file cài đặt setup_service.bat
- Nhấp chuột phải vào tệp setup_service.bat chọn "Run as Administrator".
- Chương trình sẽ tự động thực hiện từ đầu đến cuối và tạo ra dịch vụ chạy ẩn.

Bước 3: Kiểm tra log vận hành
- Mở thư mục C:\NasunAgent
- Xem tệp agent.log để theo dõi quá trình đồng bộ và tải công thức màu.
========================================================================
