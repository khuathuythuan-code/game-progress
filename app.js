(function () {
  "use strict";

  const DATA = window.PROGRESS;
  const KEY = "game-progress-state-v1";
  const MODE_KEY = "game-progress-edit-mode";
  const NAME_KEY = "game-progress-author";
  const $ = (id) => document.getElementById(id);
  const EMPTY = () => ({ delGames: [], delTasks: [], done: {}, added: {}, comments: {}, delComments: [], progress: {} });
  const canHover = () => matchMedia("(hover: hover)").matches;
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Trạng thái lưu trong trình duyệt ----------
  let state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === "object") return Object.assign(EMPTY(), s);
    } catch (e) {}
    return EMPTY();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ---------- Trạng thái giao diện ----------
  const ui = { editing: false, collapsed: {}, drafts: {}, name: "", pop: null, incoming: null, annotating: false };
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
    const base = g.tasks || [];
    const ids = new Set(base.map((t) => t.id));
    return base.concat((state.added[g.id] || []).filter((t) => !ids.has(t.id)));
  }
  const visibleTasks = (g) => allTasks(g).filter((t) => !state.delTasks.includes(t.id));
  function allComments(g) {
    const baseRaw = g.comments || [];
    const ids = new Set(baseRaw.map((c) => c.id));
    const base = baseRaw.filter((c) => !state.delComments.includes(c.id)).map((c) => Object.assign({}, c, { mine: false }));
    const mine = (state.comments[g.id] || []).filter((c) => !ids.has(c.id)).map((c) => Object.assign({}, c, { mine: true }));
    return base.concat(mine).sort((a, b) => new Date(a.time) - new Date(b.time));
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
    return ' id="' + esc(tid) + '" data-annot data-target="' + esc(tid) + '" data-tlabel="' + esc(label) + '" data-game="' + esc(g.id) + '"' +
      (cm[tid] ? ' data-ccount="' + cm[tid] + '"' : "");
  }

  // ---------- Render từng phần ----------
  let introDone = false; // thanh tiến độ ở bảng đầu trang chỉ chạy hiệu ứng một lần

  function renderTask(t, g, cm) {
    const d = isDone(t);
    const attrs = A(g, "task-" + t.id, "Việc: " + short(t.text, 48), cm);
    if (!ui.editing) {
      return '<li class="task' + (d ? " done" : "") + '"' + attrs + '><span class="mark" aria-hidden="true">' + (d ? "✓" : "") +
        '</span><span class="task-text">' + esc(t.text) + '</span><span class="sr-only">' + (d ? " (đã xong)" : " (chưa xong)") + "</span></li>";
    }
    return '<li class="task' + (d ? " done" : "") + '"' + attrs + "><label>" +
      '<input type="checkbox" data-action="toggle" data-fk="tg-' + esc(t.id) + '" data-id="' + esc(t.id) + '"' + (d ? " checked" : "") + ">" +
      '<span class="task-text">' + esc(t.text) + "</span></label>" +
      '<button class="icon-btn" data-action="del-task" data-id="' + esc(t.id) + '" title="Xóa việc này" aria-label="Xóa việc: ' + esc(t.text) + '">✕</button></li>';
  }

  function renderMsg(g, c, withTag) {
    const canDel = c.mine || ui.editing;
    return '<li class="msg' + (c.mine ? " mine" : "") + '"><div class="msg-meta"><b>' + esc(c.author) + "</b><time>" + esc(fmtTime(c.time)) + "</time>" +
      (canDel ? '<button class="link-btn" data-action="del-comment" data-game="' + esc(g.id) + '" data-id="' + esc(c.id) + '" aria-label="Xóa nhận xét của ' + esc(c.author) + '">Xóa</button>' : "") + "</div>" +
      (withTag && c.target ? '<a class="ctag" href="#' + esc(c.target.id) + '" data-action="goto-target" data-id="' + esc(c.target.id) + '">về: ' + esc(c.target.label) + "</a>" : "") +
      '<p class="bubble">' + esc(c.text) + "</p></li>";
  }

  function renderComments(g) {
    const list = allComments(g);
    const draft = ui.drafts[g.id] || "";
    return '<section class="comments" id="c-' + esc(g.id) + '" aria-label="Nhận xét về ' + esc(g.name) + '">' +
      "<h4>Nhận xét" + (list.length ? " (" + list.length + ")" : "") + "</h4>" +
      (list.length ? '<ul class="thread">' + list.map((c) => renderMsg(g, c, true)).join("") + "</ul>" :
        '<p class="no-comments">Chưa có nhận xét. Rê chuột vào ảnh, tiến độ hay một mục bất kỳ để nhận xét đúng chỗ, hoặc viết nhận xét chung ở dưới.</p>') +
      '<form class="composer" data-game="' + esc(g.id) + '">' +
      '<label class="sr-only" for="cn-' + esc(g.id) + '">Tên của bạn</label>' +
      '<input id="cn-' + esc(g.id) + '" name="author" type="text" maxlength="40" placeholder="Tên của bạn" autocomplete="name" data-fk="cn-' + esc(g.id) + '" value="' + esc(ui.name) + '" required>' +
      '<label class="sr-only" for="ct-' + esc(g.id) + '">Nội dung nhận xét</label>' +
      '<textarea id="ct-' + esc(g.id) + '" name="text" rows="2" maxlength="600" placeholder="Nhận xét chung về ' + esc(g.name) + '" data-draft="' + esc(g.id) + '" data-fk="ct-' + esc(g.id) + '" required>' + esc(draft) + "</textarea>" +
      '<div class="composer-foot"><span class="hint kbd">Ctrl + Enter để gửi</span><button class="btn small" type="submit">Thêm nhận xét</button></div>' +
      "</form></section>";
  }

  function renderGame(sec, g) {
    const tasks = visibleTasks(g);
    const doneCount = tasks.filter(isDone).length;
    const planned = sec.key === "planned";
    const p = prog(g);
    const cm = targetCounts(g);
    const nCmt = allComments(g).length;
    const open = !ui.collapsed[g.id];

    const facts = '<span class="genre">' + esc(g.genre) + "</span><span>" + esc(g.platform) + "</span>" +
      (g.meta ? "<span>" + esc(g.meta) + "</span>" : "");

    const progress = planned ? "" :
      '<div class="progress"' + A(g, "progress", "Tiến độ", cm) + '><div class="progress-top"><span>Tiến độ</span><b>' + p + "%</b></div>" +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><i style="width:' + p + '%"></i></div>' +
      (ui.editing ? '<label class="slider">Điều chỉnh tiến độ<input type="range" min="0" max="100" step="5" value="' + p + '" data-action="progress" data-id="' + esc(g.id) + '" data-fk="rg-' + esc(g.id) + '"></label>' : "") +
      "</div>";

    const imgs = g.images || [];
    const gallery = imgs.length ?
      '<div class="gallery-wrap">' +
      '<button class="nav-btn prev" data-action="scroll" data-dir="-1" aria-label="Ảnh trước">‹</button>' +
      (imgs.length > 1 ? '<span class="gcount" aria-hidden="true">1 / ' + imgs.length + "</span>" : "") +
      '<div class="gallery" tabindex="0" role="group" aria-label="Ảnh của ' + esc(g.name) + '">' +
      imgs.map((im, i) =>
        "<figure" + A(g, "img-" + (i + 1), "Ảnh " + (i + 1) + (im.caption ? ": " + im.caption : ""), cm) + '><img loading="lazy" src="' + esc(im.src) + '" alt="' + esc(im.caption || g.name) + '" data-action="zoom" data-game="' + esc(g.id) + '" data-index="' + i + '">' +
        "<figcaption>" + esc(im.caption || "") + "</figcaption></figure>").join("") +
      "</div>" +
      '<button class="nav-btn next" data-action="scroll" data-dir="1" aria-label="Ảnh sau">›</button></div>' : "";

    const taskHtml = tasks.length ? '<ul class="tasks">' + tasks.map((t) => renderTask(t, g, cm)).join("") + "</ul>" : '<p class="none">Chưa có việc nào.</p>';
    const addForm = ui.editing ?
      '<form class="add-task" data-game="' + esc(g.id) + '"><input type="text" name="text" maxlength="140" placeholder="Thêm việc mới" aria-label="Việc mới cho ' + esc(g.name) + '" data-fk="at-' + esc(g.id) + '" required>' +
      '<button class="btn small" type="submit">Thêm</button></form>' : "";

    const links = g.links || [];
    const linkHtml = links.length ?
      '<ul class="links">' + links.map((l, i) => "<li" + A(g, "link-" + (i + 1), "Tài liệu: " + short(l.title, 48), cm) + '><a href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(l.title) + "</a></li>").join("") + "</ul>" :
      '<p class="none">Chưa có tài liệu.</p>';

    const tools =
      '<a class="tool' + (nCmt ? " has-count" : "") + '" href="#c-' + esc(g.id) + '" data-action="goto-comments" data-id="' + esc(g.id) + '" aria-label="Nhận xét: ' + nCmt + '">' + ICON_CMT + "<span>" + nCmt + "</span></a>" +
      '<button class="tool" data-action="collapse" data-id="' + esc(g.id) + '" aria-expanded="' + open + '" aria-controls="m-' + esc(g.id) + '">' + '<span class="tool-label">' + (open ? "Thu gọn" : "Mở rộng") + "</span>" + ICON_CHEV + "</button>" +
      (ui.editing ? '<button class="icon-btn" data-action="del-game" data-id="' + esc(g.id) + '" title="Xóa game này" aria-label="Xóa game ' + esc(g.name) + '">✕</button>' : "");

    return '<article class="game" id="g-' + esc(g.id) + '">' +
      '<div class="game-head"><div class="game-title"' + A(g, "title", "Thông tin game", cm) + '><h3 tabindex="-1">' + esc(g.name) + '</h3><div class="facts">' + facts + '</div></div><div class="game-tools">' + tools + "</div></div>" +
      progress +
      '<div class="game-more" id="m-' + esc(g.id) + '"' + (open ? "" : " hidden") + ">" + gallery +
      '<div class="game-body"><p class="desc"' + A(g, "desc", "Mô tả", cm) + ">" + esc(g.description) + "</p>" +
      '<div class="cols"><div><h4>Việc cần làm, xong ' + doneCount + "/" + tasks.length + "</h4>" + taskHtml + addForm + "</div>" +
      "<div><h4>Tài liệu tham khảo</h4>" + linkHtml + "</div></div>" + renderComments(g) + "</div></div></article>";
  }

  function render() {
    $("title").textContent = DATA.title;
    document.title = DATA.title;
    $("updated").textContent = DATA.updated || "";
    document.body.classList.toggle("editing", ui.editing);
    document.body.classList.toggle("annotating", ui.annotating);
    $("editbar").hidden = !ui.editing;
    $("enter-edit").hidden = ui.editing;

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

    let boardHtml = "", appHtml = "", tabsHtml = "";
    DATA.sections.forEach((sec) => {
      const games = visibleGames(sec);
      boardHtml += '<div class="lane" data-key="' + esc(sec.key) + '"><div class="lane-label"><b>' + esc(sec.title) + "</b><span>" + games.length + " game</span></div>" +
        (games.length ? '<div class="chips">' + games.map((g) => {
          const sub = sec.key === "dev" ?
            '<span class="chip-sub">' + prog(g) + '% hoàn thành</span><span class="chip-bar"><i style="--w:' + prog(g) + '%"></i></span>' :
            '<span class="chip-sub">' + esc(g.meta || g.genre) + "</span>";
          return '<a class="chip" href="#g-' + esc(g.id) + '" data-game="' + esc(g.id) + '"><span class="chip-name">' + esc(g.name) + "</span>" + sub + "</a>";
        }).join("") + "</div>" : '<p class="lane-empty">Chưa có game nào.</p>') + "</div>";
      tabsHtml += '<a href="#sec-' + esc(sec.key) + '" data-key="' + esc(sec.key) + '"><span class="dot"></span>' + esc(sec.title) + "</a>";
      appHtml += '<section class="section" id="sec-' + esc(sec.key) + '" data-key="' + esc(sec.key) + '"><div class="section-head"><h2>' + esc(sec.title) + '</h2><span class="count">' + games.length + "</span>" +
        (sec.note ? '<span class="note">' + esc(sec.note) + "</span>" : "") + "</div>" +
        (games.length ? games.map((g) => renderGame(sec, g)).join("") : '<div class="empty">Chưa có game nào trong mục này.</div>') + "</section>";
    });
    tabsHtml += '<button type="button" data-action="toggle-all" id="toggle-all"></button>' +
      '<button type="button" class="touch-only' + (ui.annotating ? " on" : "") + '" data-action="annot-mode" aria-pressed="' + ui.annotating + '">Nhận xét</button>';

    const board = $("board");
    board.innerHTML = boardHtml;
    board.classList.toggle("intro", !introDone);
    introDone = true;
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
  }, { passive: true });

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
    const navH = $("tabs").offsetHeight || 0;
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
  function renderPop() {
    const p = ui.pop;
    if (!p) { popEl.hidden = true; return; }
    const g = findGame(p.gid);
    if (!g) { ui.pop = null; popEl.hidden = true; return; }
    const list = allComments(g).filter((c) => c.target && c.target.id === p.id);
    let items = list.map((c) => renderMsg(g, c, false)).join("");
    if (ui.incoming && ui.incoming.tid === p.id) {
      items += '<li class="msg from-link"><div class="msg-meta"><b>' + esc(ui.incoming.a || "Người nhận xét") + "</b><time>" + esc(fmtTime(ui.incoming.t)) +
        '</time><span class="badge">từ link email</span></div><p class="bubble">' + esc(ui.incoming.m) + "</p></li>";
    }
    const key = "pop:" + p.id;
    popEl.innerHTML =
      '<div class="pop-head"><div><span class="kicker">Nhận xét về</span><strong>' + esc(p.label) + '</strong></div>' +
      '<button class="icon-btn" data-action="pop-close" aria-label="Đóng">✕</button></div>' +
      (items ? '<ul class="thread pop-thread">' + items + "</ul>" : "") +
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
    const navH = $("tabs").offsetHeight || 0;
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
    try { localStorage.setItem(MODE_KEY, on ? "1" : "0"); } catch (e) {}
    render();
    toast(on ? "Đã bật chế độ chỉnh sửa" : "Đã chuyển sang chế độ xem");
  }
  $("enter-edit").addEventListener("click", () => setEditing(true));
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
    const s = state;
    const dirty = s.delGames.length || s.delTasks.length || s.delComments.length || Object.keys(s.done).length ||
      Object.keys(s.added).length || Object.keys(s.progress).length || Object.keys(s.comments).length;
    if (!dirty) { toast("Không có gì để khôi phục"); return; }
    if (confirm("Khôi phục về đúng như trong data.js? Mọi thay đổi, việc và nhận xét đã thêm trên trình duyệt này sẽ mất.")) {
      state = EMPTY();
      save(); render(); toast("Đã khôi phục");
    }
  });
  $("export").addEventListener("click", () => {
    const out = JSON.parse(JSON.stringify(DATA));
    const d = new Date();
    out.updated = pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
    out.sections.forEach((sec) => {
      sec.games = visibleGames(sec);
      sec.games.forEach((g) => {
        g.progress = prog(g);
        g.tasks = visibleTasks(g).map((t) => ({ id: t.id, text: t.text, done: isDone(t) }));
        g.comments = allComments(g).map((c) => {
          const o = { id: c.id, author: c.author, text: c.text, time: c.time };
          if (c.target) o.target = { id: c.target.id, label: c.target.label };
          return o;
        });
      });
    });
    copyText("window.PROGRESS = " + JSON.stringify(out, null, 2) + ";\n", (ok) =>
      toast(ok ? "Đã sao chép. Dán đè vào data.js" : "Không sao chép được"));
  });

  render();
  handleHash(true);
})();
