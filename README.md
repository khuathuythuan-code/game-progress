# Trang báo cáo tiến độ game

Trang web tĩnh (HTML/CSS/JS thuần). **GitHub chỉ giữ code**, còn **chữ, ảnh, tiến độ và tin nhắn nằm trong
cơ sở dữ liệu (Firebase Realtime Database hoặc Firestore)**. Sửa nội dung trên trang là tự lưu và mọi người thấy ngay, không cần
commit hay push.

## Cấu trúc

```
index.html      – khung trang
style.css       – giao diện
app.js          – toàn bộ logic (hiển thị, sửa tại chỗ, lọc, chat, kết nối cơ sở dữ liệu)
data.js         – cấu hình kết nối + dữ liệu MẪU (chỉ dùng nạp lần đầu vào cơ sở dữ liệu trống)
database.rules.json – quy tắc bảo mật dán vào Firebase Realtime Database
firestore.rules     – quy tắc bảo mật dán vào Firestore (nếu dùng Firestore)
images/         – ảnh mẫu đi kèm dữ liệu mẫu
```

## Cách hoạt động và bảo mật
- Không có đăng nhập. Quyền truy cập nằm ở **link riêng có mã bí mật**: `https://.../game-progress/?k=<mã>`.
  Mã dài từ 20 ký tự, không nằm trong code hay repo. Trình duyệt nhớ mã sau lần đầu mở link.
- Ai chỉ có link trang (không có mã) sẽ thấy "Trang này cần link riêng" và không đọc hay sửa được gì.
- **Ai có link kèm mã thì đọc và sửa được tất cả**, kể cả sửa hay xóa nội dung. Chỉ gửi link cho sếp.
  Nếu lộ, đổi mã mới (nội dung ở mã cũ sẽ không còn hiện, nhớ tải bản sao lưu trước).
- Đừng đưa thông tin cá nhân nhạy cảm vào trang. Dữ liệu nằm trên máy chủ Google, không mã hóa đầu cuối.

## Cài đặt cơ sở dữ liệu (một lần, khoảng 10 phút)
Trang dùng được **một trong hai** loại cơ sở dữ liệu của Firebase. Dự án hiện tại dùng **Realtime Database**
(`provider: "rtdb"`). Hai loại có file quy tắc khác nhau, **không dán nhầm file này vào ô quy tắc của loại kia**
(sẽ báo "Parse error").

**Cách A: Realtime Database (đang dùng)**
1. Vào console.firebase.google.com, **Create a project**, đặt tên, tắt Google Analytics, Create.
2. **Build, Realtime Database, Create Database**. Chọn vị trí (ví dụ `asia-southeast1`), chọn **locked mode**.
3. Tab **Rules**: xóa hết, dán toàn bộ nội dung file `database.rules.json`, bấm **Publish**.
4. Trong `data.js`, mục `db.firebase` điền `databaseURL` (địa chỉ ở đầu trang Realtime Database, dạng
   `https://<tên-dự-án>-default-rtdb.<vùng>.firebasedatabase.app`) và `projectId`, `provider: "rtdb"`.
   `apiKey` và `appId` (Project settings, Your apps, biểu tượng web `</>`, Register app) nên điền để chắc chắn,
   nhưng Realtime Database có thể chạy được khi để trống.

**Cách B: Firestore** (`provider: "firebase"`)
1. **Build, Firestore Database, Create database**, chọn **production mode**.
2. Tab **Rules**: dán toàn bộ nội dung file `firestore.rules`, bấm **Publish**.
3. Trong `data.js` điền `apiKey`, `authDomain`, `projectId`, `appId` (Project settings, Your apps, biểu tượng web `</>`).

**Sau khi chọn A hoặc B:**
5. Commit và push (đây là lần cuối bạn cần push để dùng trang, trừ khi sửa code).
7. Tạo mã bí mật (một lần), ví dụ bằng PowerShell:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
```

8. Mở `https://khuathuythuan-code.github.io/game-progress/?k=<mã>` trên máy bạn. **Lần đầu**, cơ sở dữ liệu
   còn trống nên trang tự nạp dữ liệu mẫu từ `data.js` làm điểm bắt đầu. Sau đó gửi sếp đúng link có mã đó.

Chưa điền cấu hình Firebase (`provider: ""`) thì trang hiện dữ liệu mẫu và mọi chỉnh sửa chỉ nằm trên
trình duyệt này.

