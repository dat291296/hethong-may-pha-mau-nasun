/**
 * Dữ liệu Mẫu Mã Lỗi, Quy trình Thao tác Chuẩn (SOPs) và Mẹo Thực địa
 * Phục vụ Sổ tay Kỹ thuật viên & Tra cứu Sự cố Máy Pha Màu Nasun
 */

export const ERROR_CODES_DATA = [
  {
    id: 'ERR-E01',
    code: 'E-01',
    title: 'Lỗi kẹt Pít-tông chiết màu (Piston Jamming)',
    category: 'Máy chiết',
    machineModel: 'Satint A2',
    severity: 'HIGH', // LIGHT | MEDIUM | HIGH | CRITICAL
    symptoms: [
      'Máy phát tiếng kêu cạch cạch khi đẩy màu',
      'Lượng màu chiết ra bị thiếu hoặc không xả màu',
      'Đèn báo lỗi đỏ chớp 3 lần trên bảng điều khiển'
    ],
    rootCause: 'Sơn bị vón cục do lâu ngày không khuấy, cặn sơn bám dính xy-lanh pít-tông hoặc khô keo van chiết.',
    actionSteps: [
      'Tắt nguồn máy chiết Satint A2 và ngắt kết nối điện áp.',
      'Dùng dung môi sục rửa chuyên dụng bơm vào ống xi-lanh để làm mềm cặn sơn.',
      'Tháo van điều hướng xoay nhẹ trục pít-tông bằng tay quay kỹ thuật.',
      'Vệ sinh kỹ zoăng cao su (seal) pít-tông, bôi mỡ màng thực phẩm/chịu nhiệt chuyên dụng.',
      'Bật máy, thực hiện chiết thử 50ml dung môi để kiểm tra độ trơn mượt.'
    ],
    preventiveMaintenance: 'Cài đặt chế độ tự động khuấy sơn (Agitation) 15 phút/lần trong phần mềm pha màu Nasun Agent.',
    author: 'KTV. Nguyễn Văn Hùng'
  },
  {
    id: 'ERR-E04',
    code: 'E-04',
    title: 'Lỗi lệch góc van chiết xoay (Rotary Valve Miss-position)',
    category: 'Máy chiết',
    machineModel: 'Satint AIO',
    severity: 'CRITICAL',
    symptoms: [
      'Màu chiết bị phun lệch sang hũ màu bên cạnh',
      'Phần mềm báo "Valve Position Error (E04)"',
      'Đầu chiết không xoay đúng vị trí can màu yêu cầu'
    ],
    rootCause: 'Cảm biến quang (Optocoupler/Encoder) đĩa van bị bám bụi sơn hoặc dây cáp tín hiệu đĩa xoay bị lỏng.',
    actionSteps: [
      'Ngắt nguồn điện máy chiết AIO.',
      'Tháo nắp bảo vệ đĩa xoay van chiết phía dưới.',
      'Dùng cồn Isopropyl 99% và chổi mềm vệ sinh sạch đĩa đọc mã vạch encoder & mắt đọc cảm biến quang.',
      'Kiểm tra giắc cắm tín hiệu từ đĩa van về bo mạch chính Mainboard.',
      'Cắm lại nguồn, dùng công cụ Diagnostic Tool để Set Home Position cho van chiết.'
    ],
    preventiveMaintenance: 'Vệ sinh đĩa van xoay định kỳ 3 tháng/lần, tránh để sơn nhỏ giọt vào hốc đĩa đọc.',
    author: 'KTV. Trần Đình Long'
  },
  {
    id: 'ERR-E12',
    code: 'E-12',
    title: 'Lỗi nghẹt đầu vòi xả màu (Nozzle Clogging)',
    category: 'Máy chiết',
    machineModel: 'Satint A2-100',
    severity: 'MEDIUM',
    symptoms: [
      'Màu phun thành tia xiên hoặc bị đứt đoạn',
      'Đầu vòi chiết có đốm sơn khô đóng cục',
      'Độ chính xác mL màu bị sai số > 5%'
    ],
    rootCause: 'Đại lý không đậy nắp đĩa ẩm (Sponge cap), làm không khí khô gây đông cứng màng sơn tại vòi chiết.',
    actionSteps: [
      'Dùng kim khơi chuyên dụng kỹ thuật đẩy nhẹ cặn khô tại đầu vòi chiết.',
      'Tháo miếng xốp giữ ẩm vòi chiết, ngâm vào nước ấm hoặc dung môi rửa.',
      'Thực hiện lệnh "Purge/Sục rửa" 5ml màu qua vòi bị nghẹt trên phần mềm.',
      'Nhắc nhở đại lý châm bổ sung nước làm ẩm vào khay giữ ẩm vòi chiết hàng ngày.'
    ],
    preventiveMaintenance: 'Thay miếng xốp ẩm vòi chiết 6 tháng/lần, luôn duy trì độ ẩm đĩa che vòi.',
    author: 'KTV. Lê Minh Tuấn'
  },
  {
    id: 'ERR-COM01',
    code: 'COM_TIMEOUT',
    title: 'Lỗi mất kết nối Phần mềm Nasun Agent với Máy Chiết',
    category: 'Phần mềm',
    machineModel: 'Case máy tính',
    severity: 'HIGH',
    symptoms: [
      'Phần mềm Nasun Agent hiện thông báo "Cannot connect to Dispenser (COM Port Timeout)"',
      'Không bấm được nút "Chiết màu" từ máy tính',
      'Biểu tượng kết nối máy chiết trên thanh trạng thái báo màu đỏ 🔴'
    ],
    rootCause: 'Cáp chuyển đổi USB-to-RS232 bị lỏng, Driver FTDI/CH340 bị lỗi hoặc cổng COM bị đổi số thứ tự sau khi Windows update.',
    actionSteps: [
      'Mở Device Manager trên Windows (nhấn Win+X -> Device Manager).',
      'Kiểm tra mục "Ports (COM & LPT)", xác định số cổng COM hiện tại (VD: COM3 hoặc COM4).',
      'Nếu xuất hiện dấu chấm cảm vàng tại driver USB Serial, tải & cài lại Driver FTDI v2.12.',
      'Vào Cài đặt trong Phần mềm Nasun Agent -> Chọn lại đúng tên Cổng COM -> Nhấn "Test Connect".',
      'Thay cáp chuyển đổi USB-RS232 có bọc kim chống nhiễu nếu cổng nối chập chờn.'
    ],
    preventiveMaintenance: 'Cố định dây cáp RS232 vào thùng máy PC bằng dây thít, tránh co kéo dứt cáp.',
    author: 'KTV. Nguyễn Văn Hùng'
  },
  {
    id: 'ERR-MIX01',
    code: 'MIX_NOISE',
    title: 'Lỗi máy lắc phát tiếng rung rung lớn & kẹt lon sơn',
    category: 'Máy lắc',
    machineModel: 'Khác / Linh kiện',
    severity: 'HIGH',
    symptoms: [
      'Máy lắc nhảy chồm chồm khi vận hành',
      'Tay kẹp lon sơn không siết chặt được lon 18L',
      'Mùi khét nhẹ từ dây curoa truyền động'
    ],
    rootCause: 'Dây curoa bị trùng hoặc sần sùi, trục ren kẹp lon bị khô mỡ màng hoặc đệm cao su chân máy bị nứt gãy.',
    actionSteps: [
      'Tháo nắp hông máy lắc, kiểm tra độ căng dây curoa (độ võng cho phép 5-10mm).',
      'Dùng cờ-lê nắn lại vị trí Puli động cơ để tăng căng dây curoa.',
      'Vệ sinh hai trục ren siết kẹp lon, bôi mỡ bò chịu lực mầu bò/trắng.',
      'Kiểm tra 4 chân cao su giảm chấn đế máy, thay mới nếu bị mục nứt.'
    ],
    preventiveMaintenance: 'Bảo dưỡng tra mỡ trục siết máy lắc định kỳ 3 tháng/lần.',
    author: 'KTV. Phạm Quốc Bảo'
  },
  {
    id: 'ERR-CAL01',
    code: 'CALIB_FAIL',
    title: 'Lỗi sai số định lượng pha màu (Scale Test Error)',
    category: 'Máy chiết',
    machineModel: 'Satint A2',
    severity: 'HIGH',
    symptoms: [
      'Chênh lệch trọng lượng màu chiết ra so với công thức > 1.5%',
      'Sơn pha ra bị lệch tông màu (Ví dụ: Nhạt màu hơn mẫu chuẩn)',
      'Kết quả cân thử nghiệm 1/32oz bị âm hoặc quá tải'
    ],
    rootCause: 'Tỷ trọng sơn (Specific Gravity - SG) trong phần mềm khai báo sai, hoặc Pít-tông mòn cơ khí.',
    actionSteps: [
      'Dùng cân tiểu ly điện tử độ chính xác 0.01g.',
      'Vào mục Calibration trên Nasun Agent Software.',
      'Thực hiện chiết mẫu 1/32 oz (hoặc 1ml) của từng hộp màu vào cốc nghiệm.',
      'Nhập khối lượng thực tế cân được vào phần mềm để tự động tính lại hệ số Pulses/mL.',
      'Cập nhật lại bảng Tỷ trọng sơn (SG g/ml) chuẩn theo tài liệu Nasun Paint.'
    ],
    preventiveMaintenance: 'Hiệu chuẩn (Calibration) định kỳ 6 tháng/lần hoặc mỗi khi thay đợt màu tint mới.',
    author: 'KTV. Trần Đình Long'
  }
];

