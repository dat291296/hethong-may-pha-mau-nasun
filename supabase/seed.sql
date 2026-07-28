-- ============================================================
-- Seed Data – Paint Tinting & Stock Manager v2.0
-- Migrated from mockData.js
-- Run AFTER schema.sql + rls_policies.sql
-- ============================================================

-- ── Distributors (NPP) ────────────────────────────────────────────────────────
INSERT INTO distributors (id, name, phone, contact_person, region, province, address, location_coordinates, google_maps_url, status, photos) VALUES
('NPP-HN-001','Nhà Phân Phối Sơn Minh Phát','0912 345 678','Nguyễn Văn Phát','Miền Bắc','Hà Nội','Số 45 Đường Giải Phóng, Q. Hai Bà Trưng, Hà Nội','21.0024, 105.8412','https://maps.google.com/?q=21.0024,105.8412','Đang hợp tác','[]'),
('NPP-HN-002','Đại Lý Sơn Hoàn Mỹ','0988 765 432','Trần Thị Hoàn','Miền Bắc','Hà Nội','128 Đường Cầu Giấy, Q. Cầu Giấy, Hà Nội','21.0362, 105.7905','https://maps.google.com/?q=21.0362,105.7905','Đang hợp tác','[]'),
('NPP-HP-001','Công Ty TNHH Vật Liệu Hải Phòng','0904 112 233','Phạm Quốc Hùng','Miền Bắc','Hải Phòng','78 Phố Lạch Tray, Ngô Quyền, Hải Phòng','20.8495, 106.6881','https://maps.google.com/?q=20.8495,106.6881','Đang hợp tác','[]'),
('NPP-DN-001','Nhà Phân Phối Sơn Việt Trung','0905 444 333','Lê Việt Trung','Miền Trung','Đà Nẵng','22 Trần Phú, Q. Hải Châu, Đà Nẵng','16.0544, 108.2022','https://maps.google.com/?q=16.0544,108.2022','Đang hợp tác','[]'),
('NPP-KH-001','Đại Lý Sơn Nha Trang Green','0901 888 777','Nguyễn Thanh Bình','Miền Trung','Khánh Hòa','56 Bà Triệu, Nha Trang, Khánh Hòa','12.2451, 109.1924','https://maps.google.com/?q=12.2451,109.1924','Đã ngưng hợp tác','[]'),
('NPP-HCM-001','Tổng Kho Sơn Sài Gòn Gold','0912 000 111','Trương Minh Tuấn','Miền Nam','TP. Hồ Chí Minh','200 Nguyễn Thị Định, Q.2, TP. HCM','10.7894, 106.7305','https://maps.google.com/?q=10.7894,106.7305','Đang hợp tác','[]'),
('NPP-BDG-001','Phân Phối Sơn Bình Dương Star','0933 222 555','Võ Minh Quân','Miền Nam','Bình Dương','89 Đại Lộ Bình Dương, TP. Thủ Dầu Một','10.9805, 106.6519','https://maps.google.com/?q=10.9805,106.6519','Đang hợp tác','[]')
ON CONFLICT (id) DO NOTHING;

