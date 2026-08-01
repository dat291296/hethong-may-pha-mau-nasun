========================================================================
             NASUN PAINT TINTING MACHINE SYNC AGENT (WINDOWS GUI)
========================================================================

Phần mềm này giúp máy tính Windows tại Nhà Phân Phối (NPP) tự động đồng bộ
lịch sử pha màu từ máy chiết lên Cloud và nhận cập nhật công thức màu mới.

Điểm cải tiến: Phiên bản này cung cấp Giao Diện Đồ Họa (GUI) trực quan giúp
Kỹ thuật viên (KTV) dễ dàng nhập các thông số cấu hình và cài đặt chạy ngầm
không cần biên dịch code phức tạp.

------------------------------------------------------------------------
I. CÁC THÀNH PHẦN CHÍNH:
------------------------------------------------------------------------
1. agent_gui.py:
   Mã nguồn chính tích hợp giao diện GUI và luồng chạy ẩn nền.
   - Khi chạy bình thường: Mở cửa sổ đồ họa nhập thông số.
   - Khi chạy với tham số --silent: Chạy ẩn hoàn toàn dưới nền Windows.

2. config.json:
   Tệp lưu trữ thông số cấu hình dạng JSON.

3. setup_service.bat:
   Tập lệnh tự động copy phần mềm vào thư mục làm việc hệ thống C:\NasunAgent
   và khởi chạy giao diện GUI cấu hình lần đầu.

------------------------------------------------------------------------
II. HƯỚNG DẪN CÀI ĐẶT 3 BƯỚC (CHO KTV):
------------------------------------------------------------------------

BƯỚC 1: Khởi chạy Trình cấu hình GUI
- Nhấp đúp chuột vào file "setup_service.bat".
- Chương trình sẽ tự động tạo thư mục C:\NasunAgent, copy mã nguồn vào
  đó và mở ra một cửa sổ giao diện đồ họa cấu hình tuyệt đẹp.

BƯỚC 2: Nhập thông số cấu hình trực tiếp trên giao diện
- Điền các thông số: API URL, Supabase Token, Mã bộ máy (Set Code).
- Chọn loại phần mềm pha màu NPP đang dùng (ColorExpert 3, 2, hay CorobTINT).
- Bấm nút "Browse..." ở góc phải các ô thư mục để chọn trực tiếp file
  database hoặc file log trên máy tính (Không cần gõ tay đường dẫn).
- Bấm nút "LƯU CẤU HÌNH".

BƯỚC 3: Đồng bộ thử nghiệm & Cài đặt chạy ngầm cùng Windows
- Bấm nút "ĐỒNG BỘ THỬ NGHIỆM" để kiểm tra kết nối. Log hoạt động sẽ hiển
  thị trực tiếp trong khung console màu xanh bên dưới cửa sổ ứng dụng.
- Bấm nút "CÀI ĐẶT CHẠY CÙNG WINDOWS" để phần mềm tự động đăng ký với
  Windows Task Scheduler. Từ lúc này phần mềm sẽ tự chạy ẩn hoàn toàn mỗi
  khi máy tính NPP khởi động (Sử dụng pythonw.exe chạy ngầm).

* Xem file log chi tiết lưu tại: C:\NasunAgent\agent.log
========================================================================
