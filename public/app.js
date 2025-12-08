/**
 * Sporcle League - Main Application Logic
 * Handles the frontend UI for the daily quiz scoreboard, season standings,
 * championship awards, and admin functionality.
 */
(function waitForFirebase() {
  if (window.shared && window.shared.listenToday && window.authHelpers) {
    console.log("Firebase ready, initializing app");
    initApp();
  } else {
    setTimeout(waitForFirebase, 100);
  }
})();

function initApp() {
  var __isAdmin = false;
  var _latestTodayRows = [];

  // Championship winners by alias (lowercase)
  // Each entry maps to an array of { season, type } objects
  // Types: 'commissioner' (most points), 'cup' (playoff winner),
  //        'h2h' (most H2H wins), 'highs' (most first places)
  var champions = {
    grifjom: [
      { season: 1, type: "commissioner" },
      { season: 1, type: "cup" },
    ],
    winkmax: [{ season: 1, type: "h2h" }],
    moghosh: [{ season: 1, type: "highs" }],
  };

  // Badge display configuration for each award type
  var badgeStyles = {
    commissioner: {
      emoji: "🏆",
      label: "CT",
      title: "Commissioner's Trophy",
      className: "badge-commissioner",
    },
    cup: {
      emoji: "🥇",
      label: "SC",
      title: "Sporcle Cup",
      className: "badge-cup",
    },
    h2h: {
      emoji: "👹",
      label: "H2H",
      title: "Head to Head Demon",
      className: "badge-h2h",
    },
    highs: {
      emoji: "⭐",
      label: "HH",
      title: "Highest Highs",
      className: "badge-highs",
    },
  };

  // Generate badge HTML for a player based on their championships
  function getChampionBadges(alias) {
    var aliasLower = String(alias || "").toLowerCase();
    var titles = champions[aliasLower];
    if (!titles || titles.length === 0) return "";

    var badges = "";
    titles.forEach(function (title) {
      var style = badgeStyles[title.type];
      if (!style) return;
      var fullTitle = style.title + " - Season " + title.season;
      badges +=
        '<span class="champion-badge ' +
        style.className +
        '" title="' +
        fullTitle +
        '">' +
        style.emoji +
        "</span>";
    });
    return badges;
  }

  // Expose globally for use in H2H standings
  window.getChampionBadges = getChampionBadges;

  // UI helper functions
  function setStatus(text, kind) {
    var el = document.getElementById("status");
    if (!el) return;
    el.textContent = text || "";
    var color = "#94a3b8";
    if (kind === "ok") color = "#22c55e";
    else if (kind === "warn") color = "#f59e0b";
    el.style.color = color;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>\"']/g, function (s) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[s];
    });
  }

  function parseFraction(input) {
    var m = String(input || "")
      .trim()
      .match(/^(-?\d+)\s*\/\s*(\d+)$/);
    if (!m) return null;
    var num = parseInt(m[1], 10);
    var den = parseInt(m[2], 10);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
    return { num: num, den: den };
  }

  function titleCase(str) {
    return String(str || "")
      .split(/\s+/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
  }

  // Render today's standings table
  // Sorted by: ratio (desc), time left (desc), num correct (desc), name (asc)
  function renderStandingsFromShared(rows) {
    const tbody = document.getElementById("standings-body");
    const empty = document.getElementById("empty-standings");
    tbody.innerHTML = "";

    if (!rows || rows.length === 0) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");

    rows.sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      const timeA = a.timeLeft || 0;
      const timeB = b.timeLeft || 0;
      if (timeB !== timeA) return timeB - timeA;
      if (b.num !== a.num) return b.num - a.num;
      return String(a.displayName || "").localeCompare(
        String(b.displayName || "")
      );
    });

    rows.forEach((e, i) => {
      const shown =
        e.displayName && e.displayName.trim()
          ? e.displayName.trim()
          : titleCase(e.alias);

      const timeLeft = e.timeLeft || 0;
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      const timeDisplay =
        timeLeft > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : "-";
      const badges = getChampionBadges(e.alias);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="badge">${i + 1}</span></td>
        <td>${escapeHtml(shown)}${badges}</td>
        <td>${e.num}/${e.den}</td>
        <td>${(e.ratio * 100).toFixed(2)}%</td>
        <td>${timeDisplay}</td>
        ${
          __isAdmin
            ? `<td>
              <button class="btn ghost act-edit" data-alias="${escapeHtml(
                e.alias
              )}" data-display-name="${escapeHtml(shown)}">Edit</button>
              <button class="btn danger act-del" data-alias="${escapeHtml(
                e.alias
              )}">Delete</button>
            </td>`
            : "<td></td>"
        }`;
      tbody.appendChild(tr);
    });
  }

  // Render season standings (cumulative points)
  function renderPointsFromShared(rows) {
    const tbody = document.getElementById("points-body");
    const empty = document.getElementById("empty-points");
    tbody.innerHTML = "";

    if (!rows.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    rows.sort(
      (a, b) =>
        b.pts - a.pts ||
        (a.displayName || a.alias).localeCompare(b.displayName || b.alias)
    );

    rows.forEach((r, i) => {
      const shown =
        r.displayName && r.displayName.trim()
          ? r.displayName.trim()
          : titleCase(r.alias);
      const badges = getChampionBadges(r.alias);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="badge">${i + 1}</span></td>
        <td>${escapeHtml(shown)}${badges}</td>
        <td>${r.pts}</td>`;
      tbody.appendChild(tr);
    });
  }

  // Season awards data - populated with each season's winners
  var seasonAwards = {
    1: {
      commissionersTrophy: {
        alias: "grifjom",
        displayName: "Josh",
        stat: "234 points",
      },
      sporcleCup: {
        alias: "grifjom",
        displayName: "Josh",
        stat: "Playoff Champion",
      },
      h2hDemon: {
        alias: "winkmax",
        displayName: "Max",
        stat: "107 wins",
      },
      highestHighs: {
        alias: "moghosh",
        displayName: "Moon",
        stat: "12 first places",
      },
    },
  };

  // Award type metadata for rendering
  var awardTypes = {
    commissionersTrophy: {
      icon: "🏆",
      title: "Commissioner's Trophy",
      description: "Most points in the regular season",
      cardClass: "commissioners-trophy",
    },
    sporcleCup: {
      icon: "🥇",
      title: "Sporcle Cup",
      description: "Playoff champion",
      cardClass: "sporcle-cup",
    },
    h2hDemon: {
      icon: "👹",
      title: "Head to Head Demon",
      description: "Most Head to Head victories",
      cardClass: "h2h-demon",
    },
    highestHighs: {
      icon: "⭐",
      title: "Highest Highs",
      description: "Most first places on daily quizzes",
      cardClass: "highest-highs",
    },
  };

  // Render Hall of Champions awards cards
  function renderAwards(season) {
    var container = document.getElementById("awards-container");
    var empty = document.getElementById("empty-fame");
    if (!container) return;

    var awards = seasonAwards[season];
    if (!awards) {
      container.innerHTML = "";
      if (empty) empty.classList.remove("d-none");
      return;
    }
    if (empty) empty.classList.add("d-none");

    var html = "";
    var awardOrder = [
      "commissionersTrophy",
      "sporcleCup",
      "h2hDemon",
      "highestHighs",
    ];

    awardOrder.forEach(function (awardKey) {
      var award = awards[awardKey];
      var meta = awardTypes[awardKey];
      if (!award || !meta) return;

      var winnerName = award.displayName || titleCase(award.alias) || "TBD";

      html += '<div class="col-md-6 col-lg-3">';
      html += '<div class="award-card ' + meta.cardClass + '">';
      html += '<span class="award-icon">' + meta.icon + "</span>";
      html += '<div class="award-title">' + meta.title + "</div>";
      html += '<div class="award-description">' + meta.description + "</div>";
      html += '<div class="award-winner">' + escapeHtml(winnerName) + "</div>";
      html +=
        '<div class="award-stat">' + escapeHtml(award.stat || "") + "</div>";
      html += "</div></div>";
    });

    container.innerHTML = html;
  }

  // Initialize season selector dropdown
  var seasonSelector = document.getElementById("season-selector");
  if (seasonSelector) {
    var seasons = Object.keys(seasonAwards).sort((a, b) => b - a);
    seasonSelector.innerHTML = "";
    seasons.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = "Season " + s;
      seasonSelector.appendChild(opt);
    });

    seasonSelector.addEventListener("change", function () {
      renderAwards(parseInt(this.value, 10));
    });

    if (seasons.length > 0) {
      renderAwards(parseInt(seasons[0], 10));
    }
  }

  // Render Wall of Shame (most last places)
  function renderShame(rows) {
    var body = document.getElementById("shame-body");
    var empty = document.getElementById("empty-shame");
    if (!body) return;
    body.innerHTML = "";

    var list = rows
      .slice()
      .sort(
        (a, b) =>
          (b.lasts || 0) - (a.lasts || 0) ||
          (a.displayName || a.alias).localeCompare(b.displayName || b.alias)
      )
      .slice(0, 10);

    if (!list.length) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");

    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var shown =
        r.displayName && r.displayName.trim()
          ? r.displayName.trim()
          : titleCase(r.alias);
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td><span class="badge">' +
        (i + 1) +
        "</span></td>" +
        "<td>" +
        escapeHtml(shown) +
        "</td>" +
        "<td>" +
        (r.lasts || 0) +
        "</td>";
      body.appendChild(tr);
    }
  }

  // Set up Firestore listeners for real-time data
  if (window.shared) {
    if (typeof window.shared.listenToday === "function") {
      window.shared.listenToday((snap) => {
        const rows = snap.docs.map((d) => d.data());
        _latestTodayRows = rows;
        renderStandingsFromShared(rows);
      });
    }
    if (typeof window.shared.listenPoints === "function") {
      window.shared.listenPoints(function (snap) {
        var rows = snap.docs.map(function (d) {
          var x = d.data() || {};
          return {
            alias: (x.alias || d.id || "").toLowerCase(),
            displayName: x.displayName || "",
            pts: x.pts || 0,
            firsts: x.firsts || 0,
            lasts: x.lasts || 0,
          };
        });
        renderPointsFromShared(rows);
        renderShame(rows);
        renderPlayoffsBracketSimple(rows);
      });
    }
  }

  // Admin UI management
  async function refreshAdminUI() {
    function finish() {
      renderStandingsFromShared(_latestTodayRows || []);
    }

    if (
      !window.authHelpers ||
      typeof window.authHelpers.getIdTokenResult !== "function"
    ) {
      finish();
      return;
    }

    const adminTabBtn = document.querySelector('.tab-btn[data-tab="admin"]');
    const adminPanel = document.getElementById("admin-panel");
    const btnIn = document.getElementById("admin-signin-btn");
    const btnOut = document.getElementById("admin-signout-btn");
    const btnGrant = document.getElementById("admin-grant-btn");
    const quizAdmin = document.getElementById("quiz-admin");

    try {
      let res;
      try {
        res = await window.authHelpers.getIdTokenResult();
      } catch (e) {
        __isAdmin = false;
        if (adminTabBtn) adminTabBtn.classList.add("hidden");
        if (adminPanel) adminPanel.classList.add("hidden");
        if (btnIn) btnIn.classList.remove("hidden");
        if (btnOut) btnOut.classList.add("hidden");
        if (btnGrant) btnGrant.classList.add("hidden");
        if (quizAdmin) quizAdmin.classList.add("hidden");
        finish();
        return;
      }

      const claims = res ? res.claims || {} : {};
      const isAdmin = !!claims.admin;
      __isAdmin = isAdmin;

      const provider = claims.firebase?.sign_in_provider || null;

      if (adminTabBtn) adminTabBtn.classList.toggle("hidden", !isAdmin);
      if (adminPanel) adminPanel.classList.toggle("hidden", !isAdmin);
      if (btnIn) btnIn.classList.toggle("hidden", isAdmin);
      if (btnOut) btnOut.classList.toggle("hidden", !isAdmin);

      const showGrant = provider === "google.com" && !isAdmin;
      if (btnGrant) btnGrant.classList.toggle("hidden", !showGrant);

      if (quizAdmin) {
        quizAdmin.classList.toggle("hidden", !isAdmin);
      }
    } catch (e) {
      console.error("refreshAdminUI error:", e);
      if (adminPanel) adminPanel.classList.add("hidden");
      if (btnIn) btnIn.classList.remove("hidden");
      if (btnOut) btnOut.classList.add("hidden");
      if (btnGrant) btnGrant.classList.add("hidden");
      if (quizAdmin) quizAdmin.classList.add("hidden");
    }

    finish();
  }

  // Listen for auth state changes
  if (window.authHelpers && typeof window.authHelpers.onChange === "function") {
    window.authHelpers.onChange(function () {
      refreshAdminUI();
    });
  }
  refreshAdminUI();

  // Admin sign in/out buttons
  var adminSignin = document.getElementById("admin-signin");
  var adminSignout = document.getElementById("admin-signout");

  if (adminSignin) {
    adminSignin.addEventListener("click", async function () {
      try {
        await window.authHelpers.signInAsAdmin();
      } catch (e) {
        console.error(e);
      }
    });
  }
  if (adminSignout) {
    adminSignout.addEventListener("click", async function () {
      try {
        await window.authHelpers.signOut();
        location.reload();
      } catch (e) {
        console.error(e);
      }
    });
  }

  // Quiz link display - updates when admin sets a new quiz URL
  const quizDisplay = document.getElementById("quiz-link-display");
  const quizForm = document.getElementById("quiz-form");

  window.shared.listenQuizLink((snap) => {
    const data = snap.data();
    if (data && data.url) {
      quizDisplay.href = data.url;
      quizDisplay.textContent = "▶ Play This Quiz";
      quizDisplay.classList.remove("d-none");
    } else {
      quizDisplay.classList.add("d-none");
    }
  });

  if (quizForm) {
    quizForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const url = document.getElementById("quiz-url").value.trim();
      if (!url) return setStatus("Enter a valid URL", "warn");
      await window.shared.setQuizLink(url);
      setStatus("Quiz link updated", "ok");
      document.getElementById("quiz-url").value = "";
    });
  }

  // Admin action buttons
  var finishBtn = document.getElementById("finish-day");
  if (finishBtn) {
    finishBtn.addEventListener("click", function () {
      if (!confirm("Finish the day and award points (ties share rank)?"))
        return;
      if (!window.shared || typeof window.shared.finishDay !== "function")
        return;
      window.shared
        .finishDay()
        .then(() => setStatus("Awarded points", "ok"))
        .catch((e) => setStatus(e?.message || "Permission denied", "warn"));
    });
  }

  var resetBtn = document.getElementById("reset-scores");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (!confirm("Reset ALL cumulative points back to 0?")) return;
      if (!window.shared || typeof window.shared.resetScores !== "function")
        return;
      window.shared
        .resetScores()
        .then(() => setStatus("All points reset", "ok"))
        .catch((e) => setStatus(e?.message || "Permission denied", "warn"));
    });
  }

  // Table row edit/delete handlers
  var standingsTable = document.getElementById("standings-body");
  if (standingsTable) {
    standingsTable.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.classList) return;

      if (t.classList.contains("act-del")) {
        var alias = t.getAttribute("data-alias") || "";
        if (!__isAdmin) return setStatus("Admins only", "warn");
        if (!confirm("Delete today's entry for alias \"" + alias + '"?'))
          return;
        window.shared
          .deleteEntry(alias)
          .then(() => setStatus("Entry deleted", "ok"))
          .catch((e) => setStatus(e?.message || "Delete failed", "warn"));
        return;
      }

      if (t.classList.contains("act-edit")) {
        var oldAlias = t.getAttribute("data-alias") || "";
        var currentName = t.getAttribute("data-display-name") || "";
        if (!__isAdmin) return setStatus("Admins only", "warn");

        var newAlias = prompt("Alias (immutable ID):", oldAlias);
        if (newAlias === null) return;
        newAlias = newAlias.trim();
        if (!newAlias) return setStatus("Alias required", "warn");

        var displayName = prompt("Display name:", currentName);
        if (displayName === null) return;
        displayName = displayName.trim();
        if (!displayName) return setStatus("Name required", "warn");

        var fraction = prompt(
          "Enter new score (numerator/denominator):",
          "7/9"
        );
        if (fraction === null) return;
        var parsed = parseFraction(fraction);
        if (!parsed) return setStatus("Enter like 7/9", "warn");

        window.shared
          .upsertEntry({
            oldAlias: oldAlias,
            newAlias: newAlias,
            displayName: displayName,
            num: parsed.num,
            den: parsed.den,
          })
          .then(() => setStatus("Entry updated", "ok"))
          .catch((e) => setStatus(e?.message || "Update failed", "warn"));
      }
    });
  }

  // Admin forms for managing points/finishes
  var delForm = document.getElementById("delete-points-form");
  if (delForm) {
    delForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!__isAdmin) return setStatus("Admins only", "warn");
      var id = document.getElementById("delete-docid").value.trim();
      if (!id) return setStatus("Enter a doc ID (alias)", "warn");
      if (!confirm('Delete leaderboard entry for "' + id + '"?')) return;
      window.shared
        .adminDeletePoints({ docId: id })
        .then(() => setStatus("Deleted from leaderboard", "ok"))
        .catch((err) => setStatus(err.message || "Delete failed", "warn"));
    });
  }

  var peForm = document.getElementById("points-edit-form");
  if (peForm) {
    peForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!__isAdmin) return setStatus("Admins only", "warn");
      var docId = document.getElementById("pe-docid").value.trim();
      var mode = document.getElementById("pe-mode").value;
      var value = Number(document.getElementById("pe-value").value);
      var dn = document.getElementById("pe-dn").value.trim();
      if (!docId || !isFinite(value))
        return setStatus("Enter id and numeric points", "warn");

      window.shared
        .adminUpdatePoints({
          docId: docId,
          mode: mode,
          value: value,
          displayName: dn || undefined,
        })
        .then(() => setStatus("Points updated", "ok"))
        .catch((e) => setStatus(e?.message || "Update failed", "warn"));
    });
  }

  var fForm = document.getElementById("finishes-edit-form");
  if (fForm) {
    fForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!__isAdmin) return setStatus("Admins only", "warn");
      var docId = document.getElementById("fe-docid").value.trim();
      var mode = document.getElementById("fe-mode").value;
      var firsts = document.getElementById("fe-firsts").value.trim();
      var lasts = document.getElementById("fe-lasts").value.trim();

      var payload = { docId: docId, mode: mode };
      if (firsts !== "") payload.firsts = Number(firsts);
      if (lasts !== "") payload.lasts = Number(lasts);

      window.shared
        .adminUpdateFinishes(payload)
        .then(() => setStatus("Finishes updated", "ok"))
        .catch((e) => setStatus(e?.message || "Update failed", "warn"));
    });
  }

  // Tab navigation system
  (function tabsInit() {
    var nav = document.getElementById("tabs");
    if (!nav) return;
    var buttons = Array.prototype.slice.call(nav.querySelectorAll(".tab-btn"));
    var panels = Array.prototype.slice.call(
      document.querySelectorAll(".tab-panel")
    );
    var LS_KEY = "scoreboard_active_tab";

    function showTab(key) {
      buttons.forEach(function (b) {
        var k = b.getAttribute("data-tab");
        b.classList.toggle("active", k === key);
        b.id = "tab-" + k;
        b.setAttribute("aria-controls", "panel-" + k);
        b.setAttribute("aria-selected", k === key ? "true" : "false");
        b.setAttribute("role", "tab");
      });
      panels.forEach(function (p) {
        var id = p.id.replace("panel-", "");
        p.classList.toggle("active", id === key);
      });
      try {
        localStorage.setItem(LS_KEY, key);
      } catch (e) {}
      if (location.hash !== "#" + key) {
        history.replaceState(null, "", "#" + key);
      }
    }

    function pickInitial() {
      var fromHash = (location.hash || "").replace("#", "");
      if (
        fromHash &&
        buttons.some((b) => b.getAttribute("data-tab") === fromHash)
      ) {
        return fromHash;
      }
      try {
        var fromLS = localStorage.getItem(LS_KEY);
        if (
          fromLS &&
          buttons.some((b) => b.getAttribute("data-tab") === fromLS)
        ) {
          return fromLS;
        }
      } catch (e) {}
      return "today";
    }

    nav.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".tab-btn");
      if (!btn) return;
      showTab(btn.getAttribute("data-tab"));
    });
    window.addEventListener("hashchange", function () {
      var key = (location.hash || "").replace("#", "");
      if (key) showTab(key);
    });
    showTab(pickInitial());
  })();

  // Playoff bracket rendering utilities
  function escHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  // Standard 32-team bracket pairings (1v32, 16v17, etc.)
  function seededPairs32() {
    return [
      [1, 32],
      [16, 17],
      [8, 25],
      [9, 24],
      [4, 29],
      [13, 20],
      [5, 28],
      [12, 21],
      [2, 31],
      [15, 18],
      [7, 26],
      [10, 23],
      [3, 30],
      [14, 19],
      [6, 27],
      [11, 22],
    ];
  }

  // Build top 32 seeds from standings, filling with BYEs if needed
  function computeTop32(rows) {
    var sorted = rows.slice().sort(function (a, b) {
      var pa = a.pts || 0;
      var pb = b.pts || 0;
      if (pb !== pa) return pb - pa;
      var an = (a.displayName || a.alias || "").toLowerCase();
      var bn = (b.displayName || b.alias || "").toLowerCase();
      return an.localeCompare(bn);
    });

    var top = [];
    for (var i = 0; i < 32; i++) {
      var r = sorted[i];
      if (r) {
        top.push({
          seed: i + 1,
          name: r.displayName || r.alias || "Unknown",
          isBye: false,
        });
      } else {
        top.push({ seed: i + 1, name: "Bye", isBye: true });
      }
    }
    return top;
  }

  // Render a simple projected playoff bracket based on current standings
  function renderPlayoffsBracketSimple(rows) {
    var host = document.getElementById("playoffs-bracket");
    if (!host) return;
    host.innerHTML = "";

    var titles = [
      "Round of 32",
      "Sweet 16",
      "Elite 8",
      "Final 4",
      "Final",
      "Champion",
    ];
    var counts = [16, 8, 4, 2, 1, 1];

    var seeds = computeTop32(rows);
    var seedMap = {};
    seeds.forEach(function (s) {
      seedMap[s.seed] = s;
    });

    function makeCol(title) {
      var col = document.createElement("div");
      col.className = "col-12 col-lg-2 br-round-col";

      var titleEl = document.createElement("div");
      titleEl.className = "br-title";
      titleEl.textContent = title;

      var inner = document.createElement("div");
      inner.className = "br-round-inner";

      col.appendChild(titleEl);
      col.appendChild(inner);
      return { col: col, inner: inner };
    }

    function matchCard(a, b) {
      var card = document.createElement("div");
      card.className = "br-match";

      var l1 = document.createElement("div");
      l1.className = "br-line";
      l1.innerHTML =
        '<span class="br-seed">' +
        (a ? a.seed : "–") +
        "</span>" +
        '<span class="br-name ' +
        (a && a.isBye ? "br-bye" : "") +
        '">' +
        escHtml(a ? a.name : "TBD") +
        "</span>";

      if (b) {
        var l2 = document.createElement("div");
        l2.className = "br-line";
        l2.innerHTML =
          '<span class="br-seed">' +
          b.seed +
          "</span>" +
          '<span class="br-name ' +
          (b.isBye ? "br-bye" : "") +
          '">' +
          escHtml(b.name) +
          "</span>";
        card.appendChild(l1);
        card.appendChild(l2);
      } else {
        card.appendChild(l1);
      }

      return card;
    }

    // First round: actual seeded pairings
    var col0 = makeCol(titles[0]);
    seededPairs32().forEach(function (pair) {
      var a = seedMap[pair[0]];
      var b = seedMap[pair[1]];
      col0.inner.appendChild(matchCard(a, b));
    });
    host.appendChild(col0.col);

    // Later rounds: TBD placeholders
    for (var ci = 1; ci < titles.length; ci++) {
      var c = makeCol(titles[ci]);
      for (var m = 0; m < counts[ci]; m++) {
        c.inner.appendChild(matchCard(null, null));
      }
      host.appendChild(c.col);
    }
  }
}
