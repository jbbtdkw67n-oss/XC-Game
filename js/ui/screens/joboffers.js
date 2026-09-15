/*
 * Available Jobs popup (offseason job-offer picker).
 *
 * After the season ends and the coaching market opens (Week 16, the awards
 * week), the player is presented with a clean, tappable list of the open
 * programs already tracked in game.jobOffers — the same offers surfaced on the
 * Dashboard's job market — rendered as a full-screen picker: each program's
 * crest, its season record, and its Program Rating (prestige), sortable, with
 * a Continue action. The player selects a new program to take over, or leaves
 * the current program selected to stay put.
 *
 * Taking a job reuses the existing career machinery (Careers.acceptOffer for
 * direct offers/promotions, Careers.applyForJob for open-market chairs), so a
 * move from the popup behaves exactly like a move from the Dashboard.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  const STAY = '__stay__';

  // Per-open-popup state.
  let sortKey = 'prestige'; // prestige | record | name
  let selectedId = STAY;    // STAY (keep current job) or a schoolId

  function schoolColors(school) {
    if (school && Array.isArray(school.colors) && school.colors.length >= 2) return school.colors;
    const meta = (window.XCD.data.schoolMeta && school) ? window.XCD.data.schoolMeta(school.name) : null;
    return (meta && meta.colors) || ['#7a869a', '#c8d0dc'];
  }

  function crest(school, size) {
    const colors = schoolColors(school);
    const initial = ((school && school.name) || '?').trim().charAt(0) || '?';
    return `<span class="job-crest" style="width:${size}px; height:${size}px; background:${colors[0]}; font-size:${Math.round(size * 0.44)}px;">${Utils.escapeHtml(initial)}</span>`;
  }

  function ring(value, color, size) {
    return `<span class="job-ring" style="width:${size}px; height:${size}px; border-color:${color}; font-size:${Math.round(size * 0.34)}px;">${Math.round(value || 0)}</span>`;
  }

  // W–L for any program from the just-completed season — the same rule the
  // Dashboard uses for the player's record: in every meet, teams you beat are
  // wins and teams that beat you are losses (men's and women's races both).
  function seasonRecord(game, schoolId) {
    const s = game.season;
    let w = 0, l = 0;
    if (!s) return { w, l };
    Object.values(s.meets).forEach((meet) => {
      if (!meet.results) return;
      ['M', 'W'].forEach((g) => {
        const res = meet.results[g];
        if (!res || !res.teamScores) return;
        const mine = res.teamScores.find((t) => t.schoolId === schoolId);
        if (!mine) return;
        w += res.teamScores.length - mine.place;
        l += mine.place - 1;
      });
    });
    return { w, l };
  }

  function openOffers(game) {
    return (game.jobOffers && game.jobOffers.offers || []).filter((o) => !o.rejected);
  }

  function sortedOffers(game) {
    const arr = openOffers(game).slice();
    const recCache = {};
    const rec = (sid) => (recCache[sid] || (recCache[sid] = seasonRecord(game, sid)));
    if (sortKey === 'record') arr.sort((a, b) => rec(b.schoolId).w - rec(a.schoolId).w);
    else if (sortKey === 'name') arr.sort((a, b) => String(a.schoolName).localeCompare(String(b.schoolName)));
    else arr.sort((a, b) => (b.prestige || 0) - (a.prestige || 0));
    return arr;
  }

  // A clean row: crest, school name, season record, and the program-rating
  // ring — nothing else, matching the reference design. The move's details
  // (interest %, what you leave behind) live in the confirmation step.
  function rowHtml(game, o, selected) {
    const isStay = o.schoolId === STAY;
    const school = isStay ? game.getPlayerSchool() : (game.getSchool(o.schoolId) || { name: o.schoolName });
    const color = schoolColors(school)[0];
    const rec = seasonRecord(game, isStay ? game.playerSchoolId : o.schoolId);
    const sub = `${rec.w}-${rec.l}${isStay ? ' · Current' : ''}`;
    return `
      <div class="job-row${isStay ? ' current' : ''}${selected ? ' selected' : ''}" data-job="${isStay ? STAY : o.schoolId}">
        ${crest(school, 52)}
        <div class="job-row-body">
          <div class="job-row-name">${Utils.escapeHtml(school.name || o.schoolName)}</div>
          <div class="job-row-sub">${sub}</div>
        </div>
        ${ring(isStay ? school.prestige : o.prestige, color, 46)}
      </div>`;
  }

  function listHtml(game) {
    const stay = rowHtml(game, { schoolId: STAY }, selectedId === STAY);
    const offers = sortedOffers(game).map((o) => rowHtml(game, o, selectedId === o.schoolId)).join('');
    return stay + (offers || '<div style="color:var(--text-dim); padding:18px; text-align:center;">No open chairs this cycle — you can stay put.</div>');
  }

  function render(game) {
    const html = `
      <div class="job-popup">
        <div class="job-popup-head"><h2>Available Jobs</h2></div>
        <div class="job-sort">
          <span class="job-sort-label">Sort By:</span>
          <select id="job-sort-sel">
            <option value="prestige" ${sortKey === 'prestige' ? 'selected' : ''}>Program Rating</option>
            <option value="record" ${sortKey === 'record' ? 'selected' : ''}>Team Record</option>
            <option value="name" ${sortKey === 'name' ? 'selected' : ''}>School Name</option>
          </select>
        </div>
        <div class="job-list" id="job-list">${listHtml(game)}</div>
        <div class="job-popup-foot">
          <button class="btn primary pill" id="job-continue">→ Continue</button>
        </div>
      </div>`;
    UI.showModal(html, (modal) => wire(modal, game));
  }

  function wireRows(modal, game) {
    modal.querySelectorAll('[data-job]').forEach((row) => {
      row.addEventListener('click', () => {
        selectedId = row.dataset.job;
        modal.querySelectorAll('.job-row').forEach((r) => r.classList.toggle('selected', r === row));
      });
    });
  }

  function wire(modal, game) {
    const sel = modal.querySelector('#job-sort-sel');
    if (sel) sel.addEventListener('change', () => {
      sortKey = sel.value;
      const list = modal.querySelector('#job-list');
      if (list) { list.innerHTML = listHtml(game); wireRows(modal, game); }
    });
    wireRows(modal, game);
    const cont = modal.querySelector('#job-continue');
    if (cont) cont.addEventListener('click', () => onContinue(game));
  }

  function onContinue(game) {
    if (selectedId === STAY) {
      UI.closeModal();
      UI.toast(`You stay at ${game.getPlayerSchool().name}.`, 'success');
      return;
    }
    const target = game.getSchool(selectedId);
    const offer = openOffers(game).find((o) => o.schoolId === selectedId);
    if (!target || !offer) { UI.toast('That opening is no longer available.', 'error'); render(game); return; }
    const direct = offer.assistantRole || (game.jobOffers && game.jobOffers.promotion);

    UI.showModal(`
      <h2>${direct ? 'Take' : 'Apply for'} the ${Utils.escapeHtml(target.name)} job?</h2>
      <p style="color:var(--text-dim); margin-bottom:16px;">
        ${direct
          ? `You'll leave ${Utils.escapeHtml(game.getPlayerSchool().name)} immediately. Your career record travels with you; your roster, recruits, and captains stay behind.`
          : `Their interest in you is <strong>${offer.interest}%</strong> — that's your chance of landing the chair. If they pass, they'll hire someone else and the door closes for this cycle. Land it and you leave ${Utils.escapeHtml(game.getPlayerSchool().name)} immediately.`}
      </p>
      <div style="display:flex; gap:10px;">
        <button class="btn primary" id="job-confirm">${direct ? "Accept — Let's Build" : `Apply (${offer.interest}% chance)`}</button>
        <button class="btn" id="job-back">Back</button>
      </div>`, (modal) => {
      modal.querySelector('#job-confirm').addEventListener('click', () => {
        const result = direct
          ? window.XCD.engine.Careers.acceptOffer(game, selectedId)
          : window.XCD.engine.Careers.applyForJob(game, selectedId);
        UI.closeModal();
        UI.toast(result.message, result.ok ? 'success' : 'error');
        if (result.ok) {
          UI.renderShell();
        } else {
          // Passed over (or invalid): reflect the updated market and let the
          // player pick again or stay.
          selectedId = STAY;
          render(game);
        }
      });
      modal.querySelector('#job-back').addEventListener('click', () => render(game));
    });
  }

  /* Public: open the picker for the current offers. */
  UI.showJobOffersPopup = function (game) {
    if (!game.jobOffers || !openOffers(game).length) return false;
    game.jobOffers.popupSeen = true;
    sortKey = 'prestige';
    selectedId = STAY;
    render(game);
    return true;
  };

  /*
   * Show the picker once per offseason cycle when the market first opens (the
   * awards week / offseason), unless the player has already been shown it or
   * closed the market. Callers gate on the advance flow (framework.js).
   */
  UI.maybeShowJobOffers = function (game) {
    if (!game || game.seasonPhase !== 'Offseason') return false;
    if (!game.jobOffers || game.jobOffers.popupSeen) return false;
    if (!openOffers(game).length) return false;
    return UI.showJobOffersPopup(game);
  };
})();
