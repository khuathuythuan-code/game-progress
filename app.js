(function () {
  "use strict";

  const DATA = window.PROGRESS;
  const KEY = "game-progress-state-v1";
  const MODE_KEY = "game-progress-edit-mode";
  const NAME_KEY = "game-progress-author";
  const $ = (id) => document.getElementById(id);
  // state = các chỉnh sửa chưa lưu lên web (nằm trong trình duyệt này):
  // fields/links/images/moved/newGames/taskText là sửa trực tiếp trên trang, các mục còn lại như cũ.
  const EMPTY = () => ({
    delGames: [], delTasks: [], done: {}, added: {}, comments: {}, delComments: [], progress: {},
    fields: {}, links: {}, images: {}, moved: {}, newGames: [], taskText: {}
  });
  const canHover = () => matchMedia("(hover: hover)").matches;
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Chat dùng chung (Firebase) ----------
  // CHAT.provider: "" = tắt (nhận xét lưu trên máy người viết + email), "firebase" = chat thật,
  // "local" = chat thử giữa các tab cùng trình duyệt (chỉ để thử giao diện).
  const CHAT = DATA.chat || {};
  // Chưa điền cấu hình Firebase thì coi như chưa bật chat, trang chạy ở chế độ nhận xét + email
  const chatOn = !!CHAT.provider && (CHAT.provider !== "firebase" || !!(CHAT.firebase && CHAT.firebase.projectId));
  const ROOM_KEY = "game-progress-room";
  const OWNER_KEY = "game-progress-owner";
  const CID_KEY = "game-progress-cid";
  let room = "";
  let myCid = "";
  try {
    const k = new URLSearchParams(location.search).get("k");
    if (k && /^[A-Za-z0-9_-]{20,64}$/.test(k)) localStorage.setItem(ROOM_KEY, k);
    room = localStorage.getItem(ROOM_KEY) || "";
    myCid = localStorage.getItem(CID_KEY) || "";
    if (!myCid) { myCid = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem(CID_KEY, myCid); }
  } catch (e) { myCid = myCid || "u" + Math.random().toString(36).slice(2, 12); }
  const canComment = !chatOn || !!room; // bật chat mà không có link bí mật thì chỉ xem
  const isOwner = () => { try { return localStorage.getItem(OWNER_KEY) === "1"; } catch (e) { return false; } };
  let remote = [];      // tin nhắn từ máy chủ chat
  let chatApi = null;   // adapter đã kết nối
  let chatReady = false;

  // ---------- Trạng thái lưu trong trình duyệt ----------
  let state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === "object") return Object.assign(EMPTY(), s);
    } catch (e) {}
    return EMPTY();
  }
  let warnedQuota = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {
      if (!warnedQuota) { warnedQuota = true; toast('Bộ nhớ trình duyệt đầy (thường do ảnh lớn). Hãy bấm "Lưu lên web" ngay.'); }
    }
  }
  const isDirty = () => {
    const s = state;
    return !!(s.delGames.length || s.delTasks.length || s.delComments.length || s.newGames.length ||
      Object.keys(s.done).length || Object.keys(s.added).length || Object.keys(s.progress).length ||
      Object.keys(s.comments).length || Object.keys(s.fields).length || Object.keys(s.links).length ||
      Object.keys(s.images).length || Object.keys(s.moved).length || Object.keys(s.taskText).length);
  };

  // Dữ liệu gốc (như trong data.js) và dữ liệu hiệu lực = gốc + chỉnh sửa trực tiếp chưa lưu.
  // DATA.sections luôn là dữ liệu hiệu lực để phần còn lại của mã dùng thẳng.
  let BASE = { sections: JSON.parse(JSON.stringify(DATA.sections)) };
  function rebuild() {
    const secs = JSON.parse(JSON.stringify(BASE.sections));
    state.newGames.forEach((n) => {
      if (secs.some((s) => s.games.some((g) => g.id === n.game.id))) return;
      (secs.find((s) => s.key === n.sec) || secs[0]).games.push(JSON.parse(JSON.stringify(n.game)));
    });
    Object.keys(state.moved).forEach((gid) => {
      let game = null;
      secs.forEach((s) => { const i = s.games.findIndex((g) => g.id === gid); if (i >= 0) game = s.games.splice(i, 1)[0]; });
      if (game) (secs.find((s) => s.key === state.moved[gid]) || secs[0]).games.push(game);
    });
    secs.forEach((s) => s.games.forEach((g) => {
      if (state.fields[g.id]) Object.assign(g, state.fields[g.id]);
      if (state.links[g.id]) g.links = state.links[g.id].map((x) => Object.assign({}, x));
      if (state.images[g.id]) g.images = state.images[g.id].map((x) => Object.assign({}, x));
    }));
    DATA.sections = secs;
  }
  rebuild();

  // ---------- Trạng thái giao diện ----------
  const ui = {
    editing: false, collapsed: {}, drafts: {}, name: "", pop: null, incoming: null, annotating: false,
    filter: { q: "", sec: "all", genre: "" }, dragging: ""
  };
  try {
    if (/[?&]edit(=1|=true)?(&|$)/.test(location.search)) localStorage.setItem(MODE_KEY, "1");
    ui.editing = localStorage.getItem(MODE_KEY) === "1";
    ui.name = localStorage.getItem(NAME_KEY) || "";
  } catch (e) {
    ui.editing = /[?&]edit/.test(location.search);
  }
  // Nhận xét đi kèm trong link email (?cm=...): chỉ để hiển thị, không lưu
  try {
    const raw = new URLSearchParams(location.search).get("cm");
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o.m === "string") ui.incoming = { a: String(o.a || "").slice(0, 40), m: o.m.slice(0, 600), t: String(o.t || ""), tid: "" };
    }
  } catch (e) {}

  // ---------- Tiện ích ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^(https?:|mailto:)/i.test(u) ? u : "#");
  const pad = (n) => String(n).padStart(2, "0");
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const findByKey = (attr, val) => Array.from(document.querySelectorAll("[" + attr + "]")).find((e) => e.getAttribute(attr) === val);
  const pageUrl = () => location.href.split("#")[0].split("?")[0];

  const isDone = (t) => (t.id in state.done ? state.done[t.id] : !!t.done);
  const prog = (g) => (g.id in state.progress ? state.progress[g.id] : g.progress);
  const visibleGames = (sec) => sec.games.filter((g) => !state.delGames.includes(g.id));
  function allTasks(g) {
    const base = (g.tasks || []).map((t) => (t.id in state.taskText ? Object.assign({}, t, { text: state.taskText[t.id] }) : t));
    const ids = new Set(base.map((t) => t.id));
    return base.concat((state.added[g.id] || []).filter((t) => !ids.has(t.id)));
  }
  const visibleTasks = (g) => allTasks(g).filter((t) => !state.delTasks.includes(t.id));
  function allComments(g) {
    const baseRaw = g.comments || [];
    const ids = new Set(baseRaw.map((c) => c.id));
    const base = baseRaw.filter((c) => !state.delComments.includes(c.id)).map((c) => Object.assign({}, c, { mine: false }));
    const extra = chatOn ?
      remote.filter((m) => m.gid === g.id && !ids.has(m.id)).map((m) => ({
        id: m.id, author: m.author, text: m.text, time: new Date(m.ts).toISOString(), mine: m.cid === myCid, remote: true,
        target: m.tid ? { id: m.tid, label: m.tlabel || "" } : undefined
      })) :
      (state.comments[g.id] || []).filter((c) => !ids.has(c.id)).map((c) => Object.assign({}, c, { mine: true }));
    return base.concat(extra).sort((a, b) => new Date(a.time) - new Date(b.time));
  }
  function targetCounts(g) {
    const m = {};
    allComments(g).forEach((c) => { if (c.target && c.target.id) m[c.target.id] = (m[c.target.id] || 0) + 1; });
    return m;
  }
  function findGame(id) {
    for (const sec of DATA.sections) for (const g of sec.games) if (g.id === id) return g;
  }
  function findTask(id) {
    for (const sec of DATA.sections) for (const g of sec.games) {
      const t = allTasks(g).find((x) => x.id === id);
      if (t) return t;
    }
  }

  const ICON_CMT = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Thuộc tính đánh dấu một phần giao diện có thể nhận xét
  function A(g, kind, label, cm) {
    const tid = "t-" + g.id + "-" + kind;
    if (!canComment) return ' id="' + esc(tid) + '"'; // chưa có link bí mật: chỉ xem, không nhận xét
    return ' id="' + esc(tid) + '" data-annot data-target="' + esc(tid) + '" data-tlabel="' + esc(label) + '" data-game="' + esc(g.id) + '"' +
      (cm[tid] ? ' data-ccount="' + cm[tid] + '"' : "");
  }

  // ---------- Render từng phần ----------
  let introDone = false; // thanh tiến độ ở bảng đầu trang chỉ chạy hiệu ứng một lần

  // Phần tử chữ sửa trực tiếp được ngay trên trang (chỉ dùng ở chế độ chỉnh sửa)
  function ed(kind, id, field, text, tag, cls, multi, label, ph, extra) {
    return "<" + tag + ' class="' + cls + ' editable" contenteditable="true" spellcheck="false" role="textbox"' + (multi ? ' aria-multiline="true"' : "") +
      ' aria-label="' + esc(label) + '" data-edit="' + kind + '" data-id="' + esc(id) + '" data-field="' + esc(field) + '"' +
      (ph ? ' data-ph="' + esc(ph) + '"' : "") + (extra || "") + ">" + esc(text) + "</" + tag + ">";
  }

  function renderTask(t, g, cm) {
    const d = isDone(t);
    const attrs = A(g, "task-" + t.id, "Việc: " + short(t.text, 48), cm);
    if (!ui.editing) {
      return '<li class="task' + (d ? " done" : "") + '"' + attrs + '><span class="mark" aria-hidden="true">' + (d ? "✓" : "") +
        '</span><span class="task-text">' + esc(t.text) + '</span><span class="sr-only">' + (d ? " (đã xong)" : " (chưa xong)") + "</span></li>";
    }
    return '<li class="task' + (d ? " done" : "") + '"' + attrs + ">" +
      '<input type="checkbox" class="task-check" data-action="toggle" data-fk="tg-' + esc(t.id) + '" data-id="' + esc(t.id) + '" aria-label="Đánh dấu xong: ' + esc(t.text) + '"' + (d ? " checked" : "") + ">" +
      ed("task", t.id, "text", t.text, "span", "task-text", false, "Nội dung việc", "Nội dung việc") +
      '<button class="icon-btn" data-action="del-task" data-id="' + esc(t.id) + '" title="Xóa việc này" aria-label="Xóa việc: ' + esc(t.text) + '">✕</button></li>';
  }

  function renderMsg(g, c, withTag) {
    const canDel = c.mine || ui.editing;
    return '<li class="msg' + (c.mine ? " mine" : "") + '"><div class="msg-meta"><b>' + esc(c.author) + "</b><time>" + esc(fmtTime(c.time)) + "</time>" +
      (canDel ? '<button class="link-btn" data-action="del-comment" data-game="' + esc(g.id) + '" data-id="' + esc(c.id) + '" aria-label="Xóa nhận xét của ' + esc(c.author) + '">Xóa</button>' : "") + "</div>" +
      (withTag && c.target ? '<a class="ctag" href="#' + esc(c.target.id) + '" data-action="goto-target" data-id="' + esc(c.target.id) + '">về: ' + esc(c.target.label) + "</a>" : "") +
      '<p class="bubble">' + esc(c.text) + "</p></li>";
  }

  // Phần tiêu đề + danh sách tin nhắn của một game (tách riêng để cập nhật mà không đụng vào ô đang gõ)
  function threadHtml(g) {
    const list = allComments(g);
    return "<h4>" + (chatOn ? "Trao đổi" : "Nhận xét") + (list.length ? " (" + list.length + ")" : "") + "</h4>" +
      (list.length ? '<ul class="thread">' + list.map((c) => renderMsg(g, c, true)).join("") + "</ul>" :
        '<p class="no-comments">' + (canComment ? "Chưa có tin nhắn. Rê chuột vào ảnh, tiến độ hay một mục bất kỳ để nhận xét đúng chỗ, hoặc viết chung ở dưới." : "Chưa có nhận xét.") + "</p>") +
      (!canComment ? '<p class="no-comments">Muốn nhận xét, hãy mở trang bằng link do người làm gửi cho bạn.</p>' : "");
  }

  function renderComments(g) {
    const draft = ui.drafts[g.id] || "";
    return '<section class="comments" id="c-' + esc(g.id) + '" aria-label="Nhận xét về ' + esc(g.name) + '">' +
      '<div class="thread-wrap">' + threadHtml(g) + "</div>" +
      (!canComment ? "</section>" : "") +
      (!canComment ? "" : '<form class="composer" data-game="' + esc(g.id) + '">' +
      '<label class="sr-only" for="cn-' + esc(g.id) + '">Tên của bạn</label>' +
      '<input id="cn-' + esc(g.id) + '" name="author" type="text" maxlength="40" placeholder="Tên của bạn" autocomplete="name" data-fk="cn-' + esc(g.id) + '" value="' + esc(ui.name) + '" required>' +
      '<label class="sr-only" for="ct-' + esc(g.id) + '">Nội dung nhận xét</label>' +
      '<textarea id="ct-' + esc(g.id) + '" name="text" rows="2" maxlength="600" placeholder="Nhận xét chung về ' + esc(g.name) + '" data-draft="' + esc(g.id) + '" data-fk="ct-' + esc(g.id) + '" required>' + esc(draft) + "</textarea>" +
      '<div class="composer-foot"><span class="hint kbd">Ctrl + Enter để gửi</span><button class="btn small" type="submit">' + (chatOn ? "Gửi" : "Thêm nhận xét") + "</button></div>" +
      "</form></section>");
  }

  function renderGame(sec, g) {
    const tasks = visibleTasks(g);
    const doneCount = tasks.filter(isDone).length;
    const planned = sec.key === "planned";
    const p = prog(g);
    const cm = targetCounts(g);
    const nCmt = allComments(g).length;
    const open = !ui.collapsed[g.id];

    const facts = ui.editing ?
      ed("game", g.id, "genre", g.genre, "span", "genre", false, "Thể loại", "Thể loại") +
      ed("game", g.id, "platform", g.platform, "span", "", false, "Nền tảng", "Nền tảng") +
      ed("game", g.id, "meta", g.meta || "", "span", "", false, "Ghi chú, ví dụ: Dự kiến ra mắt 02/2027", "Ghi chú (ví dụ: ra mắt 02/2027)") :
      '<span class="genre">' + esc(g.genre) + "</span><span>" + esc(g.platform) + "</span>" + (g.meta ? "<span>" + esc(g.meta) + "</span>" : "");

    const progress = planned ? "" :
      '<div class="progress"' + A(g, "progress", "Tiến độ", cm) + '><div class="progress-top"><span>Tiến độ</span><b>' + p + "%</b></div>" +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><i style="width:' + p + '%"></i></div>' +
      (ui.editing ? '<label class="slider">Điều chỉnh tiến độ<input type="range" min="0" max="100" step="5" value="' + p + '" data-action="progress" data-id="' + esc(g.id) + '" data-fk="rg-' + esc(g.id) + '"></label>' : "") +
      "</div>";

    const imgs = g.images || [];
    const gallery = (imgs.length || ui.editing) ?
      '<div class="gallery-wrap">' +
      '<button class="nav-btn prev" data-action="scroll" data-dir="-1" aria-label="Ảnh trước">‹</button>' +
      (imgs.length > 1 ? '<span class="gcount" aria-hidden="true">1 / ' + imgs.length + "</span>" : "") +
      '<div class="gallery" tabindex="0" role="group" aria-label="Ảnh của ' + esc(g.name) + '">' +
      imgs.map((im, i) =>
        "<figure" + A(g, "img-" + (i + 1), "Ảnh " + (i + 1) + (im.caption ? ": " + im.caption : ""), cm) + '><div class="imgbox"><img loading="lazy" src="' + esc(im.src) + '" alt="' + esc(im.caption || g.name) + '" data-action="zoom" data-game="' + esc(g.id) + '" data-index="' + i + '">' +
        (ui.editing ? '<div class="img-tools"><button type="button" class="img-btn" data-action="img-replace" data-game="' + esc(g.id) + '" data-index="' + i + '">Thay ảnh</button>' +
          '<button type="button" class="img-btn danger" data-action="img-del" data-game="' + esc(g.id) + '" data-index="' + i + '">Xóa</button></div>' : "") +
        "</div><figcaption>" + (ui.editing ? ed("cap", g.id, String(i), im.caption || "", "span", "", false, "Chú thích ảnh", "Chú thích ảnh") : esc(im.caption || "")) + "</figcaption></figure>").join("") +
      (ui.editing ? '<figure class="add-img"><button type="button" class="add-img-btn" data-action="img-add" data-game="' + esc(g.id) + '">+ Thêm ảnh</button></figure>' : "") +
      "</div>" +
      '<button class="nav-btn next" data-action="scroll" data-dir="1" aria-label="Ảnh sau">›</button></div>' : "";

    const taskHtml = tasks.length ? '<ul class="tasks">' + tasks.map((t) => renderTask(t, g, cm)).join("") + "</ul>" : '<p class="none">Chưa có việc nào.</p>';
    const addForm = ui.editing ?
      '<form class="add-task" data-game="' + esc(g.id) + '"><input type="text" name="text" maxlength="140" placeholder="Thêm việc mới" aria-label="Việc mới cho ' + esc(g.name) + '" data-fk="at-' + esc(g.id) + '" required>' +
      '<button class="btn small" type="submit">Thêm</button></form>' : "";

    const links = g.links || [];
    const linkHtml = ui.editing ?
      (links.length ? '<ul class="links edit-links">' + links.map((l, i) => "<li" + A(g, "link-" + (i + 1), "Tài liệu: " + short(l.title, 48), cm) + '><div class="link-edit">' +
        '<input type="text" class="le" data-action="link-edit" data-k="title" data-game="' + esc(g.id) + '" data-index="' + i + '" value="' + esc(l.title) + '" placeholder="Tên tài liệu" aria-label="Tên tài liệu" maxlength="120">' +
        '<input type="url" class="le" data-action="link-edit" data-k="url" data-game="' + esc(g.id) + '" data-index="' + i + '" value="' + esc(l.url) + '" placeholder="https://..." aria-label="Địa chỉ tài liệu" maxlength="500">' +
        '<button class="icon-btn" data-action="link-del" data-game="' + esc(g.id) + '" data-index="' + i + '" aria-label="Xóa tài liệu ' + esc(l.title) + '">✕</button></div></li>').join("") + "</ul>" : '<p class="none">Chưa có tài liệu.</p>') +
      '<button type="button" class="btn small ghost add-link" data-action="link-add" data-game="' + esc(g.id) + '">+ Thêm tài liệu</button>' :
      (links.length ?
        '<ul class="links">' + links.map((l, i) => "<li" + A(g, "link-" + (i + 1), "Tài liệu: " + short(l.title, 48), cm) + '><a href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(l.title) + "</a></li>").join("") + "</ul>" :
        '<p class="none">Chưa có tài liệu.</p>');

    const tools =
      '<a class="tool' + (nCmt ? " has-count" : "") + '" href="#c-' + esc(g.id) + '" data-action="goto-comments" data-id="' + esc(g.id) + '" aria-label="Nhận xét: ' + nCmt + '">' + ICON_CMT + "<span>" + nCmt + "</span></a>" +
      '<button class="tool" data-action="collapse" data-id="' + esc(g.id) + '" aria-expanded="' + open + '" aria-controls="m-' + esc(g.id) + '">' + '<span class="tool-label">' + (open ? "Thu gọn" : "Mở rộng") + "</span>" + ICON_CHEV + "</button>" +
      (ui.editing ? '<button class="icon-btn" data-action="del-game" data-id="' + esc(g.id) + '" title="Xóa game này" aria-label="Xóa game ' + esc(g.name) + '">✕</button>' : "");

    // Chế độ sửa: tay nắm kéo + ô chọn mục ở đầu mỗi game để chuyển sang mục khác
    const mover = ui.editing ?
      '<div class="mover"><span class="drag-handle" draggable="true" data-drag="' + esc(g.id) + '" title="Kéo sang mục khác" aria-hidden="true">⠿ Kéo</span>' +
      '<label class="move-label"><span class="sr-only">Chuyển ' + esc(g.name) + ' sang mục</span><select class="move-sel" data-action="move" data-id="' + esc(g.id) + '">' +
      DATA.sections.map((s) => '<option value="' + esc(s.key) + '"' + (s.key === sec.key ? " selected" : "") + ">" + esc(s.title) + "</option>").join("") +
      "</select></label></div>" : "";

    const titleHtml = ui.editing ? ed("game", g.id, "name", g.name, "h3", "", false, "Tên game", "Tên game", ' tabindex="-1"') : '<h3 tabindex="-1">' + esc(g.name) + "</h3>";
    const descHtml = ui.editing ?
      ed("game", g.id, "description", g.description, "p", "desc", true, "Mô tả game", "Mô tả game", A(g, "desc", "Mô tả", cm)) :
      '<p class="desc"' + A(g, "desc", "Mô tả", cm) + ">" + esc(g.description) + "</p>";

    return '<article class="game" id="g-' + esc(g.id) + '">' + mover +
      '<div class="game-head"><div class="game-title"' + A(g, "title", "Thông tin game", cm) + ">" + titleHtml + '<div class="facts">' + facts + '</div></div><div class="game-tools">' + tools + "</div></div>" +
      progress +
      '<div class="game-more" id="m-' + esc(g.id) + '"' + (open ? "" : " hidden") + ">" + gallery +
      '<div class="game-body">' + descHtml +
      '<div class="cols"><div><h4>Việc cần làm, xong ' + doneCount + "/" + tasks.length + "</h4>" + taskHtml + addForm + "</div>" +
      "<div><h4>Tài liệu tham khảo</h4>" + linkHtml + "</div></div>" + renderComments(g) + "</div></div></article>";
  }

  // ---------- Bộ lọc ----------
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  function passes(sec, g) {
    const f = ui.filter;
    if (f.genre && g.genre !== f.genre) return false;
    if (f.q) {
      const hay = norm([g.name, g.genre, g.platform, g.meta, g.description].join(" "));
      if (!f.q.split(/\s+/).every((w) => hay.includes(norm(w)))) return false;
    }
    return true;
  }
  const filterActive = () => !!(ui.filter.q || ui.filter.genre || ui.filter.sec !== "all");
  function renderFilterBar(shown, total) {
    const f = ui.filter;
    $("f-sec").innerHTML = [{ key: "all", title: "Tất cả" }].concat(DATA.sections).map((s) =>
      '<button type="button" class="seg-btn' + (f.sec === s.key ? " on" : "") + '" data-sec="' + esc(s.key) + '" aria-pressed="' + (f.sec === s.key) + '">' + esc(s.title) + "</button>").join("");
    const genres = Array.from(new Set(DATA.sections.reduce((a, s) => a.concat(visibleGames(s).map((g) => g.genre)), []).filter(Boolean))).sort();
    const sel = $("f-genre");
    const key = genres.join("|");
    if (sel.getAttribute("data-key") !== key) {
      sel.innerHTML = '<option value="">Mọi thể loại</option>' + genres.map((x) => '<option value="' + esc(x) + '">' + esc(x) + "</option>").join("");
      sel.setAttribute("data-key", key);
    }
    sel.value = genres.includes(f.genre) ? f.genre : "";
    $("f-count").textContent = filterActive() ? "Hiện " + shown + "/" + total + " game" : total + " game";
    $("f-clear").hidden = !filterActive();
  }

  // ---------- Bảng tổng quan đầu trang ----------
  function renderBoard() {
    let html = "";
    DATA.sections.forEach((sec) => {
      const games = visibleGames(sec);
      html += '<div class="lane" data-key="' + esc(sec.key) + '"><div class="lane-label"><b>' + esc(sec.title) + "</b><span>" + games.length + " game</span></div>" +
        (games.length ? '<div class="chips">' + games.map((g) => {
          const sub = sec.key === "dev" ?
            '<span class="chip-sub">' + prog(g) + '% hoàn thành</span><span class="chip-bar"><i style="--w:' + prog(g) + '%"></i></span>' :
            '<span class="chip-sub">' + esc(g.meta || g.genre) + "</span>";
          return '<a class="chip" href="#g-' + esc(g.id) + '" data-game="' + esc(g.id) + '"><span class="chip-name">' + esc(g.name) + "</span>" + sub + "</a>";
        }).join("") + "</div>" : '<p class="lane-empty">Chưa có game nào.</p>') + "</div>";
    });
    const board = $("board");
    board.innerHTML = html;
    board.classList.toggle("intro", !introDone);
    introDone = true;
  }

  function render() {
    rebuild();
    $("title").textContent = DATA.title;
    document.title = DATA.title;
    $("updated").textContent = DATA.updated || "";
    document.body.classList.toggle("editing", ui.editing);
    document.body.classList.toggle("annotating", ui.annotating);
    $("editbar").hidden = !ui.editing;
    $("dirty").hidden = !isDirty();
    const modeBtn = $("enter-edit");
    modeBtn.textContent = ui.editing ? "Xong chỉnh sửa" : "Chỉnh sửa";
    modeBtn.setAttribute("aria-pressed", String(ui.editing));
    modeBtn.classList.toggle("on", ui.editing);

    // nhớ vị trí cuộn, ô đang focus, vị trí cuộn của dải ảnh
    const y = window.scrollY;
    const ae = document.activeElement;
    const fk = ae && ae.getAttribute ? ae.getAttribute("data-fk") : null;
    const sel = fk && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
    const scrolls = {};
    document.querySelectorAll(".game").forEach((el) => {
      const gl = el.querySelector(".gallery");
      if (gl) scrolls[el.id] = gl.scrollLeft;
    });

    let appHtml = "", tabsHtml = "", shown = 0, total = 0;
    DATA.sections.forEach((sec) => {
      const all = visibleGames(sec);
      const games = all.filter((g) => passes(sec, g));
      total += all.length;
      const secOk = ui.filter.sec === "all" || ui.filter.sec === sec.key;
      if (secOk) shown += games.length;
      // Khi sửa luôn hiện đủ các mục để làm chỗ thả; khi xem thì ẩn mục không khớp bộ lọc
      const hide = !ui.editing && (!secOk || (filterActive() && !games.length));
      if (hide) return;
      const list = secOk ? games : [];
      const filtered = list.length !== all.length;
      tabsHtml += '<a href="#sec-' + esc(sec.key) + '" data-key="' + esc(sec.key) + '"><span class="dot"></span>' + esc(sec.title) + "</a>";
      appHtml += '<section class="section" id="sec-' + esc(sec.key) + '" data-key="' + esc(sec.key) + '"><div class="section-head"><h2>' + esc(sec.title) + '</h2><span class="count">' +
        (filtered ? list.length + "/" + all.length : all.length) + "</span>" +
        (sec.note ? '<span class="note">' + esc(sec.note) + "</span>" : "") + "</div>" +
        (ui.editing ? '<div class="drop-hint" aria-hidden="true">Thả vào đây để chuyển sang "' + esc(sec.title) + '"</div>' : "") +
        (list.length ? list.map((g) => renderGame(sec, g)).join("") :
          '<div class="empty">' + (all.length ? "Không có game nào khớp bộ lọc." : "Chưa có game nào trong mục này.") + "</div>") +
        (ui.editing ? '<button type="button" class="btn ghost add-game" data-action="add-game" data-sec="' + esc(sec.key) + '">+ Thêm game vào "' + esc(sec.title) + '"</button>' : "") +
        "</section>";
    });
    if (!appHtml) appHtml = '<div class="empty">Không có game nào khớp bộ lọc.</div>';
    tabsHtml += '<button type="button" data-action="toggle-all" id="toggle-all"></button>' +
      (canComment ? '<button type="button" class="touch-only' + (ui.annotating ? " on" : "") + '" data-action="annot-mode" aria-pressed="' + ui.annotating + '">Nhận xét</button>' : "");

    renderBoard();
    renderFilterBar(shown, total);
    $("tabs").innerHTML = tabsHtml;
    $("app").innerHTML = appHtml;

    document.querySelectorAll(".game").forEach((el) => {
      const gl = el.querySelector(".gallery");
      if (gl && scrolls[el.id]) gl.scrollLeft = scrolls[el.id];
    });
    hoverEl = null;
    chip.hidden = true;
    renderPop();
    syncActive();
    window.scrollTo(0, y);
    if (fk) {
      const el = findByKey("data-fk", fk);
      if (el) {
        el.focus({ preventScroll: true });
        if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {}
      }
    }
    updateToggleAll();
    updateSend();
    updateSpy();
  }

  // ---------- Thu gọn / mở rộng ----------
  function setCollapsed(id, collapsed) {
    ui.collapsed[id] = collapsed;
    const m = $("m-" + id);
    if (m) m.hidden = collapsed;
    const b = Array.from(document.querySelectorAll('[data-action="collapse"]')).find((e) => e.getAttribute("data-id") === id);
    if (b) {
      b.setAttribute("aria-expanded", String(!collapsed));
      b.querySelector(".tool-label").textContent = collapsed ? "Mở rộng" : "Thu gọn";
    }
    updateToggleAll();
  }
  function updateToggleAll() {
    const b = $("toggle-all");
    if (!b) return;
    const anyOpen = Array.from(document.querySelectorAll(".game")).some((el) => !ui.collapsed[el.id.slice(2)]);
    b.textContent = anyOpen ? "Thu gọn tất cả" : "Mở rộng tất cả";
  }

  // ---------- Làm nổi mục đang xem trên thanh điều hướng ----------
  let spyQueued = false;
  function updateSpy() {
    spyQueued = false;
    let current = "";
    document.querySelectorAll(".section").forEach((s) => {
      if (s.getBoundingClientRect().top <= 140) current = s.getAttribute("data-key");
    });
    document.querySelectorAll(".tabs a").forEach((a) => {
      const on = a.getAttribute("data-key") === current;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", () => {
    if (!spyQueued) { spyQueued = true; requestAnimationFrame(updateSpy); }
    if (hoverEl && !chip.hidden) placeChip(hoverEl);
    $("to-top").hidden = window.scrollY < 500; // nút cuộn lên đầu trang chỉ hiện khi đã cuộn xuống
  }, { passive: true });
  $("to-top").addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }));

  // đếm ảnh "2 / 4" khi cuộn dải ảnh
  document.addEventListener("scroll", (e) => {
    const gl = e.target;
    if (!gl.classList || !gl.classList.contains("gallery")) return;
    const fig = gl.querySelector("figure");
    const c = gl.parentElement.querySelector(".gcount");
    if (!fig || !c) return;
    const n = gl.querySelectorAll("figure").length;
    const i = Math.min(n - 1, Math.round(gl.scrollLeft / (fig.offsetWidth + 12)));
    c.textContent = i + 1 + " / " + n;
    if (hoverEl && !chip.hidden) placeChip(hoverEl);
  }, true);

  // ảnh lỗi → khung báo thay vì icon vỡ
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && t.closest(".gallery")) {
      const d = document.createElement("div");
      d.className = "noimg";
      d.setAttribute("role", "img");
      d.setAttribute("aria-label", t.alt || "Chưa có ảnh");
      d.textContent = "Chưa có ảnh";
      t.replaceWith(d);
    }
  }, true);

  // ---------- Thông báo + hoàn tác ----------
  let toastTimer, undoFn = null;
  function toast(msg, undo) {
    $("toast-msg").textContent = msg;
    undoFn = undo || null;
    $("toast-undo").hidden = !undo;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("toast").classList.remove("show"); undoFn = null; }, undo ? 7000 : 2600);
  }
  $("toast-undo").addEventListener("click", () => {
    if (!undoFn) return;
    const f = undoFn;
    undoFn = null;
    $("toast").classList.remove("show");
    f();
  });

  // ---------- Xóa (có hoàn tác) ----------
  function deleteGame(id) {
    const g = findGame(id);
    if (!g) return;
    state.delGames.push(id); save(); render();
    toast('Đã xóa game "' + g.name + '"', () => { state.delGames = state.delGames.filter((x) => x !== id); save(); render(); });
  }
  function deleteTask(id) {
    const t = findTask(id);
    if (!t) return;
    state.delTasks.push(id); save(); render();
    toast("Đã xóa việc", () => { state.delTasks = state.delTasks.filter((x) => x !== id); save(); render(); });
  }
  function deleteComment(gid, id) {
    if (chatOn) {
      const m = remote.find((x) => x.id === id);
      if (m && chatApi && (m.cid === myCid || ui.editing)) {
        const backup = Object.assign({}, m);
        chatApi.remove(id).then(() => {
          toast("Đã xóa tin nhắn", () => { chatApi.restore(backup).catch(() => toast("Không khôi phục được tin nhắn")); });
        }).catch(() => toast("Không xóa được tin nhắn"));
        return;
      }
    }
    const mineList = state.comments[gid] || [];
    const idx = mineList.findIndex((c) => c.id === id);
    if (idx >= 0) {
      const removed = mineList.splice(idx, 1)[0];
      save(); render();
      toast("Đã xóa nhận xét", () => { (state.comments[gid] = state.comments[gid] || []).push(removed); save(); render(); });
    } else if (ui.editing) {
      state.delComments.push(id); save(); render();
      toast("Đã xóa nhận xét", () => { state.delComments = state.delComments.filter((x) => x !== id); save(); render(); });
    }
  }

  // ---------- Nút "Nhận xét" khi rê chuột + bong bóng nhận xét ----------
  const chip = $("annot-chip");
  const popEl = $("annot-pop");
  let hoverEl = null, hideT = null;

  function placeChip(el) {
    const r = el.getBoundingClientRect();
    const navH = $("topbar").offsetHeight || 0;
    if (r.bottom < navH + 24 || r.top > innerHeight - 24) { chip.hidden = true; return; }
    chip.hidden = false;
    const cw = chip.offsetWidth, ch = chip.offsetHeight;
    const shift = el.querySelector(".icon-btn") ? 44 : 0; // tránh đè nút ✕ ở chế độ sửa
    let top = Math.max(r.top + 6, navH + 6);
    top = Math.min(top, r.bottom - ch - 6);
    if (r.height < ch + 12) top = r.top + (r.height - ch) / 2;
    let left = Math.min(r.right - cw - 6 - shift, innerWidth - cw - 8);
    left = Math.max(8, left);
    chip.style.top = top + "px";
    chip.style.left = left + "px";
  }
  function showChip(el) {
    clearTimeout(hideT);
    if (ui.editing) return; // đang sửa: không hiện nút nhận xét để khỏi vướng
    if (ui.pop && ui.pop.id === el.id) { chip.hidden = true; return; } // đang mở bong bóng cho phần này
    if (hoverEl && hoverEl !== el) hoverEl.classList.remove("annot-hover");
    hoverEl = el;
    el.classList.add("annot-hover");
    const n = Number(el.getAttribute("data-ccount") || 0);
    chip.querySelector("span").textContent = n ? "Nhận xét · " + n : "Nhận xét";
    chip.setAttribute("aria-label", "Nhận xét về: " + el.getAttribute("data-tlabel"));
    placeChip(el);
  }
  function hideChip() {
    if (hoverEl) hoverEl.classList.remove("annot-hover");
    hoverEl = null;
    chip.hidden = true;
  }
  const scheduleHide = () => { clearTimeout(hideT); hideT = setTimeout(hideChip, 160); };

  document.addEventListener("mouseover", (e) => {
    if (!canHover()) return;
    if (chip.contains(e.target)) { clearTimeout(hideT); return; }
    if (popEl.contains(e.target)) return;
    const a = e.target.closest ? e.target.closest("[data-annot]") : null;
    if (a) showChip(a); else scheduleHide();
  });
  document.documentElement.addEventListener("mouseleave", scheduleHide);
  document.addEventListener("focusin", (e) => {
    if (!canHover() || chip.contains(e.target) || popEl.contains(e.target)) return;
    const a = e.target.closest ? e.target.closest("[data-annot]") : null;
    if (a) showChip(a);
  });
  chip.addEventListener("click", () => { if (hoverEl) openPop(hoverEl); });

  function syncActive() {
    document.querySelectorAll(".annot-active").forEach((el) => el.classList.remove("annot-active"));
    if (ui.pop) {
      const el = $(ui.pop.id);
      if (el) el.classList.add("annot-active");
    }
  }
  function popThreadHtml(g, p) {
    const list = allComments(g).filter((c) => c.target && c.target.id === p.id);
    let items = list.map((c) => renderMsg(g, c, false)).join("");
    if (ui.incoming && ui.incoming.tid === p.id) {
      items += '<li class="msg from-link"><div class="msg-meta"><b>' + esc(ui.incoming.a || "Người nhận xét") + "</b><time>" + esc(fmtTime(ui.incoming.t)) +
        '</time><span class="badge">từ link email</span></div><p class="bubble">' + esc(ui.incoming.m) + "</p></li>";
    }
    return items ? '<ul class="thread pop-thread">' + items + "</ul>" : "";
  }
  function renderPop() {
    const p = ui.pop;
    if (!p) { popEl.hidden = true; return; }
    const g = findGame(p.gid);
    if (!g) { ui.pop = null; popEl.hidden = true; return; }
    const key = "pop:" + p.id;
    popEl.innerHTML =
      '<div class="pop-head"><div><span class="kicker">Nhận xét về</span><strong>' + esc(p.label) + '</strong></div>' +
      '<button class="icon-btn" data-action="pop-close" aria-label="Đóng">✕</button></div>' +
      '<div class="pop-thread-wrap">' + popThreadHtml(g, p) + "</div>" +
      '<form class="composer pop-form" data-game="' + esc(p.gid) + '" data-target="' + esc(p.id) + '" data-tlabel="' + esc(p.label) + '">' +
      '<label class="sr-only" for="pn">Tên của bạn</label>' +
      '<input id="pn" name="author" type="text" maxlength="40" placeholder="Tên của bạn" autocomplete="name" data-fk="pop-n" value="' + esc(ui.name) + '" required>' +
      '<label class="sr-only" for="pt">Nội dung nhận xét</label>' +
      '<textarea id="pt" name="text" rows="3" maxlength="600" placeholder="Bạn thấy chỗ này thế nào?" data-draft="' + esc(key) + '" data-fk="pop-t" required>' + esc(ui.drafts[key] || "") + "</textarea>" +
      '<div class="composer-foot"><span class="hint kbd">Ctrl + Enter để gửi</span><button class="btn small" type="submit">Gửi nhận xét</button></div></form>';
    popEl.hidden = false;
    clampPop();
  }
  function clampPop() {
    if (popEl.hidden || window.matchMedia("(max-width: 640px)").matches) return;
    const r = popEl.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) popEl.style.top = Math.max(8, innerHeight - r.height - 8) + "px";
  }
  function placePop(rect) {
    // ưu tiên đặt bong bóng bên dưới, rồi bên trên, rồi bên cạnh để không che phần đang được nhận xét
    const w = Math.min(360, innerWidth - 16);
    popEl.style.width = w + "px";
    const navH = $("topbar").offsetHeight || 0;
    const h = popEl.offsetHeight, gap = 10;
    const clampL = (x) => Math.max(8, Math.min(x, innerWidth - w - 8));
    const sideTop = () => Math.max(navH + 8, Math.min(rect.top, innerHeight - h - 8));
    let left, top;
    if (innerHeight - rect.bottom - gap - 8 >= h) { top = rect.bottom + gap; left = clampL(rect.right - w); }
    else if (rect.top - navH - gap - 8 >= h) { top = rect.top - gap - h; left = clampL(rect.right - w); }
    else if (innerWidth - rect.right - gap - 8 >= w) { left = rect.right + gap; top = sideTop(); }
    else if (rect.left - gap - 8 >= w) { left = rect.left - gap - w; top = sideTop(); }
    else { left = clampL(rect.right - w); top = Math.max(navH + 8, innerHeight - h - 8); }
    popEl.style.left = left + "px";
    popEl.style.top = top + "px";
    clampPop();
  }
  function openPop(el) {
    ui.pop = { id: el.getAttribute("data-target"), label: el.getAttribute("data-tlabel"), gid: el.getAttribute("data-game") };
    if (ui.incoming && ui.incoming.tid !== ui.pop.id && !ui.incoming.pinned) ui.incoming.tid = "";
    renderPop();
    placePop(el.getBoundingClientRect());
    syncActive();
    chip.hidden = true;
    const t = $("pt");
    if (t) t.focus({ preventScroll: true });
  }
  function closePop() {
    ui.pop = null;
    popEl.hidden = true;
    syncActive();
    hideChip();
  }
  document.addEventListener("mousedown", (e) => {
    if (popEl.hidden || popEl.contains(e.target) || chip.contains(e.target)) return;
    if (e.target.closest("#toast")) return;
    closePop();
  });

  // Mở đúng phần giao diện từ link (#t-...)
  function flash(el) {
    el.classList.remove("annot-flash");
    void el.offsetWidth;
    el.classList.add("annot-flash");
    setTimeout(() => el.classList.remove("annot-flash"), 2800);
  }
  function goTarget(tid, fromLoad) {
    const el = $(tid);
    if (!el || !el.hasAttribute("data-annot")) return false;
    setCollapsed(el.getAttribute("data-game"), false);
    el.scrollIntoView({ behavior: "instant", block: "center" }); // cuộn tức thì để bong bóng tính đúng vị trí
    flash(el);
    const count = Number(el.getAttribute("data-ccount") || 0);
    if (fromLoad && ui.incoming) { ui.incoming.tid = tid; ui.incoming.pinned = true; }
    if ((fromLoad && ui.incoming) || count) requestAnimationFrame(() => openPop(el));
    return true;
  }
  function handleHash(fromLoad) {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.indexOf("t-") === 0) goTarget(h, fromLoad);
  }
  window.addEventListener("hashchange", () => handleHash(false));

  // ---------- Gửi thông báo qua email (dịch vụ form) ----------
  const notifyConfigured = () => !!(DATA.notify && DATA.notify.url);
  function postNotify(subject, message, name) {
    const n = DATA.notify;
    const body = { subject: subject, name: name || "Người xem", from_name: name || "Người xem", message: message };
    if (n.accessKey) body.access_key = n.accessKey;
    if (/formsubmit\.co/i.test(n.url)) { body._subject = subject; body._captcha = "false"; body._template = "box"; }
    return fetch(n.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    }).then((r) => {
      if (!r.ok) throw new Error("http " + r.status);
      // Dịch vụ có thể trả 200 nhưng báo thất bại (ví dụ chưa kích hoạt email) → coi là chưa gửi được
      return r.json().catch(() => ({})).then((j) => {
        if (j && (j.success === false || j.success === "false" || j.ok === false)) throw new Error(j.message || "notify failed");
        return true;
      });
    });
  }
  // Link mở đúng phần được nhận xét, kèm nội dung để hiện ngay trong bong bóng
  function linkFor(g, c) {
    const base = pageUrl();
    if (!c.target) return base + "#c-" + g.id;
    // Chat thật: nội dung nằm trên máy chủ chat. Không đưa mã bí mật vào email; bạn mở link trên
    // trình duyệt đã từng vào bằng link có mã (trình duyệt nhớ mã).
    if (chatOn) return base + "#" + c.target.id;
    const payload = encodeURIComponent(JSON.stringify({ a: c.author, m: c.text.slice(0, 400), t: c.time }));
    return base + "?cm=" + payload + "#" + c.target.id;
  }
  function unsentComments() {
    const out = [];
    DATA.sections.forEach((sec) => visibleGames(sec).forEach((g) =>
      (state.comments[g.id] || []).forEach((c) => { if (!c.notified) out.push({ g: g, c: c }); })));
    return out;
  }
  function buildFeedback(items) {
    let text = 'Nhận xét mới về "' + DATA.title + '"\n';
    items.forEach(({ g, c }) => {
      text += "\n" + g.name + (c.target ? " · " + c.target.label : " · nhận xét chung") + "\n";
      text += c.author + " (" + fmtTime(c.time) + "):\n" + c.text + "\n";
      text += "Xem đúng chỗ này: " + linkFor(g, c) + "\n";
    });
    return text;
  }
  const subjectFor = (g, c) => short("Nhận xét mới: " + g.name + (c.target ? " · " + c.target.label : ""), 120);
  function updateSend() {
    const n = unsentComments().length;
    const b = $("send");
    b.hidden = n === 0;
    b.textContent = "Gửi nhận xét (" + n + ")";
  }
  function copyText(text, cb) {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); cb(true); } catch (e) { cb(false); }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => cb(true), fallback);
    else fallback();
  }
  function sendFeedback() {
    const items = unsentComments();
    if (!items.length) return;
    const text = buildFeedback(items);
    const markSent = () => { items.forEach(({ c }) => { c.notified = true; }); save(); render(); };
    const manual = () => {
      const mail = DATA.feedbackEmail && /^[^\s@]+@[^\s@]+$/.test(DATA.feedbackEmail) ? DATA.feedbackEmail : "";
      copyText(text, (ok) => {
        if (mail) {
          location.href = "mailto:" + mail + "?subject=" + encodeURIComponent("Nhận xét: " + DATA.title) + "&body=" + encodeURIComponent(text);
          toast("Đã mở email. Nếu không mở được, nội dung đã được sao chép để bạn dán.");
        } else {
          toast(ok ? "Đã sao chép nhận xét. Dán vào chat hoặc email để gửi." : "Không sao chép được nhận xét");
        }
      });
    };
    if (notifyConfigured()) {
      toast("Đang gửi nhận xét…");
      postNotify(items.length === 1 ? subjectFor(items[0].g, items[0].c) : "Nhận xét mới: " + DATA.title, text, items[0].c.author)
        .then(() => { markSent(); toast("Đã gửi nhận xét cho người làm"); })
        .catch(manual);
    } else {
      manual();
    }
  }

  function addComment(g, author, text, target, draftKey) {
    ui.name = author;
    try { localStorage.setItem(NAME_KEY, author); } catch (err) {}
    if (chatOn) { // chat thật: gửi lên máy chủ, tin hiện ngay cho cả hai bên
      if (!chatApi) { toast("Chưa kết nối được chat, thử lại sau ít giây."); return; }
      const m = { gid: g.id, author: author, text: text, ts: Date.now(), cid: myCid };
      if (target) { m.tid = target.id; m.tlabel = target.label; }
      ui.drafts[draftKey] = "";
      render();
      chatApi.add(m).then(() => {
        if (!ui.editing && !isOwner() && notifyConfigured()) { // người xem nhắn → báo email cho chủ trang
          const c = { author: author, text: text, time: new Date(m.ts).toISOString() };
          if (target) c.target = target;
          postNotify(subjectFor(g, c), buildFeedback([{ g: g, c: c }]), author).catch(() => {});
        }
      }).catch(() => toast("Không gửi được tin nhắn. Kiểm tra mạng rồi thử lại."));
      return;
    }
    const c = { id: uid("c-"), author: author, text: text, time: new Date().toISOString() };
    if (target) c.target = target;
    (state.comments[g.id] = state.comments[g.id] || []).push(c);
    ui.drafts[draftKey] = "";
    save(); render();
    if (!ui.editing && notifyConfigured()) {
      toast("Đang gửi nhận xét…");
      postNotify(subjectFor(g, c), buildFeedback([{ g: g, c: c }]), author)
        .then(() => { c.notified = true; save(); render(); toast("Đã gửi nhận xét cho người làm"); })
        .catch(() => toast('Đã lưu nhận xét, nhưng chưa gửi được. Bấm "Gửi nhận xét" để thử lại.'));
    } else {
      toast(notifyConfigured() ? "Đã thêm nhận xét" : 'Đã lưu nhận xét. Bấm "Gửi nhận xét" để chuyển cho người làm.');
    }
  }

  // ---------- Phóng to ảnh ----------
  const lb = $("lightbox");
  const lbState = { list: [], i: 0, opener: null };
  function lbShow(i) {
    const n = lbState.list.length;
    lbState.i = (i + n) % n;
    const im = lbState.list[lbState.i];
    lb.querySelector("img").src = im.src;
    lb.querySelector("img").alt = im.caption || "";
    lb.querySelector("figcaption").textContent = (im.caption || "") + (n > 1 ? "  (" + (lbState.i + 1) + "/" + n + ")" : "");
    lb.querySelector(".lb-prev").hidden = lb.querySelector(".lb-next").hidden = n < 2;
  }
  function lbOpen(gid, idx, opener) {
    const g = findGame(gid);
    if (!g || !(g.images || []).length) return;
    lbState.list = g.images; lbState.opener = opener;
    lbShow(idx);
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    lb.querySelector(".lb-close").focus();
  }
  function lbClose() {
    lb.hidden = true;
    document.body.style.overflow = "";
    if (lbState.opener && document.contains(lbState.opener)) lbState.opener.focus({ preventScroll: true });
  }
  lb.addEventListener("click", (e) => {
    if (e.target === lb || e.target.classList.contains("lb-close")) lbClose();
    else if (e.target.classList.contains("lb-prev")) lbShow(lbState.i - 1);
    else if (e.target.classList.contains("lb-next")) lbShow(lbState.i + 1);
  });
  let touchX = null;
  lb.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) lbShow(lbState.i + (dx < 0 ? 1 : -1));
  }, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (!lb.hidden) {
      if (e.key === "Escape") lbClose();
      else if (e.key === "ArrowLeft") lbShow(lbState.i - 1);
      else if (e.key === "ArrowRight") lbShow(lbState.i + 1);
      else if (e.key === "Tab") { // giữ focus trong hộp ảnh
        const f = Array.from(lb.querySelectorAll("button")).filter((b) => !b.hidden);
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.key === "Escape" && !popEl.hidden) closePop();
  });

  // ---------- Chế độ xem / chỉnh sửa ----------
  function setEditing(on) {
    ui.editing = on;
    try {
      localStorage.setItem(MODE_KEY, on ? "1" : "0");
      if (on) localStorage.setItem(OWNER_KEY, "1"); // máy này là của chủ trang: không tự gửi email cho chính mình
    } catch (e) {}
    render();
    toast(on ? "Đã bật chế độ chỉnh sửa" : "Đã chuyển sang chế độ xem");
  }
  $("enter-edit").addEventListener("click", () => setEditing(!ui.editing));
  $("exit-edit").addEventListener("click", () => setEditing(false));
  $("send").addEventListener("click", sendFeedback);

  // Màn hình cảm ứng: bật "Nhận xét" rồi chạm vào phần muốn nhận xét
  document.addEventListener("click", (e) => {
    if (!ui.annotating) return;
    if (e.target.closest("#annot-pop, .tabs, #editbar, #send, #toast, #lightbox")) return;
    const a = e.target.closest("[data-annot]");
    if (a) { e.preventDefault(); e.stopImmediatePropagation(); openPop(a); }
  }, true);

  // ---------- Sự kiện chung ----------
  document.addEventListener("click", (e) => {
    const chipLink = e.target.closest(".chip[data-game]");
    if (chipLink) {
      e.preventDefault();
      const id = chipLink.getAttribute("data-game");
      setCollapsed(id, false);
      const card = $("g-" + id);
      if (card) {
        card.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
        card.querySelector("h3").focus({ preventScroll: true });
        history.replaceState(null, "", "#g-" + id);
      }
      return;
    }
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.getAttribute("data-action");
    const id = el.getAttribute("data-id");

    if (act === "scroll") {
      const gl = el.parentElement.querySelector(".gallery");
      gl.scrollBy({ left: Number(el.getAttribute("data-dir")) * gl.clientWidth * 0.7, behavior: "smooth" });
    } else if (act === "zoom") {
      lbOpen(el.getAttribute("data-game"), Number(el.getAttribute("data-index")), el);
    } else if (act === "collapse") {
      setCollapsed(id, !ui.collapsed[id]);
    } else if (act === "toggle-all") {
      const anyOpen = Array.from(document.querySelectorAll(".game")).some((g) => !ui.collapsed[g.id.slice(2)]);
      document.querySelectorAll(".game").forEach((g) => setCollapsed(g.id.slice(2), anyOpen));
    } else if (act === "annot-mode") {
      ui.annotating = !ui.annotating;
      closePop();
      render();
      if (ui.annotating) toast("Chạm vào ảnh, tiến độ hay một mục để nhận xét");
    } else if (act === "goto-comments") {
      e.preventDefault();
      setCollapsed(id, false);
      const c = $("c-" + id);
      if (c) c.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    } else if (act === "goto-target") {
      e.preventDefault();
      history.replaceState(null, "", "#" + id);
      goTarget(id, false);
    } else if (act === "pop-close") {
      closePop();
    } else if (act === "del-game" && ui.editing) {
      deleteGame(id);
    } else if (act === "del-task" && ui.editing) {
      deleteTask(id);
    } else if (act === "del-comment") {
      deleteComment(el.getAttribute("data-game"), id);
    }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.matches) return;
    if (t.matches("textarea[data-draft]")) ui.drafts[t.getAttribute("data-draft")] = t.value;
    else if (t.matches('.composer input[name="author"]')) ui.name = t.value;
    else if (t.matches('[data-action="progress"]')) { // kéo thanh: cập nhật số ngay
      const card = t.closest(".game");
      card.querySelector(".progress-top b").textContent = t.value + "%";
      card.querySelector(".bar i").style.width = t.value + "%";
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !ui.editing) return;
    const act = el.getAttribute("data-action");
    if (act === "toggle") {
      state.done[el.getAttribute("data-id")] = el.checked;
      save(); render();
    } else if (act === "progress") {
      state.progress[el.getAttribute("data-id")] = Number(el.value);
      save(); render();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.matches && e.target.matches("textarea[data-draft]")) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });

  document.addEventListener("submit", (e) => {
    const addTask = e.target.closest(".add-task");
    const composer = e.target.closest(".composer");
    if (addTask && ui.editing) {
      e.preventDefault();
      const text = addTask.elements.text.value.trim();
      if (!text) return;
      const gid = addTask.getAttribute("data-game");
      (state.added[gid] = state.added[gid] || []).push({ id: uid("u-"), text: text, done: false });
      save(); render(); toast("Đã thêm việc");
      const again = findByKey("data-fk", "at-" + gid);
      if (again) again.focus();
    } else if (composer) {
      e.preventDefault();
      const gid = composer.getAttribute("data-game");
      const g = findGame(gid);
      const author = composer.elements.author.value.trim();
      const text = composer.elements.text.value.trim();
      if (!g || !author || !text) return;
      const tid = composer.getAttribute("data-target");
      const target = tid ? { id: tid, label: composer.getAttribute("data-tlabel") } : null;
      addComment(g, author, text, target, tid ? "pop:" + tid : gid);
    }
  });

  // ---------- Khôi phục & xuất dữ liệu ----------
  $("reset").addEventListener("click", () => {
    if (!isDirty()) { toast("Không có gì để khôi phục"); return; }
    if (confirm("Bỏ mọi thay đổi chưa lưu lên web (chữ, ảnh, game, việc, nhận xét) trên trình duyệt này?")) {
      state = EMPTY();
      save(); render(); toast("Đã khôi phục");
    }
  });
  // Dữ liệu đầy đủ sau mọi chỉnh sửa (dùng cho "Lưu lên web" và "Sao chép dữ liệu")
  function buildExport() {
    const out = JSON.parse(JSON.stringify(DATA));
    const d = new Date();
    out.updated = pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
    out.sections.forEach((sec) => {
      sec.games = visibleGames(sec);
      sec.games.forEach((g) => {
        g.progress = prog(g);
        g.tasks = visibleTasks(g).map((t) => ({ id: t.id, text: t.text, done: isDone(t) }));
        // tin chat nằm trên Firebase nên không ghi vào data.js
        g.comments = allComments(g).filter((c) => !c.remote).map((c) => {
          const o = { id: c.id, author: c.author, text: c.text, time: c.time };
          if (c.target) o.target = { id: c.target.id, label: c.target.label };
          return o;
        });
      });
    });
    return out;
  }
  $("export").addEventListener("click", () => {
    const out = buildExport();
    let pending = 0;
    out.sections.forEach((sec) => sec.games.forEach((g) => (g.images || []).forEach((im) => {
      if (im.pending) { pending++; im.src = "images/" + im.pending; delete im.pending; }
    })));
    copyText("window.PROGRESS = " + JSON.stringify(out, null, 2) + ";\n", (ok) =>
      toast(!ok ? "Không sao chép được" : pending ? "Đã sao chép, nhưng " + pending + " ảnh mới chưa có file. Hãy dùng Lưu lên web." : "Đã sao chép. Dán đè vào data.js"));
  });

  // ---------- Bộ lọc: nối sự kiện ----------
  let filterTimer = null;
  $("f-q").addEventListener("input", (e) => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => { ui.filter.q = e.target.value.trim(); render(); }, 150);
  });
  $("f-genre").addEventListener("change", (e) => { ui.filter.genre = e.target.value; render(); });
  $("f-sec").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sec]");
    if (b) { ui.filter.sec = b.getAttribute("data-sec"); render(); }
  });
  $("f-clear").addEventListener("click", () => {
    ui.filter = { q: "", sec: "all", genre: "" };
    $("f-q").value = "";
    render();
  });

  // ---------- Sửa trực tiếp trên trang ----------
  const EDITABLE = '[contenteditable="true"][data-edit]';
  const imagesOf = (g) => (g.images || []).map((x) => Object.assign({}, x));
  const linksOf = (g) => (g.links || []).map((x) => Object.assign({}, x));
  const sectionOf = (gid) => DATA.sections.find((s) => s.games.some((g) => g.id === gid));

  function commitEdit(el) {
    const kind = el.getAttribute("data-edit"), id = el.getAttribute("data-id"), field = el.getAttribute("data-field");
    const text = el.innerText.replace(/ /g, " ").trim();
    if (kind === "game") {
      const g = findGame(id);
      if (!g || text === String(g[field] || "")) return;
      if (!text && (field === "name" || field === "description")) { el.textContent = g[field]; toast("Mục này không được để trống"); return; }
      (state.fields[id] = state.fields[id] || {})[field] = text;
    } else if (kind === "task") {
      const t = findTask(id);
      if (!t || text === t.text) return;
      if (!text) { el.textContent = t.text; toast("Nội dung việc không được để trống"); return; }
      let inAdded = false; // việc thêm mới nằm trong state.added, việc gốc thì ghi đè bằng state.taskText
      Object.keys(state.added).forEach((gid) => state.added[gid].forEach((x) => { if (x.id === id) { x.text = text; inAdded = true; } }));
      if (!inAdded) state.taskText[id] = text;
    } else if (kind === "cap") {
      const g = findGame(id), i = Number(field);
      if (!g || !g.images[i] || text === (g.images[i].caption || "")) return;
      const arr = imagesOf(g);
      arr[i].caption = text;
      state.images[id] = arr;
    } else return;
    save();
    rebuild();
    renderBoard(); // chỉ làm mới bảng đầu trang, không vẽ lại cả trang để khỏi cướp focus ô khác
    $("dirty").hidden = false;
  }
  document.addEventListener("focusout", (e) => { if (e.target.matches && e.target.matches(EDITABLE)) commitEdit(e.target); });
  document.addEventListener("keydown", (e) => {
    if (!e.target.matches || !e.target.matches(EDITABLE)) return;
    if (e.key === "Enter" && e.target.getAttribute("aria-multiline") !== "true") { e.preventDefault(); e.target.blur(); }
  });
  document.addEventListener("paste", (e) => { // dán chữ thuần, bỏ định dạng
    if (!e.target.matches || !e.target.matches(EDITABLE)) return;
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, e.target.getAttribute("aria-multiline") === "true" ? t : t.replace(/\s*\n\s*/g, " "));
  });

  // Tài liệu tham khảo
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!el.matches || !el.matches('[data-action="link-edit"]')) return;
    const g = findGame(el.getAttribute("data-game"));
    const arr = g && linksOf(g), i = Number(el.getAttribute("data-index"));
    if (!arr || !arr[i]) return;
    arr[i][el.getAttribute("data-k")] = el.value.trim();
    state.links[g.id] = arr;
    save(); rebuild(); $("dirty").hidden = false;
  });

  // Ảnh: đọc file, thu nhỏ còn tối đa 1280px, nén JPEG để nhẹ rồi giữ tạm cho tới khi Lưu lên web
  function processImage(file, gid) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const r = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * r));
        c.height = Math.max(1, Math.round(img.height * r));
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve({ dataUrl: c.toDataURL("image/jpeg", 0.82), name: gid + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + ".jpg" });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được ảnh")); };
      img.src = url;
    });
  }
  function pickImage(gid, index) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      processImage(f, gid).then((res) => {
        const g = findGame(gid);
        if (!g) return;
        const arr = imagesOf(g);
        const old = index >= 0 ? arr[index] : null;
        const item = { src: res.dataUrl, caption: old ? old.caption || "" : "", pending: res.name };
        if (old) arr[index] = item; else arr.push(item);
        state.images[gid] = arr;
        save(); render();
        toast(old ? "Đã thay ảnh. Bấm Lưu lên web để áp dụng." : "Đã thêm ảnh. Bấm Lưu lên web để áp dụng.");
      }).catch(() => toast("Không đọc được file ảnh này."));
    };
    inp.click();
  }

  // Chuyển game sang mục khác (kéo thả hoặc chọn từ danh sách)
  function moveGame(gid, key) {
    const from = sectionOf(gid), g = findGame(gid);
    if (!from || !g || from.key === key) return;
    const prevMoved = state.moved[gid], prevProg = state.progress[gid], p = prog(g);
    state.moved[gid] = key;
    if (key === "done") state.progress[gid] = 100;
    else if (key === "planned") state.progress[gid] = 0;
    else if (p >= 100) state.progress[gid] = 90;
    else if (p <= 0) state.progress[gid] = 10;
    save(); render();
    const to = DATA.sections.find((s) => s.key === key);
    toast('Đã chuyển "' + g.name + '" sang "' + (to ? to.title : key) + '"', () => {
      if (prevMoved === undefined) delete state.moved[gid]; else state.moved[gid] = prevMoved;
      if (prevProg === undefined) delete state.progress[gid]; else state.progress[gid] = prevProg;
      save(); render();
    });
    requestAnimationFrame(() => { const c = $("g-" + gid); if (c) c.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" }); });
  }
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.matches && el.matches('[data-action="move"]') && ui.editing) moveGame(el.getAttribute("data-id"), el.value);
  });
  document.addEventListener("dragstart", (e) => {
    const h = e.target.closest && e.target.closest("[data-drag]");
    if (!h || !ui.editing) return;
    ui.dragging = h.getAttribute("data-drag");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", ui.dragging);
    const card = h.closest(".game");
    if (card && e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(card, 24, 24);
    document.body.classList.add("dragging");
    if (card) card.classList.add("drag-src");
  });
  const endDrag = () => {
    ui.dragging = "";
    document.body.classList.remove("dragging");
    document.querySelectorAll(".drop-hover, .drag-src").forEach((el) => el.classList.remove("drop-hover", "drag-src"));
  };
  document.addEventListener("dragend", endDrag);
  document.addEventListener("dragover", (e) => {
    if (!ui.dragging) return;
    const s = e.target.closest && e.target.closest(".section");
    if (!s) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".section.drop-hover").forEach((x) => { if (x !== s) x.classList.remove("drop-hover"); });
    s.classList.add("drop-hover");
  });
  document.addEventListener("drop", (e) => {
    if (!ui.dragging) return;
    const s = e.target.closest && e.target.closest(".section");
    if (!s) return;
    e.preventDefault();
    const gid = ui.dragging;
    endDrag();
    moveGame(gid, s.getAttribute("data-key"));
  });

  function addGame(secKey) {
    const id = "g" + Date.now().toString(36);
    state.newGames.push({ sec: secKey, game: {
      id: id, name: "Game mới", genre: "Thể loại", platform: "Nền tảng", progress: secKey === "done" ? 100 : 0, meta: "",
      description: "Mô tả ngắn về game…", images: [], tasks: [], links: [], comments: []
    } });
    save(); render();
    requestAnimationFrame(() => {
      const c = $("g-" + id);
      if (!c) return;
      c.scrollIntoView({ block: "center" });
      const h = c.querySelector("h3");
      if (h) { h.focus(); const s = window.getSelection(); if (s) s.selectAllChildren(h); }
    });
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !ui.editing) return;
    const act = el.getAttribute("data-action"), gid = el.getAttribute("data-game"), i = Number(el.getAttribute("data-index"));
    const g = gid ? findGame(gid) : null;
    if (act === "link-add" && g) {
      const arr = linksOf(g); arr.push({ title: "Tài liệu mới", url: "https://" });
      state.links[gid] = arr; save(); render();
      const inputs = document.querySelectorAll('#g-' + gid + ' [data-action="link-edit"][data-k="title"]');
      if (inputs.length) { const last = inputs[inputs.length - 1]; last.focus(); last.select(); }
    } else if (act === "link-del" && g) {
      const before = linksOf(g), arr = linksOf(g); arr.splice(i, 1);
      state.links[gid] = arr; save(); render();
      toast("Đã xóa tài liệu", () => { state.links[gid] = before; save(); render(); });
    } else if (act === "img-replace" && g) pickImage(gid, i);
    else if (act === "img-add" && g) pickImage(gid, -1);
    else if (act === "img-del" && g) {
      const before = imagesOf(g), arr = imagesOf(g); arr.splice(i, 1);
      state.images[gid] = arr; save(); render();
      toast("Đã xóa ảnh", () => { state.images[gid] = before; save(); render(); });
    } else if (act === "add-game") addGame(el.getAttribute("data-sec"));
    else if (act === "gh-save") saveToWeb();
  });

  // ---------- Lưu lên web (ghi vào GitHub, trang tự cập nhật sau ít phút) ----------
  const GH_TOKEN_KEY = "game-progress-gh-token";
  const getToken = () => { try { return localStorage.getItem(GH_TOKEN_KEY) || ""; } catch (e) { return ""; } };
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const fromB64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
  function askToken() {
    return new Promise((resolve) => {
      const dlg = $("gh-dialog"), inp = $("gh-token");
      inp.value = "";
      const finish = (v) => { dlg.close(); resolve(v); };
      $("gh-ok").onclick = (ev) => {
        ev.preventDefault();
        const v = inp.value.trim();
        if (!v) { inp.focus(); return; }
        try { localStorage.setItem(GH_TOKEN_KEY, v); } catch (err) {}
        finish(v);
      };
      $("gh-cancel").onclick = (ev) => { ev.preventDefault(); finish(""); };
      dlg.oncancel = () => resolve("");
      dlg.showModal();
      inp.focus();
    });
  }
  async function gh(cfg, token, path, opts) {
    const o = opts || {};
    const r = await fetch("https://api.github.com/repos/" + cfg.repo + path, {
      method: o.method || "GET",
      headers: Object.assign({ Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, o.body ? { "Content-Type": "application/json" } : {}),
      body: o.body
    });
    if (!r.ok) {
      const err = new Error("GitHub " + r.status);
      err.status = r.status;
      try { err.detail = (await r.json()).message; } catch (x) {}
      throw err;
    }
    return r.json();
  }
  let saving = false;
  function setSaveBusy(b) {
    const btn = $("save-web");
    btn.disabled = b;
    btn.textContent = b ? "Đang lưu…" : "Lưu lên web";
  }
  async function saveToWeb() {
    const cfg = DATA.github;
    if (!cfg || !cfg.repo) { toast("Chưa cấu hình mục github trong data.js."); return; }
    if (saving) return;
    if (!isDirty()) { toast("Chưa có thay đổi nào để lưu."); return; }
    let token = getToken();
    if (!token) { token = await askToken(); if (!token) return; }
    saving = true; setSaveBusy(true);
    try {
      const out = buildExport();
      const branch = cfg.branch || "main", path = cfg.path || "data.js";
      // 1) tải ảnh mới lên thư mục images/
      for (const sec of out.sections) for (const g of sec.games) for (const im of g.images || []) {
        if (!im.pending) continue;
        await gh(cfg, token, "/contents/images/" + encodeURIComponent(im.pending), {
          method: "PUT",
          body: JSON.stringify({ message: "Thêm ảnh " + im.pending, content: im.src.split(",")[1], branch: branch })
        });
        im.src = "images/" + im.pending;
        delete im.pending;
      }
      // 2) ghi data.js, giữ nguyên phần chú thích ở đầu file
      const cur = await gh(cfg, token, "/contents/" + path + "?ref=" + encodeURIComponent(branch));
      const old = fromB64(cur.content), at = old.search(/^window\.PROGRESS\s*=/m); // đầu dòng, để không nhầm với chữ trong phần chú thích
      const text = (at > 0 ? old.slice(0, at) : "") + "window.PROGRESS = " + JSON.stringify(out, null, 2) + ";\n";
      await gh(cfg, token, "/contents/" + path, {
        method: "PUT",
        body: JSON.stringify({ message: "Cập nhật tiến độ từ trang web", content: b64(text), sha: cur.sha, branch: branch })
      });
      // 3) xong: dữ liệu vừa lưu trở thành dữ liệu gốc, xóa các chỉnh sửa tạm
      BASE = { sections: JSON.parse(JSON.stringify(out.sections)) };
      DATA.updated = out.updated;
      state = EMPTY();
      save(); render();
      toast("Đã lưu lên web. Mọi người sẽ thấy sau khoảng 1 phút.");
    } catch (e) {
      if (e.status === 401) {
        try { localStorage.removeItem(GH_TOKEN_KEY); } catch (x) {}
        toast("Token không hợp lệ hoặc đã hết hạn. Bấm Lưu lên web để nhập token mới.");
      } else if (e.status === 403 || e.status === 404) {
        toast("Token chưa đủ quyền ghi vào repo. Cần quyền Contents: Read and write.");
      } else if (e.status === 409 || e.status === 422) {
        toast("Dữ liệu trên web vừa thay đổi. Tải lại trang rồi thử lại.");
      } else {
        toast("Không lưu được: " + (e.detail || e.message));
      }
    } finally {
      saving = false; setSaveBusy(false);
    }
  }
  $("save-web").addEventListener("click", saveToWeb);
  $("gh-forget").addEventListener("click", () => {
    try { localStorage.removeItem(GH_TOKEN_KEY); } catch (e) {}
    toast("Đã xóa token khỏi trình duyệt này.");
  });

  // ---------- Kết nối chat ----------
  async function createChatApi() {
    if (CHAT.provider === "firebase") {
      const base = "https://www.gstatic.com/firebasejs/10.14.1/";
      const [appMod, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-firestore.js")]);
      const db = fs.getFirestore(appMod.initializeApp(CHAT.firebase));
      const col = fs.collection(db, "rooms", room, "messages");
      return {
        subscribe: (onList, onErr) => fs.onSnapshot(fs.query(col, fs.orderBy("ts")),
          (snap) => onList(snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))), onErr),
        add: (m) => fs.addDoc(col, m),
        remove: (id) => fs.deleteDoc(fs.doc(col, id)),
        restore: (m) => { const rest = Object.assign({}, m); delete rest.id; return fs.setDoc(fs.doc(col, m.id), rest); }
      };
    }
    // "local": chat thử giữa các tab cùng trình duyệt (không cần máy chủ)
    const LSK = "gp-chat-local-" + room;
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LSK) : null;
    const read = () => { try { return JSON.parse(localStorage.getItem(LSK)) || []; } catch (e) { return []; } };
    const write = (l) => localStorage.setItem(LSK, JSON.stringify(l));
    let cb = null;
    const push = () => { if (cb) cb(read().sort((a, b) => a.ts - b.ts)); };
    const changed = () => { if (bc) bc.postMessage(1); push(); };
    if (bc) bc.onmessage = push;
    window.addEventListener("storage", (e) => { if (e.key === LSK) push(); });
    return {
      subscribe: (onList) => { cb = onList; push(); return () => { cb = null; }; },
      add: async (m) => { const l = read(); l.push(Object.assign({ id: uid("m-") }, m)); write(l); changed(); },
      remove: async (id) => { write(read().filter((x) => x.id !== id)); changed(); },
      restore: async (m) => { const l = read(); l.push(m); write(l); changed(); }
    };
  }

  // Cập nhật khi có tin mới. Đang gõ chữ thì chỉ làm mới danh sách tin, không vẽ lại ô gõ
  // (vẽ lại sẽ làm mất chữ đang gõ dở, nhất là gõ tiếng Việt kiểu Telex).
  let knownIds = null, pendingRender = false;
  const isTyping = () => {
    const ae = document.activeElement;
    if (ae && ae.isContentEditable) return true; // đang sửa chữ trực tiếp trên trang
    return !!(ae && ae.matches && ae.matches(".composer textarea, .composer input, .le, .add-task input") && (ae.value || "").length);
  };
  function softRender() {
    if (!isTyping()) { pendingRender = false; render(); return; }
    pendingRender = true;
    document.querySelectorAll(".game").forEach((el) => {
      const g = findGame(el.id.slice(2));
      const w = el.querySelector(".thread-wrap");
      if (g && w) w.innerHTML = threadHtml(g);
    });
    if (ui.pop) {
      const g = findGame(ui.pop.gid);
      const w = popEl.querySelector(".pop-thread-wrap");
      if (g && w) w.innerHTML = popThreadHtml(g, ui.pop);
    }
  }
  document.addEventListener("focusout", () => {
    if (!pendingRender) return;
    setTimeout(() => { if (pendingRender && !isTyping()) { pendingRender = false; render(); } }, 400);
  });
  function onRemote(list) {
    const prev = knownIds;
    knownIds = new Set(list.map((m) => m.id));
    remote = list;
    if (prev) {
      const fresh = list.filter((m) => !prev.has(m.id) && m.cid !== myCid);
      if (fresh.length) { const m = fresh[fresh.length - 1]; toast(m.author + ": " + short(m.text, 70)); }
    }
    softRender();
    if (!chatReady) {
      chatReady = true;
      if (/^#t-/.test(location.hash)) handleHash(false); // mở đúng phần từ link email khi tin đã tải xong
    }
  }
  async function initChat() {
    if (!chatOn || !room) return;
    try {
      chatApi = await createChatApi();
      chatApi.subscribe(onRemote, () => toast("Mất kết nối chat, hãy tải lại trang."));
    } catch (e) {
      toast("Không kết nối được chat.");
    }
  }

  render();
  handleHash(true);
  initChat();
})();