export const TECHNICAL_SOPS_DATA = [
  {
    id: 'SOP-01',
    title: 'Quy trình Cân chỉnh Định lượng (Calibration) Máy Chiết Sơn',
    machineType: 'Máy chiết (Satint A2, AIO, Hero)',
    duration: '30 phút',
    toolsRequired: ['Cân tiểu ly 0.01g', 'Cốc nghiệm nhựa', 'Máy tính cài Nasun Agent', 'Bảng Tỷ Trọng Sơn Nasun'],
    steps: [
      {
        stepNumber: 1,
        title: 'Bật máy & Làm ấm ống chiết',
        desc: 'Khởi động máy chiết 10 phút trước khi cân chỉnh. Thực hiện sục rửa (Purge) 2ml mỗi hộp màu để xả bọt khí.'
      },
      {
        stepNumber: 2,
        title: 'Đặt cân tiểu ly & Tare chuẩn',
        desc: 'Đặt cốc nghiệm lên cân tiểu ly điện tử 0.01g, nhấn nút TARE về 0.00g.'
      },
      {
        stepNumber: 3,
        title: 'Phát lệnh chiết thử mẫu',
        desc: 'Trên phần mềm Nasun Agent -> Chọn mục Kỹ thuật Calibration -> Chọn hộp màu (VD: Black/Red/Yellow) -> Chiết 1/32 oz (hoặc 1 Y).'
      },
      {
        stepNumber: 4,
        title: 'Nhập số liệu & Đồng bộ hệ số',
        desc: 'Cân khối lượng thực tế thu được (đơn vị gram). Nhập số gram vào phần mềm. Hệ số Pulse/mL sẽ tự động điều chỉnh.'
      },
      {
        stepNumber: 5,
        title: 'Chiết kiểm tra lại',
        desc: 'Lặp lại lệnh chiết mẫu 1Y. Sai số đạt chuẩn nếu nằm trong khoảng ± 1.0%.'
      }
    ]
  },
  {
    id: 'SOP-02',
    title: 'Quy trình Lắp đặt & Bàn giao Bộ Máy Pha Màu cho Đại lý Mới',
    machineType: 'Bộ máy hoàn chỉnh (Chiết + Lắc + PC + Ổn áp)',
    duration: '90 phút',
    toolsRequired: ['Đồng hồ đo điện vạn năng', 'Máy in tem QL700', 'Ổn áp Lioa 2KVA', 'Bộ tua-vít kỹ thuật'],
    steps: [
      {
        stepNumber: 1,
        title: 'Kiểm tra nguồn điện & Lắp Ổn áp',
        desc: 'Dùng đồng hồ đo điện áp ổ cắm đại lý. Bắt buộc cắm máy chiết & máy tính qua Ổn áp Lioa 2KVA (Điện áp ra 220V ± 5%).'
      },
      {
        stepNumber: 2,
        title: 'Kê thăng bằng & Tháo chốt khóa hành trình',
        desc: 'Đặt máy chiết trên mặt phẳng chắc chắn. Tháo bỏ chốt đai ốc bảo vệ hành trình khi vận chuyển (Transport Locks).'
      },
      {
        stepNumber: 3,
        title: 'Kết nối Máy tính & Cài đặt Nasun Agent',
        desc: 'Cắm cáp USB-RS232. Cài đặt bản phần mềm Nasun Agent mới nhất. Khai báo mã NPP và cập nhật cây công thức sơn.'
      },
      {
        stepNumber: 4,
        title: 'Nạp màu gốc & Chạy Agitation',
        desc: 'Đổ sơn tinh màu vào các hũ chứa. Bật tính năng khuấy tự động 15 phút/lần. Kiểm tra không bị rò rỉ van.'
      },
      {
        stepNumber: 5,
        title: 'Pha thử 1 lon màu mẫu & Hướng dẫn Đại lý',
        desc: 'Pha lon màu thực tế 1L. Hướng dẫn chủ đại lý cách đậy nắp khay nước làm ẩm vòi chiết và thao tác phần mềm.'
      }
    ]
  },
  {
    id: 'SOP-03',
    title: 'Quy trình Vệ sinh & Sục rửa Cụm Van Pít-tông bị Khô Sơn',
    machineType: 'Máy chiết Satint / Hero / D200',
    duration: '45 phút',
    toolsRequired: ['Dung môi sục rửa rửa sơn', 'Xi-lanh kỹ thuật 50ml', 'Mỡ bôi trơn cao su', 'Bộ lục giác'],
    steps: [
      {
        stepNumber: 1,
        title: 'Hút bớt sơn trong hũ chứa',
        desc: 'Dùng ống hút dồn lượng sơn tinh màu trong hũ bị sự cố về can tạm.'
      },
      {
        stepNumber: 2,
        title: 'Bơm dung môi rửa làm mềm sơn khô',
        desc: 'Đổ 200ml dung môi rửa cặn màu vào hũ chứa. Dùng phần mềm phát lệnh Purge liên tục 10 lần.'
      },
      {
        stepNumber: 3,
        title: 'Tháo pít-tông vệ sinh thủ công',
        desc: 'Dùng lục giác tháo xi-lanh pít-tông bị kẹt. Ngâm trong dung môi 15 phút rồi lau sạch màng sơn cứng.'
      },
      {
        stepNumber: 4,
        title: 'Tra mỡ & Lắp lại',
        desc: 'Thoa lớp mỡ trơn chịu nhiệt lên zoăng pít-tông. Lắp lại vào thân van, siết ốc đối ứng cân bằng.'
      }
    ]
  }
];

