/**
 * Cloud Functions for shared scoreboard (Firebase v2).
 * - finishDayAwardPoints: awards 10..1 with ties sharing rank
 * - resetAllPoints: sets all points to 0
 * - makeMeAdmin: one-time helper to grant admin to allowed emails
 */

const functions = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/** Add your Google email(s) here **/
const ALLOWED_ADMIN_EMAILS = ["jaredellis533@gmail.com", "ellisjf@amazon.com"];

/**
 * Sort entries by ratio desc, then numerator desc, then name asc.
 * @param {Array<Object>} list
 * @return {Array<Object>}
 */
// eslint-disable-next-line no-unused-vars
function sortTieAware(list) {
  return list.sort((a, b) => {
    if (b.ratio !== a.ratio) return b.ratio - a.ratio;
    if (b.num !== a.num) return b.num - a.num;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Require admin claim.
 * Throws HttpsError if the caller is not an admin.
 * @param {Object} req
 */
function assertAdmin(req) {
  if (!req || !req.auth || !req.auth.token || req.auth.token.admin !== true) {
    throw new functions.HttpsError("permission-denied", "Admins only");
  }
}

/**
 * One-time helper to grant admin to the caller IF their email
 * is in ALLOWED_ADMIN_EMAILS and they signed in with Google.
 */
exports.makeMeAdmin = functions.onCall(async (req) => {
  if (!req || !req.auth || !req.auth.uid || !req.auth.token) {
    throw new functions.HttpsError("unauthenticated", "Sign in first.");
  }

  const uid = req.auth.uid;
  const token = req.auth.token;
  const email = token.email || "";
  const provider =
    token.firebase && token.firebase.sign_in_provider ?
      token.firebase.sign_in_provider :
      "";

  if (provider !== "google.com") {
    throw new functions.HttpsError("permission-denied", "Use Google sign-in.");
  }
  if (ALLOWED_ADMIN_EMAILS.indexOf(email) === -1) {
    throw new functions.HttpsError("permission-denied", "Not authorized.");
  }

  await admin.auth().setCustomUserClaims(uid, {admin: true, email: email});
  return {ok: true};
});

/**
 * Finish the day:
 * - Reads /today docs
 * - Awards points 10..1 (ties share rank’s points)
 * - Upserts /points/{name}.pts
 * - Clears /today
 */
exports.finishDayAwardPoints = functions.onCall(async (req) => {
  assertAdmin(req);

  const todaySnap = await db.collection("today").get();
  if (todaySnap.empty) return {awarded: 0};

  // collect and sort all entries
  const entries = todaySnap.docs.map((d) => {
    return d.data();
  });
  entries.sort((a, b) => {
    if (b.ratio !== a.ratio) return b.ratio - a.ratio;
    if (b.num !== a.num) return b.num - a.num;
    return String(a.displayName || "").localeCompare(
        String(b.displayName || ""),
    );
  });

  // identify first-place tie group (top) and last-place tie group (bottom)
  let firstEnd = 0;
  while (
    firstEnd + 1 < entries.length &&
    entries[firstEnd + 1].ratio === entries[0].ratio
  ) {
    firstEnd++;
  }

  let lastStart = entries.length - 1;
  while (
    lastStart - 1 >= 0 &&
    entries[lastStart - 1].ratio === entries[entries.length - 1].ratio
  ) {
    lastStart--;
  }

  const award = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const batch = db.batch();
  let i = 0;
  let rank = 1;
  let awarded = 0;

  while (i < entries.length && rank <= 10) {
    let j = i;
    while (
      j + 1 < entries.length &&
      entries[j + 1].ratio === entries[i].ratio
    ) {
      j++;
    }

    const pts = award[rank - 1] || 0;

    for (let k = i; k <= j; k++) {
      const alias = String(entries[k].alias || "")
          .trim()
          .toLowerCase();
      const displayName = String(entries[k].displayName || alias);
      if (!alias) continue;

      const ref = db.collection("points").doc(alias);

      // read previous display name once if needed
      // optional: you can skip this read if you always trust today's displayName
      // const prev = await ref.get(); (avoid per-doc gets in tight loop if you can)
      // for simplicity and speed, just write displayName as latest:
      const inc = admin.firestore.FieldValue.increment(pts);

      // increment firsts if this alias is in the first-place tie group
      const incFirst =
        i <= firstEnd && firstEnd >= 0 ?
          admin.firestore.FieldValue.increment(1) :
          null;

      // increment lasts if this alias is in the last-place tie group
      const incLast =
        i >= lastStart && lastStart >= 0 ?
          admin.firestore.FieldValue.increment(1) :
          null;

      const data = {alias: alias, displayName: displayName, pts: inc};
      if (incFirst) data.firsts = incFirst;
      if (incLast) data.lasts = incLast;

      batch.set(ref, data, {merge: true});

      // optional users mirror
      const uref = db.collection("users").doc(alias);
      batch.set(
          uref,
          {alias: alias, displayName: displayName, updatedAt: Date.now()},
          {merge: true},
      );

      awarded++;
    }

    rank += j - i + 1;
    i = j + 1;
  }

  todaySnap.docs.forEach((d) => {
    batch.delete(d.ref);
  });
  await batch.commit();
  return {
    awarded: awarded,
    firstsAdded: firstEnd + 1,
    lastsAdded: entries.length - lastStart,
  };
});

// Move/merge an existing points doc to a new alias id
// data: { oldId, newAlias, newDisplayName }
exports.adminMovePoints = functions.onCall(async (req) => {
  assertAdmin(req);

  const oldId = String((req.data && req.data.oldId) || "")
      .trim()
      .toLowerCase();
  const newAlias = String((req.data && req.data.newAlias) || "")
      .trim()
      .toLowerCase();
  const newDisplayName = String(
      (req.data && req.data.newDisplayName) || "",
  ).trim();

  if (!oldId || !newAlias) {
    throw new functions.HttpsError(
        "invalid-argument",
        "oldId and newAlias required",
    );
  }

  const srcRef = db.collection("points").doc(oldId);
  const dstRef = db.collection("points").doc(newAlias);

  const srcSnap = await srcRef.get();
  const srcData = srcSnap.exists ? srcSnap.data() : null;

  const dstSnap = await dstRef.get();
  const dstData = dstSnap.exists ? dstSnap.data() : null;

  const batch = db.batch();

  // Merge logic: sum pts if both exist
  if (srcData) {
    const ptsSum = (srcData.pts || 0) + (dstData ? dstData.pts || 0 : 0);
    batch.set(
        dstRef,
        {
          alias: newAlias,
          displayName:
          newDisplayName ||
          (dstData && dstData.displayName) ||
          srcData.displayName ||
          newAlias,
          pts: ptsSum,
        },
        {merge: true},
    );
    batch.delete(srcRef);
  } else {
    // If source doesn't exist, still ensure destination exists
    batch.set(
        dstRef,
        {
          alias: newAlias,
          displayName:
          newDisplayName || (dstData && dstData.displayName) || newAlias,
        },
        {merge: true},
    );
  }

  // keep users/{alias}
  const uref = db.collection("users").doc(newAlias);
  batch.set(
      uref,
      {
        alias: newAlias,
        displayName: newDisplayName || newAlias,
        updatedAt: Date.now(),
      },
      {merge: true},
  );

  await batch.commit();
  return {movedFrom: oldId, to: newAlias};
});

/**
 * Reset all points to 0.
 */
exports.resetAllPoints = functions.onCall(async (req) => {
  assertAdmin(req);

  const ptsSnap = await db.collection("points").get();
  const batch = db.batch();

  ptsSnap.docs.forEach((d) => {
    batch.set(d.ref, {pts: 0}, {merge: true});
  });

  await batch.commit();
  return {reset: ptsSnap.size};
});

// Add to functions/index.js (no optional chaining)
exports.adminSetAliasFields = functions.onCall(async (req) => {
  assertAdmin(req);

  const data = req && req.data ? req.data : {};
  const docId = String(data.docId || "").trim(); // existing /points doc id (old or alias)
  const alias = String(data.alias || "")
      .trim()
      .toLowerCase(); // target alias (lowercase)
  const displayName = String(data.displayName || "").trim(); // proper-cased display name (optional)

  if (!docId || !alias) {
    throw new functions.HttpsError(
        "invalid-argument",
        "docId and alias required",
    );
  }

  const ref = db.collection("points").doc(docId);
  await ref.set({alias: alias, displayName: displayName}, {merge: true});

  return {updated: docId, alias: alias, displayName: displayName};
});

// Delete one leaderboard entry from /points (and optional users/{alias})
exports.adminDeletePointsDoc = functions.onCall(async (req) => {
  assertAdmin(req);

  const data = req && req.data ? req.data : {};
  const docId = String(data.docId || "").trim(); // can be alias or old name id
  if (!docId) {
    throw new functions.HttpsError("invalid-argument", "docId required");
  }

  const ref = db.collection("points").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    return {deleted: false, reason: "not-found"};
  }

  // capture alias (if the doc stores it) to also clean users/{alias}
  let alias = "";
  const d = snap.data() || {};
  if (d.alias) alias = String(d.alias).trim().toLowerCase();

  await ref.delete();

  // optional cleanup of users/{alias}
  if (alias) {
    const uref = db.collection("users").doc(alias);
    const usnap = await uref.get();
    if (usnap.exists) {
      await uref.delete();
    }
  }

  return {deleted: true, id: docId, alias: alias};
});

// Edit a participant's points (set absolute or increment by delta)
exports.adminUpdatePoints = functions.onCall(async (req) => {
  assertAdmin(req);

  const data = req && req.data ? req.data : {};
  const docId = String(data.docId || "").trim(); // points doc ID (alias or existing id)
  const mode = String(data.mode || "set").trim(); // "set" or "inc"
  const value = Number(data.value); // new total (set) or delta (inc)
  const displayName = (data.displayName || "").trim(); // optional: update display name too
  const alias = (data.alias || "").trim().toLowerCase(); // optional: set/confirm alias field

  if (!docId || !isFinite(value)) {
    throw new functions.HttpsError(
        "invalid-argument",
        "docId and numeric value are required",
    );
  }
  const ref = db.collection("points").doc(docId);
  const snap = await ref.get();
  if (!snap.exists && mode === "inc") {
    // create doc if incrementing a missing one
    await ref.set({pts: 0}, {merge: true});
  }

  const update = {};
  if (mode === "set") {
    update.pts = value;
  } else {
    update.pts = admin.firestore.FieldValue.increment(value);
  }
  if (displayName) update.displayName = displayName;
  if (alias) update.alias = alias;

  await ref.set(update, {merge: true});

  // Optional: keep users/{alias} in sync if alias provided
  if (alias) {
    const uref = db.collection("users").doc(alias);
    await uref.set(
        {
          alias: alias,
          displayName:
          displayName || (snap.exists ? snap.data().displayName || "" : ""),
          updatedAt: Date.now(),
        },
        {merge: true},
    );
  }

  return {ok: true, id: docId, mode: mode, value: value};
});

exports.adminUpdateFinishes = functions.onCall(async (req) => {
  assertAdmin(req);

  const data = req && req.data ? req.data : {};
  const docId = String(data.docId || "").trim(); // points doc id (alias or existing id)
  const mode = String(data.mode || "set").trim(); // "set" or "inc"
  const firsts = Number(data.firsts); // required if provided
  const lasts = Number(data.lasts); // required if provided
  const displayName = (data.displayName || "").trim(); // optional, keep casing

  if (!docId) {
    throw new functions.HttpsError("invalid-argument", "docId required");
  }
  const ref = db.collection("points").doc(docId);

  const update = {};
  if (mode === "set") {
    if (isFinite(firsts)) update.firsts = Math.max(0, Math.floor(firsts));
    if (isFinite(lasts)) update.lasts = Math.max(0, Math.floor(lasts));
  } else {
    // "inc"
    if (isFinite(firsts)) {
      update.firsts = admin.firestore.FieldValue.increment(Math.floor(firsts));
    }
    if (isFinite(lasts)) {
      update.lasts = admin.firestore.FieldValue.increment(Math.floor(lasts));
    }
  }
  if (displayName) update.displayName = displayName;

  if (Object.keys(update).length === 0) {
    throw new functions.HttpsError(
        "invalid-argument",
        "Provide firsts or lasts",
    );
  }

  await ref.set(update, {merge: true});
  return {ok: true, id: docId, mode: mode, applied: update};
});
