(function () {
  "use strict";

  const DATA = window.PROGRESS;
  const KEY = "game-progress-state-v1";
  const MODE_KEY = "game-progress-edit-mode";
  const NAME_KEY = "game-progress-author";
  // Nếu trình duyệt đang giữ bản index.html cũ (thiếu một số nút mà app.js mới cần), trả về phần tử "rỗng" vô hại
  // thay vì để lỗi làm trắng cả trang.
  const ghosts = {};
  const $ = (id) => document.getElementById(id) || (ghosts[id] = ghosts[id] || document.createElement("div"));
  // state = các chỉnh sửa chưa lưu lên web (nằm trong trình duyệt này):
  // fields/links/images/moved/newGames/taskText là sửa trực tiếp trên trang, các mục còn lại như cũ.
  const EMPTY = () => ({
    delGames: [], delTasks: [], done: {}, added: {}, comments: {}, delComments: [], progress: {},
    fields: {}, links: {}, images: {}, moved: {}, newGames: [], taskText: {}, versions: {}
  });
  const canHover = () => matchMedia("(hover: hover)").matches;
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Cơ sở dữ liệu dùng chung (Firebase): nội dung trang + chat ----------
  // CHAT.provider: "" = chưa kết nối (hiện dữ liệu mẫu, sửa chỉ nằm trên trình duyệt này),
  // "firebase" = dùng thật, "local" = thử giữa các tab cùng trình duyệt (chỉ để thử giao diện).
  const CHAT = DATA.db || DATA.chat || {};
  // Chưa điền cấu hình Firebase thì coi như chưa kết nối
  const chatOn = !!CHAT.provider && (
    CHAT.provider === "local" ||
    (CHAT.provider === "firebase" && !!(CHAT.firebase && CHAT.firebase.projectId)) ||        // Firestore
    (CHAT.provider === "rtdb" && !!(CHAT.firebase && CHAT.firebase.databaseURL)));            // Realtime Database
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
  // Đăng nhập email (Firebase Authentication, link gửi qua email, không mật khẩu) để xác nhận chủ trang.
  // AUTH_ON: có apiKey nên đăng nhập được. AUTH_ENFORCED: đã khai báo ownerUid, chỉ đúng tài khoản đó là chủ trang.
  // Chủ trang = tài khoản Google có email khớp ownerEmailHash (mã băm SHA-256 của email, để email không nằm công khai
  // trong code) hoặc có UID khớp ownerUid. Chủ trang làm gì cũng không bị gửi email báo. Mọi người khác (không đăng
  // nhập hoặc tài khoản khác) nhắn hay chỉnh sửa đều gửi email báo cho chủ trang.
  const AUTH_ON = chatOn && CHAT.provider === "rtdb" && !!(CHAT.firebase && CHAT.firebase.apiKey);
  const OWNER_UID = String(CHAT.ownerUid || "").trim();
  const OWNER_HASH = String(CHAT.ownerEmailHash || "").trim().toLowerCase();
  const AUTH_ENFORCED = AUTH_ON && !!(OWNER_UID || OWNER_HASH);
  let authUser = null;      // người đang đăng nhập (null = chưa)
  let authIsOwner = false;  // người đó có phải chủ trang không (tính xong sau khi đăng nhập)
  const legacyOwner = () => { try { return localStorage.getItem(OWNER_KEY) === "1"; } catch (e) { return false; } };
  // Khi đã khai báo chủ trang: chỉ đăng nhập đúng tài khoản mới là chủ. Chưa khai báo: trình duyệt đã bấm Chỉnh sửa là chủ (như cũ).
  const isOwner = () => AUTH_ENFORCED ? authIsOwner : (ui.editing || legacyOwner());
  async function sha256Hex(s) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  async function computeOwner(u) {
    if (!u) return false;
    if (OWNER_UID && u.uid === OWNER_UID) return true;
    if (OWNER_HASH && u.email && u.emailVerified !== false) {
      try { return (await sha256Hex(String(u.email).trim().toLowerCase())) === OWNER_HASH; } catch (e) { return false; }
    }
    return false;
  }
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
  function persist() { // ghi bản nháp vào trình duyệt (không kích hoạt lưu lên cơ sở dữ liệu)
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {
      if (!warnedQuota) { warnedQuota = true; toast("Bộ nhớ trình duyệt đầy (thường do ảnh lớn). Thay đổi vẫn đang được lưu lên cơ sở dữ liệu."); }
    }
  }
  function save() { // mọi chỉnh sửa gọi hàm này: ghi nháp rồi tự động lưu lên cơ sở dữ liệu
    persist();
    if (chatOn && room) scheduleSync();
  }
  const isDirty = () => {
    const s = state;
    return !!(s.delGames.length || s.delTasks.length || s.delComments.length || s.newGames.length ||
      Object.keys(s.done).length || Object.keys(s.added).length || Object.keys(s.progress).length ||
      Object.keys(s.comments).length || Object.keys(s.fields).length || Object.keys(s.links).length ||
      Object.keys(s.images).length || Object.keys(s.moved).length || Object.keys(s.taskText).length ||
      Object.keys(s.versions).length);
  };

  // Dữ liệu gốc (như trong data.js) và dữ liệu hiệu lực = gốc + chỉnh sửa trực tiếp chưa lưu.
  // DATA.sections luôn là dữ liệu hiệu lực để phần còn lại của mã dùng thẳng.
  // SEED = dữ liệu mẫu trong data.js, chỉ dùng để nạp lần đầu vào cơ sở dữ liệu trống.
  // Khi đã kết nối cơ sở dữ liệu thì dữ liệu gốc bắt đầu rỗng và chỉ lấy từ cơ sở dữ liệu.
  const SEED = JSON.parse(JSON.stringify(DATA.sections));
  let BASE = { sections: chatOn ? [] : JSON.parse(JSON.stringify(SEED)) };
  function rebuild() {
    const secs = JSON.parse(JSON.stringify(BASE.sections));
    if (!secs.length) { DATA.sections = secs; return; }
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
      if (state.versions[g.id]) g.versions = JSON.parse(JSON.stringify(state.versions[g.id]));
    }));
    DATA.sections = secs;
  }
  rebuild();

  // ---------- Trạng thái giao diện ----------
  const ui = {
    editing: false, collapsed: {}, drafts: {}, name: "", pop: null, incoming: null, annotating: false,
    filter: { q: "", sec: "all", genre: "" }, dragging: "",
    viewVersion: {},   // game id → id phiên bản cũ đang xem (không có = xem bản mới nhất)
    showResolved: {},  // khóa → có đang hiện các nhận xét đã giải quyết không
    chatGame: "all",   // khung Trao đổi bên phải: "all" = tất cả nhận xét (mặc định), "auto" = theo phần đang xem, "_site", hoặc id game
    allTo: "",         // ô "Viết về" ở mục Tất cả nhận xét (rỗng = theo game đang xem)
    spyGame: "",       // game đang nằm ở đầu màn hình (do updateSpy tính)
    lCollapsed: false, // thanh bên trái đang thu gọn (chỉ có tác dụng trên máy tính)
    rCollapsed: false  // thanh bên phải đang thu gọn (chỉ có tác dụng trên máy tính)
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
        resolved: !!m.resolved,
        target: m.tid ? { id: m.tid, label: m.tlabel || "" } : undefined
      })) :
      (state.comments[g.id] || []).filter((c) => !ids.has(c.id)).map((c) => Object.assign({}, c, { mine: true }));
    return base.concat(extra).sort((a, b) => new Date(a.time) - new Date(b.time));
  }
  function targetCounts(g) {
    const m = {};
    // chỉ đếm nhận xét chưa giải quyết
    allComments(g).forEach((c) => { if (!c.resolved && c.target && c.target.id) m[c.target.id] = (m[c.target.id] || 0) + 1; });
    return m;
  }
  // "Toàn trang": game giả đại diện cho các phần giao diện chung (tiêu đề, bảng tổng quan, menu, thanh lọc…)
  // để nhận xét về chúng cũng đi qua đúng đường như nhận xét về một game.
  const SITE_ID = "_site";
  const SITE_GAME = { id: SITE_ID, name: "Toàn trang", comments: [], versions: [] };
  function findGame(id) {
    if (id === SITE_ID) return SITE_GAME;
    for (const sec of DATA.sections) for (const g of sec.games) if (g.id === id) return g;
  }
  // Tìm phần tử theo mã nhận xét: có sẵn id thì dùng id, không thì tìm theo data-target (phần tử tĩnh như #title)
  const targetEl = (tid) => document.getElementById(tid) || Array.from(document.querySelectorAll("[data-target]")).find((e) => e.getAttribute("data-target") === tid);
  function tagSite(el, kind, label, cm) {
    if (!el) return;
    const tid = "t-" + SITE_ID + "-" + kind;
    el.setAttribute("data-annot", "");
    el.setAttribute("data-target", tid);
    el.setAttribute("data-tlabel", label);
    el.setAttribute("data-agame", SITE_ID); // data-game của một số phần tử đang dùng cho việc khác (ví dụ ô game), nên dùng thuộc tính riêng
    if (cm[tid]) el.setAttribute("data-ccount", cm[tid]); else el.removeAttribute("data-ccount");
  }
  // Gắn dấu "nhận xét được" cho mọi phần giao diện chung. Gọi lại sau mỗi lần vẽ vì một số phần được vẽ lại.
  // Hiện KHÔNG phần nào của phần đầu trang nhận xét được: tiêu đề, ngày cập nhật, bảng tổng quan, thanh tìm kiếm và lọc,
  // nút Trao đổi, tiêu đề các mục, và hai thanh bên. Chỉ nội dung từng game (ảnh, tiến độ, mô tả, việc, link, phiên bản…)
  // nhận xét được. Nhận xét chung về cả trang vẫn viết được ở mục "Toàn trang" của khung Trao đổi.
  // Hàm giữ lại (không làm gì) để các chỗ gọi sau mỗi lần vẽ lại không phải sửa.
  function markSiteTargets() { /* không gắn dấu nhận xét cho phần giao diện chung */ }
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

  // Ảnh đại diện chữ cái đầu, màu theo tên (cùng một tên luôn cùng một màu)
  function avatarHtml(name) {
    const s = String(name || "?").trim() || "?";
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    const w = s.split(/\s+/), ch = (w[w.length - 1][0] || "?").toUpperCase();
    return '<span class="avatar" style="--h:' + h + '" aria-hidden="true">' + esc(ch) + "</span>";
  }
  const ICON_OK = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_UNDO = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_DEL = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Khung một tin nhắn dùng chung cho khung Trao đổi và cửa sổ nhận xét nhỏ
  function msgShell(o) {
    return '<li class="msg' + (o.cls || "") + '">' + avatarHtml(o.author) + '<div class="msg-main"><div class="msg-head"><b>' + esc(o.author) + "</b><time>" + esc(fmtTime(o.time)) + "</time>" + (o.badge || "") + "</div>" +
      (o.ctx ? '<div class="msg-ctx">' + o.ctx + "</div>" : "") +
      '<p class="bubble">' + esc(o.text) + "</p>" + (o.foot ? '<div class="msg-foot">' + o.foot + "</div>" : "") + "</div></li>";
  }

  function renderMsg(g, c, withTag, withGame) {
    // Người viết, hoặc chủ trang (trình duyệt đã từng bấm Chỉnh sửa), được xóa hoặc đánh dấu "đã giải quyết" (ẩn đi)
    const canAct = c.mine || isOwner();
    const canResolve = canAct && (c.remote || c.mine);
    return msgShell({
      cls: (c.mine ? " mine" : "") + (c.resolved ? " resolved" : ""), author: c.author, time: c.time, text: c.text,
      badge: c.resolved ? '<span class="badge ok">Đã giải quyết</span>' : "",
      ctx: (withGame ? '<a class="ctag gtag" href="' + (g.id === SITE_ID ? "#" : "#g-" + esc(g.id)) + '" data-action="goto-game" data-id="' + esc(g.id) + '">' + esc(g.name) + "</a>" : "") +
        (withTag && c.target ? '<a class="ctag" href="#' + esc(c.target.id) + '" data-action="goto-target" data-id="' + esc(c.target.id) + '">' + esc(c.target.label) + "</a>" : ""),
      foot: (canResolve ? '<button class="act ok" type="button" data-action="resolve-comment" data-game="' + esc(g.id) + '" data-id="' + esc(c.id) + '" data-to="' + (c.resolved ? "0" : "1") + '">' + (c.resolved ? ICON_UNDO + "Mở lại" : ICON_OK + "Đã giải quyết") + "</button>" : "") +
        (canAct ? '<button class="act danger" type="button" data-action="del-comment" data-game="' + esc(g.id) + '" data-id="' + esc(c.id) + '" aria-label="Xóa nhận xét của ' + esc(c.author) + '">' + ICON_DEL + "Xóa</button>" : "")
    });
  }

  // Danh sách tin: chưa giải quyết hiện sẵn, đã giải quyết bị ẩn (bấm để hiện lại)
  function threadList(g, list, key, withTag, cls) {
    const open = list.filter((c) => !c.resolved), done = list.filter((c) => c.resolved);
    const shown = !!ui.showResolved[key];
    const li = (c) => renderMsg(g, c, withTag);
    return {
      open: open, done: done,
      html: (open.length ? '<ul class="thread' + cls + '">' + open.map(li).join("") + "</ul>" : "") +
        (done.length ? '<button type="button" class="link-btn show-resolved" data-action="toggle-resolved" data-key="' + esc(key) + '" aria-expanded="' + shown + '">' +
          (shown ? "Ẩn " : "Hiện ") + done.length + " nhận xét đã giải quyết</button>" : "") +
        (done.length && shown ? '<ul class="thread resolved-list' + cls + '">' + done.map(li).join("") + "</ul>" : "")
    };
  }

  // Phần tiêu đề + danh sách tin nhắn của một game (tách riêng để cập nhật mà không đụng vào ô đang gõ)
  function threadHtml(g) {
    const list = allComments(g);
    const t = threadList(g, list, g.id, true, "");
    return '<h4 class="thread-title">' + (chatOn ? "Trao đổi" : "Nhận xét") + (t.open.length ? '<span class="count">' + t.open.length + "</span>" : "") + "</h4>" +
      (list.length ?
        (!t.open.length ? '<p class="no-comments">Mọi nhận xét đã được giải quyết.</p>' : "") + t.html :
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

  // ---------- Mục "Tất cả nhận xét" của khung Trao đổi ----------
  // Gom nhận xét của mọi game và của "Toàn trang", theo thời gian. Mỗi tin có nhãn game để biết là về đâu.
  function allItems() {
    const items = [];
    [SITE_GAME].concat(DATA.sections.reduce((a, s) => a.concat(visibleGames(s)), [])).forEach((g) => allComments(g).forEach((c) => items.push({ g: g, c: c })));
    return items.sort((a, b) => new Date(a.c.time) - new Date(b.c.time));
  }
  function allThreadHtml() {
    const items = allItems();
    const open = items.filter((x) => !x.c.resolved), done = items.filter((x) => x.c.resolved);
    const shown = !!ui.showResolved.all;
    const li = (x) => renderMsg(x.g, x.c, true, true);
    return '<h4 class="thread-title">Chưa giải quyết' + (open.length ? '<span class="count">' + open.length + "</span>" : "") + "</h4>" +
      (!items.length ? '<p class="no-comments">Chưa có nhận xét nào. Rê chuột vào một phần bất kỳ của trang rồi bấm "Nhận xét", hoặc viết ở dưới.</p>' :
        (!open.length ? '<p class="no-comments">Mọi nhận xét đã được giải quyết.</p>' : "") +
        (open.length ? '<ul class="thread">' + open.map(li).join("") + "</ul>" : "") +
        (done.length ? '<button type="button" class="link-btn show-resolved" data-action="toggle-resolved" data-key="all" aria-expanded="' + shown + '">' +
          (shown ? "Ẩn " : "Hiện ") + done.length + " nhận xét đã giải quyết</button>" : "") +
        (done.length && shown ? '<ul class="thread resolved-list">' + done.map(li).join("") + "</ul>" : ""));
  }
  function renderAllComments() {
    const games = DATA.sections.reduce((a, s) => a.concat(visibleGames(s)), []);
    const to = ui.allTo && (ui.allTo === SITE_ID || games.some((g) => g.id === ui.allTo)) ? ui.allTo : (games.some((g) => g.id === ui.spyGame) ? ui.spyGame : SITE_ID);
    return '<section class="comments" id="c-all" aria-label="Tất cả nhận xét"><div class="thread-wrap">' + allThreadHtml() + "</div>" +
      '<form class="composer" data-game="">' +
      '<label class="sr-only" for="to-all">Viết về</label>' +
      '<select id="to-all" name="gid" class="to-select" data-fk="to-all"><option value="' + SITE_ID + '"' + (to === SITE_ID ? " selected" : "") + ">Viết về: Toàn trang</option>" +
      games.map((g) => '<option value="' + esc(g.id) + '"' + (g.id === to ? " selected" : "") + ">Viết về: " + esc(g.name) + "</option>").join("") + "</select>" +
      '<label class="sr-only" for="cn-all">Tên của bạn</label>' +
      '<input id="cn-all" name="author" type="text" maxlength="40" placeholder="Tên của bạn" autocomplete="name" data-fk="cn-all" value="' + esc(ui.name) + '" required>' +
      '<label class="sr-only" for="ct-all">Nội dung nhận xét</label>' +
      '<textarea id="ct-all" name="text" rows="2" maxlength="600" placeholder="Viết nhận xét chung" data-draft="all" data-fk="ct-all" required>' + esc(ui.drafts.all || "") + "</textarea>" +
      '<div class="composer-foot"><span class="hint kbd">Ctrl + Enter để gửi</span><button class="btn small" type="submit">' + (chatOn ? "Gửi" : "Thêm nhận xét") + "</button></div></form></section>";
  }

  // ---------- Phiên bản của từng game ----------
  // g.versions = [{ id, version, date, notes, snap }] từ cũ đến mới. Bản mới nhất (latest) luôn là dữ liệu hiện tại
  // của game; khi tạo bản mới, bản cũ nhất được "đóng băng" thành snap = ảnh chụp thông tin lúc đó.
  const versionsOf = (g) => JSON.parse(JSON.stringify(g.versions || []));
  const isDataUrl = (s) => /^data:/.test(s || "");
  const todayStr = () => { const d = new Date(); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); };
  const nextVersion = (prev) => {
    if (!prev) return "v1.0";
    const m = String(prev).match(/^(.*?)(\d+)(\D*)$/);
    return m ? m[1] + (Number(m[2]) + 1) + m[3] : prev + ".1";
  };
  let imgIndex = {}; // iid → nội dung ảnh (gồm cả ảnh đã bỏ khỏi game nhưng còn thuộc phiên bản cũ)
  function imgSrc(iid) {
    if (imgIndex[iid]) return imgIndex[iid];
    for (const s of DATA.sections) for (const g of s.games) for (const im of g.images || []) if (im.iid === iid) return im.src;
    return "";
  }
  const snapImages = (snap) => (snap.images || []).map((im) => ({ src: im.src || imgSrc(im.iid), caption: im.caption || "" })).filter((im) => im.src);
  function snapOf(g) { // ảnh chụp toàn bộ thông tin game ở thời điểm hiện tại
    const sec = DATA.sections.find((s) => s.games.some((x) => x.id === g.id));
    return {
      sec: sec ? sec.key : "dev", name: g.name, genre: g.genre, platform: g.platform, meta: g.meta || "", description: g.description,
      progress: prog(g),
      links: (g.links || []).map((l) => ({ title: l.title || "", url: l.url || "" })),
      tasks: visibleTasks(g).map((t) => ({ id: String(t.id), text: t.text, done: isDone(t) })),
      images: (g.images || []).map((im) => {
        const o = { caption: im.caption || "" };
        if (im.iid) o.iid = im.iid;
        if (!(chatOn && isDataUrl(im.src))) o.src = im.src; // ảnh lớn đã nằm trong cơ sở dữ liệu thì chỉ ghi tham chiếu
        return o;
      })
    };
  }

  function renderVerBar(g, vers, viewingId, cm) {
    const canCreate = ui.editing && chatOn && !!room;
    if (!vers.length && !canCreate) return "";
    const latest = vers[vers.length - 1];
    const cur = viewingId || (latest && latest.id);
    const opts = vers.slice().reverse().map((v) => '<option value="' + esc(v.id) + '"' + (v.id === cur ? " selected" : "") + ">" +
      esc(v.version) + (v === latest ? " (latest)" : "") + (v.date ? " · " + esc(v.date) : "") + "</option>").join("");
    return '<div class="verbar"' + A(g, "verbar", "Chọn phiên bản", cm || {}) + ">" +
      (vers.length ? '<label class="ver-label">Phiên bản <select class="ver-select" data-action="ver-select" data-game="' + esc(g.id) + '">' + opts + "</select></label>" :
        '<span class="ver-none">Chưa có phiên bản nào.</span>') +
      (canCreate ? '<button type="button" class="btn small ghost" data-action="ver-new" data-game="' + esc(g.id) + '">+ Tạo phiên bản mới</button>' : "") + "</div>";
  }
  function renderVerNotes(g, v, isLatest, cm) {
    const x = ' data-game="' + esc(g.id) + '"';
    const name = ui.editing ? ed("ver", v.id, "version", v.version, "span", "ver-name", false, "Số phiên bản", "Số phiên bản", x) : '<span class="ver-name">' + esc(v.version) + "</span>";
    const notes = ui.editing ?
      ed("ver", v.id, "notes", v.notes || "", "div", "ver-text", true, "Ghi chú bản vá của phiên bản này", "Bản vá và thay đổi của phiên bản này…", x) :
      (v.notes ? '<div class="ver-text">' + esc(v.notes) + "</div>" : '<div class="ver-text none">Chưa có ghi chú cho phiên bản này.</div>');
    return '<section class="ver-notes"' + A(g, "vernotes", "Bản vá " + v.version, cm || {}) + "><h4>Bản vá " + name + (isLatest ? ' <span class="badge latest">latest</span>' : "") +
      (v.date ? " <time>" + esc(v.date) + "</time>" : "") +
      (ui.editing ? ' <button type="button" class="link-btn" data-action="ver-del" data-game="' + esc(g.id) + '" data-id="' + esc(v.id) + '">Xóa phiên bản</button>' : "") +
      "</h4>" + notes + "</section>";
  }
  // Xem một phiên bản cũ: hiện đúng thông tin lúc làm phiên bản đó (chỉ xem, trừ ghi chú bản vá)
  function renderHistGame(g, v, vers, nCmt) {
    const s = v.snap;
    const open = !ui.collapsed[g.id];
    const tasks = s.tasks || [];
    const imgs = snapImages(s);
    const secT = DATA.sections.find((x) => x.key === s.sec);
    const facts = '<span class="genre">' + esc(s.genre) + "</span><span>" + esc(s.platform) + "</span>" + (s.meta ? "<span>" + esc(s.meta) + "</span>" : "") +
      (secT ? "<span>Lúc đó: " + esc(secT.title) + "</span>" : "");
    const progress = s.sec === "planned" ? "" :
      '<div class="progress"><div class="progress-top"><span>Tiến độ lúc đó</span><b>' + (s.progress || 0) + "%</b></div>" +
      '<div class="bar"><i style="width:' + (s.progress || 0) + '%"></i></div></div>';
    const gallery = imgs.length ? '<div class="gallery-wrap"><div class="gallery" tabindex="0" role="group" aria-label="Ảnh của ' + esc(s.name) + ' ở phiên bản ' + esc(v.version) + '">' +
      imgs.map((im, i) => '<figure><div class="imgbox"><img loading="lazy" src="' + esc(im.src) + '" alt="' + esc(im.caption || s.name) + '" data-action="zoom" data-game="' + esc(g.id) + '" data-ver="' + esc(v.id) + '" data-index="' + i + '"></div>' +
        "<figcaption>" + esc(im.caption) + "</figcaption></figure>").join("") + "</div></div>" : "";
    const taskHtml = tasks.length ? '<ul class="tasks">' + tasks.map((t) => '<li class="task' + (t.done ? " done" : "") + '"><span class="mark" aria-hidden="true">' + (t.done ? "✓" : "") +
      '</span><span class="task-text">' + esc(t.text) + '</span><span class="sr-only">' + (t.done ? " (đã xong)" : " (chưa xong)") + "</span></li>").join("") + "</ul>" : '<p class="none">Không có việc nào.</p>';
    const links = s.links || [];
    const linkHtml = links.length ? '<ul class="links">' + links.map((l) => '<li><a href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(l.title) + "</a></li>").join("") + "</ul>" : '<p class="none">Không có tài liệu.</p>';
    const tools =
      '<a class="tool' + (nCmt ? " has-count" : "") + '" href="#c-' + esc(g.id) + '" data-action="goto-comments" data-id="' + esc(g.id) + '" aria-label="Nhận xét: ' + nCmt + '">' + ICON_CMT + "<span>" + nCmt + "</span></a>" +
      '<button class="tool" data-action="collapse" data-id="' + esc(g.id) + '" aria-expanded="' + open + '" aria-controls="m-' + esc(g.id) + '">' + '<span class="tool-label">' + (open ? "Thu gọn" : "Mở rộng") + "</span>" + ICON_CHEV + "</button>";
    return '<article class="game hist" id="g-' + esc(g.id) + '">' +
      '<div class="game-head"><div class="game-title"><h3 tabindex="-1">' + esc(s.name) + '</h3><div class="facts">' + facts + '</div></div><div class="game-tools">' + tools + "</div></div>" +
      renderVerBar(g, vers, v.id) +
      '<div class="ver-banner" role="status"><span>Đang xem phiên bản <b>' + esc(v.version) + "</b>" + (v.date ? " (" + esc(v.date) + ")" : "") +
      ". Đây là thông tin lúc làm phiên bản này, chỉ để xem.</span>" +
      '<button type="button" class="btn small" data-action="ver-latest" data-game="' + esc(g.id) + '">Xem bản mới nhất</button></div>' +
      progress +
      '<div class="game-more" id="m-' + esc(g.id) + '"' + (open ? "" : " hidden") + ">" + gallery +
      '<div class="game-body">' + renderVerNotes(g, v, false) + '<p class="desc">' + esc(s.description) + "</p>" +
      '<div class="cols"><div><h4>Việc cần làm, xong ' + tasks.filter((t) => t.done).length + "/" + tasks.length + "</h4>" + taskHtml + "</div>" +
      "<div><h4>Tài liệu tham khảo</h4>" + linkHtml + "</div></div></div></div></article>"; // trao đổi nằm ở thanh bên phải
  }

  function renderGame(sec, g) {
    const tasks = visibleTasks(g);
    const doneCount = tasks.filter(isDone).length;
    const planned = sec.key === "planned";
    const p = prog(g);
    const cm = targetCounts(g);
    const nCmt = allComments(g).filter((c) => !c.resolved).length; // chỉ đếm nhận xét chưa giải quyết
    const open = !ui.collapsed[g.id];
    const vers = g.versions || [];
    const latestV = vers[vers.length - 1] || null;
    const histV = ui.viewVersion[g.id] ? vers.find((v) => v.id === ui.viewVersion[g.id]) : null;
    if (histV && histV !== latestV && histV.snap) return renderHistGame(g, histV, vers, nCmt);

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
      renderVerBar(g, vers, null, cm) +
      progress +
      '<div class="game-more" id="m-' + esc(g.id) + '"' + (open ? "" : " hidden") + ">" + gallery +
      '<div class="game-body">' + (latestV ? renderVerNotes(g, latestV, true, cm) : "") + descHtml +
      '<div class="cols"><div><h4>Việc cần làm, xong ' + doneCount + "/" + tasks.length + "</h4>" + taskHtml + addForm + "</div>" +
      "<div><h4>Tài liệu tham khảo</h4>" + linkHtml + "</div></div></div></div></article>"; // trao đổi nằm ở thanh bên phải
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
    markSiteTargets(); // bảng tổng quan vừa được vẽ lại
  }

  function render() {
    rebuild();
    $("title").textContent = DATA.title;
    document.title = DATA.title;
    $("updated").textContent = DATA.updated || "";
    document.body.classList.toggle("editing", ui.editing);
    document.body.classList.toggle("annotating", ui.annotating);
    $("editbar").hidden = !ui.editing;
    updateSaveStatus();
    const modeBtn = $("enter-edit");
    modeBtn.textContent = ui.editing ? "Xong chỉnh sửa" : "Chỉnh sửa";
    modeBtn.setAttribute("aria-pressed", String(ui.editing));
    modeBtn.classList.toggle("on", ui.editing);

    // Đã kết nối cơ sở dữ liệu: cần link riêng mới xem được nội dung; đang tải thì báo đang tải
    const gated = chatOn && !room;
    document.body.classList.toggle("gated", gated);
    if (gated || (chatOn && !contentReady)) {
      $("board").innerHTML = "";
      $("tabs").innerHTML = "";
      $("app").innerHTML = gated ?
        '<div class="gate"><h2>Trang này cần link riêng</h2><p>Hãy mở trang bằng link do người làm gửi cho bạn (có đuôi <code>?k=…</code>).</p></div>' :
        dbError ? '<div class="gate" role="alert"><h2>Không tải được dữ liệu</h2><p>' + esc(dbError) + "</p></div>" :
        '<div class="gate" role="status"><p>Đang tải dữ liệu…</p></div>';
      renderFilterBar(0, 0);
      updateSend();
      return;
    }

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
      // Thanh bên: mục (kèm số game) và danh sách game của mục đó để nhảy nhanh
      tabsHtml += '<div class="nav-sec" data-key="' + esc(sec.key) + '"><a class="nav-sec-link" href="#sec-' + esc(sec.key) + '" data-key="' + esc(sec.key) + '"><span class="dot"></span>' +
        esc(sec.title) + '<span class="nav-count">' + (filtered ? list.length + "/" + all.length : all.length) + "</span></a>" +
        (list.length ? '<ul class="nav-games">' + list.map((g) => '<li><a class="nav-game" href="#g-' + esc(g.id) + '" data-game="' + esc(g.id) + '">' + esc(g.name) + "</a></li>").join("") + "</ul>" : "") + "</div>";
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
    // Máy tính: Thu gọn/Mở rộng tất cả là nút tròn #toggle-all ở mép phải các thẻ game (index.html).
    // Điện thoại không có chỗ trống ở mép phải nên nút này nằm trong menu trái (nav-tool mobile-only).
    tabsHtml += '<div class="nav-tools"><button type="button" class="nav-tool mobile-only" data-action="toggle-all" id="toggle-all-m"></button>' +
      (canComment ? '<button type="button" class="nav-tool touch-only' + (ui.annotating ? " on" : "") + '" data-action="annot-mode" aria-pressed="' + ui.annotating + '">Nhận xét</button>' : "") + "</div>";
    $("side-title").textContent = DATA.title;

    renderBoard();
    renderFilterBar(shown, total);
    $("tabs").innerHTML = tabsHtml;
    $("app").innerHTML = appHtml;
    renderRSide();       // phải dựng trước phần khôi phục focus bên dưới để ô đang gõ trong khung Trao đổi vẫn giữ được focus
    updateChatBadge();
    markSiteTargets();

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
    const games = document.querySelectorAll(".game");
    const anyOpen = Array.from(games).some((el) => !ui.collapsed[el.id.slice(2)]);
    const label = anyOpen ? "Thu gọn tất cả" : "Mở rộng tất cả";
    $("toggle-all-lbl").textContent = label;
    $("toggle-all-m").textContent = label;
    b.title = label;
    b.classList.toggle("is-closed", !anyOpen); // đổi biểu tượng thu gọn / mở rộng
    b.hidden = !games.length;
    placeToggleAll();
  }
  // Nút tròn nằm ngay dưới thanh header, trong dải trống ở mép phải các thẻ game (#app chừa padding-right).
  // Khi header chưa dính lên đầu (đang ở đầu trang) thì nó đi theo mép dưới của header.
  function placeToggleAll() {
    const tb = $("topbar"), b = $("toggle-all"), main = $("app");
    if (!tb || !b || !main) return;
    b.style.top = (Math.max(Math.round(tb.getBoundingClientRect().bottom), 0) + 48) + "px";
    b.style.left = Math.round(main.getBoundingClientRect().right - 54) + "px";
  }

  // ---------- Làm nổi mục đang xem trên thanh điều hướng ----------
  let spyQueued = false;
  function updateSpy() {
    spyQueued = false;
    let current = "";
    // Mục/game nào đã trượt tới sát dưới header thì coi là đang xem. Ngưỡng phải lớn hơn chỗ đáp của liên kết
    // (scroll-padding-top 84px), nếu không sau khi bấm một game thì game liền trước bị làm nổi nhầm.
    const edge = Math.max(($("topbar").offsetHeight || 0) + 48, 100);
    document.querySelectorAll(".section").forEach((s) => {
      if (s.getBoundingClientRect().top <= edge) current = s.getAttribute("data-key");
    });
    // game nào đã trượt qua dưới header thì coi là đang xem
    let currentGame = "";
    document.querySelectorAll(".game").forEach((el) => {
      if (el.getBoundingClientRect().top <= edge) currentGame = el.id.slice(2);
    });
    document.querySelectorAll(".nav-sec-link").forEach((a) => {
      const on = a.getAttribute("data-key") === current;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    if (currentGame !== ui.spyGame) { // đổi game đang xem thì khung Trao đổi (chế độ tự động) đổi theo, trừ khi đang gõ dở
      ui.spyGame = currentGame;
      // "auto" đổi theo game đang xem; mục Tất cả thì chỉ đổi ô "Viết về" mặc định (khi bạn chưa tự chọn)
      if ((ui.chatGame === "auto" || (ui.chatGame === "all" && !ui.allTo)) && !isTyping()) renderRSide();
    }
    let activeEl = null;
    document.querySelectorAll(".nav-game").forEach((a) => {
      const on = a.getAttribute("data-game") === currentGame;
      a.classList.toggle("active", on);
      if (on) { a.setAttribute("aria-current", "true"); activeEl = a; } else a.removeAttribute("aria-current");
    });
    // giữ mục đang xem luôn nằm trong vùng nhìn thấy của thanh bên
    const nav = $("tabs");
    if (activeEl && nav.scrollHeight > nav.clientHeight) {
      const a = activeEl.getBoundingClientRect(), n = nav.getBoundingClientRect();
      if (a.top < n.top + 8) nav.scrollTop -= n.top + 8 - a.top;
      else if (a.bottom > n.bottom - 8) nav.scrollTop += a.bottom - (n.bottom - 8);
    }
  }
  window.addEventListener("scroll", () => {
    if (!spyQueued) { spyQueued = true; requestAnimationFrame(updateSpy); }
    if (hoverEl && !chip.hidden) placeChip(hoverEl);
    $("to-top").hidden = window.scrollY < 500; // nút cuộn lên đầu trang chỉ hiện khi đã cuộn xuống
    placeToggleAll();
  }, { passive: true });
  window.addEventListener("resize", placeToggleAll);
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
    // Giữ một bản sao để hoàn tác được cả khi việc xóa đã kịp lưu lên cơ sở dữ liệu
    const copy = JSON.parse(JSON.stringify(g));
    const sec = DATA.sections.find((s) => s.games.some((x) => x.id === id));
    state.delGames.push(id); save(); render();
    toast('Đã xóa game "' + g.name + '"', () => {
      state.delGames = state.delGames.filter((x) => x !== id);
      if (!state.newGames.some((n) => n.game.id === id)) state.newGames.push({ sec: sec ? sec.key : "dev", game: copy });
      save(); render();
    });
  }
  function deleteTask(id) {
    const t = findTask(id);
    if (!t) return;
    const owner = DATA.sections.reduce((a, s) => a.concat(s.games), []).find((x) => allTasks(x).some((y) => y.id === id));
    const copy = { id: t.id, text: t.text, done: isDone(t) };
    state.delTasks.push(id); save(); render();
    toast("Đã xóa việc", () => {
      state.delTasks = state.delTasks.filter((x) => x !== id);
      if (owner) {
        const arr = (state.added[owner.id] = state.added[owner.id] || []);
        if (!arr.some((x) => x.id === id)) arr.push(copy);
      }
      save(); render();
    });
  }
  function deleteComment(gid, id) {
    if (chatOn) {
      const m = remote.find((x) => x.id === id);
      if (m && chatApi && (m.cid === myCid || isOwner())) { // người viết hoặc chủ trang
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
    } else if (isOwner()) {
      state.delComments.push(id); save(); render();
      toast("Đã xóa nhận xét", () => { state.delComments = state.delComments.filter((x) => x !== id); save(); render(); });
    }
  }

  // ---------- Nút "Nhận xét" khi rê chuột + bong bóng nhận xét ----------
  const chip = $("annot-chip");
  const popEl = $("annot-pop");
  let hoverEl = null, hideT = null;

  // Chiều cao phần header đang che nội dung: chỉ tính khi header đã dính ở đầu màn hình. Ở đầu trang header còn nằm
  // dưới phần tiêu đề nên chưa che gì (nếu tính nhầm thì nút Nhận xét ở tiêu đề trang bị ẩn).
  function stuckHeaderH() {
    const r = $("topbar").getBoundingClientRect();
    return r.top <= 1 ? Math.round(r.bottom) : 0;
  }
  function placeChip(el) {
    const r = el.getBoundingClientRect();
    const navH = stuckHeaderH();
    if (r.bottom < navH + 24 || r.top > innerHeight - 24) { chip.hidden = true; return; }
    chip.hidden = false;
    const cw = chip.offsetWidth, ch = chip.offsetHeight;
    const shift = el.querySelector(".icon-btn") ? 44 : 0; // tránh đè nút ✕ ở chế độ sửa
    let top = Math.max(r.top + 6, navH + 6);
    top = Math.min(top, r.bottom - ch - 6);
    if (r.height < ch + 12) top = r.top + (r.height - ch) / 2;
    let left = Math.min(r.right - cw - 6 - shift, innerWidth - cw - 8);
    // Phần tử nhỏ (nút, ô nhập, liên kết ngắn): đặt nút "Nhận xét" ngay sát bên dưới (hoặc bên trên) thay vì
    // đè lên, để vẫn bấm được chính phần tử đó.
    if (r.width < cw * 2.2 || r.height < 30) {
      top = r.bottom + 4 + ch <= innerHeight - 8 ? r.bottom + 4 : Math.max(navH + 4, r.top - ch - 4);
      left = Math.min(r.right - cw, innerWidth - cw - 8);
    }
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
      const el = targetEl(ui.pop.id);
      if (el) el.classList.add("annot-active");
    }
  }
  function popThreadHtml(g, p) {
    const list = allComments(g).filter((c) => c.target && c.target.id === p.id);
    const t = threadList(g, list, "pop:" + p.id, false, " pop-thread");
    let incoming = "";
    if (ui.incoming && ui.incoming.tid === p.id) {
      incoming = '<ul class="thread pop-thread">' + msgShell({ cls: " from-link", author: ui.incoming.a || "Người nhận xét", time: ui.incoming.t, text: ui.incoming.m, badge: '<span class="badge">từ link email</span>' }) + "</ul>";
    }
    return t.html + incoming;
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
    const navH = stuckHeaderH();
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
    ui.pop = { id: el.getAttribute("data-target"), label: el.getAttribute("data-tlabel"), gid: el.getAttribute("data-agame") || el.getAttribute("data-game") };
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
    const el = targetEl(tid);
    if (!el || !el.hasAttribute("data-annot")) return false;
    setCollapsed(el.getAttribute("data-agame") || el.getAttribute("data-game"), false);
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
  function postNotify(subject, message, name, keepalive) {
    const n = DATA.notify;
    const body = { subject: subject, name: name || "Người xem", from_name: name || "Người xem", message: message };
    if (n.accessKey) body.access_key = n.accessKey;
    if (/formsubmit\.co/i.test(n.url)) { body._subject = subject; body._captcha = "false"; body._template = "box"; }
    return fetch(n.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      keepalive: !!keepalive // gửi được cả khi người dùng vừa đóng trang
    }).then((r) => {
      if (!r.ok) throw new Error("http " + r.status);
      // Dịch vụ có thể trả 200 nhưng báo thất bại (ví dụ chưa kích hoạt email) → coi là chưa gửi được
      return r.json().catch(() => ({})).then((j) => {
        if (j && (j.success === false || j.success === "false" || j.ok === false)) throw new Error(j.message || "notify failed");
        return true;
      });
    });
  }
  // ---------- Báo email khi người KHÔNG phải chủ trang chỉnh sửa nội dung ----------
  // Mỗi lần tự lưu chỉ ghi nhận thay đổi; gom lại và gửi một email tóm tắt sau 90 giây (hoặc khi họ rời trang),
  // để không bị gửi một thư cho mỗi chữ gõ. Chủ trang chỉnh sửa thì không gửi gì.
  const editLog = { n: 0, games: {}, imgAdd: 0, imgDel: 0, imgMod: 0, ver: 0, site: false };
  let editT = null;
  function summarizeOps(ops) {
    const s = { n: ops.length, games: {}, imgAdd: 0, imgDel: 0, imgMod: 0, ver: 0, site: false };
    const gname = (id) => { const g = findGame(id); return (g && g.name) || (remoteGames[id] && remoteGames[id].name) || id; };
    ops.forEach((o) => {
      if (o.col === "content") s.site = true;
      else if (o.col === "games") s.games[o.id] = (o.t === "del" ? "xóa " : "") + gname(o.id);
      else if (o.col === "images") { if (o.t === "del") s.imgDel++; else if (o.merge) s.imgMod++; else s.imgAdd++; }
      else if (o.col === "versions") s.ver++;
    });
    return s;
  }
  function noteEdits(s) {
    editLog.n += s.n; editLog.imgAdd += s.imgAdd; editLog.imgDel += s.imgDel; editLog.imgMod += s.imgMod; editLog.ver += s.ver;
    editLog.site = editLog.site || s.site;
    Object.keys(s.games).forEach((id) => { editLog.games[id] = s.games[id]; });
    if (!editT) editT = setTimeout(() => flushEditNotice(false), 90000);
  }
  function flushEditNotice(keepalive) {
    clearTimeout(editT); editT = null;
    if (!editLog.n || !notifyConfigured()) return;
    const who = ui.name || (authUser && authUser.displayName) || "Người xem";
    const lines = ['Có người không phải chủ trang vừa chỉnh sửa nội dung "' + DATA.title + '".', "Người sửa: " + who + (authUser && authUser.email ? " (" + authUser.email + ")" : " (chưa đăng nhập)")];
    const names = Object.keys(editLog.games).map((id) => editLog.games[id]);
    if (names.length) lines.push("Game đã đổi: " + names.join(", "));
    if (editLog.imgAdd || editLog.imgDel || editLog.imgMod) lines.push("Ảnh: thêm " + editLog.imgAdd + ", xóa " + editLog.imgDel + ", sửa " + editLog.imgMod);
    if (editLog.ver) lines.push("Phiên bản thay đổi: " + editLog.ver);
    if (editLog.site) lines.push("Nội dung chung của trang (tiêu đề, các mục) có thay đổi");
    lines.push("Mở trang: " + pageUrl());
    editLog.n = 0; editLog.games = {}; editLog.imgAdd = editLog.imgDel = editLog.imgMod = editLog.ver = 0; editLog.site = false;
    postNotify("Nội dung trang vừa được chỉnh sửa: " + DATA.title, lines.join("\n"), who, keepalive)
      .catch(() => { if (!keepalive) toast("Đã lưu chỉnh sửa, nhưng chưa gửi được email báo cho chủ trang."); });
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushEditNotice(true); });
  window.addEventListener("pagehide", () => flushEditNotice(true));

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
    (state.comments[SITE_ID] || []).forEach((c) => { if (!c.notified) out.push({ g: SITE_GAME, c: c }); });
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

  let ownerNoticeShown = false;
  // Nút "Gửi email thử" (khi đang Chỉnh sửa): kiểm tra đường gửi email mà không cần nhắn tin giả
  $("test-mail").addEventListener("click", () => {
    if (!notifyConfigured()) { toast("Chưa cấu hình email thông báo (mục notify trong data.js)."); return; }
    toast("Đang gửi email thử…");
    postNotify("Thử gửi email từ " + DATA.title, "Đây là email thử do bạn bấm nút “Gửi email thử” trên trang.\nTrang: " + pageUrl() + "\n", "Chủ trang")
      .then(() => toast("Web3Forms đã nhận thư thử. Hãy kiểm tra hộp thư của bạn (cả mục Spam, Quảng cáo) trong vài phút."))
      .catch((e) => toast("Không gửi được email thử: " + (e && e.message ? e.message : "lỗi mạng")));
  });

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
        if (!notifyConfigured()) return;
        if (isOwner()) { // chủ trang tự nhắn thì không báo email cho chính mình, nhưng nói rõ để khỏi nhầm là lỗi
          if (!ownerNoticeShown) {
            ownerNoticeShown = true;
            toast("Đã gửi. Trình duyệt này là của chủ trang nên không gửi email báo. Thử email bằng nút “Gửi email thử” hoặc dùng cửa sổ ẩn danh.");
          }
          return;
        }
        // người xem nhắn → báo email cho chủ trang; nếu lỗi thì nói rõ, không im lặng
        const c = { author: author, text: text, time: new Date(m.ts).toISOString() };
        if (target) c.target = target;
        postNotify(subjectFor(g, c), buildFeedback([{ g: g, c: c }]), author)
          .catch((e) => toast("Tin đã gửi, nhưng chưa gửi được email báo cho chủ trang (" + (e && e.message ? e.message : "lỗi mạng") + ")."));
      }).catch(() => toast("Không gửi được tin nhắn. Kiểm tra mạng rồi thử lại."));
      return;
    }
    const c = { id: uid("c-"), author: author, text: text, time: new Date().toISOString() };
    if (target) c.target = target;
    (state.comments[g.id] = state.comments[g.id] || []).push(c);
    ui.drafts[draftKey] = "";
    save(); render();
    if (!isOwner() && notifyConfigured()) {
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
  function lbOpen(gid, idx, opener, verId) {
    const g = findGame(gid);
    if (!g) return;
    let list = g.images || [];
    if (verId) { // đang xem ảnh của một phiên bản cũ
      const v = (g.versions || []).find((x) => x.id === verId);
      list = v && v.snap ? snapImages(v.snap) : [];
    }
    if (!list.length) return;
    lbState.list = list; lbState.opener = opener;
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
  // ---------- Đăng nhập chủ trang bằng Google (Gmail) ----------
  let authApi = null; // { am: module firebase-auth, auth }
  async function initAuth(app, am) {
    const auth = am.getAuth(app);
    authApi = { am: am, auth: auth };
    const first = new Promise((res) => {
      am.onAuthStateChanged(auth, async (u) => { authUser = u; authIsOwner = await computeOwner(u); onAuthChange(); res(); }, () => res());
    });
    await Promise.race([first, new Promise((r) => setTimeout(r, 5000))]); // đợi biết đã đăng nhập sẵn chưa, tối đa 5 giây
    if (!authUser) startGooglePrompt(); // chưa đăng nhập: tự hỏi "tiếp tục với tài khoản Google này?"
    if (!authUser && !String(CHAT.googleClientId || "").trim()) offerSignInDialog(); // chưa có Client ID: dùng hộp thoại của trang
  }
  // Khi chưa có googleClientId (chưa hiện được hộp của Google): trên trình duyệt của chủ trang (đã từng bấm Chỉnh sửa)
  // tự mở hộp thoại "Đăng nhập Google" ngay khi vào, mỗi lần mở trình duyệt một lần. Người xem thông thường không thấy.
  function offerSignInDialog() {
    if (!AUTH_ON || CHAT.autoPrompt === false || !legacyOwner()) return;
    try { if (sessionStorage.getItem("game-progress-signin-offered") === "1") return; sessionStorage.setItem("game-progress-signin-offered", "1"); } catch (e) {}
    setTimeout(() => { if (!authUser) openAuth(); }, 600);
  }
  // Hộp gợi ý đăng nhập nhanh của Google (One Tap): vừa vào trang, nếu trình duyệt đang đăng nhập Gmail thì hiện
  // "Tiếp tục với tài khoản …". Cần mã OAuth Web client ID (googleClientId trong data.js); để trống thì không hiện.
  function startGooglePrompt() {
    const cid = String(CHAT.googleClientId || "").trim();
    if (!AUTH_ON || !cid || CHAT.autoPrompt === false) return;
    const run = () => {
      try {
        window.google.accounts.id.initialize({ client_id: cid, callback: onGoogleCredential, auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true });
        window.google.accounts.id.prompt();
      } catch (e) {}
    };
    if (window.google && window.google.accounts && window.google.accounts.id) { run(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = run;
    document.head.appendChild(s); // lỗi tải (mạng, bị chặn) thì thôi, vẫn đăng nhập được bằng nút trong hộp thoại
  }
  async function onGoogleCredential(resp) {
    if (!authApi || !resp || !resp.credential) return;
    try {
      const cred = authApi.am.GoogleAuthProvider.credential(resp.credential);
      await authApi.am.signInWithCredential(authApi.auth, cred);
      authUser = authApi.auth.currentUser; authIsOwner = await computeOwner(authUser);
      onAuthChange();
      toast(authIsOwner ? "Đã đăng nhập đúng chủ trang. Từ giờ không có email báo cho chính bạn." : "Đã đăng nhập. Bạn không phải chủ trang nên nhận xét và chỉnh sửa vẫn được báo email cho chủ trang.");
    } catch (e) { toast(authErrorText(e)); }
  }
  function onAuthChange() {
    refreshAuthUi();
    try { render(); } catch (e) {}
  }
  const authMsg = (t) => { $("auth-msg").textContent = t || ""; };
  function refreshAuthUi() {
    // Nút đăng nhập chỉ hiện khi đang ở chế độ Chỉnh sửa (hoặc đã đăng nhập), người xem thông thường không thấy
    $("auth-btn").hidden = !(AUTH_ON && (authUser || ui.editing || legacyOwner()));
    $("auth-btn").textContent = authUser ? "Tài khoản đăng nhập" : "Đăng nhập Google";
    $("auth-out").hidden = !!authUser;
    $("auth-in").hidden = !authUser;
    if (!authUser) return;
    $("auth-who").textContent = authUser.email || "(không có email)";
    $("auth-uid-box").hidden = AUTH_ENFORCED;
    $("auth-uid").textContent = authUser.uid;
    $("auth-status").textContent = !AUTH_ENFORCED ? "Chưa khai báo chủ trang (ownerEmailHash trong data.js). Mã UID bên dưới dùng để khai báo." :
      authIsOwner ? "Đúng chủ trang. Chỉnh sửa, nhận xét hay xóa đều không gửi email báo cho chính bạn." :
      "Tài khoản này không phải chủ trang. Chỉnh sửa và nhận xét của bạn vẫn được gửi email báo cho chủ trang.";
  }
  function authErrorText(e) {
    const c = (e && e.code) || "";
    if (c === "auth/configuration-not-found") return "Dự án Firebase chưa bật Authentication. Vào Firebase Console > Authentication > Get started, rồi bật nhà cung cấp Google và bấm Save.";
    if (c === "auth/operation-not-allowed") return "Firebase chưa bật đăng nhập Google (Authentication > Sign-in method > Google > Enable, nhập email hỗ trợ rồi bấm Save).";
    if (c === "auth/unauthorized-domain") return "Tên miền trang này chưa được thêm vào Authentication > Settings > Authorized domains.";
    if (c === "auth/popup-blocked") return "Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên (pop-up) cho trang này rồi thử lại.";
    if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return "Bạn đã đóng cửa sổ đăng nhập. Bấm lại để thử.";
    if (c === "auth/network-request-failed") return "Mất kết nối mạng, hãy thử lại.";
    return "Không đăng nhập được" + (c ? " (" + c + ")" : "") + ".";
  }
  function openAuth() {
    if (!AUTH_ON) return;
    if (!authApi) { toast("Đang kết nối dịch vụ đăng nhập, thử lại sau ít giây."); return; }
    authMsg(""); refreshAuthUi();
    const d = $("auth-dialog");
    if (d.showModal && !d.open) d.showModal();
  }
  async function signInGoogle() {
    const b = $("auth-send"); b.disabled = true; authMsg("Đang mở cửa sổ đăng nhập Google…");
    try {
      const provider = new authApi.am.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" }); // luôn cho chọn đúng tài khoản Gmail
      await authApi.am.signInWithPopup(authApi.auth, provider);
      authMsg("");
      authUser = authApi.auth.currentUser; authIsOwner = await computeOwner(authUser);
      onAuthChange();
      if (AUTH_ENFORCED && authIsOwner) { $("auth-dialog").close(); toast("Đã đăng nhập đúng chủ trang. Từ giờ không có email báo cho chính bạn."); }
    } catch (e) { authMsg(authErrorText(e)); }
    b.disabled = false;
  }
  $("auth-send").addEventListener("click", signInGoogle);
  $("auth-close").addEventListener("click", () => $("auth-dialog").close());
  $("auth-close2").addEventListener("click", () => $("auth-dialog").close());
  $("auth-signout").addEventListener("click", () => {
    if (authApi) authApi.am.signOut(authApi.auth).then(() => {
      try { window.google.accounts.id.disableAutoSelect(); } catch (e) {} // đăng xuất rồi thì Google đừng tự đăng nhập lại
      $("auth-dialog").close(); toast("Đã đăng xuất");
    });
  });
  $("auth-copy").addEventListener("click", () => copyText(authUser ? authUser.uid : "", (ok) => toast(ok ? "Đã sao chép UID" : "Không sao chép được, hãy bôi đen và copy thủ công")));
  $("auth-btn").addEventListener("click", openAuth);

  function setEditing(on) {
    ui.editing = on;
    try {
      localStorage.setItem(MODE_KEY, on ? "1" : "0");
      if (on) localStorage.setItem(OWNER_KEY, "1"); // máy này là của chủ trang: không tự gửi email cho chính mình
    } catch (e) {}
    refreshAuthUi();
    render();
    toast(!on ? "Đã chuyển sang chế độ xem" :
      AUTH_ENFORCED && !authIsOwner ? "Đã bật chế độ chỉnh sửa. Bạn chưa đăng nhập đúng tài khoản chủ trang nên chỉnh sửa sẽ được báo qua email cho chủ trang." :
      "Đã bật chế độ chỉnh sửa");
  }
  $("enter-edit").addEventListener("click", () => setEditing(!ui.editing));
  $("exit-edit").addEventListener("click", () => setEditing(false));
  $("send").addEventListener("click", sendFeedback);

  // Màn hình cảm ứng: bật "Nhận xét" rồi chạm vào phần muốn nhận xét
  document.addEventListener("click", (e) => {
    if (!ui.annotating) return;
    // Ở chế độ chọn để nhận xét, chạm vào phần nào cũng chọn phần đó. Chỉ chừa những nút cần để thoát chế độ
    // hoặc mở menu, và các hộp thoại đang mở.
    if (e.target.closest("#annot-pop, #editbar, #send, #toast, #lightbox, #menu-btn, #nav-close, #nav-backdrop, #rs-collapse, #rs-edge, [data-action='annot-mode']")) return;
    const a = e.target.closest("[data-annot]");
    if (a) { e.preventDefault(); e.stopImmediatePropagation(); openPop(a); }
  }, true);

  function jumpToGame(id) { // nhảy tới thẻ của một game (hoặc về đầu trang nếu là "Toàn trang")
    if (id === SITE_ID) { window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }); return; }
    setCollapsed(id, false);
    const card = $("g-" + id);
    if (card) {
      card.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
      card.querySelector("h3").focus({ preventScroll: true });
      history.replaceState(null, "", "#g-" + id);
    }
  }
  // Chọn "Viết về" ở mục Tất cả nhận xét thì nhớ lựa chọn (không còn tự theo game đang xem)
  document.addEventListener("change", (e) => {
    if (e.target.matches && e.target.matches('.composer select[name="gid"]')) ui.allTo = e.target.value;
  });

  // ---------- Sự kiện chung ----------
  document.addEventListener("click", (e) => {
    const chipLink = e.target.closest(".chip[data-game], .nav-game[data-game]"); // ô trên bảng đầu trang hoặc game trong thanh bên
    if (chipLink) {
      e.preventDefault();
      jumpToGame(chipLink.getAttribute("data-game"));
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
      lbOpen(el.getAttribute("data-game"), Number(el.getAttribute("data-index")), el, el.getAttribute("data-ver"));
    } else if (act === "resolve-comment") {
      resolveComment(el.getAttribute("data-game"), id, el.getAttribute("data-to") === "1");
    } else if (act === "toggle-resolved") {
      ui.showResolved[el.getAttribute("data-key")] = !ui.showResolved[el.getAttribute("data-key")];
      softRender();
    } else if (act === "ver-latest") {
      delete ui.viewVersion[el.getAttribute("data-game")];
      render();
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
      openChat(id); // mở khung Trao đổi bên phải đúng game này
    } else if (act === "goto-game") {
      e.preventDefault();
      jumpToGame(id);
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
      const isAll = !!composer.elements.gid; // ô soạn trong mục "Tất cả nhận xét": chọn game cần viết về
      const gid = isAll ? composer.elements.gid.value : composer.getAttribute("data-game");
      const g = findGame(gid);
      const author = composer.elements.author.value.trim();
      const text = composer.elements.text.value.trim();
      if (!g || !author || !text) return;
      const tid = composer.getAttribute("data-target");
      const target = tid ? { id: tid, label: composer.getAttribute("data-tlabel") } : null;
      addComment(g, author, text, target, tid ? "pop:" + tid : (isAll ? "all" : gid));
    }
  });

  // ---------- Dữ liệu đầy đủ sau mọi chỉnh sửa (dùng để lưu lên cơ sở dữ liệu và sao lưu) ----------
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
  function archiveOf(g) {
    const live = new Set((g.images || []).map((im) => im.iid));
    const seen = {}, out = [];
    (g.versions || []).forEach((v) => ((v.snap && v.snap.images) || []).forEach((im) => {
      if (!im.iid || live.has(im.iid) || seen[im.iid]) return;
      const src = im.src || imgSrc(im.iid);
      if (!src) return;
      seen[im.iid] = true;
      out.push({ iid: im.iid, src: src, caption: im.caption || "" });
    }));
    return out;
  }
  // Tải bản sao lưu toàn bộ nội dung (kèm ảnh) về máy dưới dạng file JSON
  $("export").addEventListener("click", () => {
    const out = buildExport();
    const model = { app: "game-progress", version: 1, title: out.title, updated: out.updated,
      sections: out.sections.map((s) => ({ key: s.key, title: s.title, note: s.note || "", games: s.games.map((g) => ({
        id: g.id, name: g.name, genre: g.genre, platform: g.platform, meta: g.meta || "", description: g.description,
        progress: g.progress, links: g.links || [], tasks: g.tasks || [],
        images: (g.images || []).map((im) => ({ iid: im.iid, src: im.src, caption: im.caption || "" })),
        versions: (g.versions || []).map((v) => ({ id: v.id, version: v.version, date: v.date, notes: v.notes || "", snap: v.snap || null })),
        archive: archiveOf(g) // ảnh đã bỏ khỏi game nhưng còn thuộc một phiên bản cũ
      })) })) };
    const d = new Date();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(model, null, 2)], { type: "application/json" }));
    a.download = "tien-do-game-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("Đã tải bản sao lưu.");
  });
  // Nhập lại bản sao lưu: thay toàn bộ nội dung hiện tại
  $("import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    f.text().then((txt) => {
      const m = JSON.parse(txt);
      if (!m || !Array.isArray(m.sections) || !m.sections.every((s) => s && s.key && Array.isArray(s.games))) throw new Error("bad");
      if (!confirm("Thay TOÀN BỘ nội dung hiện tại bằng bản sao lưu này? Thao tác này không hoàn tác được.")) return;
      if (!chatOn || !room) { toast("Cần kết nối cơ sở dữ liệu và mở bằng link riêng để nhập."); return; }
      importModel(m);
    }).catch(() => toast("File này không phải bản sao lưu hợp lệ."));
  });

  // ---------- Đánh dấu nhận xét "đã giải quyết" (ẩn đi, bấm để hiện lại) ----------
  function resolveComment(gid, id, to) {
    const done = () => toast(to ? "Đã ẩn nhận xét đã giải quyết" : "Đã mở lại nhận xét", () => resolveComment(gid, id, !to));
    if (chatOn) {
      const m = remote.find((x) => x.id === id);
      if (!m || !chatApi) return;
      chatApi.patch(id, { resolved: to }).then(done).catch(() => toast("Không cập nhật được nhận xét."));
      return;
    }
    const c = (state.comments[gid] || []).find((x) => x.id === id);
    if (!c) return;
    c.resolved = to;
    save(); render(); done();
  }
  document.addEventListener("change", (e) => { // chọn phiên bản để xem
    const el = e.target;
    if (!el.matches || !el.matches('[data-action="ver-select"]')) return;
    const gid = el.getAttribute("data-game"), g = findGame(gid);
    if (!g) return;
    const vers = g.versions || [], latest = vers[vers.length - 1];
    if (!latest || el.value === latest.id) delete ui.viewVersion[gid]; else ui.viewVersion[gid] = el.value;
    render();
  });

  // ---------- Tạo / xóa phiên bản ----------
  async function flushSync() { // chờ mọi thay đổi đã lên cơ sở dữ liệu (để ảnh mới có sẵn trước khi chụp bản lưu)
    if (!chatOn || !room) return;
    clearTimeout(syncT);
    for (let i = 0; i < 40; i++) {
      if (!isDirty() && !syncing) return;
      if (!syncing) await runSync(); else await new Promise((r) => setTimeout(r, 150));
    }
  }
  function askVersion(def, gameName) {
    return new Promise((resolve) => {
      const dlg = $("ver-dialog");
      $("ver-game").textContent = gameName;
      $("ver-num").value = def;
      $("ver-notes").value = "";
      $("ver-ok").onclick = (ev) => {
        ev.preventDefault();
        const v = $("ver-num").value.trim();
        if (!v) { $("ver-num").focus(); return; }
        const n = $("ver-notes").value.trim();
        dlg.close();
        resolve({ version: v, notes: n });
      };
      $("ver-cancel").onclick = (ev) => { ev.preventDefault(); dlg.close(); resolve(null); };
      dlg.oncancel = () => resolve(null);
      dlg.showModal();
      $("ver-num").select();
    });
  }
  async function createVersion(gid) {
    let g = findGame(gid);
    if (!g) return;
    const last = (g.versions || []).slice(-1)[0];
    const r = await askVersion(nextVersion(last && last.version), g.name);
    if (!r) return;
    await flushSync();
    g = findGame(gid);
    if (!g) return;
    const arr = versionsOf(g), prev = arr[arr.length - 1];
    if (prev) prev.snap = snapOf(g); // bản trước được chụp lại nguyên trạng, bản mới tiếp tục từ thông tin hiện tại
    arr.push({ id: "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), version: r.version, date: todayStr(), notes: r.notes });
    state.versions[gid] = arr;
    delete ui.viewVersion[gid];
    save(); render();
    toast('Đã tạo phiên bản ' + r.version + (prev ? ". Thông tin bản " + prev.version + " đã được lưu lại để xem sau." : "."));
  }
  function deleteVersion(gid, vid) {
    const g = findGame(gid);
    if (!g) return;
    const before = versionsOf(g), v = before.find((x) => x.id === vid);
    if (!v) return;
    state.versions[gid] = before.filter((x) => x.id !== vid);
    delete ui.viewVersion[gid];
    save(); render();
    toast("Đã xóa phiên bản " + v.version, () => { state.versions[gid] = before; save(); render(); });
  }

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
    } else if (kind === "ver") { // số phiên bản hoặc ghi chú bản vá
      const gid = el.getAttribute("data-game"), g = findGame(gid);
      const arr = g && versionsOf(g), v = arr && arr.find((x) => x.id === id);
      if (!v || text === String(v[field] || "")) return;
      if (field === "version" && !text) { el.textContent = v.version; toast("Số phiên bản không được để trống"); return; }
      v[field] = text.slice(0, field === "notes" ? 5000 : 60); // khớp giới hạn trong quy tắc Firestore
      state.versions[gid] = arr;
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
    updateSaveStatus();
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
    save(); rebuild(); updateSaveStatus();
  });

  // Ảnh: đọc file, thu nhỏ còn tối đa 1280px, nén JPEG để nhẹ rồi giữ tạm cho tới khi Lưu lên web
  function processImage(file, gid) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        // Thu nhỏ và nén dần cho tới khi đủ nhẹ (cơ sở dữ liệu giới hạn mỗi ảnh khoảng 500KB)
        const LIMIT = 450000; // số ký tự của chuỗi ảnh
        let max = 1280, q = 0.82, dataUrl = "";
        for (let tries = 0; tries < 8; tries++) {
          const r = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * r));
          c.height = Math.max(1, Math.round(img.height * r));
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          dataUrl = c.toDataURL("image/jpeg", q);
          if (dataUrl.length <= LIMIT) break;
          q = Math.max(0.5, q - 0.1);
          if (q <= 0.6) max = Math.round(max * 0.8);
        }
        if (dataUrl.length > LIMIT * 1.5) { reject(new Error("Ảnh quá lớn")); return; }
        resolve({ dataUrl: dataUrl, name: gid + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + ".jpg" });
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
        // iid gán ngay từ đầu để phiên bản có thể tham chiếu ảnh này
        const item = { src: res.dataUrl, caption: old ? old.caption || "" : "", pending: res.name, iid: sanitizeId(res.name) };
        if (old) arr[index] = item; else arr.push(item);
        state.images[gid] = arr;
        save(); render();
        toast(old ? "Đã thay ảnh." : "Đã thêm ảnh.");
      }).catch(() => toast("Không đọc được file ảnh này."));
    };
    inp.click();
  }

  // Chuyển game sang mục khác (kéo thả hoặc chọn từ danh sách)
  function moveGame(gid, key) {
    const from = sectionOf(gid), g = findGame(gid);
    if (!from || !g || from.key === key) return;
    const p = prog(g);
    state.moved[gid] = key;
    if (key === "done") state.progress[gid] = 100;
    else if (key === "planned") state.progress[gid] = 0;
    else if (p >= 100) state.progress[gid] = 90;
    else if (p <= 0) state.progress[gid] = 10;
    save(); render();
    const to = DATA.sections.find((s) => s.key === key);
    toast('Đã chuyển "' + g.name + '" sang "' + (to ? to.title : key) + '"', () => {
      state.moved[gid] = from.key; // đặt lại rõ ràng, vì bản gốc có thể đã đổi sau khi tự lưu
      state.progress[gid] = p;
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
    } else if (act === "ver-new" && g) createVersion(gid);
    else if (act === "ver-del" && g) deleteVersion(gid, el.getAttribute("data-id"));
    else if (act === "add-game") addGame(el.getAttribute("data-sec"));
  });


  // ---------- Cơ sở dữ liệu: kết nối, đồng bộ nội dung, chat ----------
  // Nội dung nằm ở rooms/{mã-bí-mật}/ với 4 nhóm: content (thông tin chung), games, images, messages.
  const sanitizeId = (s) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80);
  const stable = (o) => JSON.stringify(o, (k, v) => (v && typeof v === "object" && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((r, key) => { r[key] = v[key]; return r; }, {}) : v));

  let contentReady = !chatOn;  // đã tải xong nội dung từ cơ sở dữ liệu (hoặc không dùng cơ sở dữ liệu)
  let dbError = "";            // lỗi kết nối hiển thị thay cho trang
  let remoteSite = null, remoteGames = {}, remoteImages = {}, remoteVersions = {};
  const got = { content: false, games: false, images: false, versions: false };

  // <rtdb-adapter>
  // Bộ kết nối Firebase Realtime Database. Dữ liệu nằm ở rooms/{mã}/{messages|content|games|images|versions}/{id}.
  // Realtime Database bỏ mọi mảng rỗng, giá trị null và đối tượng rỗng, nên khi đọc phải bù lại cho giống hệt
  // dạng dữ liệu trong trang. Nếu không, phép so sánh sẽ luôn thấy "khác" và trang ghi lại mãi.
  function makeRtdbAdapter(rt, db, room) {
    const R = (p) => rt.ref(db, "rooms/" + room + (p ? "/" + p : ""));
    const arr = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : []);
    const clean = (o) => JSON.parse(JSON.stringify(o)); // bỏ giá trị undefined (Realtime Database không nhận)
    const fixSnap = (s) => (s ? Object.assign({}, s, { links: arr(s.links), tasks: arr(s.tasks), images: arr(s.images) }) : null);
    const fix = (name, d) => {
      if (!d || typeof d !== "object") return d;
      if (name === "games") return Object.assign({}, d, { links: arr(d.links), tasks: arr(d.tasks) });
      if (name === "versions") return Object.assign({}, d, { snap: fixSnap(d.snap) });
      if (name === "content") return Object.assign({}, d, { sections: arr(d.sections) });
      return d;
    };
    return {
      subscribe: (onList, onErr) => rt.onValue(R("messages"), (snap) => {
        const v = snap.val() || {};
        onList(Object.keys(v).map((id) => Object.assign({ id: id }, v[id])).sort((a, b) => a.ts - b.ts));
      }, onErr),
      add: (m) => rt.set(rt.push(R("messages")), clean(m)),
      remove: (id) => rt.remove(R("messages/" + id)),
      restore: (m) => { const rest = Object.assign({}, m); delete rest.id; return rt.set(R("messages/" + m.id), clean(rest)); },
      patch: (id, data) => rt.update(R("messages/" + id), data),
      watch: (name, cb, onErr) => rt.onValue(R(name), (snap) => {
        const v = snap.val() || {};
        cb(Object.keys(v).map((id) => ({ id: id, data: fix(name, v[id]) })));
      }, onErr),
      // Gộp nhiều thay đổi vào từng lượt ghi một lần (tối đa khoảng 3MB mỗi lượt)
      commit: async (ops) => {
        let upd = {}, size = 0;
        const flush = async () => { if (size) { await rt.update(R(""), upd); upd = {}; size = 0; } };
        for (const op of ops) {
          const p = op.col + "/" + op.id;
          let add = {};
          if (op.t === "del") add[p] = null;
          else if (op.merge) Object.keys(op.data).forEach((k) => { add[p + "/" + k] = op.data[k]; });
          else add[p] = clean(op.data);
          const s = JSON.stringify(add).length;
          if (size && size + s > 3000000) await flush();
          Object.assign(upd, add);
          size += s;
        }
        await flush();
      }
    };
  }
  // </rtdb-adapter>

  async function createChatApi() {
    if (CHAT.provider === "rtdb") {
      const base = "https://www.gstatic.com/firebasejs/10.14.1/";
      const [appMod, rt, am] = await Promise.all([
        import(base + "firebase-app.js"), import(base + "firebase-database.js"),
        AUTH_ON ? import(base + "firebase-auth.js").catch(() => null) : null // lỗi tải thì vẫn chạy được, chỉ không đăng nhập
      ]);
      const app = appMod.initializeApp(CHAT.firebase);
      if (am) await initAuth(app, am); // phải có trước khi ghi dữ liệu để Firebase gắn đúng tài khoản vào mọi lần ghi
      return makeRtdbAdapter(rt, rt.getDatabase(app, CHAT.firebase.databaseURL), room);
    }
    if (CHAT.provider === "firebase") {
      const base = "https://www.gstatic.com/firebasejs/10.14.1/";
      const [appMod, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-firestore.js")]);
      const db = fs.getFirestore(appMod.initializeApp(CHAT.firebase));
      const col = (name) => fs.collection(db, "rooms", room, name);
      const ref = (name, id) => fs.doc(db, "rooms", room, name, id);
      return {
        subscribe: (onList, onErr) => fs.onSnapshot(fs.query(col("messages"), fs.orderBy("ts")),
          (snap) => onList(snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))), onErr),
        add: (m) => fs.addDoc(col("messages"), m),
        remove: (id) => fs.deleteDoc(ref("messages", id)),
        restore: (m) => { const rest = Object.assign({}, m); delete rest.id; return fs.setDoc(ref("messages", m.id), rest); },
        patch: (id, data) => fs.setDoc(ref("messages", id), data, { merge: true }),
        watch: (name, cb, onErr) => fs.onSnapshot(col(name),
          (snap) => cb(snap.docs.map((d) => ({ id: d.id, data: d.data() }))), onErr),
        commit: async (ops) => {
          for (let i = 0; i < ops.length; i += 100) {
            const b = fs.writeBatch(db);
            ops.slice(i, i + 100).forEach((op) => {
              const r = ref(op.col, op.id);
              if (op.t === "del") b.delete(r); else if (op.merge) b.set(r, op.data, { merge: true }); else b.set(r, op.data);
            });
            await b.commit();
          }
        }
      };
    }
    // "local": cơ sở dữ liệu thử giữa các tab cùng trình duyệt (không cần máy chủ)
    const LSK = "gp-db-local-" + room;
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LSK) : null;
    const blank = () => ({ messages: [], content: {}, games: {}, images: {}, versions: {} });
    const read = () => { try { const o = JSON.parse(localStorage.getItem(LSK)); if (o) return Object.assign(blank(), o); } catch (e) {} return blank(); };
    const write = (o) => localStorage.setItem(LSK, JSON.stringify(o));
    const subs = [];
    const list = (o, name) => (name === "messages" ? o.messages.slice().sort((a, b) => a.ts - b.ts) : Object.keys(o[name]).map((id) => ({ id: id, data: o[name][id] })));
    const emit = () => { const o = read(); subs.forEach((s) => s.cb(list(o, s.name))); };
    const changed = () => { if (bc) bc.postMessage(1); emit(); };
    if (bc) bc.onmessage = emit;
    window.addEventListener("storage", (e) => { if (e.key === LSK) emit(); });
    return {
      subscribe: (onList) => { subs.push({ name: "messages", cb: onList }); onList(list(read(), "messages")); },
      add: async (m) => { const o = read(); o.messages.push(Object.assign({ id: uid("m-") }, m)); write(o); changed(); },
      remove: async (id) => { const o = read(); o.messages = o.messages.filter((x) => x.id !== id); write(o); changed(); },
      restore: async (m) => { const o = read(); o.messages.push(m); write(o); changed(); },
      patch: async (id, data) => { const o = read(); const m = o.messages.find((x) => x.id === id); if (m) Object.assign(m, data); write(o); changed(); },
      watch: (name, cb) => { subs.push({ name: name, cb: cb }); cb(list(read(), name)); },
      commit: async (ops) => {
        const o = read();
        ops.forEach((op) => {
          if (op.t === "del") delete o[op.col][op.id];
          else o[op.col][op.id] = op.merge ? Object.assign({}, o[op.col][op.id], op.data) : op.data;
        });
        write(o); changed();
      }
    };
  }

  // ----- Chuyển qua lại giữa mô hình trong trang và tài liệu trong cơ sở dữ liệu -----
  // model = { title, updated, sections: [{ key, title, note, games: [{ id, name, ..., images: [{src, caption}] }] }] }
  function toDocs(model) {
    const site = { title: model.title || "", updated: model.updated || "",
      sections: model.sections.map((s) => ({ key: s.key, title: s.title || "", note: s.note || "" })) };
    const games = {}, images = {}, versions = {};
    model.sections.forEach((s) => s.games.forEach((g, order) => {
      games[g.id] = {
        sec: s.key, order: order, name: g.name || "", genre: g.genre || "", platform: g.platform || "", meta: g.meta || "",
        description: g.description || "", progress: Number(g.progress) || 0,
        links: (g.links || []).map((l) => ({ title: l.title || "", url: l.url || "" })),
        tasks: (g.tasks || []).map((t) => ({ id: String(t.id), text: t.text || "", done: !!t.done }))
      };
      (g.images || []).forEach((im, i) => {
        if (!im.iid) im.iid = sanitizeId(im.pending || g.id + "-" + uid("i"));
        delete im.pending;
        images[im.iid] = { gid: g.id, order: i, caption: im.caption || "", src: im.src };
      });
      // ảnh đã bỏ khỏi game nhưng còn thuộc một phiên bản cũ (khi nhập bản sao lưu)
      (g.archive || []).forEach((a) => {
        if (a.iid && a.src && !images[a.iid]) images[a.iid] = { gid: g.id, order: -1, caption: a.caption || "", src: a.src, retired: true };
      });
      (g.versions || []).forEach((v, i) => {
        versions[v.id] = { gid: g.id, order: i, version: v.version || "", date: v.date || "", notes: v.notes || "", snap: v.snap ? cleanSnap(v.snap) : null };
      });
    }));
    return { site: site, games: games, images: images, versions: versions };
  }
  function cleanSnap(s) { // bản chụp thông tin game: chỉ giữ các trường hợp lệ, không có giá trị undefined
    return {
      sec: s.sec || "", name: s.name || "", genre: s.genre || "", platform: s.platform || "", meta: s.meta || "",
      description: s.description || "", progress: Number(s.progress) || 0,
      links: (s.links || []).map((l) => ({ title: l.title || "", url: l.url || "" })),
      tasks: (s.tasks || []).map((t) => ({ id: String(t.id), text: t.text || "", done: !!t.done })),
      images: (s.images || []).map((im) => { const o = { caption: im.caption || "" }; if (im.iid) o.iid = im.iid; if (im.src) o.src = im.src; return o; })
    };
  }
  // So sánh với dữ liệu đang có trên máy chủ, chỉ ghi phần khác (ảnh không đổi thì không gửi lại nội dung ảnh)
  function diffOps(docs) {
    const ops = [];
    if (!remoteSite || stable(remoteSite) !== stable(docs.site)) ops.push({ t: "set", col: "content", id: "site", data: docs.site });
    Object.keys(docs.games).forEach((id) => {
      if (!remoteGames[id] || stable(remoteGames[id]) !== stable(docs.games[id])) ops.push({ t: "set", col: "games", id: id, data: docs.games[id] });
    });
    Object.keys(remoteGames).forEach((id) => { if (!docs.games[id]) ops.push({ t: "del", col: "games", id: id }); });
    // ảnh còn được phiên bản cũ tham chiếu thì không được xóa hẳn, chỉ "cất đi" (retired)
    const refs = new Set();
    Object.keys(docs.versions).forEach((vid) => {
      const sn = docs.versions[vid].snap;
      if (sn) (sn.images || []).forEach((im) => { if (im.iid) refs.add(im.iid); });
    });
    Object.keys(docs.images).forEach((iid) => {
      const d = docs.images[iid], r = remoteImages[iid];
      if (!r) ops.push({ t: "set", col: "images", id: iid, data: d });
      else if (r.gid !== d.gid || r.order !== d.order || (r.caption || "") !== d.caption || !!r.retired !== !!d.retired) {
        ops.push({ t: "set", col: "images", id: iid, data: { gid: d.gid, order: d.order, caption: d.caption, retired: !!d.retired }, merge: true });
      }
    });
    Object.keys(remoteImages).forEach((iid) => {
      if (docs.images[iid]) return;
      const r = remoteImages[iid];
      if (refs.has(iid)) { if (!r.retired) ops.push({ t: "set", col: "images", id: iid, data: { retired: true }, merge: true }); }
      else if (!r.retired) ops.push({ t: "del", col: "images", id: iid });
      // ảnh đã cất mà không còn phiên bản nào dùng: giữ nguyên để hoàn tác việc xóa phiên bản vẫn còn ảnh
    });
    Object.keys(docs.versions).forEach((vid) => {
      if (!remoteVersions[vid] || stable(remoteVersions[vid]) !== stable(docs.versions[vid])) ops.push({ t: "set", col: "versions", id: vid, data: docs.versions[vid] });
    });
    Object.keys(remoteVersions).forEach((vid) => { if (!docs.versions[vid]) ops.push({ t: "del", col: "versions", id: vid }); });
    return ops;
  }

  // ----- Tự động lưu: mỗi chỉnh sửa được gom lại rồi ghi lên cơ sở dữ liệu -----
  let syncT = null, syncing = false, syncAgain = false, syncError = false, lastSaved = 0;
  function updateSaveStatus() {
    const el = $("dirty");
    if (!el) return;
    if (!ui.editing) { el.hidden = true; return; }
    let t;
    if (!chatOn) t = "Chưa kết nối cơ sở dữ liệu: thay đổi chỉ nằm trên trình duyệt này.";
    else if (syncError) t = "Chưa lưu được, đang thử lại…";
    else if (syncing || isDirty()) t = "Đang lưu…";
    else if (lastSaved) { const d = new Date(lastSaved); t = "Đã lưu lúc " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + "."; }
    else t = "Đã lưu.";
    el.textContent = t;
    el.classList.toggle("err", syncError);
    el.hidden = false;
  }
  function scheduleSync(delay) {
    clearTimeout(syncT);
    syncT = setTimeout(runSync, delay == null ? 700 : delay);
    updateSaveStatus();
  }
  async function runSync() {
    if (!chatApi || !contentReady) { syncT = setTimeout(runSync, 1000); return; } // chờ kết nối xong
    if (syncing) { syncAgain = true; return; }
    if (!isDirty()) { updateSaveStatus(); return; }
    syncing = true; syncError = false; updateSaveStatus();
    const snap = JSON.stringify(state);
    try {
      const out = buildExport();
      const ops = diffOps(toDocs(out));
      const note = ops.length && !isOwner() && notifyConfigured() ? summarizeOps(ops) : null; // người không phải chủ trang sửa → báo email
      if (ops.length) await chatApi.commit(ops);
      if (note) noteEdits(note);
      lastSaved = Date.now();
      if (JSON.stringify(state) === snap) { // không có chỉnh sửa mới trong lúc lưu: bản vừa lưu thành dữ liệu gốc
        BASE = { sections: JSON.parse(JSON.stringify(out.sections)) };
        DATA.updated = out.updated;
        state = EMPTY();
        persist();
        softRender();
      } else {
        syncAgain = true; // có chỉnh sửa mới: lưu thêm một lượt nữa
      }
    } catch (e) {
      syncError = true;
      setTimeout(() => scheduleSync(0), 5000);
    } finally {
      syncing = false;
      updateSaveStatus();
      if (syncAgain) { syncAgain = false; scheduleSync(300); }
    }
  }

  // ----- Nhận dữ liệu từ máy chủ -----
  let rebuildT = null, seeding = false;
  const scheduleRebuild = () => { clearTimeout(rebuildT); rebuildT = setTimeout(applyRemote, 40); };
  function applyRemote() {
    if (!got.content || !got.games || !got.images || !got.versions) return;
    if (!remoteSite) { seedFromStatic(); return; }
    imgIndex = {};
    const secs = (remoteSite.sections || []).map((s) => ({ key: s.key, title: s.title, note: s.note || "", games: [] }));
    const byId = {};
    Object.keys(remoteGames).map((id) => Object.assign({ id: id }, remoteGames[id]))
      .sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((g) => {
        const s = secs.find((x) => x.key === g.sec) || secs[0];
        if (!s) return;
        const game = { id: g.id, name: g.name, genre: g.genre, platform: g.platform, meta: g.meta || "", description: g.description,
          progress: g.progress || 0, links: g.links || [], tasks: g.tasks || [], images: [], versions: [], comments: [] };
        s.games.push(game);
        byId[g.id] = game;
      });
    Object.keys(remoteImages).map((iid) => Object.assign({ iid: iid }, remoteImages[iid]))
      .sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((im) => {
        imgIndex[im.iid] = im.src; // gồm cả ảnh đã cất, để phiên bản cũ vẫn hiện đủ ảnh
        if (!im.retired && byId[im.gid]) byId[im.gid].images.push({ src: im.src, caption: im.caption || "", iid: im.iid });
      });
    Object.keys(remoteVersions).map((vid) => Object.assign({ id: vid }, remoteVersions[vid]))
      .sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((v) => {
        if (byId[v.gid]) byId[v.gid].versions.push({ id: v.id, version: v.version || "", date: v.date || "", notes: v.notes || "", snap: v.snap || null });
      });
    BASE = { sections: secs };
    if (remoteSite.title) DATA.title = remoteSite.title;
    DATA.updated = remoteSite.updated || DATA.updated;
    const first = !contentReady;
    contentReady = true;
    dbError = "";
    softRender();
    if (first) afterFirstContent();
  }
  // Lần đầu cơ sở dữ liệu còn trống: nạp dữ liệu mẫu trong data.js làm điểm bắt đầu
  async function seedFromStatic() {
    if (seeding || !chatApi) return;
    seeding = true;
    try {
      const model = { title: DATA.title, updated: DATA.updated, sections: SEED.map((s) => ({
        key: s.key, title: s.title, note: s.note || "",
        games: s.games.map((g) => Object.assign({}, g, { images: (g.images || []).map((im, i) => ({ src: im.src, caption: im.caption || "", iid: sanitizeId(g.id + "-" + (i + 1)) })) }))
      })) };
      await chatApi.commit(diffOps(toDocs(model))); // dữ liệu mẫu gồm cả phiên bản mẫu (g.versions)
      toast("Đã nạp dữ liệu mẫu vào cơ sở dữ liệu. Bạn có thể sửa ngay.");
    } catch (e) {
      dbError = "Không nạp được dữ liệu. Kiểm tra quy tắc bảo mật Firestore và kết nối mạng.";
      softRender();
    } finally {
      seeding = false;
    }
  }
  // Nhập bản sao lưu: ghi đè toàn bộ nội dung trên máy chủ bằng nội dung trong file
  async function importModel(m) {
    try {
      // Mã (id) lấy từ file nên làm sạch: Realtime Database cấm . $ # [ ] / trong khóa
      m.sections.forEach((s) => s.games.forEach((g) => {
        g.id = sanitizeId(g.id);
        (g.images || []).forEach((im) => { if (im.iid) im.iid = sanitizeId(im.iid); });
        (g.archive || []).forEach((a) => { if (a.iid) a.iid = sanitizeId(a.iid); });
        (g.versions || []).forEach((v) => {
          v.id = sanitizeId(v.id);
          if (v.snap) (v.snap.images || []).forEach((im) => { if (im.iid) im.iid = sanitizeId(im.iid); });
        });
      }));
      const model = { title: m.title || DATA.title, updated: m.updated || DATA.updated, sections: m.sections.map((s) => ({
        key: String(s.key), title: s.title || "", note: s.note || "",
        games: s.games.map((g) => Object.assign({}, g, { images: (g.images || []).map((im) => ({ src: im.src, caption: im.caption || "", iid: im.iid })) }))
      })) };
      const ops = diffOps(toDocs(model));
      await chatApi.commit(ops);
      state = EMPTY();
      persist();
      toast("Đã nhập bản sao lưu.");
    } catch (e) {
      toast("Không nhập được bản sao lưu (file quá lớn hoặc mất kết nối).");
    }
  }
  // Mở đúng chỗ theo link (#g-, #c-, #t-) sau khi nội dung tải xong
  function afterFirstContent() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (/^t-/.test(h)) handleHash(false);
    else if (/^g-/.test(h)) { const c = $(h); if (c) c.scrollIntoView({ block: "start" }); }
    else if (/^c-/.test(h)) openChat(h.slice(2)); // link tới trao đổi của một game
  }

  // ----- Cập nhật khi có tin mới / dữ liệu mới -----
  // Đang gõ chữ thì chỉ làm mới danh sách tin, không vẽ lại ô gõ
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
    // khung Trao đổi bên phải: chỉ làm mới danh sách tin, giữ nguyên ô đang gõ
    const rbg = $("rs-body").getAttribute("data-game"), rw = $("rs-body").querySelector(".thread-wrap");
    if (rw) {
      if (rbg === "all") rw.innerHTML = allThreadHtml();
      else { const rg = findGame(rbg); if (rg) rw.innerHTML = threadHtml(rg); }
    }
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
      if (contentReady && /^#t-/.test(location.hash)) handleHash(false); // mở đúng phần từ link khi tin đã tải xong
    }
  }
  async function initChat() {
    if (!chatOn || !room) return;
    const fail = () => {
      dbError = "Không kết nối được cơ sở dữ liệu. Kiểm tra mạng và quy tắc bảo mật Firestore.";
      softRender();
    };
    try {
      chatApi = await createChatApi();
      chatApi.subscribe(onRemote, () => toast("Mất kết nối chat, hãy tải lại trang."));
      chatApi.watch("content", (docs) => { const s = docs.find((d) => d.id === "site"); remoteSite = s ? s.data : null; got.content = true; scheduleRebuild(); }, fail);
      chatApi.watch("games", (docs) => { remoteGames = {}; docs.forEach((d) => { remoteGames[d.id] = d.data; }); got.games = true; scheduleRebuild(); }, fail);
      chatApi.watch("images", (docs) => { remoteImages = {}; docs.forEach((d) => { remoteImages[d.id] = d.data; }); got.images = true; scheduleRebuild(); }, fail);
      chatApi.watch("versions", (docs) => { remoteVersions = {}; docs.forEach((d) => { remoteVersions[d.id] = d.data; }); got.versions = true; scheduleRebuild(); }, fail);
    } catch (e) {
      fail();
    }
  }

  // ---------- Khung Trao đổi bên phải ----------
  // Một khung chung thay cho phần trao đổi ở cuối từng game: hiện trao đổi của game đang xem (tự đổi khi cuộn),
  // của game được chọn, hoặc của "Toàn trang" (các phần giao diện chung như menu, tiêu đề, bảng tổng quan).
  function chatTarget() {
    if (ui.chatGame === SITE_ID) return SITE_GAME;
    const games = DATA.sections.reduce((a, s) => a.concat(visibleGames(s)), []);
    if (ui.chatGame !== "auto") { const g = games.find((x) => x.id === ui.chatGame); if (g) return g; }
    return games.find((x) => x.id === ui.spyGame) || SITE_GAME; // chưa cuộn tới game nào: hiện trao đổi chung của cả trang
  }
  function renderRSide() {
    const games = DATA.sections.reduce((a, s) => a.concat(visibleGames(s)), []);
    const sel = $("rs-game");
    const key = games.map((g) => g.id + "|" + g.name).join("§");
    if (sel.getAttribute("data-key") !== key) { // chỉ dựng lại danh sách khi có đổi, để không mất focus của ô chọn
      sel.innerHTML = '<option value="all">Tất cả nhận xét</option><option value="auto">Theo phần đang xem</option><option value="' + SITE_ID + '">Toàn trang (tiêu đề, bảng tổng quan, thanh lọc…)</option>' +
        games.map((g) => '<option value="' + esc(g.id) + '">' + esc(g.name) + "</option>").join("");
      sel.setAttribute("data-key", key);
    }
    sel.value = (ui.chatGame === "all" || ui.chatGame === "auto" || ui.chatGame === SITE_ID || games.some((g) => g.id === ui.chatGame)) ? ui.chatGame : "all";
    const body = $("rs-body");
    if (ui.chatGame === "all" || sel.value === "all") { // mục mặc định: tất cả nhận xét của cả trang
      body.setAttribute("data-game", "all");
      body.innerHTML = renderAllComments();
      return;
    }
    const g = chatTarget();
    body.setAttribute("data-game", g.id);
    body.innerHTML = '<h3 class="rs-game">' + esc(g.name) + "</h3>" + renderComments(g);
  }
  function updateChatBadge() { // số nhận xét chưa giải quyết trên toàn trang
    let n = allComments(SITE_GAME).filter((c) => !c.resolved).length;
    DATA.sections.forEach((s) => visibleGames(s).forEach((g) => { n += allComments(g).filter((c) => !c.resolved).length; }));
    const el = $("chat-count");
    el.textContent = n;
    el.hidden = !n;
  }
  $("rs-game").addEventListener("change", (e) => { ui.chatGame = e.target.value; renderRSide(); });

  // ---------- Hai thanh bên: thu gọn (máy tính) hoặc ngăn kéo trượt ra (điện thoại) ----------
  const narrow = matchMedia("(max-width: 899px)");
  const navOpen = () => document.body.classList.contains("nav-open");
  const rsOpenMobile = () => document.body.classList.contains("rs-open");
  const store = (k, v) => { try { localStorage.setItem("game-progress-" + k, v); } catch (e) {} };
  const stored = (k) => { try { return localStorage.getItem("game-progress-" + k); } catch (e) { return null; } };
  // Máy tính nhớ lựa chọn lần trước. Chưa chọn lần nào thì khung phải chỉ mở khi màn hình đủ rộng.
  ui.lCollapsed = stored("lcollapsed") === "1";
  ui.rCollapsed = stored("rcollapsed") != null ? stored("rcollapsed") === "1" : innerWidth < 1280;

  function applyPanels() {
    const mobile = narrow.matches;
    document.body.classList.toggle("side-collapsed", !mobile && ui.lCollapsed);
    document.body.classList.toggle("rside-collapsed", !mobile && ui.rCollapsed);
    $("nav-collapse").setAttribute("aria-expanded", String(!ui.lCollapsed));
    $("menu-btn").setAttribute("aria-expanded", String(navOpen()));
    $("chat-btn").setAttribute("aria-expanded", String(mobile ? rsOpenMobile() : !ui.rCollapsed));
    const edge = $("rs-edge"), rOpen = !ui.rCollapsed;
    edge.setAttribute("aria-expanded", String(rOpen));
    const lbl = rOpen ? "Thu gọn khung trao đổi" : "Mở khung trao đổi";
    edge.title = lbl; edge.setAttribute("aria-label", lbl);
    $("nav-backdrop").hidden = !(mobile && (navOpen() || rsOpenMobile()));
  }
  function setLeft(collapsed) { ui.lCollapsed = collapsed; store("lcollapsed", collapsed ? "1" : "0"); applyPanels(); }
  function setNav(open, restoreFocus) { // menu trượt từ trái (điện thoại)
    document.body.classList.toggle("nav-open", open);
    if (open) document.body.classList.remove("rs-open");
    applyPanels();
    if (open) { const f = $("sidebar").querySelector("a, button"); if (f) f.focus({ preventScroll: true }); }
    else if (restoreFocus) $("menu-btn").focus({ preventScroll: true });
  }
  function setRight(open, restoreFocus) { // máy tính: mở/thu gọn khung phải; điện thoại: ngăn kéo từ phải
    if (narrow.matches) {
      document.body.classList.toggle("rs-open", open);
      if (open) document.body.classList.remove("nav-open");
    } else { ui.rCollapsed = !open; store("rcollapsed", open ? "0" : "1"); }
    applyPanels();
    if (open) renderRSide();
    if (!open && restoreFocus) $("chat-btn").focus({ preventScroll: true });
  }
  function openChat(gid) { // mở khung Trao đổi cho một game (hoặc "_site" = toàn trang)
    if (gid) ui.chatGame = gid;
    renderRSide();
    setRight(true, false);
    $("rs-body").scrollTop = 0;
  }
  $("menu-btn").addEventListener("click", () => setNav(!navOpen(), false));
  $("nav-close").addEventListener("click", () => setNav(false, true));
  $("nav-collapse").addEventListener("click", () => setLeft(true));
  $("nav-reopen").addEventListener("click", () => setLeft(false));
  $("chat-btn").addEventListener("click", () => setRight(narrow.matches ? !rsOpenMobile() : ui.rCollapsed, false));
  $("rs-collapse").addEventListener("click", () => setRight(false, true));
  $("rs-edge").addEventListener("click", () => setRight(ui.rCollapsed, false));
  $("nav-backdrop").addEventListener("click", () => { setNav(false, true); setRight(false, false); });
  $("sidebar").addEventListener("click", (e) => { if (narrow.matches && e.target.closest("a")) setNav(false, false); }); // chọn mục thì đóng menu
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (navOpen()) setNav(false, true); else if (narrow.matches && rsOpenMobile()) setRight(false, true);
  });
  narrow.addEventListener("change", () => { document.body.classList.remove("nav-open", "rs-open"); applyPanels(); });
  applyPanels();
  // Giao diện sáng/tối: Tự động (theo hệ thống) → Sáng → Tối, nhớ theo từng trình duyệt
  const THEMES = {
    auto: { lbl: "Tự động", title: "Tự động (theo hệ thống)", ico: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>' },
    light: { lbl: "Sáng", title: "Sáng", ico: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3 7 7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
    dark: { lbl: "Tối", title: "Tối", ico: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' }
  };
  function currentTheme() { const t = stored("theme"); return t === "light" || t === "dark" ? t : "auto"; }
  function applyTheme(t) {
    const root = document.documentElement;
    if (t === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
    const m = THEMES[t], b = $("theme-btn");
    $("theme-ico").innerHTML = m.ico; $("theme-lbl").textContent = m.lbl;
    b.title = "Giao diện: " + m.title; b.setAttribute("aria-label", "Giao diện: " + m.title + ". Bấm để đổi");
    const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    const mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.setAttribute("content", dark ? "#0a0d14" : "#161a26");
  }
  $("theme-btn").addEventListener("click", () => {
    const next = { auto: "light", light: "dark", dark: "auto" }[currentTheme()];
    store("theme", next); applyTheme(next); toast("Giao diện: " + THEMES[next].title);
  });
  if (matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme(currentTheme()));
  applyTheme(currentTheme());
  // Cập nhật --header-h theo chiều cao thật của header dính để chỗ đáp khi cuộn tới một mục không bị header che
  const syncHeaderH = () => document.documentElement.style.setProperty("--header-h", ($("topbar").offsetHeight || 60) + "px");
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(syncHeaderH).observe($("topbar"));
  syncHeaderH();

  render();
  handleHash(true);
  initChat();
})();
