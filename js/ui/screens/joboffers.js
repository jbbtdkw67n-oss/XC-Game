/*
 * Available Jobs popup (offseason job-offer picker).
 *
 * After the season ends and the coaching market opens (Week 16, the awards
 * week), the player is presented with every open program already tracked in
 * game.jobOffers — the same offers surfaced on the Dashboard's job market —
 * as a full-screen picker. Each row shows the program's crest, the kind of
 * move, division/conference, season record, the school's interest in you,
 * and its Program Rating (prestige). Tapping a row expands a side-by-side
 * comparison with your current program (prestige, roster strength, budget,
 * facilities, academics, pedigree, expectations) plus the key things to weigh.
 *
 * The player can take/apply for the selected job, turn down every offer and
 * stay put (closes the market for this cycle), or decide later from the
 * Dashboard.
 *
 * Taking a job reuses the existing career machinery (Careers.acceptOffer for
 * direct offers/promotions, Careers.applyForJob for open-market chairs), and
 * turning offers down reuses Careers.declineOffers, so every choice behaves
 * exactly like the same choice from the Dashboard.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  // Per-open-popup state.
  let sortKey = 'prestige'; // prestige | interest | record | name
  let selectedId = null;    // schoolId of the expanded offer, or null

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
    return `<span class="job-ring" style="width:${size}px; height:${size}px; border-color:${color}; font-size:${Math.round(size * 0.34)}px;" title="Program Rating (prestige)">${Math.round(value || 0)}</span>`;
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

  function nationalRanks(game, schoolId) {
    const r = game.rankings;
    const find = (g) => { const x = r && r[g] && r[g].find((e) => e.schoolId === schoolId); return x ? x.rank : null; };
    return { M: find('M'), W: find('W') };
  }

  // Top-five race strength of each squad — what you'd actually inherit.
  function rosterStrength(game, school) {
    const R = window.XCD.engine.Rankings;
    if (!R || !school || !school.rosterM) return { M: 0, W: 0 };
    return { M: Math.round(R.teamStrength(game, school, 'M')), W: Math.round(R.teamStrength(game, school, 'W')) };
  }

  // Where the program's prestige says it "should" finish nationally — the bar
  // the athletic director will measure the new coach against.
  function expectedFinish(game, school) {
    const C = window.XCD.engine.Coaching;
    const total = C && C.divisionSize ? C.divisionSize(game, school.division || 'DI') : 300;
    return Math.max(1, Math.round((1 - (school.prestige || 0) / 100) * total));
  }

  function openOffers(game) {
    return (game.jobOffers && game.jobOffers.offers || []).filter((o) => !o.rejected);
  }

  function isDirect(game, o) {
    return !!(o.assistantRole || (game.jobOffers && game.jobOffers.promotion));
  }

  function interestOf(o) { return o.interest ?? o.repFit ?? 50; }

  function interestColor(v) {
    return v >= 60 ? 'var(--success)' : v >= 30 ? 'var(--warning)' : 'var(--danger)';
  }

  function kindClass(kind) {
    if (kind === 'Dream job' || kind === 'Jump to DI' || kind === 'Elite assistant post') return 'r-elite';
    if (kind === 'Step up' || kind === 'Bigger assistant job' || /^Head coach/.test(kind || '')) return 'r-great';
    if (kind === 'Lateral move') return 'r-avg';
    return 'r-poor';
  }

  function sortedOffers(game) {
    const arr = openOffers(game).slice();
    const recCache = {};
    const rec = (sid) => (recCache[sid] || (recCache[sid] = seasonRecord(game, sid)));
    if (sortKey === 'record') arr.sort((a, b) => rec(b.schoolId).w - rec(a.schoolId).w);
    else if (sortKey === 'interest') arr.sort((a, b) => (isDirect(game, b) ? 101 : interestOf(b)) - (isDirect(game, a) ? 101 : interestOf(a)));
    else if (sortKey === 'name') arr.sort((a, b) => String(a.schoolName).localeCompare(String(b.schoolName)));
    else arr.sort((a, b) => (b.prestige || 0) - (a.prestige || 0));
    return arr;
  }

  const money = (v) => (v ? '$' + Math.round(v / 1000).toLocaleString() + 'k' : '—');

  // ▲/▼ versus your current program. `lowerIsBetter` for ranks.
  function delta(v, cur, { lowerIsBetter = false, fmt = (x) => x } = {}) {
    if (v === null || v === undefined || cur === null || cur === undefined) return '';
    const d = v - cur;
    if (Math.abs(d) < 0.5) return '<span class="job-delta even">= yours</span>';
    const good = lowerIsBetter ? d < 0 : d > 0;
    // The arrow reads as better/worse (a lower rank number is ▲ better).
    return `<span class="job-delta ${good ? 'up' : 'down'}">${good ? '▲' : '▼'} ${fmt(Math.abs(d))}</span>`;
  }

  function locationOf(school) {
    return [school.city, school.state].filter(Boolean).join(', ') || school.region || '';
  }

  /* ---------------- Current program (reference, not an option) ---------------- */

  function currentHtml(game) {
    const school = game.getPlayerSchool();
    const rec = seasonRecord(game, school.id);
    const color = schoolColors(school)[0];
    return `
      <div class="job-current">
        ${crest(school, 40)}
        <div class="job-row-body">
          <div class="job-current-label">Your program</div>
          <div class="job-row-name" style="font-size:15px;">${Utils.escapeHtml(school.name)}</div>
          <div class="job-row-sub">${school.division || 'DI'} · ${Utils.escapeHtml(school.conference || '')} · ${rec.w}-${rec.l}</div>
        </div>
        ${ring(school.prestige, color, 38)}
      </div>`;
  }

  /* ---------------- Offer rows ---------------- */

  function rowHtml(game, o, selected) {
    const school = game.getSchool(o.schoolId) || { name: o.schoolName };
    const color = schoolColors(school)[0];
    const rec = seasonRecord(game, o.schoolId);
    const direct = isDirect(game, o);
    const interest = interestOf(o);
    const chance = direct
      ? '<span class="job-chance" style="color:var(--success);" title="They came to you — the job is yours to take">Offer</span>'
      : `<span class="job-chance" style="color:${interestColor(interest)};" title="The school's interest in you — your chance of landing the job if you apply">${interest}%<small>interest</small></span>`;
    return `
      <div class="job-row${selected ? ' selected' : ''}" data-job="${o.schoolId}">
        <div class="job-row-main">
          ${crest(school, 48)}
          <div class="job-row-body">
            <div class="job-row-name">${o.kind === 'Dream job' ? '🌟 ' : ''}${Utils.escapeHtml(school.name || o.schoolName)}</div>
            <div class="job-row-sub">
              <span class="rating ${kindClass(o.kind)} job-kind">${Utils.escapeHtml(o.kind || 'Opening')}</span>
              ${o.division || 'DI'} · ${Utils.escapeHtml(o.conference || '')} · ${rec.w}-${rec.l}
            </div>
          </div>
          ${chance}
          ${ring(o.prestige, color, 44)}
        </div>
        ${selected ? detailHtml(game, o, school) : ''}
      </div>`;
  }

  // The decision panel for the expanded offer: a comparison grid against the
  // player's current program plus plain-language things to weigh.
  function detailHtml(game, o, school) {
    const cur = game.getPlayerSchool();
    const direct = isDirect(game, o);
    const interest = interestOf(o);
    const ranks = nationalRanks(game, o.schoolId);
    const curRanks = nationalRanks(game, cur.id);
    const str = rosterStrength(game, school);
    const curStr = rosterStrength(game, cur);
    const exp = expectedFinish(game, school);
    const bestRank = (r) => Math.min(r.M || 999, r.W || 999);
    const ob = bestRank(ranks), cb = bestRank(curRanks);
    const loc = locationOf(school);
    const head = o.assistantRole && school.coachId ? game.getCoach(school.coachId) : null;
    const rosterM = (school.rosterM || []).length, rosterW = (school.rosterW || []).length;

    const stat = (label, value, d, sub) => `
      <div class="job-stat">
        <div class="job-stat-label">${label}</div>
        <div class="job-stat-value">${value} ${d || ''}</div>
        ${sub ? `<div class="job-stat-sub">${sub}</div>` : ''}
      </div>`;

    const grid = [
      stat('Program Rating', school.prestige ?? o.prestige, delta(school.prestige ?? o.prestige, cur.prestige), `yours: ${cur.prestige}`),
      stat('Roster Strength', `${str.M} M · ${str.W} W`,
        delta(str.M + str.W, curStr.M + curStr.W, { fmt: (x) => Math.round(x / 2) }),
        `yours: ${curStr.M} M · ${curStr.W} W${rosterM + rosterW ? ` · ${rosterM}/${rosterW} athletes` : ''}`),
      stat('Final Nat. Rank', `${ranks.M ? '#' + ranks.M : '—'} M · ${ranks.W ? '#' + ranks.W : '—'} W`,
        // Ranks are per division, so only compare like with like.
        ob < 999 && cb < 999 && (o.division || 'DI') === (cur.division || 'DI') ? delta(ob, cb, { lowerIsBetter: true }) : '',
        `yours: ${curRanks.M ? '#' + curRanks.M : '—'} M · ${curRanks.W ? '#' + curRanks.W : '—'} W`),
      stat('Budget', money(o.budget ?? (school.budget && school.budget.total)),
        delta(o.budget ?? (school.budget && school.budget.total), cur.budget && cur.budget.total, { fmt: (x) => money(x) }),
        `yours: ${money(cur.budget && cur.budget.total)}`),
      stat('Facilities', o.facilities ?? school.facilitiesOverall ?? '—',
        delta(o.facilities ?? school.facilitiesOverall, cur.facilitiesOverall), `yours: ${cur.facilitiesOverall ?? '—'}`),
      stat('Academics', school.academics ?? o.academics ?? '—',
        delta(school.academics ?? o.academics, cur.academics), `yours: ${cur.academics ?? '—'}`),
      stat('Titles', `${o.natTitles || 0} 🏆 national`, '',
        `${o.confTitles || 0} conference title${o.confTitles === 1 ? '' : 's'}`),
      stat('Expectations', `~#${exp} in ${Utils.escapeHtml(o.division || 'DI')}`, '',
        `${(o.expectations ?? 100) >= 100 ? 'High' : (o.expectations ?? 100) >= 80 ? 'Moderate' : 'Low'} hot-seat pressure`)
    ].join('');

    // Things to weigh — plain-language pros and cons of this particular move.
    const pros = [], cons = [];
    if (direct) pros.push(o.assistantRole ? 'Direct offer — the seat is yours if you want it' : 'Direct offer — no application roll');
    if (!o.assistantRole && game.isAssistant && game.isAssistant()) pros.push('Promotion to head coach — you take over training, scheduling, and race strategy');
    else if (interest >= 60) pros.push(`Strong interest (${interest}%) — good odds they hire you`);
    else if (interest >= 30) cons.push(`Coin flip (${interest}%) — if they pass, this door closes for the cycle`);
    else cons.push(`Long shot (${interest}%) — they will most likely go another direction`);
    const pd = (school.prestige ?? o.prestige) - cur.prestige;
    if (pd >= 8) pros.push(`Bigger name (+${pd} prestige) — stronger recruiting pull`);
    else if (pd <= -8) cons.push(`Step down in prestige (${pd}) — harder to land top recruits`);
    const sd = (str.M + str.W) - (curStr.M + curStr.W);
    if (sd >= 6) pros.push('Inherits a stronger roster than yours — ready to win now');
    else if (sd <= -6) cons.push('Weaker roster than yours — expect a rebuild');
    const bd = (o.budget ?? 0) - ((cur.budget && cur.budget.total) || 0);
    if ((cur.budget && cur.budget.total) && bd / cur.budget.total >= 0.2) pros.push(`Bigger budget (+${money(bd)})`);
    else if ((cur.budget && cur.budget.total) && bd / cur.budget.total <= -0.2) cons.push(`Smaller budget (${'−' + money(-bd)})`);
    const fd = (o.facilities ?? school.facilitiesOverall ?? 0) - (cur.facilitiesOverall ?? 0);
    if (fd >= 8) pros.push(`Better facilities (+${fd}) — faster development and recruiting appeal`);
    else if (fd <= -8) cons.push(`Worse facilities (${fd})`);
    if ((o.natTitles || 0) > 0) pros.push(`Championship pedigree — ${o.natTitles} national title${o.natTitles === 1 ? '' : 's'}`);
    if ((o.division || 'DI') !== (cur.division || 'DI')) {
      const D = window.XCD.data;
      const lbl = (D.DIVISIONS && D.DIVISIONS[o.division] && D.DIVISIONS[o.division].label) || o.division;
      if (o.division === 'DI') pros.push(`Moves you up to ${lbl} — the biggest stage`);
      else cons.push(`Drops you to ${lbl} — fewer scholarships and a smaller stage`);
    }
    if (exp <= 25) cons.push(`Blue-blood expectations — anything short of a top-${Math.max(5, exp + 5)} finish puts you on the hot seat`);
    if (o.assistantRole) cons.push(`Assistant role — ${head ? Utils.escapeHtml(head.fullName) : 'the head coach'} runs training and races; you recruit`);
    if (!o.assistantRole) cons.push(`You leave ${Utils.escapeHtml(cur.name)}'s roster, recruits, and captains behind`);

    const list = (items, cls, mark) => items.map((t) =>
      `<li class="${cls}"><span class="to-mark">${mark}</span><span>${t}</span></li>`).join('');

    return `
      <div class="job-detail">
        <div class="job-detail-meta">
          ${loc ? `📍 ${Utils.escapeHtml(loc)}` : ''}${school.mascot ? ` · ${Utils.escapeHtml(school.mascot)}` : ''}
          ${o.assistantRole ? ` · Assistant coach${head ? ` under ${Utils.escapeHtml(head.fullName)}` : ''}` : ' · Head coach'}
        </div>
        <div class="job-stats">${grid}</div>
        <div class="tradeoffs job-weigh">
          <div class="to-col"><div class="to-head pro">Why take it</div><ul>${list(pros, 'pro', '+') || '<li class="pro"><span class="to-mark">·</span><span>No clear upside over your current job</span></li>'}</ul></div>
          <div class="to-col"><div class="to-head con">Why stay</div><ul>${list(cons, 'con', '−')}</ul></div>
        </div>
      </div>`;
  }

  function listHtml(game) {
    const offers = sortedOffers(game).map((o) => rowHtml(game, o, selectedId === o.schoolId)).join('');
    return offers || '<div style="color:var(--text-dim); padding:18px; text-align:center;">No open chairs this cycle — you can stay put.</div>';
  }

  function continueLabel(game) {
    const offer = selectedId && openOffers(game).find((o) => o.schoolId === selectedId);
    if (!offer) return 'Select a job';
    return isDirect(game, offer) ? 'Take This Job →' : `Apply (${interestOf(offer)}% chance) →`;
  }

  function render(game) {
    const n = openOffers(game).length;
    const promo = game.jobOffers && game.jobOffers.promotion;
    const html = `
      <div class="job-popup">
        <div class="job-popup-head">
          <h2>Available Jobs</h2>
          <div class="job-popup-intro">
            ${promo
              ? `${n} program${n === 1 ? ' wants' : 's want'} you this offseason. Tap a job to compare it with your program — each is a direct offer, yours to take.`
              : `${n} open chair${n === 1 ? '' : 's'} this offseason. Tap a job to compare it with your program. <strong>Interest</strong> is your chance of being hired if you apply.`}
          </div>
        </div>
        ${currentHtml(game)}
        <div class="job-sort">
          <span class="job-sort-label">Sort By:</span>
          <select id="job-sort-sel">
            <option value="prestige" ${sortKey === 'prestige' ? 'selected' : ''}>Program Rating</option>
            <option value="interest" ${sortKey === 'interest' ? 'selected' : ''}>Interest in You</option>
            <option value="record" ${sortKey === 'record' ? 'selected' : ''}>Team Record</option>
            <option value="name" ${sortKey === 'name' ? 'selected' : ''}>School Name</option>
          </select>
        </div>
        <div class="job-list" id="job-list">${listHtml(game)}</div>
        <div class="job-popup-foot">
          <button class="btn danger pill" id="job-decline">✕ Turn Down Offers</button>
          <button class="btn primary pill" id="job-continue" ${selectedId ? '' : 'disabled'}>${Utils.escapeHtml(continueLabel(game))}</button>
          <button class="job-later" id="job-later">Decide later from the Dashboard</button>
        </div>
      </div>`;
    UI.showModal(html, (modal) => wire(modal, game));
  }

  function refreshList(modal, game) {
    const list = modal.querySelector('#job-list');
    if (list) { list.innerHTML = listHtml(game); wireRows(modal, game); }
    const cont = modal.querySelector('#job-continue');
    if (cont) { cont.disabled = !selectedId; cont.textContent = continueLabel(game); }
    const sel = selectedId && modal.querySelector(`.job-row[data-job="${selectedId}"]`);
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }

  function wireRows(modal, game) {
    modal.querySelectorAll('.job-row[data-job]').forEach((row) => {
      row.querySelector('.job-row-main').addEventListener('click', () => {
        // Tap again to collapse.
        selectedId = selectedId === row.dataset.job ? null : row.dataset.job;
        refreshList(modal, game);
      });
    });
  }

  function wire(modal, game) {
    const sel = modal.querySelector('#job-sort-sel');
    if (sel) sel.addEventListener('change', () => { sortKey = sel.value; refreshList(modal, game); });
    wireRows(modal, game);
    modal.querySelector('#job-continue').addEventListener('click', () => onContinue(game));
    modal.querySelector('#job-decline').addEventListener('click', () => onDecline(game));
    modal.querySelector('#job-later').addEventListener('click', () => {
      UI.closeModal();
      UI.toast(`Offers stay open on the Dashboard until Week ${game.jobOffers.expiresWeek}.`, 'info');
    });
  }

  // Turn down every offer and stay put — closes the market for this cycle.
  function onDecline(game) {
    const school = game.getPlayerSchool();
    UI.showModal(`
      <h2>Turn down all offers?</h2>
      <p style="color:var(--text-dim); margin-bottom:16px;">
        You'll recommit to <strong>${Utils.escapeHtml(school.name)}</strong> and the coaching market closes for you
        this offseason — no more applications or offers until next year's hiring cycle.
      </p>
      <div style="display:flex; gap:10px;">
        <button class="btn primary" id="job-decline-confirm">Stay at ${Utils.escapeHtml(school.name)}</button>
        <button class="btn" id="job-back">Back</button>
      </div>`, (modal) => {
      modal.querySelector('#job-decline-confirm').addEventListener('click', () => {
        window.XCD.engine.Careers.declineOffers(game);
        UI.closeModal();
        UI.toast(`You turn down the offers and stay at ${school.name}.`, 'success');
        UI.renderShell();
      });
      modal.querySelector('#job-back').addEventListener('click', () => render(game));
    });
  }

  function onContinue(game) {
    if (!selectedId) return;
    const target = game.getSchool(selectedId);
    const offer = openOffers(game).find((o) => o.schoolId === selectedId);
    if (!target || !offer) { UI.toast('That opening is no longer available.', 'error'); selectedId = null; render(game); return; }
    const direct = isDirect(game, offer);

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
          // player pick again or turn the rest down.
          selectedId = null;
          if (openOffers(game).length) render(game);
          else UI.renderShell();
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
    selectedId = null;
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