## Dùng hằng ngày
- **Bố cục ba cột**: **thanh bên trái** (điều hướng mục và game, Thu gọn tất cả, nút **Chỉnh sửa**), nội dung ở giữa,
  **thanh bên phải** (khung **Trao đổi**). Hai thanh bên đều **thu gọn được**: nút ‹ ở đầu thanh trái; khung phải
  có một **tay nắm nổi** (nút ›) nằm đúng mép giữa nội dung và khung, bấm để thu gọn, khi thu gọn nó dính vào mép
  phải màn hình (nút ‹) để mở lại. Thanh trái mở lại bằng nút nhỏ ở mép trái; nút **Trao đổi** trên header cũng mở/đóng khung phải. Máy tính nhớ lựa chọn của bạn
  (lần đầu khung phải chỉ tự mở khi màn hình rộng từ 1280px). Trên điện thoại hai thanh bên là ngăn kéo: nút ☰ mở
  menu trái, nút **Trao đổi** mở khung phải; chạm nền mờ hoặc nhấn Esc để đóng.
- **Chỉnh sửa**: nút ở đáy thanh bên trái. Thanh dưới cho biết "Đang lưu…" / "Đã lưu lúc …".
  - **Chữ**: bấm vào tên game, thể loại, nền tảng, ghi chú, mô tả, từng việc, chú thích ảnh (ô viền nét đứt)
    và gõ. Rời ô là tự lưu. Enter để xong (riêng mô tả, Enter xuống dòng).
  - **Ảnh**: **Thay ảnh** / **Xóa** trên mỗi ảnh, **+ Thêm ảnh** ở cuối dải ảnh. Ảnh tự thu nhỏ (tối đa 1280px)
    và nén cho tới khi đủ nhẹ.
  - **Tài liệu tham khảo**: sửa tên và địa chỉ, **+ Thêm tài liệu**, ✕ để xóa.
  - **Việc cần làm**: tích xong, thêm, xóa, sửa chữ. **Tiến độ**: thanh kéo %.
  - **Thêm game**: nút **+ Thêm game vào "…"** cuối mỗi mục. **Xóa game**: nút ✕.
  - **Chuyển game sang mục khác**: ở đầu mỗi game, kéo nút **⠿ Kéo** thả vào mục khác, hoặc chọn mục ở
    ô bên phải (dùng cho điện thoại). Sang "Hoàn thành" thì tiến độ thành 100%, sang "Dự kiến" thì về 0%.
  - Mọi thao tác xóa/chuyển có nút **Hoàn tác** trong 7 giây.
- **Xem**: mặc định gọn, không có nút sửa/xóa. Sếp thấy thay đổi của bạn ngay, không cần tải lại trang.
- **Lọc game**: nằm trên **thanh header dính** ở đầu trang (cuộn trang vẫn thấy): ô tìm kiếm (gõ không dấu vẫn
  tìm được), lọc theo mục và theo thể loại. Thanh bên trái cũng cập nhật theo bộ lọc.
- **Giao diện sáng/tối**: nút ở thanh header đổi vòng **Tự động** (theo hệ thống) → **Sáng** → **Tối**. Lựa chọn được
  nhớ riêng trên từng trình duyệt, nên bạn và sếp có thể dùng giao diện khác nhau.
- **Nhận xét và chat**: **mọi phần giao diện đều nhận xét được**: rê chuột vào bất kỳ phần nào rồi bấm
  **Nhận xét**. Gồm nội dung từng game (tên, ảnh, tiến độ, phiên bản, bản vá, mô tả, từng việc, từng link) và cả các
  phần chung: tiêu đề trang, ngày cập nhật, bảng tổng quan, tiêu đề mục, thanh lọc, nút **Trao đổi**. Riêng hai thanh
  bên (menu trái, khung Trao đổi phải) thì không cần nhận xét nên không có nút này. Nhận xét về
  các phần chung nằm ở mục **Toàn trang** trong khung Trao đổi. Với phần nhỏ (nút, ô nhập) nút "Nhận xét" hiện sát
  bên dưới để không che mất chính phần đó. Trên điện thoại, bấm nút **Nhận xét** ở thanh bên rồi chạm vào phần cần
  nhận xét (ở chế độ này chạm vào đâu cũng là chọn phần đó; bấm lại nút để thoát).
  - **Khung Trao đổi bên phải** thay cho khung ở cuối từng game: mặc định là **Tất cả nhận xét** (gom nhận xét của
    toàn trang và mọi game theo thời gian, mỗi tin có nhãn game, bấm nhãn để nhảy tới game đó; muốn viết thì chọn
    "Viết về: …" ngay ở ô soạn). Ở ô chọn trên cùng có thể đổi sang **Theo phần đang xem** (cuộn tới game nào hiện
    trao đổi của game đó), **Toàn trang** hoặc một game cụ thể; hoặc bấm biểu tượng bình luận ở đầu một game để mở
    đúng khung của game đó. Nút **Trao đổi** trên header hiện số nhận xét
    chưa giải quyết của cả trang. Tin nhắn hiện tức thì cho cả hai bên.
