/*
 * SaveManager: multi-dynasty persistence (Update 6, Phase 5).
 *
 * Every dynasty is fully independent. It owns:
 *   - its own autosave slot  (`auto_<dynastyId>`), written every week, and
 *   - any number of manual checkpoint slots (`slot_<timestamp>`).
 * Starting a new dynasty can never overwrite another one, because the
 * autosave key is derived from the dynasty's unique id rather than a single
 * shared "auto" slot (the old behaviour, which clobbered every prior save).
 *
 * Storage is IndexedDB (large worlds exceed localStorage quotas). IndexedDB
 * writes are transactional (atomic — a `put` either fully lands or fully
 * rolls back), and on top of that each autosave keeps a rolling recovery
 * point (`<slot>__bak`) from the previous in-game year so a bad save can
 * fall back. JSON export/import remains for portable save files.
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
        tx.oncomplete = () => resolve(result.__value !== undefined ? result.__value : result);
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

  // Player W–L for the save browser: the dynasty's cumulative coaching record.
  function recordString(gameState) {
    try {
      const coach = gameState.getPlayerCoach();
      const cr = coach && coach.careerRecord;
      if (cr && (cr.wins || cr.losses)) return `${cr.wins}-${cr.losses}`;
    } catch (e) { /* fall through */ }
    return '0-0';
  }

  function buildRecord(slotId, gameState, label) {
    return {
      slotId,
      dynastyId: gameState.dynastyId || null,
      label: label || gameState.dynastyName,
      dynastyName: gameState.dynastyName,
      savedAt: Date.now(),
      year: gameState.year,
      week: gameState.week,
      schoolName: gameState.getPlayerSchool()?.name || '',
      coachName: gameState.getPlayerCoach()?.fullName || '',
      record: recordString(gameState),
      isAuto: slotId.startsWith('auto_') || slotId === 'auto',
      data: gameState.toJSON()
    };
  }

  const META_FIELDS = ['slotId', 'dynastyId', 'label', 'dynastyName', 'savedAt',
    'year', 'week', 'schoolName', 'coachName', 'record', 'isAuto'];

  function metaOnly(record) {
    const out = {};
    META_FIELDS.forEach((k) => { out[k] = record[k]; });
    return out;
  }

  const SaveManager = {
    /*
     * Save the game state into a slot. Used for manual checkpoints and (via
     * autoSave) per-dynasty autosaves.
     */
    async save(slotId, gameState, label) {
      const record = buildRecord(slotId, gameState, label);
      await withStore('readwrite', (store) => store.put(record));
      return record;
    },

    async load(slotId) {
      const db = await openDB();
      try {
        let record = await getRecord(db, slotId);
        // Corruption protection: fall back to the rolling backup if the
        // primary record is missing or unreadable.
        if (!record || !record.data) {
          const bak = await getRecord(db, slotId + BAK_SUFFIX).catch(() => null);
          if (bak && bak.data) record = bak;
        }
        if (!record || !record.data) return null;
        return window.XCD.engine.GameState.fromJSON(record.data);
      } finally {
        db.close();
      }
    },

    /*
     * Metadata for the save browser. Backup (`__bak`) slots are hidden — they
     * are silent recovery points, not user-facing saves.
     */
    async listSlots() {
      const db = await openDB();
      try {
        const records = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        return records
          .filter((r) => !r.slotId.endsWith(BAK_SUFFIX))
          .map(metaOnly)
          .sort((a, b) => b.savedAt - a.savedAt);
      } finally {
        db.close();
      }
    },

    async deleteSlot(slotId) {
      // Deleting a dynasty removes its rolling backup too.
      await withStore('readwrite', (store) => {
        store.delete(slotId);
        store.delete(slotId + BAK_SUFFIX);
      });
    },

    /*
     * Rename a dynasty without touching its world. Updates both the slot
     * label and the dynasty name inside the saved state so the change sticks.
     */
    async renameSlot(slotId, newName) {
      const db = await openDB();
      try {
        const record = await getRecord(db, slotId);
        if (!record) return false;
        const name = (newName || '').trim() || record.dynastyName || record.label;
        record.label = record.isAuto ? `Autosave — ${name}` : name;
        record.dynastyName = name;
        if (record.data) record.data.dynastyName = name;
        await withStore('readwrite', (store) => store.put(record));
        return true;
      } finally {
        db.close();
      }
    },

    /*
     * Per-dynasty autosave. The primary write is a single atomic put (as fast
     * as the old shared autosave). On top of that, once per in-game year, a
     * rolling recovery point (`<slot>__bak`) is written in the background —
     * fire-and-forget, so it never adds latency to advancing a week — giving a
     * fallback if the primary autosave is ever unreadable.
     */
    async autoSave(gameState) {
      const dynId = gameState.dynastyId || 'legacy';
      const slotId = 'auto_' + dynId;
      const record = await this.save(slotId, gameState, `Autosave — ${gameState.dynastyName}`);
      if (backupYears[dynId] !== gameState.year) {
        backupYears[dynId] = gameState.year;
        const copy = Object.assign({}, record, { slotId: slotId + BAK_SUFFIX });
        withStore('readwrite', (store) => store.put(copy)).catch(() => { /* best-effort */ });
      }
      return record;
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
            // can never share an autosave slot with the file's origin.
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
