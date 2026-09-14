/* ==========================================================================
   六级真题刷题 —— 主逻辑
   ========================================================================== */
(function () {
  "use strict";

  var INDEX = window.__CET6_INDEX || [];
  window.__CET6_PAPERS = window.__CET6_PAPERS || {};
  var PAPERS = window.__CET6_PAPERS;
  var loading = {};
  var view = document.getElementById("view");

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function partOf(no) {
    if (no <= 25) return "listening";
    if (no <= 35) return "cloze";
    if (no <= 45) return "matching";
    return "reading";
  }
  var PART_LABEL = { listening: "听力理解", cloze: "选词填空", matching: "信息匹配", reading: "仔细阅读" };
  var EXPLAIN_LABEL = {
    "定位": "原文定位", "信号": "信号提示", "替换": "同义替换", "排除": "干扰项排除",
    "判型": "题型判定", "拆句": "题干拆句", "选项": "选项分析",
    "锚点": "段落锚点", "改写": "同义改写", "辨邻": "邻近段辨析",
    "词性槽": "词性槽位", "依据": "锁定依据", "竞争词": "竞争词淘汰", "易错": "易错提醒"
  };
  var EXPLAIN_ORDER = ["判型", "拆句", "定位", "信号", "替换", "选项", "排除",
    "锚点", "改写", "辨邻", "词性槽", "依据", "竞争词", "易错"];

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1700);
  }

  /* ---------------- 数据加载 ---------------- */
  function loadPaper(pid) {
    if (PAPERS[pid]) return Promise.resolve(PAPERS[pid]);
    if (loading[pid]) return loading[pid];
    loading[pid] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "data/papers/" + pid + ".js";
      s.onload = function () {
        PAPERS[pid] = window.__CET6_PAPERS[pid];
        if (PAPERS[pid]) resolve(PAPERS[pid]); else reject(new Error("数据为空"));
      };
      s.onerror = function () { reject(new Error("无法加载 " + pid)); };
      document.head.appendChild(s);
    });
    return loading[pid];
  }

  function qidOf(pid, no) { return pid + "#" + no; }

  /* ---------------- 状态 ---------------- */
  var S = {
    mode: "home",
    arg: null,
    queue: [],
    qi: 0,
    cur: null,        // 当前题目对象
    curPid: null,
    revealed: false,
    sheet: false,
    startAt: 0
  };

  function setMode(mode, arg) {
    S.mode = mode; S.arg = arg;
    var tabs = document.querySelectorAll("#tabs button");
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("on", tabs[i].dataset.mode === mode);
  }

  function buildQueue(mode, arg) {
    var q = [];
    var i, j, p;
    if (mode === "sequence") {
      for (i = 0; i < INDEX.length; i++)
        for (j = 0; j < INDEX[i].nos.length; j++) q.push({ pid: INDEX[i].id, no: INDEX[i].nos[j] });
    } else if (mode === "random") {
      for (i = 0; i < INDEX.length; i++)
        for (j = 0; j < INDEX[i].nos.length; j++) q.push({ pid: INDEX[i].id, no: INDEX[i].nos[j] });
      for (i = q.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); p = q[i]; q[i] = q[j]; q[j] = p; }
      q = q.slice(0, 100);
    } else if (mode === "papers") {
      for (i = 0; i < INDEX.length; i++) if (INDEX[i].id === arg) {
        for (j = 0; j < INDEX[i].nos.length; j++) q.push({ pid: arg, no: INDEX[i].nos[j] });
      }
    } else if (mode === "types") {
      for (i = 0; i < INDEX.length; i++)
        for (j = 0; j < INDEX[i].nos.length; j++)
          if (partOf(INDEX[i].nos[j]) === arg) q.push({ pid: INDEX[i].id, no: INDEX[i].nos[j] });
    } else if (mode === "wrong" || mode === "fav") {
      var list = mode === "wrong" ? Store.wrongList() : Store.favList();
      list.sort();
      for (i = 0; i < list.length; i++) {
        var k = list[i].split("#");
        q.push({ pid: k[0], no: parseInt(k[1], 10) });
      }
    }
    return q;
  }

  function start(mode, arg, atIndex) {
    var q = buildQueue(mode, arg);
    if (!q.length) { toast(mode === "wrong" ? "错题本是空的，先去刷几题吧" : "收藏夹是空的"); return; }
    S.queue = q;
    S.mode = mode; S.arg = arg;
    S.qi = atIndex || 0;
    S.startAt = Date.now();
    setMode(mode, arg);
    go(S.qi);
  }

  function go(i) {
    if (i < 0) i = 0;
    if (i > S.queue.length - 1) i = S.queue.length - 1;
    S.qi = i;
    S.revealed = false;
    var it = S.queue[i];
    S.curPid = it.pid;
    Store.setPos("last", { mode: S.mode, arg: S.arg, qi: i });
    view.innerHTML = '<div class="loading">正在载入题目…</div>';
    loadPaper(it.pid).then(function (p) {
      var q = null;
      for (var k = 0; k < p.questions.length; k++) if (p.questions[k].no === it.no) { q = p.questions[k]; break; }
      if (!q) { toast("题目缺失"); return; }
      S.cur = q;
      renderPractice();
    }).catch(function (e) {
      view.innerHTML = '<div class="empty"><div class="ei">⚠️</div><p>题目数据加载失败</p>' +
        '<p style="font-size:12.5px;color:#b6a7ae;margin-top:6px">' + esc(e.message) +
        '<br>请确认 data/ 目录完整，或通过本地服务器打开（python -m http.server）</p></div>';
    });
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    S.mode = "home"; S.cur = null;
    setMode("home", null);
    var st = Store.stats();
    var total = INDEX.reduce(function (n, p) { return n + p.count; }, 0);
    var wrongN = Store.wrongCount(), favN = Store.favCount();
    var pos = Store.getPos("last");
    var typeCount = { listening: 0, cloze: 0, matching: 0, reading: 0 };
    INDEX.forEach(function (p) {
      for (var k in p.parts) typeCount[k] = (typeCount[k] || 0) + p.parts[k];
    });

    var h = '';
    h += '<section class="hero">';
    h += '<h2>六级真题 · <em>刷题模式</em></h2>';
    h += '<p class="sub">2020 — 2026 共 46 套真题，逐题附带答案与「定位 / 信号 / 替换 / 排除」四维解析。' +
      '选一个模式开始，答完立刻判分。</p>';
    h += '<div class="hero-stats">' +
      hs(total, "总题量") + hs(INDEX.length, "套真题") +
      hs(st.done, "已作答") + hs(st.rate + "%", "正确率") +
      hs(wrongN, "错题") + hs(favN, "收藏") +
      '</div>';
    if (pos && pos.mode && pos.mode !== "home") {
      h += '<div style="margin-top:18px"><button class="btn primary" id="resumeBtn">继续上次：' +
        esc(modeName(pos.mode, pos.arg)) + ' 第 ' + (pos.qi + 1) + ' 题</button></div>';
    }
    h += '</section>';

    h += '<div class="sec-title">练习模式<span class="line"></span></div>';
    h += '<div class="modes">' +
      modeCard("sequence", "▶", "顺序刷题", "从 2020 年 7 月第 1 套开始，按年份一路刷到最新", total + " 题") +
      modeCard("random", "🎲", "随机练习", "随机抽 100 题混合练习，适合考前突击", "100 题") +
      modeCard("papers", "📚", "按套卷模考", "整套 55 题完整模考，可交卷看成绩", "46 套") +
      modeCard("types", "🧩", "按题型专项", "听力 / 选词填空 / 信息匹配 / 仔细阅读", "4 类") +
      modeCard("wrong", "❌", "错题本", "做错的题自动收录，答对后移出", wrongN + " 题") +
      modeCard("fav", "★", "我的收藏", "随时收藏好题、难句和值得回看的解析", favN + " 题") +
      '</div>';

    h += '<div class="sec-title">按题型专项<span class="line"></span></div>';
    h += '<div class="papers">' +
      typeCard("listening", "听力理解", typeCount.listening, "1–25 题 · 长对话 / 短文 / 讲座") +
      typeCard("cloze", "选词填空", typeCount.cloze, "26–35 题 · 15 选 10") +
      typeCard("matching", "长篇阅读", typeCount.matching, "36–45 题 · 段落信息匹配") +
      typeCard("reading", "仔细阅读", typeCount.reading, "46–55 题 · 四选一") +
      '</div>';

    h += '<div class="sec-title">按套卷刷题<span class="line"></span></div>';
    h += '<div class="papers">';
    INDEX.forEach(function (p) {
      var pr = Store.paperProgress(p.id, p.nos);
      var pct = Math.round(pr.done / pr.total * 100);
      h += '<div class="paper" data-paper="' + p.id + '">' +
        '<div class="pt"><b>' + esc(p.label) + '</b><span>' + esc(p.set) + '</span></div>' +
        '<div class="pm">' + pr.total + ' 题 · 已做 ' + pr.done + ' · 正确率 ' + (pr.done ? Math.round(pr.right / pr.done * 100) : 0) + '%</div>' +
        '<div class="pbar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="pgo">' + (pr.done ? "继续第 " + (pr.done + 1) + " 题 →" : "开始刷题 →") + '</div>' +
        '</div>';
    });
    h += '</div>';

    h += '<div class="sec-title">数据<span class="line"></span></div>';
    h += '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn ghost" id="clearWrong">清空错题本</button>' +
      '<button class="btn ghost" id="clearFav">清空收藏</button>' +
      '<button class="btn ghost" id="resetAll">重置全部记录</button>' +
      '</div>';

    view.innerHTML = h;

    if ($("resumeBtn")) $("resumeBtn").onclick = function () {
      var p = Store.getPos("last");
      start(p.mode, p.arg, p.qi);
    };
    var cards = view.querySelectorAll(".mode");
    for (var i = 0; i < cards.length; i++) {
      cards[i].onclick = function () {
        var m = this.dataset.mode;
        if (m === "types") { jumpToTypes(); return; }
        start(m, null, 0);
      };
    }
    var tcards = view.querySelectorAll("[data-type]");
    for (i = 0; i < tcards.length; i++) {
      tcards[i].onclick = function () { start("types", this.dataset.type, 0); };
    }
    var pcards = view.querySelectorAll("[data-paper]");
    for (i = 0; i < pcards.length; i++) {
      pcards[i].onclick = function () {
        var pid = this.dataset.paper, at = 0;
        for (var k = 0; k < INDEX.length; k++) if (INDEX[k].id === pid) {
          var pr = Store.paperProgress(pid, INDEX[k].nos);
          if (pr.done > 0 && pr.done < pr.total) at = pr.done;
        }
        start("papers", pid, at);
      };
    }
    $("clearWrong").onclick = function () { Store.clearWrong(); refreshBadges(); renderHome(); toast("错题本已清空"); };
    $("clearFav").onclick = function () { Store.clearFav(); refreshBadges(); renderHome(); toast("收藏已清空"); };
    $("resetAll").onclick = function () {
      if (confirm("将清除所有答题记录、错题与收藏，确定吗？")) {
        Store.resetAll(); refreshBadges(); renderHome(); toast("已重置");
      }
    };
  }

  function hs(n, l) { return '<div class="hs"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; }
  function modeCard(mode, icon, title, desc, num) {
    return '<div class="mode" data-mode="' + mode + '">' +
      '<div class="mi">' + icon + '</div><h3>' + title + '</h3><p>' + desc + '</p>' +
      '<div class="mn">' + num + ' →</div></div>';
  }
  function typeCard(type, title, n, desc) {
    return '<div class="paper" data-type="' + type + '">' +
      '<div class="pt"><b>' + title + '</b><span>' + n + ' 题</span></div>' +
      '<div class="pm">' + desc + '</div>' +
      '<div class="pgo">进入专项 →</div></div>';
  }
  function modeName(m, arg) {
    if (m === "sequence") return "顺序刷题";
    if (m === "random") return "随机练习";
    if (m === "papers") { for (var i = 0; i < INDEX.length; i++) if (INDEX[i].id === arg) return INDEX[i].label + " " + INDEX[i].set; return "套卷"; }
    if (m === "types") return PART_LABEL[arg] || "题型";
    if (m === "wrong") return "错题本";
    if (m === "fav") return "收藏";
    return "刷题";
  }
  function jumpToTypes() {
    document.querySelector('.papers [data-type]').scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------------- 练习页 ---------------- */
  /* 原文：优先取题目自带，其次取套卷级共享原文（去重后） */
  function passageOf(q, pid) {
    if (q.passage) return q.passage;
    var p = PAPERS[pid];
    if (p && p.passages && q.pref && p.passages[q.pref]) return p.passages[q.pref];
    return "";
  }

  function passageHTML(q, pid) {
    var t = passageOf(q, pid);
    if (!t) return "";
    if (q.part === "cloze") {
      t = esc(t).replace(/\((\d{2})\)_{3,}\s*/g, '<span class="blank">($1) ______</span> ');
      return '<p>' + t + "</p>";
    }
    if (q.part === "matching") {
      var parts = t.split(/\n(?=[A-M]\)\s)/);
      return parts.map(function (x) {
        return "<p>" + esc(x.trim()).replace(/^([A-M])\)/, "<b>$1)</b>") + "</p>";
      }).join("");
    }
    var ps = t.split(/\n{2,}/);
    return ps.map(function (x) {
      return "<p>" + esc(x.trim()).replace(/^(P\d+)\s/, "<b>$1</b> ") + "</p>";
    }).join("");
  }

  function renderPractice() {
    var q = S.cur, pid = S.curPid;
    var idx = S.qi, total = S.queue.length;
    var qid = qidOf(pid, q.no);
    var rec = Store.getAnswer(qid);
    var meta = null;
    for (var i = 0; i < INDEX.length; i++) if (INDEX[i].id === pid) meta = INDEX[i];
    var part = q.part;
    var hasPassage = !!passageOf(q, pid);
    var wide = window.innerWidth > 1080;

    var h = '<div class="practice">';

    /* 头部 */
    h += '<div class="p-head">';
    h += '<button class="back" id="backHome">←</button>';
    h += '<div class="ptitle">' + esc(meta.label) + " " + esc(meta.set) +
      '<small>第 ' + q.no + ' 题 · ' + PART_LABEL[part] + '</small></div>';
    h += '<div class="pgrow"><div class="pinfo"><span>' + modeName(S.mode, S.arg) +
      '</span><span><b>' + (idx + 1) + '</b> / ' + total + '　正确率 ' + Store.stats().rate + '%</span></div>' +
      '<div class="pbar2"><i style="width:' + Math.round((idx + 1) / total * 100) + '%"></i></div></div>';
    h += '<div class="actions">';
    h += '<button class="btn sm ghost" id="sheetBtn">答题卡</button>';
    if (S.mode === "papers") h += '<button class="btn sm ghost" id="scoreBtn">成绩</button>';
    h += '</div></div>';

    /* 主体 */
    h += '<div class="p-body' + (hasPassage && wide ? " split" : "") + '">';
    if (hasPassage) {
      h += '<aside class="passage" id="passageBox">' +
        '<div class="passage-head" id="passageHead"><b>' +
        (part === "reading" ? "阅读原文" : part === "matching" ? "原文段落 A–M" : "选词填空原文") +
        '</b><span id="passageToggle">' + (wide ? "点击折叠 ▲" : "点击展开 ▼") + '</span></div>' +
        '<div class="passage-body">' + passageHTML(q, pid) + '</div></aside>';
    }

    h += '<section class="qcard">';
    h += '<div class="qmeta"><div class="qno">' + q.no + '</div>' +
      '<div class="qfrom">' + esc(meta.label) + " " + esc(meta.set) + " · " + PART_LABEL[part] +
      (q.type ? ' · ' + esc(q.type) : '') + '</div>' +
      '<div class="spacer"></div>' +
      '<button class="fav-btn' + (Store.isFav(qid) ? " on" : "") + '" id="favBtn">' +
      (Store.isFav(qid) ? "★ 已收藏" : "☆ 收藏") + '</button></div>';

    if (part === "listening") {
      h += '<p class="hint-audio">🎧 听力题：题干与选项在卷面上，录音需在线收听 —— ' +
        '<a href="https://english-exam.lazynote.cn/cet6/paper/' + pid + '/?f=p" target="_blank" rel="noopener">打开本套录音页 ↗</a></p>';
    }

    if (q.stem) h += '<p class="qstem">' + esc(q.stem) + '</p>';
    if (q.stemZh) h += '<p class="qstem-zh">' + esc(q.stemZh) + '</p>';

    /* 选项区 */
    if (part === "cloze" && q.wordBank) {
      h += '<div class="bank" id="bank">';
      var letters = Object.keys(q.wordBank);
      for (var b = 0; b < letters.length; b++) {
        h += '<button data-k="' + letters[b] + '"><span class="bk">' + letters[b] + '</span>' +
          esc(q.wordBank[letters[b]]) + '</button>';
      }
      h += '</div>';
    } else if (part === "matching") {
      h += '<div class="para-pick" id="bank">';
      var ps = q.paraOptions || "ABCDEFGHIJKLM".split("");
      for (var p2 = 0; p2 < ps.length; p2++) h += '<button data-k="' + ps[p2] + '">' + ps[p2] + '</button>';
      h += '</div>';
    } else if (q.options && q.options.length === 4) {
      h += '<div class="opts" id="opts">';
      "ABCD".split("").forEach(function (L, i) {
        h += '<button class="opt" data-k="' + L + '"><span class="k">' + L + '</span><span class="t">' +
          esc(q.options[i]) + '</span></button>';
      });
      h += '</div>';
    }

    /* 判定 + 解析 */
    h += '<div id="result"></div>';
    h += '</section></div>';

    /* 底部 */
    h += '<div class="p-foot">' +
      '<button class="btn" id="prevBtn"' + (idx === 0 ? " disabled" : "") + '>← 上一题</button>' +
      '<button class="btn ghost" id="revealBtn">' + (rec ? "查看解析" : "不会，看答案") + '</button>' +
      '<span class="spacer"></span>' +
      '<span class="fbadge" id="fbadge"></span>' +
      '<span class="spacer"></span>' +
      '<button class="btn primary" id="nextBtn">' + (idx === total - 1 ? "完成 ✓" : "下一题 →") + '</button>' +
      '</div>';

    h += '</div>';
    view.innerHTML = h;

    /* ---- 事件 ---- */
    $("backHome").onclick = function () { renderHome(); };
    $("prevBtn").onclick = function () { if (S.qi > 0) go(S.qi - 1); };
    $("nextBtn").onclick = function () {
      if (S.qi >= S.queue.length - 1) { finish(); return; }
      go(S.qi + 1);
    };
    $("favBtn").onclick = function () {
      var on = Store.toggleFav(qid);
      this.className = "fav-btn" + (on ? " on" : "");
      this.textContent = on ? "★ 已收藏" : "☆ 收藏";
      refreshBadges();
    };
    $("revealBtn").onclick = function () { S.revealed = true; paintResult(); };
    if ($("sheetBtn")) $("sheetBtn").onclick = openSheet;
    if ($("scoreBtn")) $("scoreBtn").onclick = showScore;
    if ($("passageHead")) $("passageHead").onclick = function () {
      var box = $("passageBox");
      box.classList.toggle("collapsed");
      $("passageToggle").textContent = box.classList.contains("collapsed") ? "点击展开 ▼" : "点击折叠 ▲";
    };

    var bank = $("bank");
    if (bank) {
      bank.onclick = function (e) {
        var b = e.target.closest("button[data-k]");
        if (!b || b.disabled) return;
        if (Store.getAnswer(qid)) return;
        pick(b.dataset.k);
      };
    }
    var opts = $("opts");
    if (opts) {
      opts.onclick = function (e) {
        var b = e.target.closest(".opt");
        if (!b || b.disabled) return;
        if (Store.getAnswer(qid)) return;
        pick(b.dataset.k);
      };
    }

    if (rec) { S.revealed = true; }
    if (window.Ink) Ink.sync();
    paintResult();
    updateFootBadge();
  }

  function pick(k) {
    var q = S.cur, pid = S.curPid, qid = qidOf(pid, q.no);
    var ok = (k === q.answer);
    Store.answer(qid, k, ok);
    S.revealed = true;
    paintResult();
    refreshBadges();
    updateFootBadge();
    if (ok) toast("答对了 ✓");
    else toast("答错了，看看解析 →");
  }

  function paintResult() {
    var q = S.cur, pid = S.curPid, qid = qidOf(pid, q.no);
    var rec = Store.getAnswer(qid);
    var box = $("result");
    if (!box) return;

    /* 选项着色 */
    var nodes = document.querySelectorAll("#opts .opt, #bank button");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], k = n.dataset.k;
      n.classList.remove("right", "wrong", "picked");
      if (!S.revealed) continue;
      n.disabled = true;
      if (k === q.answer) n.classList.add("right");
      else if (rec && rec.c === k) n.classList.add("wrong");
    }

    if (!S.revealed) { box.innerHTML = ""; return; }

    var html = "";
    if (rec) {
      html += '<div class="verdict ' + (rec.ok ? "ok" : "bad") + '">' +
        (rec.ok ? "✓ 回答正确" : "✕ 回答错误") +
        '<span class="vv">你的答案：' + esc(rec.c) + '　正确答案：' + esc(q.answer) +
        (q.answerText && q.answerText !== q.answer ? "（" + esc(q.answerText) + "）" : "") + '</span></div>';
    } else {
      html += '<div class="verdict" style="background:#fff8fb;color:#c0245f;border:1px solid #f7d3e2">' +
        '正确答案：' + esc(q.answer) +
        (q.answerText && q.answerText !== q.answer ? "（" + esc(q.answerText) + "）" : "") +
        '<span class="vv">本题尚未作答</span></div>';
    }

    var ex = q.explain || {};
    var keys = EXPLAIN_ORDER.filter(function (k) { return ex[k]; });
    if (!keys.length) keys = Object.keys(ex).filter(function (k) { return ex[k]; });
    if (keys.length) {
      html += '<div class="explain"><h4>逐题解析</h4>';
      keys.forEach(function (k) {
        var body = esc(ex[k]);
        body = body.replace(/([A-Za-z][A-Za-z\s,'\-]{6,}?)\s*↔/g, "<em>$1</em> ↔");
        html += '<div class="ex-block"><div class="ex-h">' + (EXPLAIN_LABEL[k] || k) + '</div>' +
          '<div class="ex-b">' + body + '</div></div>';
      });
      html += '</div>';
    }
    box.innerHTML = html;
    var rb = $("revealBtn");
    if (rb) rb.textContent = "已显示解析";
  }

  function updateFootBadge() {
    var el = $("fbadge");
    if (!el) return;
    var rec = Store.getAnswer(qidOf(S.curPid, S.cur.no));
    var st = Store.stats();
    el.textContent = (rec ? (rec.ok ? "本题已答对" : "本题已答错，已收入错题本") : "本题未作答") +
      "　|　累计 " + st.done + " 题，正确率 " + st.rate + "%";
  }

  function finish() {
    var st = Store.stats();
    toast("已到最后：累计 " + st.done + " 题，正确率 " + st.rate + "%");
    openSheet();
  }

  function showScore() {
    var meta = null;
    for (var i = 0; i < INDEX.length; i++) if (INDEX[i].id === S.curPid) meta = INDEX[i];
    var pr = Store.paperProgress(meta.id, meta.nos);
    var n = meta.nos.length;
    /* 六级计分：听力 248.5 / 阅读 248.5 / 写作翻译 212.5，这里按客观题折算 */
    var obj = meta.nos.filter(function (x) { return x <= 55; }).length;
    var rate = pr.done ? pr.right / pr.done : 0;
    var est = Math.round(rate * 480);
    alert("《" + meta.label + " " + meta.set + "》\n\n" +
      "已作答：" + pr.done + " / " + n + " 题\n" +
      "答对：" + pr.right + " 题\n" +
      "正确率：" + Math.round(rate * 100) + "%\n\n" +
      "客观题（听力+阅读）满分 497.5，按当前正确率折算约 " + est + " 分。");
  }

  /* ---------------- 答题卡 ---------------- */
  function openSheet() {
    var body = $("sheetBody");
    var meta = null;
    for (var i = 0; i < INDEX.length; i++) if (INDEX[i].id === S.curPid) meta = INDEX[i];

    var groups = [
      { name: "听力理解", lo: 1, hi: 25 },
      { name: "选词填空", lo: 26, hi: 35 },
      { name: "信息匹配", lo: 36, hi: 45 },
      { name: "仔细阅读", lo: 46, hi: 55 }
    ];
    var h = "";
    groups.forEach(function (g) {
      var nos = meta.nos.filter(function (x) { return x >= g.lo && x <= g.hi; });
      if (!nos.length) return;
      var done = 0, right = 0;
      nos.forEach(function (x) {
        var a = Store.getAnswer(qidOf(meta.id, x));
        if (a) { done++; if (a.ok) right++; }
      });
      h += '<div class="sheet-group"><div class="sg-h"><span>' + g.name + '</span>' +
        '<span>' + done + "/" + nos.length + " · 对 " + right + '</span></div><div class="sheet-grid">';
      nos.forEach(function (x) {
        var a = Store.getAnswer(qidOf(meta.id, x));
        var cls = a ? (a.ok ? "ok" : "bad") : "";
        if (x === S.cur.no) cls += " cur";
        h += '<button class="' + cls + '" data-jump="' + x + '">' + x + "</button>";
      });
      h += "</div></div>";
    });

    h += '<div class="sheet-group"><div class="sg-h"><span>跳转到套卷</span><span>共 ' + INDEX.length + ' 套</span></div>' +
      '<div class="papers" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">';
    INDEX.forEach(function (p) {
      var pr = Store.paperProgress(p.id, p.nos);
      h += '<div class="paper" data-jumppaper="' + p.id + '" style="padding:10px 11px">' +
        '<div class="pt"><b style="font-size:13px">' + esc(p.label) + '</b><span>' + esc(p.set) + '</span></div>' +
        '<div class="pm" style="margin-top:4px">' + pr.done + "/" + pr.total + '</div></div>';
    });
    h += "</div></div>";
    body.innerHTML = h;

    $("sheetFoot").innerHTML = '<button class="btn" id="sheetClose2">关闭</button>' +
      '<button class="btn ghost" id="sheetWrong">只看错题</button>' +
      '<button class="btn primary" id="sheetTop">回到顶部</button>';

    body.onclick = function (e) {
      var b = e.target.closest("button[data-jump]");
      if (b) { closeSheet(); jumpTo(meta.id, parseInt(b.dataset.jump, 10)); return; }
      var p = e.target.closest("[data-jumppaper]");
      if (p) { closeSheet(); start("papers", p.dataset.jumppaper, 0); }
    };
    $("sheetClose2").onclick = closeSheet;
    $("sheetTop").onclick = function () { body.scrollTop = 0; };
    $("sheetWrong").onclick = function () {
      if (!Store.wrongCount()) { toast("错题本是空的"); return; }
      closeSheet(); start("wrong", null, 0);
    };

    $("sheetMask").hidden = false;
    $("sheet").hidden = false;
  }

  function closeSheet() { $("sheetMask").hidden = true; $("sheet").hidden = true; }

  function jumpTo(pid, no) {
    /* 若当前队列里已有该题则直接跳，否则以套卷模式打开 */
    for (var i = 0; i < S.queue.length; i++) {
      if (S.queue[i].pid === pid && S.queue[i].no === no) { go(i); return; }
    }
    start("papers", pid, 0);
    setTimeout(function () {
      for (var j = 0; j < S.queue.length; j++) if (S.queue[j].no === no) { go(j); return; }
    }, 60);
  }

  /* ---------------- 顶栏 ---------------- */
  function refreshBadges() {
    var st = Store.stats();
    $("wrongBadge").textContent = Store.wrongCount();
    $("favBadge").textContent = Store.favCount();
    $("topstats").innerHTML =
      '<div class="ts"><span class="n">' + st.done + '</span><span class="l">已作答</span></div>' +
      '<div class="ts"><span class="n">' + st.rate + '%</span><span class="l">正确率</span></div>' +
      '<div class="ts"><span class="n">' + Store.wrongCount() + '</span><span class="l">错题</span></div>';
  }

  function bindTabs() {
    var tabs = document.querySelectorAll("#tabs button");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].onclick = function () {
        var m = this.dataset.mode;
        if (m === "types") { renderHome(); jumpToTypes(); return; }
        start(m, null, 0);
      };
    }
    $("brandHome").onclick = renderHome;
    $("sheetMask").onclick = closeSheet;
    $("sheetClose").onclick = closeSheet;
  }

  /* ---------------- 快捷键 ---------------- */
  document.addEventListener("keydown", function (e) {
    if (window.Ink && Ink.isOn()) return;
    if (S.mode === "home" || !S.cur) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    var k = e.key;
    if (k === "ArrowRight") { if (S.qi < S.queue.length - 1) go(S.qi + 1); }
    else if (k === "ArrowLeft") { if (S.qi > 0) go(S.qi - 1); }
    else if (k === " ") { e.preventDefault(); S.revealed = true; paintResult(); }
    else if (/^[a-dA-D]$/.test(k)) {
      var L = k.toUpperCase();
      if (document.querySelector('#opts .opt[data-k="' + L + '"]')) {
        if (!Store.getAnswer(qidOf(S.curPid, S.cur.no))) pick(L);
      }
    } else if (/^[e-oE-O]$/.test(k)) {
      var L2 = k.toUpperCase();
      if (document.querySelector('#bank button[data-k="' + L2 + '"]')) {
        if (!Store.getAnswer(qidOf(S.curPid, S.cur.no))) pick(L2);
      }
    }
  });

  /* ---------------- 启动 ---------------- */
  refreshBadges();
  bindTabs();
  renderHome();
  window.App = { start: start, go: go, renderHome: renderHome, S: S };
})();