- **Xóa hoặc ẩn nhận xét**: mỗi tin có nút **Đã giải quyết** (ẩn tin đi, bấm "Hiện n nhận xét đã giải quyết"
  để xem lại, hoặc **Mở lại**) và nút **Xóa**. Người viết tin được dùng cả hai nút trên tin của mình; chủ trang
  (trình duyệt đã bấm **Chỉnh sửa** ít nhất một lần, kể cả khi đang ở chế độ xem) dùng được trên mọi tin. Số nhận xét hiển thị chỉ đếm tin chưa giải quyết.
- **Phiên bản của từng game**: mỗi game có ô chọn **Phiên bản** (bản mới nhất ghi `(latest)`) kèm khung **Bản vá**
  (ghi chú thay đổi, sửa lỗi). Chọn một bản cũ để xem đầy đủ thông tin lúc làm bản đó (mô tả, tiến độ, ảnh, việc,
  tài liệu, bản vá), bấm **Xem bản mới nhất** để quay lại. Bản cũ chỉ để xem, trừ ghi chú bản vá và số phiên bản
  sửa được khi đang Chỉnh sửa.
  - **Tạo phiên bản mới**: khi đang Chỉnh sửa, bấm **+ Tạo phiên bản mới** ở game, nhập số phiên bản (trang gợi ý
    số tiếp theo) và ghi chú bản vá. Thông tin hiện tại của bản trước được **lưu lại nguyên trạng**, rồi bản mới
    tiếp tục từ thông tin đó. Nhớ tạo bản mới *trước khi* bắt đầu sửa cho bản tiếp theo.
  - Nút **Xóa phiên bản** (có Hoàn tác). Ảnh đã bỏ khỏi game nhưng còn thuộc một bản cũ vẫn được giữ lại để bản cũ
    hiện đủ ảnh. Sao lưu và nhập lại cũng gồm phiên bản.
  - Phiên bản cần kết nối cơ sở dữ liệu mới tạo được.
- **Email báo cho bạn**: khi sếp nhắn, email báo về cho bạn (qua Web3Forms, cấu hình ở `notify` trong
  `data.js`). Chưa có email nào gửi cho sếp.
  - **Trình duyệt đã bấm Chỉnh sửa một lần được coi là của chủ trang** và không bao giờ gửi email cho chính bạn
    (trang sẽ báo một lần để bạn biết). Vì vậy muốn thử email thật bằng nhận xét, hãy nhắn từ **điện thoại hoặc
    cửa sổ ẩn danh** mở link có mã, chưa từng bấm Chỉnh sửa.
  - Nút **Gửi email thử** (thanh dưới khi đang Chỉnh sửa) gửi một thư thử để kiểm tra Web3Forms, dùng được ngay
    trên máy của bạn. Nếu gửi lỗi, trang báo rõ lý do. Nếu báo thành công mà không thấy thư, hãy tìm trong Spam,
    Quảng cáo, Tất cả thư, tìm chữ "web3forms".
- **Sao lưu**: nút **Tải bản sao lưu** (file JSON kèm ảnh) và **Nhập bản sao lưu** ở thanh dưới khi đang
  chỉnh sửa. **Nhập sẽ thay toàn bộ nội dung hiện tại.** Không có lịch sử git cho nội dung, nên hãy
  tải bản sao lưu định kỳ.

## Giới hạn cần biết
- Ảnh nằm trong cơ sở dữ liệu nên mỗi ảnh được nén còn khoảng 100 đến 300KB; Firestore giới hạn 1MB mỗi tài liệu.
  Số lượng ảnh nhiều thì trang tải chậm hơn. Ảnh cũ chỉ còn thuộc phiên bản cũ vẫn chiếm chỗ trong cơ sở dữ liệu.
- Nhớ dán lại nội dung mới của file quy tắc (`database.rules.json` hoặc `firestore.rules`) vào Firebase (tab Rules,
  Publish) mỗi khi file này đổi. Lần cập nhật này thêm quy tắc cho phiên bản và cho việc đánh dấu "đã giải quyết".
- Hai người sửa cùng một game cùng lúc thì lần lưu sau ghi đè lần trước (ở mức từng game).
- Đang gõ trong một ô thì thay đổi từ máy khác được hoãn tới khi bạn rời ô, để không mất chữ đang gõ.
- Gói miễn phí Firebase (Spark) có giới hạn lượt đọc/ghi mỗi ngày, rất dư cho hai người dùng. Xem trên
  trang Firebase để biết hạn mức hiện tại.

## Cập nhật code (hiếm khi cần)
Chỉ khi sửa `app.js`, `style.css`, `index.html`: commit và push, GitHub Pages tự deploy sau khoảng 1 phút.

```powershell
git add .
```

```powershell
git commit -m "Cập nhật code"
```

```powershell
git push
```

Nội dung (chữ, ảnh, tiến độ) thì **không** cần các lệnh này.