export const FIELD_TIPS_DATA = [
  {
    id: 'TIP-01',
    title: 'Mẹo xử lý nhanh máy chiết bị treo kết nối RS232 khi trời nồm ẩm',
    author: 'KTV. Nguyễn Văn Hùng',
    date: '2026-07-20',
    tags: ['Cổng COM', 'Độ ẩm', 'Trượt tín hiệu'],
    content: 'Tại các đại lý miền Bắc mùa nồm ẩm, đầu giắc RS232 9-pin rất dễ bị oxy hóa chân sạc. Khi đến thực địa máy báo COM Timeout, thay vì cài lại phần mềm, KTV chỉ cần dùng bình xịt 3M RP7/WD-40 xịt nhẹ vào cổng RS232 đực-cái và cắm rút 5-6 lần là tín hiệu truyền ổn định ngay.'
  },
  {
    id: 'TIP-02',
    title: 'Xử lý tiếng rít chói tai từ động cơ khuấy sơn máy Satint A2',
    author: 'KTV. Trần Đình Long',
    date: '2026-07-15',
    tags: ['Động cơ khuấy', 'Tiếng ồn', 'Bảo dưỡng'],
    content: 'Động cơ khuấy sơn chạy lâu năm bị dính bụi sơn bám vào bạc đạn (vòng bi) phía trên cùng. Dùng xi-lanh bơm 2-3 giọt dầu nhớt máy may 10W vào kẽ vòng bi trục khuấy, khởi động chế độ Agitation 5 phút là máy chạy mượt êm ru.'
  },
  {
    id: 'TIP-03',
    title: 'Khắc phục nhanh máy in tem QL700 bị lệch lề tem đĩa màu',
    author: 'KTV. Lê Minh Tuấn',
    date: '2026-07-02',
    tags: ['Máy in QL700', 'In tem màu', 'Lệch lề'],
    content: 'Khi tem in ra bị lệch chéo lề, hãy kiểm tra 2 gờ nhựa kẹp cuộn giấy inside thân máy QL700. Nếu gờ bị xô lệch, nhấn chốt lò xo gạt sát mép cuộn giấy 62mm. Sau đó bấm nút Feed trên máy in 1 lần để máy tự canh lề con cảm biến.'
  }
];
