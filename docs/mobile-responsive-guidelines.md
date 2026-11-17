# Hướng dẫn tối ưu giao diện Responsive cho NASUN

Tài liệu này dành cho các developer phát triển hoặc chỉnh sửa giao diện NASUN. Mục tiêu là giữ trải nghiệm nhất quán trên desktop, điện thoại iOS/Android, màn hình có tai thỏ hoặc Dynamic Island, và điện thoại xoay ngang.

## 1. Nguyên tắc nền tảng

1. **Mobile-first về thao tác:** mọi nút quan trọng phải dễ chạm bằng ngón tay, nội dung phải đọc được khi dùng một tay và không phụ thuộc vào hover.
2. **Không để UI bị che bởi hệ thống:** luôn tính đến safe-area của iOS và Android khi dùng phần tử `fixed`, bottom navigation, drawer, toast, FAB hoặc modal.
3. **Không khóa chiều rộng bằng pixel nếu không cần thiết:** dùng `minmax(0, 1fr)`, `min-width: 0`, `max-width: 100%`, `clamp()` và `min()` để tránh tràn ngang.
4. **Giữ nghiệp vụ độc lập với layout:** thay đổi responsive chỉ nên ảnh hưởng trình bày và thao tác; không thay đổi quyền, dữ liệu, trạng thái đồng bộ hoặc logic nghiệp vụ.
5. **Ưu tiên nội dung có thể cuộn:** bảng rộng dùng vùng cuộn ngang có chủ đích; danh sách dài dùng card hoặc load-more trên mobile, không ép toàn bộ bảng co đến mức không đọc được.
6. **Hỗ trợ cả portrait và landscape:** không giả định rằng `width < 768px` luôn đồng nghĩa với điện thoại. Điện thoại xoay ngang có thể báo chiều rộng 800–950px.

## 2. Breakpoint và chế độ hiển thị hiện tại

Các breakpoint chính nằm trong `src/index.css`:

| Chế độ | Điều kiện | Hành vi chính |
| --- | --- | --- |
| Desktop | `min-width: 769px` | Sidebar cố định/sticky, không có bottom navigation. |
| Mobile portrait | `max-width: 768px` | Sidebar dạng drawer, bottom navigation cố định, nội dung có khoảng đệm dưới. |
| Mobile landscape | `orientation: landscape`, `max-height: 600px`, `max-width: 1024px` | Vẫn dùng drawer và bottom navigation; header được thu gọn để tránh tràn ngang. |
| Màn hình cao hoặc tablet | Không rơi vào các điều kiện trên | Dùng layout gần desktop; cần kiểm tra riêng nếu thêm breakpoint mới. |

Không nên sửa riêng một breakpoint mà không kiểm tra các breakpoint còn lại. Đặc biệt, một quy tắc `@media (min-width: 769px)` có thể áp dụng cho điện thoại landscape; block landscape ở cuối `src/index.css` được đặt sau các rule desktop để ghi đè trường hợp này.

## 3. Cấu trúc shell và các file cần biết

| Khu vực | File | Trách nhiệm |
| --- | --- | --- |
| App shell | `src/app/App.jsx` | Sidebar, header, main content, modal và mobile bottom nav. |
| Header | `src/app/components/Header.jsx` | Tiêu đề, tìm kiếm, thông báo, trạng thái online/offline và tiện ích. |
| Sidebar | `src/app/components/Sidebar.jsx` | Navigation desktop và drawer mobile. |
| Bottom nav | `src/app/components/MobileBottomNav.jsx` | Điều hướng nhanh trên màn hình nhỏ, badge và QR shortcut. |
| Style chung | `src/index.css` | Breakpoint, safe-area, modal, form control, card, table và utility responsive. |
| Modal dùng chung | `src/shared/components/BottomSheet.jsx` và các modal trong `src/shared/components/` | Modal desktop và bottom sheet mobile. |
| Màn hình nghiệp vụ | `src/modules/**/components/` | Component của từng module; nên dùng class responsive chung trước khi thêm CSS riêng. |

Khi thêm một màn hình mới, hãy kiểm tra cả ba lớp: shell, component nghiệp vụ và modal/dialog liên quan.

## 4. Safe-area và viewport động

### 4.1. Dùng viewport động

Không nên chỉ dùng `100vh` cho khu vực chiếm toàn màn hình trên mobile. Safari iOS có thể thay đổi chiều cao viewport khi thanh địa chỉ hiện hoặc ẩn. Ưu tiên:

