========================================================================
             NASUN PAINT TINTING MACHINE SYNC AGENT (NATIVE WINDOWS EXE)
========================================================================

Phần mềm độc lập dành cho máy tính Windows tại Nhà Phân Phối (NPP) tự động
đồng bộ lịch sử pha màu từ máy chiết lên Cloud và nhận cập nhật công thức màu mới.

Đặc điểm nổi bật:
- Biên dịch 100% Native C# (.NET Framework có sẵn trên mọi máy tính Windows).
- KHÔNG CẦN CÀI ĐẶT PYTHON, Node.js hay bất kỳ thư viện thứ ba nào.
- Giao diện đồ họa (GUI) mở tức thì khi nhấp đúp chuột, không bị tắt cửa sổ.

------------------------------------------------------------------------
I. CÁC THÀNH PHẦN CHÍNH TRONG THƯ MỤC:
------------------------------------------------------------------------
1. NasunAgentSetup.exe (File chạy trực tiếp 15KB):
   - Khi nhấp đúp chuột: Mở cửa sổ giao diện đồ họa GUI để KTV nhập thông số.
   - Khi chạy ngầm cùng Windows (/silent): Tự động thực hiện chu kỳ đồng bộ
     lịch sử pha màu và kiểm tra cập nhật công thức màu mới.

2. NasunAgentSetup.cs:
   Mã nguồn C# gốc của phần mềm. Có thể tự biên dịch lại bất cứ lúc nào bằng
   trình biên dịch csc.exe có sẵn của Windows.

3. setup_service.bat:
   Tập lệnh kích hoạt nhanh: Tự động copy phần mềm vào C:\NasunAgent và mở
   giao diện cấu hình GUI.

------------------------------------------------------------------------
II. HƯỚNG DẪN CÀI ĐẶT DỄ DÀNG (CHO KTV):
------------------------------------------------------------------------

BƯỚC 1: Mở phần mềm Cấu Hình
- Bạn chỉ cần nhấp đúp chuột trái trực tiếp vào file "NasunAgentSetup.exe"
  (Hoặc chạy file "setup_service.bat").
- Cửa sổ giao diện đồ họa "Cấu Hình NASUN NPP Agent" màu xanh đen sang
  trọng sẽ xuất hiện ngay lập tức trên màn hình.

BƯỚC 2: Điền thông số cấu hình
- Điền các thông số: API URL, Supabase Token, Mã bộ máy (Set Code).
- Chọn loại phần mềm pha màu NPP đang dùng (ColorExpert 3, 2, hay CorobTINT).
- Bấm nút "Browse..." để chọn thư mục cài đặt công thức và file database log.
- Nhấn nút "💾 LƯU CẤU HÌNH".

BƯỚC 3: Đồng bộ thử nghiệm & Đăng ký chạy ngầm
- Nhấn nút "⚡ ĐỒNG BỘ THỬ NGHIỆM" để kiểm tra kết nối với Cloud. Nhật ký
  sẽ hiển thị thời gian thực ở ô văn bản phía dưới.
- Nhấn nút "🚀 CÀI ĐẶT CHẠY CÙNG WINDOWS" để phần mềm tự động chạy ẩn
  mỗi khi máy tính NPP được bật.

========================================================================