-- ── System Sets ───────────────────────────────────────────────────────────────
INSERT INTO system_sets (set_code, npp_id, npp_name, region, status, dispenser_model, dispenser_serial, mixer_model, mixer_serial, computer_type, computer_serial, printer_serial, tinting_software, software_version, agent_status, install_date, last_maintenance_date, next_maintenance_due, technician, stabilizer) VALUES
('SET-2024-001','NPP-HN-001','Nhà Phân Phối Sơn Minh Phát','Miền Bắc','DA_LAP_DAT','Satint A2','ST-A2-99801','Satint ST-50','MIX-ST-1001','AIO','PC-AIO-2024-01','QL700-SN-8801','ColorExpert 3','v3.4.2','Online','2025-08-15','2025-08-15','2026-08-15','Nguyễn Văn Hùng','Lioa 2000VA (NPP tự mua)'),
('SET-2024-002','NPP-HN-002','Đại Lý Sơn Hoàn Mỹ','Miền Bắc','DA_LAP_DAT','Hero Eurotint','HERO-EU-5541','AI88','MIX-AI88-882','Case','PC-CASE-1092','QL700-SN-8802','ColorExpert 2','v2.9.1','Online','2025-08-01','2025-08-01','2026-08-01','Lê Thanh Tùng','Standa 3000VA (NPP tự mua)'),
('SET-2024-003','NPP-DN-001','Nhà Phân Phối Sơn Việt Trung','Miền Trung','DA_LAP_DAT','Corob F1','COROB-F1-1049','Evoshake-200','EVO-200-449','AIO','PC-AIO-2024-03','QL700-SN-8803','CorobTINT','v1.14.0','Online','2025-11-10','2025-11-10','2026-11-10','Trần Đình Trọng','Chưa có ổn áp'),
('SET-2024-004','NPP-HP-001','Công Ty TNHH Vật Liệu Hải Phòng','Miền Bắc','BAO_THUONG_BAO_TRI','Satint A2','ST-A2-99804','KMC-300','KMC-30-771','Case','PC-CASE-0871','QL700-SN-8804','ColorExpert 2','v2.8.0','Offline','2025-05-20','2025-05-20','2026-05-20','Nguyễn Văn Hùng','Lioa 1500VA (NPP tự mua)'),
('SET-2023-005','NPP-KH-001','Đại Lý Sơn Nha Trang Green','Miền Trung','DA_THU_HOI','Hero Eurotint','HERO-EU-6620','YSA-2A','YSA-2A-332','AIO','PC-AIO-2023-05','QL700-SN-8805','ColorExpert 3','v3.1.0','Offline','2024-02-10','2025-02-10','2026-02-10','Phạm Văn Minh','Không có'),
('SET-2024-006','NPP-HCM-001','Tổng Kho Sơn Sài Gòn Gold','Miền Nam','DA_LAP_DAT','Corob F1','COROB-F1-1102','Evoshake-200','EVO-200-501','Case','PC-CASE-1120','QL700-SN-8806','CorobTINT','v1.15.2','Online','2025-09-05','2025-09-05','2026-09-05','Trương Minh Tuấn','Robot 2000VA (NPP tự mua)'),
('SET-KHO-001',NULL,'Kho Tổng Trung Tâm','Kho Tổng','TRONG_KHO','Fast & Fluid HA480','FFF-HA-8812','Satint ST-50','MIX-ST-1008','Case','PC-STOCK-007','QL700-SN-8807','ColorExpert 3','Standard Stock','Offline',NULL,NULL,NULL,'Quản lý Kho','NPP tự trang bị khi lắp đặt')
ON CONFLICT (set_code) DO NOTHING;

