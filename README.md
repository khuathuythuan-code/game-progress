# Trang báo cáo tiến độ game

Trang web tĩnh (HTML/CSS/JS thuần), không cần cài đặt hay build.

## Cấu trúc

```
index.html   – khung trang
style.css    – giao diện
app.js       – logic (render, chế độ xem/sửa, nhận xét, xuất dữ liệu)
data.js      – ⭐ TOÀN BỘ nội dung: sửa file này khi cập nhật
images/      – ảnh game (hiện là ảnh mẫu .svg, thay bằng .png/.jpg của bạn)
```

## Hai chế độ

- **Chế độ xem** (mặc định, dành cho sếp): gọn, không có nút sửa/xóa.
- **Chế độ chỉnh sửa**: bấm "Chỉnh sửa trang này" ở cuối trang (hoặc mở link có `?edit`).
  Cho phép tích việc, thêm/xóa việc, xóa game, xóa nhận xét, chỉnh % tiến độ.
  Thay đổi chỉ lưu trên trình duyệt của bạn. Muốn giữ lâu dài: bấm **Sao chép dữ liệu**
  rồi dán đè vào `data.js`. Mọi thao tác xóa đều có nút **Hoàn tác** trong 7 giây.

## Cập nhật nội dung (data.js)

- **Thêm game**: copy một khối game trong `games` của mục cần thêm, đổi `id` (không trùng), tên, mô tả, ảnh...
- **Chuyển mục** (Đang phát triển → Hoàn thành): cắt khối game dán sang mục khác, đặt `progress: 100`.
- **Thêm ảnh**: bỏ file vào `images/`, thêm `{ src: "images/ten-anh.png", caption: "Chú thích" }`.
  Ảnh nên tỉ lệ 16:9 (ví dụ 1280×720), dưới ~300KB mỗi ảnh.
- **Đổi ngày cập nhật**: sửa `updated`.

## Nhận xét theo từng phần giao diện

- **Máy tính**: rê chuột vào bất kỳ phần nào (từng ảnh, tiến độ, mô tả, từng việc, từng link tài liệu,
  tên game). Nút **Nhận xét** hiện ở góc phải, bấm vào để mở bong bóng nhập nhận xét ngay tại chỗ đó.
- **Điện thoại/máy tính bảng**: bấm nút **Nhận xét** trên thanh điều hướng để bật chế độ chọn,
  rồi chạm vào phần muốn nhận xét. Bong bóng hiện ở đáy màn hình.
- Phần nào đã có nhận xét sẽ có vạch màu bên trái (ảnh thì có viền màu), nút hiện kèm số nhận xét.
- Cuối mỗi game còn khung **Nhận xét** chung, hiển thị toàn bộ nhận xét của game đó. Mỗi nhận xét
  theo phần có nhãn "về: ..." để bấm nhảy tới đúng phần đó.

## Nhận xét và thông báo email

Trang tĩnh không có máy chủ, nên nhận xét ban đầu chỉ nằm trên máy người viết.
Để bạn nhận được, có hai cách:

1. **Tự động gửi email (khuyến nghị)**: dùng một dịch vụ form miễn phí. Mỗi nhận xét mới sẽ được
   gửi tới dịch vụ, và dịch vụ chuyển về hộp thư của bạn.
   - **Web3Forms** (web3forms.com, **đang được cấu hình sẵn trong `data.js`**): nhập email của bạn
     để nhận Access Key. Trong `data.js` điền
     `notify: { url: "https://api.web3forms.com/submit", accessKey: "KEY_CỦA_BẠN" }`.
     Khóa này không để lộ email của bạn. Muốn đổi email nhận, vào web3forms.com tạo khóa mới.
   - **FormSubmit** (formsubmit.co, không cần tài khoản): đặt
     `notify.url = "https://formsubmit.co/ajax/<email-của-bạn>"`. Lần gửi đầu tiên FormSubmit gửi email
     **kích hoạt** tới hộp thư đó, bấm xác nhận một lần. Email đó có **chuỗi mã riêng**: nên đổi
     `<email-của-bạn>` thành chuỗi mã, nếu không ai xem mã nguồn trang cũng thấy email của bạn.
   - **Formspree** (formspree.io): tạo một form, xác nhận email, lấy địa chỉ dạng
     `https://formspree.io/f/xxxxxxxx`. Điền `notify: { url: "địa chỉ đó", accessKey: "" }`.
   - Gói miễn phí có giới hạn số thư mỗi tháng, hãy xem trên trang của dịch vụ.
   - Địa chỉ/khóa này nằm trong mã trang nên ai xem mã nguồn cũng thấy. Đây là cách các dịch vụ
     này hoạt động, chúng có chống spam, nhưng đừng dùng cho thông tin nhạy cảm.
2. **Gửi thủ công**: nếu để trống `notify.url`, nút nổi **Gửi nhận xét (n)** sẽ sao chép toàn bộ
   nhận xét (hoặc mở email nếu bạn điền `feedbackEmail`) để người xem dán vào chat/email.

Chỉ có **một email nhận duy nhất**, là email gắn với khóa trong `notify`. Người xem không nhập email nào.

Email bạn nhận gồm: tên người nhận xét, game, phần được nhận xét (ví dụ "Ảnh 2: Bộ sưu tập rồng"),
nội dung, và **một link mở đúng phần đó**: trang tự cuộn tới, viền nổi bật phần được nhận xét và hiện
sẵn nội dung nhận xét trong bong bóng (đánh dấu "từ link email").

Nếu gửi tự động thất bại (mất mạng...), nhận xét vẫn được giữ và nút **Gửi nhận xét** hiện để gửi lại.

Muốn nhận xét của sếp hiện cho mọi người xem, thêm vào mảng `comments` của game trong `data.js`:
`{ id: "cm-9", author: "Sếp", text: "Nội dung", time: "2026-11-20T09:30:00" }`.

## Xem thử trên máy

Mở thẳng `index.html`, hoặc chạy:

```powershell
python -m http.server 8123
```

rồi vào http://localhost:8123

## Deploy miễn phí (khuyến nghị Cloudflare Pages)

### Cách 1 — Cloudflare Pages (cho phép dùng thương mại, repo private được)
1. Đẩy thư mục này lên một repo GitHub.
2. Vào dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git.
3. Chọn repo. Build command: để trống. Output directory: `/` (thư mục gốc).
4. Deploy. Từ đó mỗi lần `git push` trang sẽ tự cập nhật sau ~30 giây.

### Cách 2 — GitHub Pages (chỉ miễn phí với repo public)
1. Đẩy lên repo GitHub public.
2. Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`.
3. Link có dạng `https://<tên-user>.github.io/<tên-repo>/`.

### Cập nhật sau này
```powershell
git add .
git commit -m "Cập nhật tiến độ"
git push
```
