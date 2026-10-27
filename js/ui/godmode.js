/*
 * God Mode (Settings → Sandbox). When the dynasty's godMode flag is on,
 * profiles grow a ✏️ Edit button (UI.godButton) that opens an editor:
 *   - athletes: physical + mental ratings, potential, morale, fatigue, heal
 *   - programs: prestige, academics, team morale, recruiting budget, the
 *     five facilities
 *   - coaches: the four coaching ratings, reputation, and the Hot Seat
 * Edits write straight to the live world and autosave; overall ratings are
 * recalculated so every screen reflects the change immediately.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  UI.godModeOn = function (game) {
    const S = window.XCD.engine.Settings;
    return !!(game && S && S.get(game, 'godMode'));
  };

  // The ✏️ Edit button for a profile header (empty when God Mode is off).
  UI.godButton = function (game, kind, id) {
    if (!UI.godModeOn(game) || !id) return '';
    return `<button class="btn small god-btn" data-god-${kind}="${id}" title="God Mode: edit">✏️ Edit</button>`;
  };

  // One delegated listener: profiles are re-rendered constantly.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-god-ath], [data-god-school], [data-god-coach]');
    if (!b) return;
    const game = UI.state.game;
    if (!UI.godModeOn(game)) return;
    e.stopPropagation();
    if (b.dataset.godAth) UI.godEditAthlete(game, game.getAthlete(b.dataset.godAth));
    else if (b.dataset.godSchool) UI.godEditSchool(game, game.getSchool(b.dataset.godSchool));
    else if (b.dataset.godCoach) UI.godEditCoach(game, game.getCoach(b.dataset.godCoach));
  }, true);

  // A labelled range + number pair. fields: [key, label, min, max]
  function fieldHtml(obj, [key, label, min, max]) {
    const v = Math.round(Number(obj[key] ?? min));
    return `<div class="god-field">
      <label for="god-${key}">${label}</label>
      <input type="range" id="god-${key}" data-god-field="${key}" min="${min}" max="${max}" step="1" value="${v}">
      <input type="number" class="god-num" data-god-num="${key}" min="${min}" max="${max}" step="1" value="${v}">
    </div>`;
  }

  function editor({ title, sub, sections, extraButtons, onChange, onSave, onBack }) {
    UI.showModal(`
      <div class="god-editor">
        <div class="god-head">
          <h2>✏️ ${title}</h2>
          <div class="god-sub">${sub || ''}</div>
          <span class="god-flag">God Mode</span>
        </div>
        ${sections.map((s) => `<h3>${s.title}</h3><div class="god-fields">${s.fields.map((f) => fieldHtml(s.obj, f)).join('')}</div>`).join('')}
        <div class="god-live" id="god-live"></div>
        <div class="god-foot">
          ${extraButtons || ''}
          <span style="flex:1"></span>
          <button class="btn" id="god-cancel">Cancel</button>
          <button class="btn primary" id="god-save">Save changes</button>
        </div>
      </div>`, (modal) => {
      const read = () => {
        const out = {};
        modal.querySelectorAll('[data-god-field]').forEach((el) => { out[el.dataset.godField] = Number(el.value); });
        return out;
      };
      const sync = () => { if (onChange) modal.querySelector('#god-live').innerHTML = onChange(read()); };
      modal.querySelectorAll('[data-god-field]').forEach((range) => {
        const num = modal.querySelector(`[data-god-num="${range.dataset.godField}"]`);
        range.addEventListener('input', () => { num.value = range.value; sync(); });
        num.addEventListener('input', () => {
          const v = Utils.clamp(Number(num.value) || 0, Number(range.min), Number(range.max));
          range.value = v; sync();
        });
      });
      modal.querySelector('#god-cancel').addEventListener('click', () => { UI.closeModal(); if (onBack) onBack(); });
      modal.querySelector('#god-save').addEventListener('click', () => {
        onSave(read(), modal);
        UI.closeModal();
        UI.renderShell();
        UI.toast('Saved — God Mode edit applied.', 'success', 1800);
        window.XCD.engine.SaveManager.autoSave(UI.state.game).catch(() => {});
        if (onBack) onBack();
      });
      sync();
      return modal;
    });
    return document.getElementById('active-modal');
  }

  const PHYS = [['vo2Max', 'VO₂ Max', 1, 99], ['runningEconomy', 'Running Economy', 1, 99], ['stamina', 'Stamina', 1, 99],
    ['lactateThreshold', 'Lactate Threshold', 1, 99], ['speed', 'Speed', 1, 99], ['injuryResistance', 'Injury Resistance', 1, 99]];
  const MENTAL = [['confidence', 'Confidence', 1, 99], ['mentalToughness', 'Mental Toughness', 1, 99], ['consistency', 'Consistency', 1, 99],
    ['raceIQ', 'Race IQ', 1, 99], ['workEthic', 'Work Ethic', 1, 99], ['leadership', 'Leadership', 1, 99]];
  const STATUS = [['potential', 'Potential', 20, 99], ['morale', 'Morale', 0, 100], ['fatigue', 'Fatigue', 0, 100]];

  function heal(a) {
    const was = !!a.injury || a.health === 'Injured' || a.health === 'Recovering';
    a.injury = null;
    a.health = 'Healthy';
    a.recentInjuryWeeks = 0;
    a.fatigue = Math.min(a.fatigue || 0, 20);
    return was;
  }

  UI.godEditAthlete = function (game, a) {
    if (!a) return;
    const weights = { vo2Max: 0.24, lactateThreshold: 0.18, runningEconomy: 0.18, stamina: 0.18, speed: 0.14, injuryResistance: 0.08 };
    const reopen = () => UI.showPlayerCard && UI.showPlayerCard(a, game);
    editor({
      title: Utils.escapeHtml(a.fullName),
      sub: `${a.classYear} · ${Utils.escapeHtml((game.getSchool(a.schoolId) || {}).name || 'Unattached')} · now ${a.currentOverall} OVR${a.injury ? ' · <span style="color:var(--danger);">injured</span>' : ''}`,
      sections: [
        { title: 'Physical ratings', obj: a, fields: PHYS },
        { title: 'Mental & makeup', obj: a, fields: MENTAL },
        { title: 'Status', obj: a, fields: STATUS }
      ],
      extraButtons: `<button class="btn" data-god-heal-one>🩹 Heal &amp; rest</button>`,
      onChange: (v) => {
        let total = 0;
        Object.keys(weights).forEach((k) => { total += v[k] * weights[k]; });
        const ovr = Math.round(Utils.clamp(total, 1, 99));
        const d = ovr - a.currentOverall;
        return `Overall: <strong>${a.currentOverall}</strong> → <strong class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${ovr}</strong>${d ? ` (${d > 0 ? '+' : ''}${d})` : ''}`;
      },
      onSave: (v) => {
        Object.entries(v).forEach(([k, val]) => { a[k] = val; });
        a.recalculateOverall();
      },
      onBack: reopen
    });
    const btn = document.querySelector('[data-god-heal-one]');
    if (btn) btn.addEventListener('click', () => {
      const was = heal(a);
      UI.toast(was ? `${a.fullName} is healthy and rested.` : `${a.fullName} was already healthy — legs freshened.`, 'success');
      window.XCD.engine.SaveManager.autoSave(game).catch(() => {});
      UI.godEditAthlete(game, a);
    });
  };

  UI.godHealRoster = function (game) {
    const school = game.getPlayerSchool();
    let n = 0;
    ['M', 'W'].forEach((g) => game.getRoster(school.id, g).forEach((a) => { if (heal(a)) n++; }));
    return n;
  };

  UI.godEditSchool = function (game, school) {
    if (!school) return;
    school.facilities = school.facilities || {};
    const budgetObj = { recruitingK: Math.round(((school.budget && school.budget.recruiting) || 0) / 1000) };
    editor({
      title: Utils.escapeHtml(school.name),
      sub: `${school.division || 'DI'} · ${Utils.escapeHtml(school.conference || '')}`,
      sections: [
        { title: 'Program', obj: school, fields: [['prestige', 'Prestige', 5, 99], ['academics', 'Academics', 1, 99], ['teamMorale', 'Team morale', 0, 100]] },
        { title: 'Facilities', obj: school.facilities, fields: [['trainingCenter', 'Training center', 1, 99], ['weightRoom', 'Weight room', 1, 99],
          ['rehabCenter', 'Rehab center', 1, 99], ['indoorTrack', 'Indoor track', 1, 99], ['alumniCenter', 'Alumni center', 1, 99]] },
        { title: 'Budget ($ thousands)', obj: budgetObj, fields: [['recruitingK', 'Recruiting budget', 0, 1500]] }
      ],
      onSave: (v) => {
        ['prestige', 'academics', 'teamMorale'].forEach((k) => { school[k] = v[k]; });
        ['trainingCenter', 'weightRoom', 'rehabCenter', 'indoorTrack', 'alumniCenter'].forEach((k) => { school.facilities[k] = v[k]; });
        if (school.budget) {
          const delta = v.recruitingK * 1000 - (school.budget.recruiting || 0);
          school.budget.recruiting = v.recruitingK * 1000;
          school.budget.total = Math.max(0, (school.budget.total || 0) + delta);
          if (school.id === game.playerSchoolId && game.recruiting) {
            game.recruiting.budgetLeft = Math.max(0, (game.recruiting.budgetLeft || 0) + delta);
          }
        }
      },
      onBack: () => UI.showSchoolCard && UI.showSchoolCard(school, game)
    });
  };

  UI.godEditCoach = function (game, coach) {
    if (!coach) return;
    editor({
      title: Utils.escapeHtml(coach.fullName),
      sub: `${Utils.escapeHtml(coach.archetype || '')} · ${coach.role || 'Head'} coach`,
      sections: [
        { title: 'Coaching ratings', obj: coach, fields: [['recruiting', 'Recruiting', 1, 99], ['training', 'Training', 1, 99], ['peaking', 'Peaking', 1, 99], ['culture', 'Culture', 1, 99]] },
        { title: 'Career', obj: coach, fields: [['reputation', 'Reputation', 1, 99], ['hotSeat', 'Hot Seat heat', 0, 100], ['hotSeatYears', 'Hot Seat years', 0, 5]] }
      ],
      onSave: (v) => { Object.entries(v).forEach(([k, val]) => { coach[k] = val; }); },
      onBack: () => UI.openCoach && UI.openCoach(game, coach.id)
    });
  };
})();
