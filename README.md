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
- **Bố cục ba cột**: **thanh bên trái** (điều hướng mục và game, nút **Chỉnh sửa**, đổi giao diện sáng/tối), nội dung ở giữa,
  **thanh bên phải** (khung **Trao đổi**). Hai thanh bên đều **thu gọn được**: nút ‹ ở đầu thanh trái; khung phải
  có một **tay nắm nổi** (nút ›) nằm đúng mép giữa nội dung và khung, bấm để thu gọn, khi thu gọn nó dính vào mép
  phải màn hình (nút ‹) để mở lại. Thanh trái mở lại bằng nút nhỏ ở mép trái; nút **Trao đổi** trên header cũng mở/đóng khung phải. Máy tính nhớ lựa chọn của bạn
  (lần đầu khung phải chỉ tự mở khi màn hình rộng từ 1280px). Trên điện thoại hai thanh bên là ngăn kéo: nút ☰ mở
  menu trái, nút **Trao đổi** mở khung phải; chạm nền mờ hoặc nhấn Esc để đóng.
- **Chỉnh sửa**: nút ở đáy thanh bên trái. Thanh dưới cho biết "Đang lưu…" / "Đã lưu lúc …".
  - **Chữ**: bấm vào tên game, thể loại, nền tảng, ghi chú, mô tả, từng việc, chú thích ảnh (ô viền nét đứt)
    và gõ. Rời ô là tự lưu. Enter để xong (riêng mô tả, Enter xuống dòng).
  - **Ảnh**: **Thay ảnh** / **Xóa** trên mỗi ảnh, **+ Thêm ảnh** ở cuối dải ảnh. Ảnh tự thu nhỏ (tối đa 1280px)
  - **Dán ảnh (Ctrl+V)**: khi đang Chỉnh sửa, chụp màn hình hoặc sao chép ảnh rồi rê chuột vào game cần thêm và nhấn **Ctrl+V** (có thể dán nhiều ảnh cùng lúc). Dán link YouTube cũng thêm video. Không rê chuột vào game nào thì ảnh vào game đang ở đầu màn hình. Đang gõ trong ô chữ thì Ctrl+V dán chữ như bình thường.
  - **Video YouTube**: nút **+ Thêm video YouTube** cạnh **+ Thêm ảnh**, dán link (watch, youtu.be, shorts đều được). Video hiện cùng dải ảnh với ảnh bìa và nút phát, bấm là phát ngay trong trang. Nên để video ở chế độ **Không công khai** trên YouTube. Trang chỉ lưu mã video (không lưu file), nên không tốn dung lượng. Mục video có nút **Đổi link** và **Xóa**, và nhận xét được như ảnh.
    và nén cho tới khi đủ nhẹ.
  - **Tài liệu tham khảo**: sửa tên và địa chỉ, **+ Thêm tài liệu**, ✕ để xóa.
  - **Việc cần làm**: tích xong, thêm, xóa, sửa chữ. **Tiến độ**: thanh kéo %.
  - **Thêm game**: nút **+ Thêm game vào "…"** cuối mỗi mục. **Xóa game**: nút ✕.
  - **Chuyển game sang mục khác**: ở đầu mỗi game, kéo nút **⠿ Kéo** thả vào mục khác, hoặc chọn mục ở
    ô bên phải (dùng cho điện thoại). Sang "Hoàn thành" thì tiến độ thành 100%, sang "Dự kiến" thì về 0%.
  - Mọi thao tác xóa/chuyển có nút **Hoàn tác** trong 7 giây.
- **Xem**: mặc định gọn, không có nút sửa/xóa. Sếp thấy thay đổi của bạn ngay, không cần tải lại trang.
- **Thu gọn / Mở rộng tất cả game**: nút tròn nằm ngay dưới thanh header, trong dải trống bên phải các thẻ game (trên điện thoại nằm trong menu trái).
- **Lọc game**: nằm trên **thanh header dính** ở đầu trang (cuộn trang vẫn thấy): ô tìm kiếm (gõ không dấu vẫn
  tìm được), lọc theo mục và theo thể loại. Thanh bên trái cũng cập nhật theo bộ lọc.
- **Giao diện sáng/tối**: nút ở thanh header đổi vòng **Tự động** (theo hệ thống) → **Sáng** → **Tối**. Lựa chọn được
  nhớ riêng trên từng trình duyệt, nên bạn và sếp có thể dùng giao diện khác nhau.
- **Nhận xét và chat**: nội dung **từng game** nhận xét được: rê chuột vào phần nào (tên, ảnh, tiến độ, phiên bản,
  bản vá, mô tả, từng việc, từng link) rồi bấm **Nhận xét**. Phần đầu trang (tiêu đề, ngày cập nhật, bảng tổng quan,
  thanh tìm kiếm và lọc, nút **Trao đổi**, tiêu đề các mục) và hai thanh bên **không** có nút nhận xét. Muốn nhận xét
  chung về cả trang, chọn **Toàn trang** ở ô "Viết về" trong khung Trao đổi. Với phần nhỏ (nút, ô nhập) nút "Nhận xét"
  hiện sát bên dưới để không che mất chính phần đó. Trên điện thoại, bấm nút **Nhận xét** ở thanh bên rồi chạm vào phần cần
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

