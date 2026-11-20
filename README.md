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

## Thanh trên cùng, lọc game, cuộn lên đầu
- Nút **Chỉnh sửa** nằm ở góc phải thanh trên cùng (thanh này luôn dính ở đầu màn hình khi cuộn).
- **Lọc game**: ô tìm kiếm (tìm theo tên, thể loại, nền tảng, mô tả; gõ không dấu vẫn tìm được),
  nút lọc theo mục (Hoàn thành / Đang phát triển / Dự kiến) và lọc theo thể loại.
- Nút mũi tên ở góc phải dưới hiện ra khi cuộn xuống, bấm để về đầu trang.

## Hai chế độ

- **Chế độ xem** (mặc định, dành cho sếp): gọn, không có nút sửa/xóa.
- **Chế độ chỉnh sửa**: bấm **Chỉnh sửa** trên thanh trên cùng (hoặc mở link có `?edit`). Sửa thẳng trên trang:
  - **Chữ**: bấm vào tên game, thể loại, nền tảng, ghi chú, mô tả, nội dung từng việc, chú thích ảnh
    (ô viền nét đứt) và gõ. Rời ô là tự ghi nhận. Enter để xong (riêng mô tả, Enter xuống dòng).
  - **Ảnh**: **Thay ảnh** / **Xóa** trên mỗi ảnh, **+ Thêm ảnh** ở cuối dải ảnh. Ảnh được tự thu nhỏ
    (tối đa 1280px) và nén để nhẹ.
  - **Tài liệu tham khảo**: sửa tên và địa chỉ, **+ Thêm tài liệu**, nút ✕ để xóa.
  - **Việc cần làm**: tích xong, thêm, xóa, sửa chữ. **Tiến độ**: thanh kéo %.
  - **Thêm game mới**: nút **+ Thêm game vào "…"** ở cuối mỗi mục. **Xóa game**: nút ✕.
  - **Chuyển game sang mục khác**: ở đầu mỗi game, kéo nút **⠿ Kéo** thả vào mục khác, hoặc chọn mục
    ở ô bên phải (dùng cho điện thoại, nơi không kéo thả được). Chuyển sang "Hoàn thành" thì tiến độ
    tự thành 100%, sang "Dự kiến" thì về 0%.
  - Mọi thao tác xóa/chuyển đều có nút **Hoàn tác** trong 7 giây.
- **Lưu lên web** (nút xanh ở thanh dưới): ghi mọi thay đổi vào GitHub, trang công khai cập nhật sau
  khoảng 1 phút. **Bỏ thay đổi** để quay về bản đang chạy. **Sao chép dữ liệu** là cách thủ công
  (dán vào `data.js`), không kèm ảnh mới.

### Lưu lên web: cần token GitHub (một lần)
Lần đầu bấm Lưu, trang hỏi token. Tạo ở github.com/settings/personal-access-tokens/new:
repo chỉ chọn `game-progress`, quyền **Contents = Read and write**, đặt hạn (ví dụ 90 ngày).
Token **chỉ lưu trong trình duyệt của bạn**, không nằm trong code hay repo. Hãy coi như mật khẩu và chỉ
dùng trên máy của bạn. Hết hạn thì tạo token mới và dán lại. Có thể xóa token ngay trong hộp thoại.
Nếu bạn sửa cùng lúc từ hai máy, lần lưu sau sẽ ghi đè lần trước.
Trang nạp `data.js` kèm mã thời gian nên người xem thấy bản mới ngay khi GitHub Pages deploy xong.

## Cập nhật nội dung bằng tay (data.js)

Vẫn sửa tay được nếu muốn:
- **Thêm game**: copy một khối game trong `games` của mục cần thêm, đổi `id` (không trùng), tên, mô tả, ảnh...
- **Chuyển mục**: cắt khối game dán sang mục khác, đặt `progress` cho hợp.
- **Thêm ảnh**: bỏ file vào `images/`, thêm `{ src: "images/ten-anh.png", caption: "Chú thích" }`.
  Ảnh nên tỉ lệ 16:9 (ví dụ 1280×720), dưới ~300KB mỗi ảnh.
- **Đổi ngày cập nhật**: sửa `updated`.
- Phần chú thích đầu `data.js` được giữ nguyên khi dùng Lưu lên web, nhưng **đừng viết chú thích bên
  trong phần dữ liệu** vì sẽ bị ghi đè.

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

## Chat hai chiều giữa bạn và sếp (Firebase)

Khi bật chat, các nhận xét trở thành **hội thoại chung**: tin của sếp hiện ngay cho bạn, tin trả lời
của bạn hiện ngay cho sếp, không cần tải lại trang. Nội dung trang vẫn lưu trong git như cũ, chỉ chat
nằm trên Firebase Firestore (gói miễn phí Spark).

### Cách hoạt động và bảo mật
- Chat chỉ mở khi trang được mở bằng **link bí mật**: `https://.../game-progress/?k=<mã-bí-mật>`.
  Mã dài 20 ký tự trở lên, **không nằm trong code hay repo**. Người không có mã chỉ xem được nội dung,
  không thấy chat và không nhắn được. Trình duyệt nhớ mã sau lần đầu mở link.
- Ai có link thì đọc và viết được: chỉ gửi link cho sếp. Nếu lộ, đổi mã mới (gửi link mới cho sếp,
  tin cũ ở mã cũ sẽ không còn hiện).
- Quy tắc bảo mật của Firestore nằm trong `firestore.rules`.
- Tin nhắn lưu trên máy chủ Google, không mã hóa đầu cuối.
- Sếp nhắn thì email vẫn báo về cho bạn (qua `notify`). Tin bạn trả lời không gửi email.
  Link trong email **không chứa mã bí mật**: hãy mở link đó trên trình duyệt bạn đã từng vào bằng link có mã.

### Cài đặt (một lần, khoảng 10 phút)
1. Vào console.firebase.google.com, **Create a project**, đặt tên, tắt Google Analytics, Create.
2. Menu trái chọn **Build, Firestore Database, Create database**. Chọn vị trí gần bạn
   (ví dụ `asia-southeast1` Singapore, **không đổi được sau này**), chọn **production mode**, Enable.
3. Mở tab **Rules**, dán toàn bộ nội dung file `firestore.rules`, bấm **Publish**.
4. Vào **Project settings** (biểu tượng bánh răng), mục **Your apps**, bấm biểu tượng web `</>`, đặt tên
   rồi **Register app**. Copy các giá trị `apiKey`, `authDomain`, `projectId`, `appId`.
5. Trong `data.js` điền các giá trị đó và đổi `provider` thành `"firebase"`:
   `chat: { provider: "firebase", firebase: { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." } }`
6. Commit và push. Gửi sếp link `https://khuathuythuan-code.github.io/game-progress/?k=<mã-bí-mật>`.
   Bạn cũng mở trang bằng link có mã đó một lần trên máy của mình.

Chưa điền cấu hình Firebase thì trang tự chạy ở chế độ cũ (nhận xét lưu trên máy người viết + email).
`provider: "local"` chỉ để thử giao diện giữa các tab cùng một trình duyệt, đừng dùng thật.

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
