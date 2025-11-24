// ==============================
// Daily Scoreboard - app.js
// Frontend for shared Firestore app with admin UI
// ==============================
(function waitForFirebase() {
  if (window.shared && window.shared.listenToday && window.authHelpers) {
    console.log("✅ Firebase ready, initializing app");
    initApp();
  } else {
    setTimeout(waitForFirebase, 100);
  }
})();
function initApp() {
  var __isAdmin = false;
  var _latestTodayRows = [];

  // ---------- UI helpers ----------

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
  function sortToday(rows) {
    return rows.slice().sort(function (a, b) {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      if (b.num !== a.num) return b.num - a.num;
      return String(a.name).localeCompare(String(b.name));
    });
  }

  // ---------- Renderers ----------
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
      const tr = document.createElement("tr");
      tr.innerHTML = `
      <td><span class="badge">${i + 1}</span></td>
      <td>${escapeHtml(shown)}</td>
      <td>${e.num}/${e.den}</td>
      <td>${(e.ratio * 100).toFixed(2)}%</td>
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
      } `;
      tbody.appendChild(tr);
    });
  }

  function renderPointsFromShared(rows) {
    const tbody = document.getElementById("points-body");
    const empty = document.getElementById("empty-points");
    tbody.innerHTML = "";
    if (!rows.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    // sort by points, then name (prefer displayName)
    rows.sort(
      (a, b) =>
        b.pts - a.pts ||
        (a.displayName || a.alias).localeCompare(b.displayName || b.alias)
    );

    rows.forEach((r, i) => {
      const shown =
        r.displayName && r.displayName.trim()
          ? r.displayName.trim()
          : titleCase(r.alias); // fallback only if displayName missing

      const tr = document.createElement("tr");
      tr.innerHTML = `
      <td><span class="badge">${i + 1}</span></td>
      <td>${escapeHtml(shown)}</td>
      <td>${r.pts}</td>`;
      tbody.appendChild(tr);
    });
  }

  function titleCase(str) {
    return String(str || "")
      .split(/\s+/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
  }

  function renderFame(rows) {
    var body = document.getElementById("fame-body");
    var empty = document.getElementById("empty-fame");
    if (!body) return;
    body.innerHTML = "";
    var list = rows
      .slice()
      .sort(function (a, b) {
        return (
          (b.firsts || 0) - (a.firsts || 0) ||
          (a.displayName || a.alias).localeCompare(b.displayName || b.alias)
        );
      })
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
        "</span></td><td>" +
        escapeHtml(shown) +
        "</td><td>" +
        (r.firsts || 0) +
        "</td>";
      body.appendChild(tr);
    }
  }

  function renderShame(rows) {
    var body = document.getElementById("shame-body");
    var empty = document.getElementById("empty-shame");
    if (!body) return;
    body.innerHTML = "";
    var list = rows
      .slice()
      .sort(function (a, b) {
        return (
          (b.lasts || 0) - (a.lasts || 0) ||
          (a.displayName || a.alias).localeCompare(b.displayName || b.alias)
        );
      })
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
        "</span></td><td>" +
        escapeHtml(shown) +
        "</td><td>" +
        (r.lasts || 0) +
        "</td>";
      body.appendChild(tr);
    }
  }

  // ---------- Form submit ----------
  var form = document.getElementById("entry-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var nameEl = document.getElementById("name");
      var aliasEl = document.getElementById("alias");
      var fracEl = document.getElementById("fraction");

      var displayName = nameEl ? nameEl.value.trim() : "";
      var alias = aliasEl ? aliasEl.value.trim() : "";
      var fraction = fracEl ? fracEl.value.trim() : "";

      if (!displayName) return setStatus("Name required", "warn");
      if (!alias) return setStatus("Alias required", "warn");
      var parsed = parseFraction(fraction);
      if (!parsed) return setStatus("Enter like 7/9", "warn");

      var ratio = parsed.num / parsed.den;
      window.shared
        .submitScore({
          alias,
          displayName,
          num: parsed.num,
          den: parsed.den,
          ratio,
        })
        .then(function () {
          setStatus("Saved entry for today", "ok");
          if (fracEl) {
            fracEl.value = "";
            fracEl.focus();
          }
        })
        .catch(function (err) {
          setStatus(err && err.message ? err.message : "Save failed", "warn");
        });
    });
  }

  // ---------- Live listeners from Firestore ----------
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

        renderPointsFromShared(rows); // existing leaderboard
        renderFame(rows); // new
        renderShame(rows); // new
        renderPlayoffsBracketSimple(rows);
      });
    }
  }

  // ---------- Admin UI ----------
  var adminPanel = document.getElementById("admin-panel");
  var btnIn = document.getElementById("admin-signin");
  var btnOut = document.getElementById("admin-signout");
  var btnGrant = document.getElementById("grant-admin");

  async function refreshAdminUI() {
    // Always keep standings rendering
    function finish() {
      renderStandingsFromShared(_latestTodayRows || []);
    }

    // If auth helpers not ready, just bail quietly
    if (
      !window.authHelpers ||
      typeof window.authHelpers.getIdTokenResult !== "function"
    ) {
      finish();
      return;
    }

    // Look up DOM elements inside the function (no TDZ issues)
    const adminTabBtn = document.querySelector('.tab-btn[data-tab="admin"]');
    const adminPanel = document.getElementById("admin-panel");
    const btnIn = document.getElementById("admin-signin-btn");
    const btnOut = document.getElementById("admin-signout-btn");
    const btnGrant = document.getElementById("admin-grant-btn");
    const quizAdmin = document.getElementById("quiz-admin");

    try {
      let res;
      try {
        // This can throw if there is no current user – we treat that as "not admin"
        res = await window.authHelpers.getIdTokenResult();
      } catch (e) {
        // No user / getIdToken of null → treat as signed-out, do NOT log an error
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

      const provider =
        claims.firebase && claims.firebase.sign_in_provider
          ? claims.firebase.sign_in_provider
          : null;

      if (adminTabBtn) adminTabBtn.classList.toggle("hidden", !isAdmin);
      if (adminPanel) adminPanel.classList.toggle("hidden", !isAdmin);
      if (btnIn) btnIn.classList.toggle("hidden", isAdmin);
      if (btnOut) btnOut.classList.toggle("hidden", !isAdmin);

      const showGrant = provider === "google.com" && !isAdmin;
      if (btnGrant) btnGrant.classList.toggle("hidden", !showGrant);

      if (quizAdmin) {
        if (isAdmin) quizAdmin.classList.remove("hidden");
        else quizAdmin.classList.add("hidden");
      }
    } catch (e) {
      // Any other unexpected error – log once but fail gracefully
      console.error("refreshAdminUI unexpected error:", e);
      if (adminPanel) adminPanel.classList.add("hidden");
      if (btnIn) btnIn.classList.remove("hidden");
      if (btnOut) btnOut.classList.add("hidden");
      if (btnGrant) btnGrant.classList.add("hidden");
      if (quizAdmin) quizAdmin.classList.add("hidden");
    }

    finish();
  }

  // React to auth changes
  if (window.authHelpers && typeof window.authHelpers.onChange === "function") {
    window.authHelpers.onChange(function () {
      refreshAdminUI();
    });
  }
  refreshAdminUI();

  // Admin sign in
  if (btnIn) {
    btnIn.addEventListener("click", async () => {
      try {
        await window.authHelpers.signInAsAdmin();
        await refreshAdminUI();
      } catch (e) {
        setStatus(e.message || "Sign in failed", "warn");
      }
    });
  }

  // Admin sign out
  if (btnOut) {
    btnOut.addEventListener("click", function () {
      if (
        !window.authHelpers ||
        typeof window.authHelpers.signOut !== "function"
      )
        return;
      window.authHelpers.signOut().then(function () {
        location.reload();
      });
    });
  }

  // Grant admin once (only works if your email is allow listed in functions)
  if (btnGrant) {
    btnGrant.addEventListener("click", function () {
      if (!window.shared || typeof window.shared.makeAdmin !== "function")
        return;
      window.shared
        .makeAdmin()
        .then(function (res) {
          var ok = res && res.data && res.data.ok;
          if (ok) {
            setStatus("Admin granted", "ok");
            refreshAdminUI();
          } else {
            setStatus("Grant failed", "warn");
          }
        })
        .catch(function (e) {
          setStatus(e && e.message ? e.message : "Grant failed", "warn");
        });
    });
  }

  window.refreshAdminUI = function (isAdmin) {
    // Quiz form toggle
    var quizForm = document.getElementById("quiz-form");
    if (quizForm) quizForm.classList.toggle("d-none", !isAdmin);

    // Admin buttons (if you have them)
    var adminSigninBtn = document.getElementById("admin-signin");
    var adminSignoutBtn = document.getElementById("admin-signout");
    var grantAdminBtn = document.getElementById("grant-admin");
    if (adminSigninBtn) adminSigninBtn.classList.toggle("d-none", !!isAdmin);
    if (adminSignoutBtn) adminSignoutBtn.classList.toggle("d-none", !isAdmin);
    if (grantAdminBtn) grantAdminBtn.classList.toggle("d-none", !!isAdmin);

    // Safely toggle the Actions column header
    var actionsTh =
      document.getElementById("standings-actions-th") ||
      (function () {
        var body = document.getElementById("standings-body");
        if (!body) return null;
        var table = body.closest("table");
        if (!table) return null;
        var ths = table.querySelectorAll("thead th");
        return ths.length ? ths[ths.length - 1] : null; // fallback: last th
      })();

    if (actionsTh) actionsTh.style.display = isAdmin ? "" : "none";

    // Safely toggle all Actions cells
    var actionTds = document.querySelectorAll(
      "#standings-body td.actions-cell"
    );
    if (actionTds && actionTds.forEach) {
      actionTds.forEach(function (td) {
        td.style.display = isAdmin ? "" : "none";
      });
    }
  };

  // Inside initApp()
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

  // ---------- Admin actions ----------
  // Quiz link display + admin form
  const quizDisplay = document.getElementById("quiz-link-display");
  const quizForm = document.getElementById("quiz-form");
  const quizAdmin = document.getElementById("quiz-admin");

  // Listen for changes in Firestore
  window.shared.listenQuizLink((snap) => {
    const data = snap.data();
    if (data && data.url) {
      quizDisplay.innerHTML = `<a href="${data.url}" target="_blank" style="color:#60a5fa;text-decoration:underline;">${data.url}</a>`;
    } else {
      quizDisplay.textContent = "No quiz link posted yet.";
    }
  });

  // Allow admin to submit new quiz link
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

  var finishBtn = document.getElementById("finish-day");
  if (finishBtn) {
    finishBtn.addEventListener("click", function () {
      if (!confirm("Finish the day and award points (ties share rank)?"))
        return;
      if (!window.shared || typeof window.shared.finishDay !== "function")
        return;
      window.shared
        .finishDay()
        .then(function () {
          setStatus("Awarded points", "ok");
        })
        .catch(function (e) {
          setStatus(e && e.message ? e.message : "Permission denied", "warn");
        });
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
        .then(function () {
          setStatus("All points reset", "ok");
        })
        .catch(function (e) {
          setStatus(e && e.message ? e.message : "Permission denied", "warn");
        });
    });
  }

  var standingsTable = document.getElementById("standings-body");
  if (standingsTable) {
    standingsTable.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.classList) return;

      // DELETE
      if (t.classList.contains("act-del")) {
        var alias = t.getAttribute("data-alias") || "";
        if (!__isAdmin) return setStatus("Admins only", "warn");
        if (!confirm('Delete today’s entry for alias "' + alias + '"?')) return;
        window.shared
          .deleteEntry(alias)
          .then(function () {
            setStatus("Entry deleted", "ok");
          })
          .catch(function (e) {
            setStatus(e && e.message ? e.message : "Delete failed", "warn");
          });
        return;
      }

      // EDIT
      if (t.classList.contains("act-edit")) {
        var oldAlias = t.getAttribute("data-alias") || "";
        var currentName = t.getAttribute("data-display-name") || "";
        if (!__isAdmin) return setStatus("Admins only", "warn");

        var newAlias = prompt(
          "Alias (immutable ID) — change only if needed:",
          oldAlias
        );
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
          .then(function () {
            setStatus("Entry updated", "ok");
          })
          .catch(function (e) {
            setStatus(e && e.message ? e.message : "Update failed", "warn");
          });
      }
    });
  }

  var migrateForm = document.getElementById("alias-migrate-form");
  if (migrateForm) {
    migrateForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!__isAdmin) return setStatus("Admins only", "warn");
      var oldId = document.getElementById("old-id").value.trim();
      var newAlias = document.getElementById("new-alias").value.trim();
      var newDN = document.getElementById("new-dn").value.trim();
      if (!oldId || !newAlias)
        return setStatus("Old id and new alias required", "warn");

      window.shared
        .adminMovePoints({ oldId, newAlias, newDisplayName: newDN })
        .then(function () {
          setStatus("Alias migration complete", "ok");
        })
        .catch(function (e) {
          setStatus(e && e.message ? e.message : "Migration failed", "warn");
        });
    });
  }

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
          displayName: dn || undefined, // optional
        })
        .then(function () {
          setStatus("Points updated", "ok");
        })
        .catch(function (e) {
          setStatus(e && e.message ? e.message : "Update failed", "warn");
        });
    });
  }

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
      if (location.hash !== "#" + key)
        history.replaceState(null, "", "#" + key);
    }

    function pickInitial() {
      var fromHash = (location.hash || "").replace("#", "");
      if (
        fromHash &&
        buttons.some(function (b) {
          return b.getAttribute("data-tab") === fromHash;
        })
      )
        return fromHash;
      try {
        var fromLS = localStorage.getItem(LS_KEY);
        if (
          fromLS &&
          buttons.some(function (b) {
            return b.getAttribute("data-tab") === fromLS;
          })
        )
          return fromLS;
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
        .then(function () {
          setStatus("Finishes updated", "ok");
        })
        .catch(function (e) {
          setStatus(e && e.message ? e.message : "Update failed", "warn");
        });
    });
  }

  /*(function themeInit() {
    const key = "theme_scheme";
    const LIGHT = document.getElementById("theme-light");
    const DARK = document.getElementById("theme-dark");
    const btn = document.getElementById("theme-toggle");

    function apply(mode) {
      if (mode === "light") {
        LIGHT.disabled = false;
        DARK.disabled = true;
      } else {
        LIGHT.disabled = true;
        DARK.disabled = false;
      }
      btn.textContent = mode === "light" ? "🌞" : "🌙";
      try {
        localStorage.setItem(key, mode);
      } catch (e) {}
    }

    const saved = localStorage.getItem(key) || "dark";
    apply(saved);

    if (btn)
      btn.addEventListener("click", () => {
        const next = LIGHT.disabled ? "light" : "dark";
        apply(next);
      });
  })();*/

  var signoutBtn = document.getElementById("account-signout");
  if (signoutBtn) {
    signoutBtn.addEventListener("click", function () {
      if (!window.authHelpers || !window.authHelpers.signOut) return;
      window.authHelpers.signOut().then(function () {
        location.reload();
      });
    });
  }

  if (window.authHelpers && typeof window.authHelpers.onChange === "function") {
    window.authHelpers.onChange(function (user) {
      if (signoutBtn) signoutBtn.classList.toggle("d-none", !user);
      // your existing refreshAdminUI() call here
      refreshAdminUI && refreshAdminUI();
    });
  }

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

  // 32-team first-round pairing
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

  // Sort by points desc, then name asc; return 32 seeds (fill with Bye)
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
        top.push({
          seed: i + 1,
          name: "Bye",
          isBye: true,
        });
      }
    }
    return top;
  }

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

    var seeds = computeTop32(rows); // 32 entries
    var seedMap = {};
    seeds.forEach(function (s) {
      seedMap[s.seed] = s;
    });

    // helpers
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

    // Column 0: real Round-of-32 pairings
    var col0 = makeCol(titles[0]);
    seededPairs32().forEach(function (pair) {
      var a = seedMap[pair[0]];
      var b = seedMap[pair[1]];
      col0.inner.appendChild(matchCard(a, b));
    });
    host.appendChild(col0.col);

    // Remaining columns: placeholders with TBD
    for (var ci = 1; ci < titles.length; ci++) {
      var c = makeCol(titles[ci]);
      for (var m = 0; m < counts[ci]; m++) {
        c.inner.appendChild(matchCard(null, null)); // "– TBD"
      }
      host.appendChild(c.col);
    }
  }
}
