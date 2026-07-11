/*
 * SaveManager: multi-slot dynasty persistence.
 * Primary storage is IndexedDB (large worlds exceed localStorage quotas);
 * also supports JSON export/import for portable save files, and auto-save.
 */
(function () {
  const DB_NAME = 'xcd-saves';
  const DB_VERSION = 1;
  const STORE = 'dynasties';

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

  const SaveManager = {
    /*
     * Save the game state into a slot. slotId 'auto' is reserved for autosave.
     */
    async save(slotId, gameState, label) {
      const record = {
        slotId,
        label: label || gameState.dynastyName,
        savedAt: Date.now(),
        year: gameState.year,
        week: gameState.week,
        schoolName: gameState.getPlayerSchool()?.name || '',
        coachName: gameState.getPlayerCoach()?.fullName || '',
        data: gameState.toJSON()
      };
      await withStore('readwrite', (store) => store.put(record));
      return record;
    },

    async load(slotId) {
      const db = await openDB();
      try {
        const record = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(slotId);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        if (!record) return null;
        return window.XCD.engine.GameState.fromJSON(record.data);
      } finally {
        db.close();
      }
    },

    async listSlots() {
      const db = await openDB();
      try {
        const records = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        // Return metadata only (not full world data) for the save browser UI.
        return records
          .map(({ slotId, label, savedAt, year, week, schoolName, coachName }) =>
            ({ slotId, label, savedAt, year, week, schoolName, coachName }))
          .sort((a, b) => b.savedAt - a.savedAt);
      } finally {
        db.close();
      }
    },

    async deleteSlot(slotId) {
      await withStore('readwrite', (store) => store.delete(slotId));
    },

    async autoSave(gameState) {
      return this.save('auto', gameState, `Autosave — ${gameState.dynastyName}`);
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
            resolve(window.XCD.engine.GameState.fromJSON(obj));
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