## Chủ trang đăng nhập Google: không gửi email cho chính mình
> **Hiện đang TẮT.** Đăng nhập Google đang được ẩn hoàn toàn (nút, hộp thoại, hộp gợi ý, thông báo) bằng công tắc `googleLogin: false` trong `data.js`. Khi tắt, chủ trang là trình duyệt đã bấm **Chỉnh sửa** như trước. Muốn dùng lại, đổi thành `true` rồi làm các bước dưới.

Trang nhận ra chủ trang bằng tài khoản Google (Gmail) đang đăng nhập, không phải bằng mật khẩu riêng.
- **Chủ trang** (đăng nhập đúng Gmail đã khai báo): nhắn, chỉnh sửa, xóa nhận xét đều **không** gửi email.
- **Mọi người khác** (không đăng nhập, hoặc đăng nhập tài khoản Google khác): nhắn nhận xét gửi email ngay; chỉnh
  sửa nội dung thì gom lại và gửi **một email tóm tắt** sau khoảng 90 giây (hoặc khi họ rời trang): ai sửa, game nào,
  ảnh, phiên bản. Họ vẫn sửa được, chỉ là bạn được báo.
- Sếp vào bằng link bí mật, không cần đăng nhập gì cả.

Làm một lần:
1. Firebase Console > **Authentication** > **Get started**. Mục **Sign-in method** > **Google** > bật **Enable**,
   chọn **Support email** > **Save** (phải bấm Save thì mới có hiệu lực).
2. **Authentication > Settings > Authorized domains** > thêm `khuathuythuan-code.github.io`.
3. Trên mỗi trình duyệt của bạn: mở trang bằng link bí mật, bấm **Chỉnh sửa**, rồi bấm **Đăng nhập Google** ở chân
   thanh bên trái và chọn Gmail chủ trang. **Chỉ cần làm một lần cho mỗi trình duyệt**: Firebase nhớ phiên, các lần
   sau trang tự nhận bạn là chủ trang. (Trang web không được phép tự đọc Gmail đang dùng trong trình duyệt nếu bạn
   chưa đồng ý một lần, đây là quy định của Google.) Nếu trình duyệt chặn cửa sổ đăng nhập, hãy cho phép pop-up.
   Nếu hộp đăng nhập không tự mở trên một trình duyệt, thêm `&login=1` vào cuối link bí mật (ví dụ `...?k=MA-BI-MAT&login=1`) để luôn mở hộp. Hộp tự mở cho trình duyệt đã từng dùng chế độ Chỉnh sửa, người xem thông thường không thấy.
4. Chủ trang được khai báo bằng `ownerEmailHash` trong `data.js`: đó là mã băm SHA-256 của Gmail, để địa chỉ email
   không nằm công khai trong code. Muốn đổi chủ trang, tạo mã băm mới (chữ thường, không dấu cách) rồi dán vào:
   ```powershell
   $e = "email.cua.ban@gmail.com"
   -join ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($e.ToLower())) | ForEach-Object { $_.ToString("x2") })
   ```
5. Tùy chọn, để trang **tự hỏi đăng nhập ngay khi vào** ("Tiếp tục với tài khoản …?" nếu trình duyệt đang đăng nhập Gmail):
   - Firebase Console > Authentication > Sign-in method > **Google** > mục **Web SDK configuration** > sao chép
     **Web client ID** (dạng `123-abc.apps.googleusercontent.com`), dán vào `googleClientId` trong `data.js`.
   - Google Cloud Console (cùng dự án `gameprogress-2a12c`) > **APIs & Services** > **Credentials** > mở "Web client
     (auto created by Google Service)" > **Authorized JavaScript origins** > Add URI
     `https://khuathuythuan-code.github.io` > Save (có thể mất vài phút để có hiệu lực).
   - Để trống `googleClientId` thì không hiện hộp tự động (vẫn đăng nhập được bằng nút). Đặt `autoPrompt: false`
     nếu không muốn sếp thấy hộp này. Hộp chỉ hiện khi chưa đăng nhập; nếu bạn tắt hộp, Google tạm không hiện lại một lúc.
6. Tùy chọn, chặn hẳn phía máy chủ (người khác không sửa được nội dung nữa, chỉ nhắn được): mở
   `database.rules.owner.json`, thay `OWNER_EMAIL_HERE` bằng Gmail chủ trang, dán vào Realtime Database > Rules >
   Publish. Khi đó bước email tóm tắt chỉnh sửa không còn cần cho người khác vì họ không ghi được. Nếu bị khóa
   không sửa được, dán lại `database.rules.json` để về như cũ. Đừng commit file rules đã điền email nếu bạn muốn
   giữ email không công khai.

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