-- ── Dispensers ────────────────────────────────────────────────────────────────
INSERT INTO dispensers (id, model, serial, status, is_assigned, set_code) VALUES
('DISP-001','Satint A2','ST-A2-99801','Mới 100%',true,'SET-2024-001'),
('DISP-002','Hero Eurotint','HERO-EU-5541','Đang chạy tốt',true,'SET-2024-002'),
('DISP-003','Corob F1','COROB-F1-1049','Đang chạy tốt',true,'SET-2024-003'),
('DISP-004','Satint A2','ST-A2-99804','Cần bảo trì',true,'SET-2024-004'),
('DISP-005','Fast & Fluid HA480','FFF-HA-8812','Mới 100%',false,NULL),
('DISP-006','Hero Eurotint','HERO-EU-6620','Hỏng đầu phun',true,'SET-2023-005'),
('DISP-007','Corob F1','COROB-F1-1102','Đang chạy tốt',true,'SET-2024-006'),
('DISP-008','Satint A2','ST-A2-99810','Mới 100%',false,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Mixers ────────────────────────────────────────────────────────────────────
INSERT INTO mixers (id, model, type, serial, status, is_assigned, set_code) VALUES
('MIX-001','Satint ST-50','Lắc xoay khép kín','MIX-ST-1001','Mới 100%',true,'SET-2024-001'),
('MIX-002','AI88','Lắc rung đứng','MIX-AI88-882','Đang chạy tốt',true,'SET-2024-002'),
('MIX-003','Evoshake-200','Lắc xoay khép kín','EVO-200-449','Đang chạy tốt',true,'SET-2024-003'),
('MIX-004','KMC-300','Lắc rung đứng','KMC-30-771','Đang chạy tốt',true,'SET-2024-004'),
('MIX-005','YSA-2A','Lắc xoay khép kín','YSA-2A-332','Cần bảo trì',true,'SET-2023-005'),
('MIX-006','Evoshake-200','Lắc xoay khép kín','EVO-200-501','Đang chạy tốt',true,'SET-2024-006'),
('MIX-007','Satint ST-50','Lắc xoay khép kín','MIX-ST-1008','Mới 100%',false,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Computers ────────────────────────────────────────────────────────────────
INSERT INTO computers (id, type, os, specs, serial, network, stabilizer, is_assigned, set_code) VALUES
('PC-001','AIO','Windows 11 Pro','Core i5 / 16GB RAM / 512GB SSD','PC-AIO-2024-01','Có mạng LAN','{"hasStabilizer":true,"brand":"Lioa 2000VA","isSelfBought":true}',true,'SET-2024-001'),
('PC-002','Case','Windows 10 LTSC','Core i3 / 8GB RAM / 256GB SSD','PC-CASE-1092','Có mạng Wifi','{"hasStabilizer":true,"brand":"Standa 3000VA","isSelfBought":true}',true,'SET-2024-002'),
('PC-003','AIO','Windows 10 Pro','Core i5 / 8GB RAM / 256GB SSD','PC-AIO-2024-03','Có mạng LAN','{"hasStabilizer":false,"brand":null,"isSelfBought":false}',true,'SET-2024-003'),
('PC-004','Case','Windows 7 SP1','Pentium Gold / 4GB RAM / 128GB SSD','PC-CASE-0871','Không có mạng','{"hasStabilizer":true,"brand":"Lioa 1500VA","isSelfBought":true}',true,'SET-2024-004'),
('PC-005','AIO','Windows 10 LTSC','Core i3 / 8GB RAM / 256GB SSD','PC-AIO-2023-05','Có mạng LAN','{"hasStabilizer":false,"brand":null,"isSelfBought":false}',true,'SET-2023-005'),
('PC-006','Case','Windows 11 Pro','Core i5 / 16GB RAM / 512GB SSD','PC-CASE-1120','Có mạng LAN','{"hasStabilizer":true,"brand":"Robot 2000VA","isSelfBought":true}',true,'SET-2024-006'),
('PC-007','Case','Windows 10 Pro','Core i3 / 8GB RAM / 256GB SSD','PC-STOCK-007','Không có mạng','{"hasStabilizer":false,"brand":null,"isSelfBought":false}',false,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Printers ──────────────────────────────────────────────────────────────────
INSERT INTO printers (id, model, serial, connection, status, is_assigned, set_code) VALUES
('PRN-001','QL700','QL700-SN-8801','USB','Đang chạy tốt',true,'SET-2024-001'),
('PRN-002','QL700','QL700-SN-8802','USB','Đang chạy tốt',true,'SET-2024-002'),
('PRN-003','QL700','QL700-SN-8803','LAN','Đang chạy tốt',true,'SET-2024-003'),
('PRN-004','QL700','QL700-SN-8804','USB','Đang chạy tốt',true,'SET-2024-004'),
('PRN-005','QL700','QL700-SN-8805','USB','Cần bảo trì',true,'SET-2023-005'),
('PRN-006','QL700','QL700-SN-8806','Bluetooth','Đang chạy tốt',true,'SET-2024-006'),
('PRN-007','QL700','QL700-SN-8807','USB','Mới 100%',false,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Repair Tickets ────────────────────────────────────────────────────────────
INSERT INTO repair_tickets (id, ticket_code, date, technician, npp_id, npp_name, product_category, machine_model, serial_number, error_description, error_category, action_direction, replacement_condition, processing_status, customer_return_status, notes) VALUES
('TICK-202607-001','TICK-202607-001','2026-07-20','Nguyễn Văn Hùng','NPP-HP-001','Công Ty TNHH Vật Liệu Hải Phòng','Máy chiết','Satint A2','ST-A2-99804','Rò rỉ tinh màu tại cụm van chiết số 4, mạch điều khiển ngắt chập chập.','Rò rỉ cụm van & hỏng van điện từ','Sửa chữa','N/A','Chưa xử lý','Chưa gửi trả','Đã mang cụm van về kho Hải Phòng để kiểm tra màng cao su.'),
('TICK-202607-002','TICK-202607-002','2026-07-18','Lê Thanh Tùng','NPP-HN-002','Đại Lý Sơn Hoàn Mỹ','Máy lắc','AI88','MIX-AI88-882','Động cơ lắc kêu to, rung lắc mạnh khi ép thùng sơn 18L.','Lỗi cơ khí & hỏng dây curoa truyền động','Xuất đổi','Mới','Đã xử lý','Chưa gửi trả','Đã xuất đổi máy lắc AI88 mới 100% cho đại lý, máy cũ đưa về kho chờ sửa.'),
('TICK-202607-003','TICK-202607-003','2026-07-10','Trần Đình Trọng','NPP-DN-001','Nhà Phân Phối Sơn Việt Trung','Máy in','QL700','QL700-SN-8803','Không nhận cổng kết nối USB, mờ nét chữ in tem mã màu.','Hỏng đầu in & cáp tín hiệu','Sửa chữa','N/A','Đã xử lý','Đã gửi trả','Thay đầu in nhiệt mới và dây cáp USB chuẩn. NPP đã nhận máy in hoạt động mượt.')
ON CONFLICT (id) DO NOTHING;

-- ── Audit Logs ────────────────────────────────────────────────────────────────
INSERT INTO audit_logs (id, type, timestamp, set_code, npp_id, npp_name, serial_list, technician, reason, notes, severity) VALUES
('AUDIT-001','LẮP ĐẶT MỚI','2025-08-15 10:00:00+07','SET-2024-001','NPP-HN-001','Nhà Phân Phối Sơn Minh Phát','Satint A2: ST-A2-99801 | Shaker: MIX-ST-1001 | PC: PC-AIO-2024-01 | Printer: QL700-SN-8801','Nguyễn Văn Hùng','Lắp mới bộ máy pha màu chuẩn cho NPP độc quyền Hà Nội','NPP đã tự chuẩn bị Ổn áp Lioa 2000VA. Máy vận hành chạy thử 50L sơn mượt mà.','INFO'),
('AUDIT-002','LẮP ĐẶT MỚI','2025-08-01 14:30:00+07','SET-2024-002','NPP-HN-002','Đại Lý Sơn Hoàn Mỹ','Hero: HERO-EU-5541 | Shaker: MIX-AI88-882 | PC: PC-CASE-1092 | Printer: QL700-SN-8802','Lê Thanh Tùng','Cấp phát hệ máy Hero Eurotint cho đại lý Cầu Giấy','Kỹ thuật viên bàn giao đầy đủ đĩa driver và hướng dẫn dùng phần mềm ColorExpert 2.','INFO'),
('AUDIT-003','THU HỒI','2025-02-10 16:00:00+07','SET-2023-005','NPP-KH-001','Đại Lý Sơn Nha Trang Green','Hero: HERO-EU-6620 | Shaker: YSA-2A-332 | PC: PC-AIO-2023-05 | Printer: QL700-SN-8805','Phạm Văn Minh','Thu hồi toàn bộ thiết bị do NPP ngưng hợp tác phân phối','Đã thu hồi về kho Nha Trang. Ghi nhận máy chiết hỏng 2 ống tinh màu do không súc rửa.','WARNING'),
('AUDIT-004','BẢO TRÌ / SỬA CHỮA','2026-05-20 09:15:00+07','SET-2024-004','NPP-HP-001','Công Ty TNHH Vật Liệu Hải Phòng','Satint A2: ST-A2-99804','Nguyễn Văn Hùng','Bảo trì định kỳ 1 năm & vệ sinh cụm pít-tông bơm chiết','Thay mới 2 ron cao su đầu chiết. Đã cập nhật phần mềm ColorExpert 2 bản v2.8.0.','INFO')
ON CONFLICT (id) DO NOTHING;
