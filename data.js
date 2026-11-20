/*
  ====== DỮ LIỆU TRANG — CHỈ CẦN SỬA FILE NÀY KHI CẬP NHẬT ======
  CÁCH DỄ NHẤT: sửa ngay trên trang (nút "Chỉnh sửa" ở thanh trên cùng) rồi bấm "Lưu lên web".
  Trang sẽ tự ghi lại file này. Khi đó chỉ phần từ dòng "window.PROGRESS" trở xuống bị ghi đè,
  phần chú thích này được giữ nguyên. Vì vậy ĐỪNG viết chú thích bên trong dữ liệu bên dưới.

  Sửa tay (nếu muốn):
  - Thêm game: copy 1 khối { ... } trong "games" của mục tương ứng rồi sửa.
  - Chuyển game sang mục khác: cắt khối game dán sang mục khác.
  - Ảnh: bỏ file vào thư mục images/ rồi ghi đường dẫn vào "images".
  - "id" của game/việc/nhận xét phải KHÔNG trùng nhau (dùng để nhớ trạng thái xóa/tích).
  - Nhận xét: thêm vào mảng "comments" của game, dạng
      { id: "cm-5", author: "Sếp", text: "Nội dung", time: "2026-11-20T09:30:00" }
    Nhận xét về một phần cụ thể thì thêm target, ví dụ:
      target: { id: "t-dragon-idle-progress", label: "Tiến độ" }
    (id phần giao diện: t-<id game>-title | progress | desc | img-<số> | link-<số> | task-<id việc>)
    Thường bạn không cần gõ tay: sếp nhận xét trên trang rồi bạn bấm "Sao chép dữ liệu" ở chế độ sửa.
  - Email thông báo khi có nhận xét mới (xem README, mục "Nhận thông báo email"):
      notify.url       : địa chỉ nhận form của FormSubmit, Formspree hoặc Web3Forms
      notify.accessKey : chỉ Web3Forms cần (các dịch vụ khác để trống)
    Để trống notify.url thì trang không tự gửi; người xem bấm "Gửi nhận xét"
    để sao chép nội dung (hoặc mở email nếu bạn điền feedbackEmail).
  - notify (Web3Forms): accessKey chỉ cho phép gửi thư về hộp thư đã đăng ký với Web3Forms,
    không để lộ địa chỉ email, nên để công khai trong mã trang là bình thường.
  - chat (xem README, mục "Chat hai chiều"): điền cấu hình Firebase rồi đổi provider thành "firebase".
    Các giá trị Firebase là thông tin công khai, không phải mật khẩu.
  - github: nơi nút "Lưu lên web" ghi dữ liệu (repo, nhánh, đường dẫn file). Token KHÔNG nằm ở đây:
    mỗi lần dùng lần đầu, trang hỏi token và chỉ nhớ trong trình duyệt của bạn.
*/
window.PROGRESS = {
  title: "Tiến độ phát triển game",
  subtitle: "Báo cáo tiến độ các dự án game của team",
  updated: "20/11/2026",
  notify: { url: "https://api.web3forms.com/submit", accessKey: "1be8f425-c4fd-433d-b4e3-1bb481bd5bb0" },
  chat: { provider: "", firebase: { apiKey: "", authDomain: "", projectId: "", appId: "" } },
  github: { repo: "khuathuythuan-code/game-progress", branch: "main", path: "data.js" },
  feedbackEmail: "",
  sections: [
    {
      key: "done",
      title: "Hoàn thành",
      note: "Các game đã phát hành",
      games: [
        {
          id: "pixel-farm",
          comments: [
            { id: "cm-4", author: "Sếp", text: "Báo cáo doanh thu tốt. Giữ nhịp cập nhật sự kiện hàng tháng nhé.", time: "2026-11-17T16:20:00" }
          ],
          name: "Pixel Farm",
          genre: "Simulation",
          platform: "Android · iOS",
          progress: 100,
          meta: "Phát hành 08/2026",
          description:
            "Game nông trại pixel-art thư giãn: trồng trọt, nuôi thú, mở rộng khu vườn và giao hàng cho dân làng. Đã phát hành toàn cầu với hơn 120.000 lượt tải trong 2 tháng đầu. Chỉ số D1 retention 42%, đánh giá trung bình 4.6★.",
          images: [
            { src: "images/pixel-farm-1.svg", caption: "Màn hình nông trại chính" },
            { src: "images/pixel-farm-2.svg", caption: "Cửa hàng vật phẩm" },
            { src: "images/pixel-farm-3.svg", caption: "Sự kiện mùa thu" }
          ],
          tasks: [
            { id: "pf-1", text: "Phát hành bản 1.0 lên store", done: true },
            { id: "pf-2", text: "Cập nhật sự kiện Halloween (v1.3)", done: true },
            { id: "pf-3", text: "Báo cáo doanh thu tháng 10", done: true }
          ],
          links: [
            { title: "Game Design Document", url: "https://example.com/pixel-farm-gdd" },
            { title: "Báo cáo hậu phát hành", url: "https://example.com/pixel-farm-postmortem" }
          ]
        },
        {
          id: "neon-racer",
          name: "Neon Racer",
          genre: "Racing",
          platform: "Android",
          progress: 100,
          meta: "Phát hành 03/2026",
          description:
            "Game đua xe arcade phong cách cyberpunk với 12 đường đua, hệ thống nâng cấp xe và bảng xếp hạng theo tuần. Đang ở giai đoạn vận hành, cập nhật nội dung hàng tháng.",
          images: [
            { src: "images/neon-racer-1.svg", caption: "Đường đua Neon City" },
            { src: "images/neon-racer-2.svg", caption: "Garage nâng cấp xe" },
            { src: "images/neon-racer-3.svg", caption: "Bảng xếp hạng tuần" }
          ],
          tasks: [
            { id: "nr-1", text: "Phát hành bản 1.0", done: true },
            { id: "nr-2", text: "Thêm 3 đường đua mới", done: true },
            { id: "nr-3", text: "Tối ưu hiệu năng máy cấu hình thấp", done: true }
          ],
          links: [
            { title: "Trang store", url: "https://example.com/neon-racer-store" }
          ]
        }
      ]
    },
    {
      key: "dev",
      title: "Đang phát triển",
      note: "Các game đang trong quá trình làm",
      games: [
        {
          id: "dragon-idle",
          comments: [
            { id: "cm-1", author: "Sếp", text: "Phần PvP nên có bản demo sớm để mình xem thử trước khi mở closed beta.", time: "2026-11-18T09:30:00", target: { id: "t-dragon-idle-img-4", label: "Ảnh 4: Concept hệ thống PvP" } },
            { id: "cm-2", author: "Team", text: "Dạ, bản demo PvP sẽ có trong build tuần sau ạ.", time: "2026-11-18T14:05:00" }
          ],
          name: "Dragon Quest Idle",
          genre: "Idle RPG",
          platform: "Android · iOS",
          progress: 65,
          meta: "Dự kiến ra mắt 02/2027",
          description:
            "Game idle RPG nuôi rồng, thu thập hơn 60 loại rồng và đánh boss theo tầng. Hiện đã xong core loop, hệ thống rồng và UI chính; đang làm hệ thống PvP và cân bằng kinh tế game. Bản closed beta dự kiến mở cuối tháng 12.",
          images: [
            { src: "images/dragon-idle-1.svg", caption: "Màn hình chiến đấu tự động" },
            { src: "images/dragon-idle-2.svg", caption: "Bộ sưu tập rồng" },
            { src: "images/dragon-idle-3.svg", caption: "Bản đồ tầng boss" },
            { src: "images/dragon-idle-4.svg", caption: "Concept hệ thống PvP" }
          ],
          tasks: [
            { id: "dq-1", text: "Hoàn thiện core loop & combat tự động", done: true },
            { id: "dq-2", text: "Làm xong UI màn hình chính", done: true },
            { id: "dq-3", text: "Hệ thống PvP đấu trường", done: false },
            { id: "dq-4", text: "Cân bằng kinh tế game (gold / gem)", done: false },
            { id: "dq-5", text: "Mở closed beta 100 người chơi", done: false }
          ],
          links: [
            { title: "Game Design Document", url: "https://example.com/dragon-idle-gdd" },
            { title: "Bảng cân bằng số liệu (Sheet)", url: "https://example.com/dragon-idle-balance" },
            { title: "Tham khảo: AFK Arena", url: "https://example.com/ref-afk-arena" }
          ]
        },
        {
          id: "space-defender",
          comments: [
            { id: "cm-3", author: "Sếp", text: "Cần chốt khi nào có bản chơi thử 10 màn đầu.", time: "2026-11-19T10:00:00", target: { id: "t-space-defender-progress", label: "Tiến độ" } }
          ],
          name: "Space Defender",
          genre: "Tower Defense",
          platform: "Android",
          progress: 30,
          meta: "Dự kiến ra mắt 05/2027",
          description:
            "Tower defense không gian với 8 loại tháp và 40 màn chơi. Đã có prototype chơi được cho 5 màn đầu. Đang thiết kế thêm các loại quái đặc biệt và hệ thống nâng cấp tháp.",
          images: [
            { src: "images/space-defender-1.svg", caption: "Prototype màn 1" },
            { src: "images/space-defender-2.svg", caption: "Các loại tháp phòng thủ" },
            { src: "images/space-defender-3.svg", caption: "Concept quái boss" }
          ],
          tasks: [
            { id: "sd-1", text: "Prototype 5 màn đầu", done: true },
            { id: "sd-2", text: "Thiết kế 8 loại tháp", done: false },
            { id: "sd-3", text: "Vẽ art quái & boss", done: false },
            { id: "sd-4", text: "Hệ thống nâng cấp tháp", done: false }
          ],
          links: [
            { title: "Tài liệu thiết kế màn chơi", url: "https://example.com/space-defender-levels" },
            { title: "Tham khảo: Kingdom Rush", url: "https://example.com/ref-kingdom-rush" }
          ]
        }
      ]
    },
    {
      key: "planned",
      title: "Dự kiến",
      note: "Các game sẽ làm trong thời gian tới",
      games: [
        {
          id: "puzzle-kingdom",
          name: "Puzzle Kingdom",
          genre: "Match-3",
          platform: "Android · iOS",
          progress: 0,
          meta: "Dự kiến bắt đầu Q1/2027",
          description:
            "Game xếp hình match-3 kết hợp xây dựng vương quốc: mỗi màn thắng sẽ mở khóa công trình mới. Đang trong giai đoạn nghiên cứu thị trường và lên ý tưởng.",
          images: [
            { src: "images/puzzle-kingdom-1.svg", caption: "Mock-up màn chơi" },
            { src: "images/puzzle-kingdom-2.svg", caption: "Concept vương quốc" }
          ],
          tasks: [
            { id: "pk-1", text: "Nghiên cứu đối thủ cùng thể loại", done: false },
            { id: "pk-2", text: "Viết one-pager ý tưởng", done: false },
            { id: "pk-3", text: "Trình duyệt ý tưởng với ban lãnh đạo", done: false }
          ],
          links: [
            { title: "Phân tích thị trường match-3", url: "https://example.com/match3-research" }
          ]
        },
        {
          id: "zombie-survival",
          name: "Zombie Survival",
          genre: "Roguelike",
          platform: "Android",
          progress: 0,
          meta: "Dự kiến bắt đầu Q2/2027",
          description:
            "Roguelike sinh tồn góc nhìn từ trên xuống: chọn kỹ năng ngẫu nhiên sau mỗi đợt zombie. Cần chốt đội ngũ và kinh phí trước khi bắt đầu.",
          images: [
            { src: "images/zombie-survival-1.svg", caption: "Concept góc nhìn game" },
            { src: "images/zombie-survival-2.svg", caption: "Ý tưởng bảng chọn kỹ năng" }
          ],
          tasks: [
            { id: "zs-1", text: "Làm prototype thử cảm giác bắn", done: false },
            { id: "zs-2", text: "Lập kế hoạch nhân sự & ngân sách", done: false }
          ],
          links: [
            { title: "Tham khảo: Vampire Survivors", url: "https://example.com/ref-vampire-survivors" }
          ]
        }
      ]
    }
  ]
};
