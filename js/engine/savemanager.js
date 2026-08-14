/*
 * SaveManager: one save per dynasty (Update 6, Phase 5 — revised).
 *
 * Each dynasty owns exactly ONE save record, keyed by its unique id
 * (`dyn_<dynastyId>`). Autosaves and manual saves both write to that same
 * record, so whichever happened last is the dynasty's save — there is never a
 * separate "autosave" and "main save" for the same dynasty. Starting a new
 * dynasty can never overwrite another one (different id → different key), and
 * deleting a dynasty removes its single record cleanly.
 *
 * Storage is IndexedDB (large worlds exceed localStorage quotas). Writes are
 * transactional (atomic), and each dynasty additionally keeps a rolling
 * recovery point (`dyn_<id>__bak`) written in the background once per in-game
 * year, which Load falls back to if the primary record is ever unreadable.
 *
 * Legacy records from earlier builds (a shared `auto` slot, per-dynasty
 * `auto_<id>` autosaves, and `slot_<timestamp>` manual saves) are transparently
 * consolidated the first time the save list is opened: the most recent record
 * for each dynasty is migrated to the canonical key and the duplicates removed.
 */
(function () {
  const DB_NAME = 'xcd-saves';
  const DB_VERSION = 1;
  const STORE = 'dynasties';
  const BAK_SUFFIX = '__bak';
  // In-memory marker so the rolling backup is written at most once per in-game
  // year per dynasty, without an extra IndexedDB read on the hot save path.
  const backupYears = {};

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'slotId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore(mode, fn) {
    const db = await openDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const result = fn(store);
        tx.oncomplete = () => resolve(result && result.__value !== undefined ? result.__value : result);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  function getRecord(db, slotId) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(slotId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAllRecords(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  const canonicalKey = (dynId) => 'dyn_' + dynId;

  // The dynasty a stored record belongs to, tolerant of every historical key
  // shape (canonical `dyn_<id>`, `auto_<id>`, `slot_<ts>`, or the ancient
  // shared `auto`). Prefers the explicit field, then the embedded state.
  function recordDynId(r) {
    if (r.dynastyId) return r.dynastyId;
    if (r.data && r.data.dynastyId) return r.data.dynastyId;
    return r.slotId; // last resort: treat the raw slot as its own dynasty
  }

  // A clean dynasty name even for very old records that predate the
  // dynastyName field (they only carried a label like "Autosave — X").
  function cleanName(r) {
    return r.dynastyName || (r.data && r.data.dynastyName) ||
      (r.label || '').replace(/^Autosave\s+—\s+/, '') || 'Dynasty';
  }

  // W–L for the save browser. A head coach shows their own career record; an
  // assistant (recruiting coordinator) has no personal W–L, so we show the
  // program's competitive record — the head coach they serve under, falling
  // back to the program ledger — instead of a misleading 0-0.
  function recordString(gameState) {
    try {
      const coach = (gameState.getHeadCoach && gameState.getHeadCoach()) || gameState.getPlayerCoach();
      const cr = coach && coach.careerRecord;
      if (cr && (cr.wins || cr.losses)) return `${cr.wins}-${cr.losses}`;
      const school = gameState.getPlayerSchool && gameState.getPlayerSchool();
      const Legacy = window.XCD.engine.Legacy;
      if (school && Legacy && Legacy.program) {
        const prog = Legacy.program(gameState, school.id);
        if (prog && (prog.wins || prog.losses)) return `${prog.wins}-${prog.losses}`;
      }
    } catch (e) { /* fall through */ }
    return '0-0';
  }

  function buildRecord(gameState, type) {
    const dynId = gameState.dynastyId || 'legacy';
    return {
      slotId: canonicalKey(dynId),
      dynastyId: dynId,
      label: gameState.dynastyName,
      dynastyName: gameState.dynastyName,
      savedAt: Date.now(),
      lastSaveType: type, // 'auto' | 'manual' — whichever wrote last
      year: gameState.year,
      week: gameState.week,
      schoolName: gameState.getPlayerSchool()?.name || '',
      coachName: gameState.getPlayerCoach()?.fullName || '',
      record: recordString(gameState),
      data: gameState.toJSON()
    };
  }

  const META_FIELDS = ['slotId', 'dynastyId', 'label', 'dynastyName', 'savedAt',
    'lastSaveType', 'year', 'week', 'schoolName', 'coachName', 'record'];

  function metaOnly(record) {
    const out = {};
    META_FIELDS.forEach((k) => { out[k] = record[k]; });
    out.dynastyName = cleanName(record);
    out.isAuto = record.lastSaveType ? record.lastSaveType === 'auto' : /^auto/.test(record.slotId || '');
    return out;
  }

  // Every stored key that belongs to a dynasty (primary + backup + all legacy
  // shapes) — used to fully delete or rename a dynasty regardless of history.
  function belongsToDynasty(r, dynId) {
    if (recordDynId(r) === dynId) return true;
    const bases = [canonicalKey(dynId), 'auto_' + dynId, dynId];
    return bases.some((b) => r.slotId === b || r.slotId === b + BAK_SUFFIX);
  }

  const SaveManager = {
    /*
     * Write the dynasty's single save record (used by both autoSave and
     * manualSave). Also clears any legacy per-dynasty autosave slot so exactly
     * one record remains going forward.
     */
    async save(gameState, type) {
      const dynId = gameState.dynastyId || 'legacy';
      const record = buildRecord(gameState, type || 'manual');
      await withStore('readwrite', (store) => {
        store.put(record);
        // Retire the old separate autosave slot (and its backup) so a dynasty
        // never shows both an autosave and a main save again.
        store.delete('auto_' + dynId);
        store.delete('auto_' + dynId + BAK_SUFFIX);
      });
      return record;
    },

    async manualSave(gameState) {
      return this.save(gameState, 'manual');
    },

    /*
     * Autosave: the same single record, tagged as an auto write, plus a
     * background rolling backup once per in-game year (fire-and-forget, so it
     * never adds latency to advancing a week).
     */
    async autoSave(gameState) {
      const dynId = gameState.dynastyId || 'legacy';
      const record = await this.save(gameState, 'auto');
      if (backupYears[dynId] !== gameState.year) {
        backupYears[dynId] = gameState.year;
        const copy = Object.assign({}, record, { slotId: canonicalKey(dynId) + BAK_SUFFIX });
        withStore('readwrite', (store) => store.put(copy)).catch(() => { /* best-effort */ });
      }
      return record;
    },

    /*
     * Load a dynasty by id. Tries the canonical record, then legacy key shapes,
     * then their backups, then a full scan — so any save, however old, loads.
     */
    async load(dynId) {
      const db = await openDB();
      try {
        const bases = [canonicalKey(dynId), 'auto_' + dynId, dynId];
        for (const base of bases) {
          let rec = await getRecord(db, base).catch(() => null);
          if (!rec || !rec.data) rec = await getRecord(db, base + BAK_SUFFIX).catch(() => null);
          if (rec && rec.data) return window.XCD.engine.GameState.fromJSON(rec.data);
        }
        // Last resort: newest non-backup record that belongs to this dynasty.
        const all = await getAllRecords(db);
        const match = all
          .filter((r) => !r.slotId.endsWith(BAK_SUFFIX) && r.data && belongsToDynasty(r, dynId))
          .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
        if (match && match.data) return window.XCD.engine.GameState.fromJSON(match.data);
        return null;
      } finally {
        db.close();
      }
    },

    /*
     * One row per dynasty for the save browser. Consolidates legacy duplicates
     * in place: for each dynasty, keep the most recent record under the
     * canonical key and delete every other record (and stray backups).
     */
    async listSlots() {
      const db = await openDB();
      try {
        const all = await getAllRecords(db);
        const groups = {};
        all.forEach((r) => {
          if (r.slotId.endsWith(BAK_SUFFIX)) return; // backups are silent
          const dynId = recordDynId(r);
          (groups[dynId] = groups[dynId] || []).push(r);
        });

        const rows = [];
        const puts = [];
        const dels = [];
        Object.keys(groups).forEach((dynId) => {
          const list = groups[dynId].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
          const newest = list[0];
          const canonical = canonicalKey(dynId);
          // Migrate the newest to the canonical key if needed.
          if (newest.slotId !== canonical) {
            const migrated = Object.assign({}, newest, {
              slotId: canonical,
              dynastyId: dynId,
              dynastyName: cleanName(newest),
              lastSaveType: newest.lastSaveType || (/^auto/.test(newest.slotId) ? 'auto' : 'manual')
            });
            if (migrated.data) {
              migrated.data.dynastyName = migrated.dynastyName;
              // Stamp the id into the embedded state so a later load + autosave
              // reuses this same canonical slot (never spawns a duplicate).
              migrated.data.dynastyId = dynId;
            }
            puts.push(migrated);
            rows.push(metaOnly(migrated));
          } else {
            rows.push(metaOnly(newest));
          }
          // Delete every non-canonical record for this dynasty, plus backups.
          list.forEach((r) => {
            if (r.slotId !== canonical) { dels.push(r.slotId); dels.push(r.slotId + BAK_SUFFIX); }
          });
        });

        if (puts.length || dels.length) {
          await withStore('readwrite', (store) => {
            puts.forEach((p) => store.put(p));
            dels.forEach((k) => store.delete(k));
          }).catch(() => { /* consolidation is best-effort */ });
        }

        return rows.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      } finally {
        db.close();
      }
    },

    /*
     * Delete an entire dynasty: every record that belongs to it, whatever key
     * shape it was stored under, including backups.
     */
    async deleteDynasty(dynId) {
      const db = await openDB();
      let keys;
      try {
        const all = await getAllRecords(db);
        keys = all.filter((r) => belongsToDynasty(r, dynId)).map((r) => r.slotId);
      } finally {
        db.close();
      }
      await withStore('readwrite', (store) => { keys.forEach((k) => store.delete(k)); });
      return keys.length;
    },

    /*
     * Rename a dynasty without touching its world. Updates every record that
     * belongs to it (and the embedded state) so the new name sticks.
     */
    async renameDynasty(dynId, newName) {
      const db = await openDB();
      let matches;
      try {
        const all = await getAllRecords(db);
        matches = all.filter((r) => belongsToDynasty(r, dynId));
      } finally {
        db.close();
      }
      if (!matches.length) return false;
      const name = (newName || '').trim();
      if (!name) return false;
      await withStore('readwrite', (store) => {
        matches.forEach((r) => {
          r.dynastyName = name;
          r.label = name;
          if (r.data) r.data.dynastyName = name;
          store.put(r);
        });
      });
      return true;
    },

    exportToFile(gameState) {
      const json = JSON.stringify(gameState.toJSON());
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (gameState.dynastyName || 'dynasty').replace(/[^a-z0-9-_]+/gi, '_');
      a.download = `xcd_${safeName}_Y${gameState.year}W${gameState.week}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },

    importFromFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const obj = JSON.parse(reader.result);
            if (!obj.world || !obj.playerSchoolId) {
              throw new Error('Not a valid Cross Country Dynasty save file.');
            }
            const game = window.XCD.engine.GameState.fromJSON(obj);
            // An imported dynasty is its own dynasty: give it a fresh id so it
            // can never share a save slot with the file's origin.
            game.dynastyId = window.XCD.engine.GameState.newDynastyId();
            resolve(game);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
    }
  };

  window.XCD.engine.SaveManager = SaveManager;
})();