```css
.screen-shell {
  min-height: 100dvh;
}
```

Có thể dùng `100svh` khi cần chiều cao nhỏ ổn định hoặc `100lvh` khi cần chiều cao lớn, nhưng `100dvh` phù hợp với các shell tương tác của NASUN.

### 4.2. Tính safe-area

Với phần tử cố định ở đáy:

```css
.mobile-control-bar {
  height: calc(64px + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

Với nội dung nằm phía trên bottom navigation:

```css
.nasun-workspace {
  padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
}
```

Với header nằm trong vùng tai thỏ:

```css
.main-header {
  padding-top: calc(10px + env(safe-area-inset-top, 0px));
}
```

Không đặt safe-area chỉ cho thanh điều hướng mà quên phần nội dung. Hai phần phải dùng cùng một quy ước để nút cuối danh sách vẫn bấm được.

## 5. Vùng chạm và form trên điện thoại

- Nút thao tác chính nên có `min-height` và `min-width` tối thiểu **48px** trong shell mobile.
- Các control phụ hoặc tab vẫn nên đạt ít nhất **44px**.
- Input/select trên iOS nên có `font-size: 16px` để tránh Safari tự zoom khi focus.
- Không dùng icon đơn độc nếu không có `aria-label` hoặc tooltip phù hợp.
- Không dựa vào hover để hiển thị hành động. Phải có trạng thái focus và active.
- Dùng `-webkit-tap-highlight-color: transparent` khi đã có phản hồi active riêng.
- Không dùng `transform: scale()` quá mạnh cho button; thao tác chạm không được làm layout nhảy hoặc khiến người dùng bấm hụt.

Ví dụ control đúng:

```css
.mobile-action {
  min-width: 48px;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 768px) {
  .form-input,
  .form-select {
    min-height: 48px;
    font-size: 16px;
    min-width: 0;
    max-width: 100%;
  }
}
```

## 6. Sidebar drawer và khóa cuộn nền

Trên mobile, `Sidebar` được hiển thị như drawer khi `isOpen=true`. Khi drawer mở:

- Phải có backdrop nằm trên nội dung nhưng dưới drawer.
- Drawer phải có `height: 100dvh`, vùng nav riêng có thể cuộn và padding safe-area phía dưới.
- Không để trang phía sau tiếp tục cuộn khi người dùng vuốt trong drawer.
- Nút đóng và các mục menu phải có vùng chạm đủ lớn.
- Khi chọn một mục, drawer nên đóng ngay để người dùng thấy màn hình mới.

`App.jsx` hiện khóa `document.body` khi drawer mở. Nếu thay đổi cơ chế drawer, cần giữ cleanup để khôi phục `overflow` và `overscrollBehavior`, kể cả khi component unmount hoặc chuyển route.

Không nên đặt `overflow: hidden` vĩnh viễn trên `body`; điều đó sẽ phá scroll desktop và có thể làm mất vị trí cuộn sau khi đóng drawer.

## 7. Bottom navigation

`MobileBottomNav` là navigation cố định ở cạnh dưới. Khi sửa component này:

- Giữ `z-index` thấp hơn modal và drawer nhưng cao hơn nội dung.
- Tính `env(safe-area-inset-bottom)` trong cả chiều cao và padding.
- Nội dung chính phải có padding-bottom lớn hơn hoặc bằng chiều cao thực tế của nav.
- Nếu thêm mục mới, kiểm tra layout 5, 6 và 7 cột; tránh label dài làm vỡ hàng.
- Badge không được chặn thao tác với icon (`pointer-events: none`).
- Trạng thái đang chọn phải thể hiện bằng màu, icon hoặc indicator; không chỉ dựa vào animation.
- QR shortcut phải có `aria-label` rõ ràng và không che label của mục kế bên.

Với màn hình rất thấp ở landscape, label có thể dùng font nhỏ hơn, nhưng không được ẩn hành động quan trọng chỉ vì thiếu chiều cao.

## 8. Header và thông báo

Header trên mobile cần được xem như một vùng layout riêng:

- Portrait: tiêu đề và search có thể xếp thành hai hàng.
- Landscape: nên thu gọn thành một hàng, giới hạn chiều rộng tiêu đề và search.
- Các CTA ít dùng có thể đưa vào menu tiện ích; không xóa chức năng mà không cung cấp đường dẫn khác.
- Notification popup phải có `max-height` theo `100dvh`, `overflow-y: auto` và không bị bottom nav che.
- Không đặt popup tuyệt đối theo một `top` cố định nếu header có safe-area hoặc thay đổi chiều cao; dùng `calc()` và kiểm tra lại trên landscape.

Nếu thêm nội dung vào header, hãy kiểm tra tối thiểu các kích thước: `375×812`, `393×852`, `667×375`, `844×390` và `932×430`.

## 9. Modal, bottom sheet và bàn phím

Trên mobile, modal hiện được căn về cạnh dưới để thao tác gần ngón tay hơn. Quy tắc khuyến nghị:

```css
@media (max-width: 768px) {
  .modal-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .modal-content {
    width: 100%;
    max-width: 100%;
    max-height: 92dvh;
    overflow-y: auto;
    border-radius: 20px 20px 0 0;
    padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  }
}
```

Khi chỉnh form trong modal:

- Footer chứa nút lưu/hủy nên sticky nếu body modal dài.
- Footer phải có safe-area padding.
- Không đặt nút hành động bên ngoài vùng scroll mà người dùng không thể nhìn thấy sau khi bàn phím mở.
- Không dùng `100vh` cho modal; dùng `dvh` hoặc `max-height` theo viewport động.
- Khi có bảng hoặc diff dài, chỉ vùng nội dung nên cuộn; tránh cuộn cả overlay và body cùng lúc.

## 10. Bảng, card và nội dung dài

Trên màn hình nhỏ, ưu tiên card list cho dữ liệu có ít cột nhưng nhiều hành động. Với bảng bắt buộc giữ dạng bảng:

```css
.data-table-container {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
}
```

Checklist chống tràn ngang:

- Parent flex/grid có `min-width: 0`.
- Chuỗi mã, serial và error message dùng `overflow-wrap: anywhere` hoặc `word-break` có kiểm soát.
- Button group dùng `flex-wrap: wrap`.
- Không đặt `min-width` lớn trên card mobile.
- Ảnh dùng `max-width: 100%; height: auto`.
- Nội dung copy dài không làm tăng chiều rộng viewport.

Không nên cắt serial hoặc mã nghiệp vụ bằng ellipsis nếu người dùng cần copy; hãy cho phép wrap hoặc cung cấp hành động copy riêng.

## 11. Touch, scroll và gesture

- Dùng `touch-action: pan-y` cho card có swipe ngang nhưng vẫn cần scroll dọc.
- Dùng `overscroll-behavior: contain` cho drawer, bottom nav và vùng scroll độc lập.
- Không dùng `touch-action: none` trên vùng nội dung; chỉ dùng cho backdrop hoặc gesture có kiểm soát.
- Pull-to-refresh không được kích hoạt khi người dùng đang kéo trong modal, drawer hoặc bảng ngang.
- Không coi `navigator.userAgent` là cách duy nhất để nhận diện mobile; layout nên dựa vào media query và khả năng tương tác.
- Các animation phải tắt hoặc giảm khi `prefers-reduced-motion: reduce`.

## 12. Accessibility và khả năng sử dụng

Mọi thay đổi responsive phải giữ:

- `aria-label` cho icon button.
- `aria-current="page"` cho mục navigation hiện tại.
- `aria-expanded` cho menu/drawer hoặc notification mở rộng.
- Focus ring nhìn thấy được khi điều hướng bằng bàn phím hoặc switch control.
- Contrast đủ giữa text, background và trạng thái disabled.
- Không truyền thông tin chỉ bằng màu.
- Thứ tự focus hợp lý khi modal mở; focus không được rơi vào nội dung bị che phía sau.

Thiết bị mobile có thể dùng VoiceOver hoặc TalkBack, vì vậy label ngắn và mô tả hành động cụ thể quan trọng hơn tên class hoặc icon.

## 13. Quy trình kiểm thử trước khi merge

### 13.1. Kiểm tra tự động

Chạy từ thư mục gốc:

```bash
npm ci
npm run lint
npm run build
git diff --check
```

Nếu thay đổi ảnh hưởng logic dữ liệu hoặc module nghiệp vụ, chạy thêm test phù hợp, tối thiểu:

```bash
npm run test:all
```

Lint hiện có thể báo warning cũ của dự án. Không được bỏ qua **error** mới; warning cần được ghi rõ nếu thay đổi có chủ đích.

### 13.2. Ma trận viewport tối thiểu

| Thiết bị giả lập | Kích thước gợi ý | Điều cần kiểm tra |
| --- | ---: | --- |
| iPhone nhỏ portrait | `375×812` | Header, search, form, bottom nav, modal. |
| iPhone hiện đại portrait | `393×852` | Safe-area, notification và FAB. |
| Android portrait | `412×915` | Card, bảng, keyboard và drawer. |
| iPhone landscape | `667×375` | Header một hàng, bottom nav, modal thấp. |
| iPhone lớn landscape | `844×390` | Không chuyển nhầm sang desktop sidebar. |
| Android landscape | `915×412` | Không tràn search/header và menu 7 cột. |
| Tablet nhỏ | `768×1024` | Ranh giới mobile/desktop. |
| Desktop | `1280×720` | Sidebar desktop, không xuất hiện bottom nav. |

### 13.3. Checklist thao tác thực tế

- Mở và đóng drawer bằng hamburger, backdrop và nút close.
- Vuốt trong drawer; xác nhận trang phía sau không cuộn.
- Chuyển qua tất cả mục bottom navigation.
- Mở notification và cuộn danh sách cảnh báo.
- Mở modal dài, focus input, bật bàn phím và đóng bàn phím.
- Nhập serial/mã dài và kiểm tra không có scroll ngang toàn trang.
- Tắt mạng, tạo bản nháp hoặc thao tác chờ gửi; kiểm tra thanh trạng thái không che nội dung.
- Xoay từ portrait sang landscape khi đang mở drawer, modal và notification.
- Kiểm tra VoiceOver/TalkBack cho các icon button chính.
- Bật reduced motion và xác nhận animation không cản trở thao tác.

## 14. Quy tắc khi thêm hoặc sửa CSS

### Nên làm

- Đặt class semantic theo component, ví dụ `.asset-inventory-toolbar`.
- Dùng biến màu và spacing có sẵn trong `:root`.
- Đặt rule responsive gần nhóm component liên quan hoặc trong block responsive chung có chú thích.
- Dùng `min-width: 0` trong flex/grid item có text dài.
- Dùng `clamp()`, `min()`, `max()` và `env()` khi layout phụ thuộc viewport.
- Kiểm tra cả portrait và landscape trước khi merge.

### Không nên làm

- Không thêm `!important` hàng loạt để chữa một selector sai; xác định nguồn xung đột trước.
- Không thêm breakpoint mới chỉ dựa trên một thiết bị.
- Không dùng `overflow: hidden` trên `body` mà không có cleanup.
- Không đặt `height: 100vh` làm giá trị duy nhất cho drawer hoặc full-screen modal.
- Không đặt width cố định cho header search, card hoặc dialog trên mobile.
- Không ẩn chức năng quan trọng trên mobile nếu chưa có đường dẫn thay thế.
- Không sửa CSS mobile bằng cách thay đổi dữ liệu, quyền hoặc state của module.

## 15. Quy trình review pull request

PR có thay đổi giao diện responsive nên mô tả:

1. Component và breakpoint bị ảnh hưởng.
2. Hành vi portrait và landscape trước/sau thay đổi.
3. Có dùng safe-area, `dvh`, drawer lock hoặc modal behavior hay không.
4. Viewport đã kiểm tra và kết quả.
5. Ảnh chụp trước/sau nếu thay đổi layout trực quan.
6. Các warning hoặc giới hạn chưa xử lý.

Reviewer cần kiểm tra cả desktop regression. Một thay đổi mobile được xem là hoàn tất khi không làm xuất hiện bottom nav trên desktop, không làm sidebar desktop biến thành drawer ngoài ý muốn và không che mất nút cuối cùng trên màn hình nhỏ.

## 16. Tham chiếu nhanh

- Shell: `src/app/App.jsx`
- Responsive CSS: `src/index.css`
- Mobile navigation: `src/app/components/MobileBottomNav.jsx`
- Drawer: `src/app/components/Sidebar.jsx`
- Header: `src/app/components/Header.jsx`
- Modal/bottom sheet: `src/shared/components/BottomSheet.jsx`
- PWA metadata: `index.html` và `public/manifest.json`
- Build kiểm tra: `npm run lint` và `npm run build`
