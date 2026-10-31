import React from 'react';
import { Printer, X } from 'lucide-react';

export default function HandoverPrintModal({ protocolData, onClose }) {
  if (!protocolData) return null;

  const { set, npp, mode, technician, date, notes, reason, photos } = protocolData;

  const handlePrint = () => {
    window.print();
  };

  const title = mode === 'WITHDRAW' ? 'BIÊN BẢN THU HỒI THIẾT BỊ MÁY PHA MÀU' : 'BIÊN BẢN BÀN GIAO LẮP ĐẶT HỆ THỐNG MÁY PHA MÀU';

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px', background: '#fff', color: '#000' }}>
        
        {/* Modal Header Actions (No Print) */}
        <div className="modal-header no-print" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ fontWeight: '800', color: '#0f172a' }}>Xem Trước Biên Bản Bàn Giao / Thu Hồi</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary btn-sm" onClick={handlePrint}>
              <Printer size={16} />
              <span>In Biên Bản Ngay</span>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="modal-body printable-document" style={{ padding: '36px', fontFamily: 'Times New Roman, serif', color: '#000', lineHeight: 1.6 }}>
          
          {/* Company Title */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', textTransform: 'uppercase' }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
            <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>Độc lập - Tự do - Hạnh phúc</div>
            <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>----------***----------</div>
          </div>

          <h2 style={{ textAlign: 'center', fontSize: '1.4rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '20px', marginTop: '10px' }}>
            {title}
          </h2>

          <div style={{ fontStyle: 'italic', textAlign: 'center', marginBottom: '20px' }}>
            Hôm nay, ngày {date ? date.split('-')[2] : '...'} tháng {date ? date.split('-')[1] : '...'} năm {date ? date.split('-')[0] : '...'}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <p><strong>BÊN A (BÊN BÀN GIAO / ĐƠN VỊ PHÁT HÀNH MÁY):</strong></p>
            <p>- Đại diện: <strong>Công Ty Sơn & Thiết Bị Máy Pha Màu Trung Tâm</strong></p>
            <p>- Kỹ thuật viên thực hiện: <strong>{technician || 'Nguyễn Văn Hùng'}</strong></p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <p><strong>BÊN B (BÊN NHẬN / NHÀ PHÂN PHỐI):</strong></p>
            <p>- Tên Nhà Phân Phối: <strong>{npp ? npp.name : set ? set.nppName : '...................................................'}</strong></p>
            <p>- Số điện thoại: <strong>{npp ? npp.phone : '...................................................'}</strong></p>
            <p>- Địa chỉ: <strong>{npp ? npp.address : '...................................................'}</strong></p>
            {npp && npp.locationCoordinates && (
              <p>- Vị trí GPS: <strong>📍 {npp.locationCoordinates}</strong></p>
            )}
          </div>

          <p style={{ fontWeight: 'bold', marginBottom: '10px' }}>
            Hai bên cùng nhau tiến hành kiểm tra và ký biên bản với nội dung chi tiết thiết bị thuộc Bộ Máy <u>[{set ? set.setCode : '.....'}]</u> như sau:
          </p>

          {/* Table of Equipment */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '0.95rem' }} border="1" cellPadding="8">
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th>STT</th>
                <th>Tên Thiết Bị / Loại Máy</th>
                <th>Model / Thương Hiệu</th>
                <th>Số Seri (Serial Number)</th>
                <th>Tình Trạng Thiết Bị</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: 'center' }}>1</td>
                <td><strong>Máy Chiết Sơn</strong></td>
                <td>{set ? set.dispenserModel : ''}</td>
                <td style={{ fontFamily: 'monospace' }}>{set ? set.dispenserSerial : ''}</td>
                <td>Đang hoạt động tốt</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'center' }}>2</td>
                <td><strong>Máy Lắc Sơn</strong></td>
                <td>{set ? set.mixerModel : ''}</td>
                <td style={{ fontFamily: 'monospace' }}>{set ? set.mixerSerial : ''}</td>
                <td>Đang hoạt động tốt</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'center' }}>3</td>
                <td><strong>Máy Tính Điều Khiển</strong></td>
                <td>{set ? `${set.pcType} (${set.pcOs})` : ''}</td>
                <td style={{ fontFamily: 'monospace' }}>{set ? set.pcSerial : ''}</td>
                <td>Đã cài đặt phần mềm pha màu</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'center' }}>4</td>
                <td><strong>Máy In Tem</strong></td>
                <td>QL700</td>
                <td style={{ fontFamily: 'monospace' }}>{set ? set.printerSerial : ''}</td>
                <td>In tem tem nhãn sắc nét</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'center' }}>5</td>
                <td><strong>Ổn Áp Điện</strong></td>
                <td>{set ? set.stabilizer : 'NPP tự mua trang bị'}</td>
                <td>N/A</td>
                <td>Ghi nhận tại địa điểm lắp đặt</td>
              </tr>
            </tbody>
          </table>

          {reason && (
            <p style={{ marginBottom: '10px' }}>
              <strong>Lý do tác nghiệp:</strong> {reason}
            </p>
          )}

          {notes && (
            <p style={{ marginBottom: '20px' }}>
              <strong>Ghi chú / Cam kết:</strong> {notes}
            </p>
          )}

          {/* Render Attached Photos */}
          {photos && photos.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>Hình ảnh hiện trường lắp đặt / thu hồi thực tế:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {photos.map((url, idx) => (
                  <div key={idx} style={{ height: '110px', border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
                    <img src={url} alt="Hiện trường" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ marginTop: '10px' }}>
            Biên bản được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản làm căn cứ quản lý tài sản.
          </p>

          {/* Signatures */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', textAlign: 'center' }}>
            <div>
              <p style={{ fontWeight: 'bold' }}>ĐẠI DIỆN BÊN A</p>
              <p style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>(Ký & ghi rõ họ tên)</p>
              <div style={{ height: '70px' }}></div>
              <p style={{ fontWeight: 'bold' }}>{technician || 'Nguyễn Văn Hùng'}</p>
            </div>
            <div>
              <p style={{ fontWeight: 'bold' }}>ĐẠI DIỆN BÊN B (NHÀ PHÂN PHỐI)</p>
              <p style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>(Ký & đóng dấu nếu có)</p>
              <div style={{ height: '70px' }}></div>
              <p style={{ fontWeight: 'bold' }}>{npp ? npp.contactPerson || npp.name : 'Đại diện NPP'}</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
