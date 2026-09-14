/*
 * News screen (feature update): three tabs.
 *   • News   — the running news log for the dynasty (as before).
 *   • Awards — the season's honors, filterable National / Conference and by
 *              division, with All-Conference teams, the individual awards, and
 *              (after the NCAA meet) the All-America teams, all as clean,
 *              clickable player cards, topped by an original sports-talk recap.
 *   • Watch  — the preseason outlook: each division's predicted podium and the
 *              runners projected to fight for the national title, plus a dark
 *              horse and a program on the rise, topped by an original
 *              sports-talk preview. Everything is a tappable player/team card.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const DIV_SHORT = { DI: 'D1', DII: 'D2', DIII: 'D3' };

  // Persisted tab/filter state (survives re-renders within a session).
  let activeTab = 'news';       // news | awards | watch
  let awardScope = 'national';  // national | conference
  let awardDiv = null;          // defaults to the player's division
  let awardConf = null;         // selected conference (conference scope)
  let watchDiv = null;          // defaults to the player's division

  /* ---------------- shared helpers ---------------- */
  function playerDivision(game) {
    return (game.getPlayerSchool() && game.getPlayerSchool().division) || 'DI';
  }
  function divisionsPresent(game) {
    const set = new Set();
    Object.values(game.world.schools).forEach((s) => set.add(s.division || 'DI'));
    return ['DI', 'DII', 'DIII'].filter((d) => set.has(d));
  }
  function conferencesIn(game, division) {
    const set = new Set();
    Object.values(game.world.schools).forEach((s) => {
      if ((s.division || 'DI') === division) set.add(s.conference);
    });
    return Array.from(set).sort();
  }
  function divLabel(division) {
    return (window.XCD.data.divisionFor(division) || {}).label || division;
  }

  // A clean, clickable player card. `x` = { athleteId, name, school, classYear }.
  function playerCard(game, x, opts = {}) {
    if (!x) return '';
    const person = game.getAthlete(x.athleteId) || { name: x.name, gender: opts.gender || 'M' };
    const rankTone = opts.rank === 1 ? ' g1' : opts.rank === 2 ? ' g2' : opts.rank === 3 ? ' g3' : '';
    const rank = opts.rank != null ? `<span class="pc-rank${rankTone}">${opts.badge || opts.rank}</span>` : (opts.badge ? `<span class="pc-rank">${opts.badge}</span>` : '');
    const mine = x.schoolId && x.schoolId === game.playerSchoolId ? ' mine' : '';
    const sub = [x.school, opts.showClass && x.classYear ? x.classYear : null].filter(Boolean).join(' • ');
    return `<div class="pcard${mine}" data-ath="${x.athleteId || ''}" data-ath-name="${Utils.escapeHtml(x.name)}">
      ${rank}
      ${UI.avatar(person, { size: 30, gender: person.gender })}
      <div class="pc-body">
        <div class="pc-name">${x.generational ? '⭐ ' : ''}${Utils.escapeHtml(x.name)}</div>
        <div class="pc-sub">${Utils.escapeHtml(sub)}</div>
      </div>
    </div>`;
  }

  // A clean, clickable team card. `t` = { schoolId, name, conference }.
  function teamCard(game, t, opts = {}) {
    if (!t) return '';
    const school = game.getSchool(t.schoolId) || { name: t.name, conference: t.conference };
    const rankTone = opts.rank === 1 ? ' g1' : opts.rank === 2 ? ' g2' : opts.rank === 3 ? ' g3' : '';
    const rank = opts.rank != null ? `<span class="pc-rank${rankTone}">${opts.badge || opts.rank}</span>` : '';
    const mine = t.schoolId && t.schoolId === game.playerSchoolId ? ' mine' : '';
    const sub = school.conference || t.conference || '';
    return `<div class="pcard${mine}" data-school="${t.schoolId || ''}">
      ${rank}
      ${UI.kitSwatch ? UI.kitSwatch(school, 24) : ''}
      <div class="pc-body">
        <div class="pc-name">${Utils.escapeHtml(school.name || t.name)}</div>
        <div class="pc-sub">${Utils.escapeHtml(sub)}</div>
      </div>
    </div>`;
  }

  // Wire every card/name to open its full profile (shared with History).
  function wireProfiles(game, el) {
    el.querySelectorAll('[data-ath]').forEach((n) => {
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        if (n.dataset.ath) UI.openAthlete(game, n.dataset.ath, n.dataset.athName || '');
      });
    });
    el.querySelectorAll('[data-school]').forEach((n) => {
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = game.getSchool(n.dataset.school);
        if (s && UI.showSchoolCard) UI.showSchoolCard(s, game);
      });
    });
    el.querySelectorAll('[data-coach]').forEach((n) => {
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        UI.openCoach(game, n.dataset.coach, n.dataset.coachName || '');
      });
    });
  }

  /* ================= NEWS TAB ================= */
  function renderNews(game, body) {
    body.innerHTML = `
      <div class="card">
        ${game.newsLog.length
          ? game.newsLog.map((n) => `
              <div class="news-item">
                <span class="when">Wk ${n.week}, ${n.year}</span>${Utils.escapeHtml(n.text)}
              </div>`).join('')
          : '<div style="color:var(--text-dim);">Nothing has happened yet. Advance the week to get the season moving.</div>'}
      </div>`;
  }

  /* ================= AWARDS TAB ================= */
  // Which season the Awards tab shows: the current year once any of its honors
  // exist (conference preview or the full slate), else the latest completed.
  function awardsSeason(game) {
    const cur = game.year;
    if ((game.history.awards || {})[cur] || (game.history.confHonors || {})[cur]) return cur;
    const yrs = Object.keys(game.history.awards || {}).map(Number);
    return yrs.length ? Math.max(...yrs) : cur;
  }

  // Resolve national + conference award data for a division/year, preferring
  // the authoritative post-nationals slate and falling back to the
  // post-conference preview for conference honors.
  function awardsFor(game, year, division) {
    const A = (game.history.awards || {})[year];
    const C = (game.history.confHonors || {})[year];
    const nat = A ? ((A.divisions || {})[division] || (division === 'DI' ? A : null)) : null;
    // Conference honors merge two sources: the 4-year confHonors preview holds
    // the complete All-Conference teams + Runner/Freshman of the Year for EVERY
    // conference; the permanent awards ledger holds the season-end Coach of the
    // Year. Merge so the conference view shows the full slate.
    const preview = C ? (((C.divisions || {})[division] || {}).conferences || null) : null;
    const authored = nat && nat.conferences && Object.keys(nat.conferences).length ? nat.conferences : null;
    let confMap = null;
    if (preview || authored) {
      confMap = {};
      const confs = new Set([...Object.keys(preview || {}), ...Object.keys(authored || {})]);
      confs.forEach((conf) => {
        const p = (preview || {})[conf] || {};
        const a = (authored || {})[conf] || {};
        ['M', 'W'].forEach((g) => {
          const pg = p[g] || {};
          const ag = a[g] || {};
          const merged = {
            runnerOfYear: pg.runnerOfYear || ag.runnerOfYear || null,
            freshmanOfYear: pg.freshmanOfYear || ag.freshmanOfYear || null,
            coachOfYear: ag.coachOfYear || null,
            allConference: pg.allConference || ag.allConference || []
          };
          if (merged.runnerOfYear || merged.coachOfYear || merged.allConference.length) {
            (confMap[conf] = confMap[conf] || {})[g] = merged;
          }
        });
      });
      if (!Object.keys(confMap).length) confMap = null;
    }
    // National honors are present once the NCAA meet has produced them —
    // detected by real content so older saves (no `stage` marker) still work.
    const hasContent = (s) => !!(s && (s.runnerOfYear || (s.allAmericans && s.allAmericans.length)));
    const hasNational = !!(nat && (hasContent(nat.M) || hasContent(nat.W)));
    return { nat, confMap, hasNational };
  }

  function awardLine(label, valueHtml) {
    if (!valueHtml) return '';
    return `<div class="award-line"><span class="al-label">${label}</span><span class="al-val">${valueHtml}</span></div>`;
  }
  function nameLink(x) {
    if (!x) return '';
    return `<span class="clk" data-ath="${x.athleteId || ''}" data-ath-name="${Utils.escapeHtml(x.name)}">${Utils.escapeHtml(x.name)}</span> <span style="color:var(--text-faint);">— ${Utils.escapeHtml(x.school)}</span>`;
  }
  function coachLink(x) {
    if (!x) return '';
    return `<span class="clk" ${x.coachId ? `data-coach="${x.coachId}"` : ''} data-coach-name="${Utils.escapeHtml(x.name)}">${Utils.escapeHtml(x.name)}</span> <span style="color:var(--text-faint);">— ${Utils.escapeHtml(x.school)}</span>`;
  }
  function teamGrid(game, list, opts) {
    if (!list || !list.length) return '';
    return `<div class="pcard-grid">${list.map((x, i) => playerCard(game, x, Object.assign({ rank: i + 1 }, opts))).join('')}</div>`;
  }

  function renderAwards(game, body) {
    if (awardDiv == null) awardDiv = playerDivision(game);
    const year = awardsSeason(game);
    const divs = divisionsPresent(game);
    const recap = ((game.history.awardsRecap || {})[year] || {})[awardDiv];

    const scopeTabs = `<div class="pill-tabs">
        <button data-ascope="national" class="${awardScope === 'national' ? 'active' : ''}">National</button>
        <button data-ascope="conference" class="${awardScope === 'conference' ? 'active' : ''}">Conference</button>
      </div>`;
    const divTabs = `<div class="pill-tabs">
        ${divs.map((d) => `<button data-adiv="${d}" class="${awardDiv === d ? 'active' : ''}">${DIV_SHORT[d]}</button>`).join('')}
      </div>`;

    let confSelector = '';
    if (awardScope === 'conference') {
      const confs = conferencesIn(game, awardDiv);
      if (awardConf == null || !confs.includes(awardConf)) awardConf = confs[0] || null;
      confSelector = confs.length
        ? `<select class="search-input" id="award-conf" style="max-width:240px;">
            ${confs.map((c) => `<option value="${Utils.escapeHtml(c)}" ${c === awardConf ? 'selected' : ''}>${Utils.escapeHtml(c)}</option>`).join('')}
          </select>`
        : '';
    }

    const data = awardsFor(game, year, awardDiv);
    let content = '';

    if (awardScope === 'national') {
      if (!data.hasNational) {
        content = `<div class="card" style="color:var(--text-dim);">National honors and the All-America teams are announced after the NCAA ${divLabel(awardDiv)} Championships. Conference honors are available now under the Conference filter once the conference meets are run.</div>`;
      } else {
        content = ['M', 'W'].map((g) => {
          const slate = data.nat[g];
          if (!slate) return '';
          const gLabel = g === 'M' ? 'Men' : 'Women';
          const aa = slate.allAmericans || [];
          return `<div class="card" style="margin-bottom:16px;">
            <h2>${gLabel} — ${divLabel(awardDiv)}</h2>
            <div class="award-slate">
              ${awardLine('Runner of the Year', nameLink(slate.runnerOfYear))}
              ${awardLine('Freshman of the Year', nameLink(slate.freshmanOfYear))}
              ${awardLine('Coach of the Year', coachLink(slate.coachOfYear))}
            </div>
            ${aa.length ? `<div class="news-section-label">🇺🇸 All-America Team (${aa.length})</div>${teamGrid(game, aa, { gender: g })}` : ''}
            ${slate.academicAllAmericans && slate.academicAllAmericans.length ? `<div class="news-section-label">🎓 Academic All-Americans</div>${teamGrid(game, slate.academicAllAmericans, { gender: g, rank: null })}` : ''}
          </div>`;
        }).join('');
      }
    } else { // conference scope
      if (!data.confMap || !awardConf || !data.confMap[awardConf]) {
        content = `<div class="card" style="color:var(--text-dim);">Conference honors for ${divLabel(awardDiv)} are announced after the conference championships are run.</div>`;
      } else {
        const cb = data.confMap[awardConf];
        content = ['M', 'W'].map((g) => {
          const slate = cb[g];
          if (!slate) return '';
          const gLabel = g === 'M' ? 'Men' : 'Women';
          const allConf = slate.allConference || [];
          return `<div class="card" style="margin-bottom:16px;">
            <h2>${gLabel} — ${Utils.escapeHtml(awardConf)}</h2>
            <div class="award-slate">
              ${awardLine('Runner of the Year', nameLink(slate.runnerOfYear))}
              ${awardLine('Freshman of the Year', nameLink(slate.freshmanOfYear))}
              ${awardLine('Coach of the Year', coachLink(slate.coachOfYear))}
            </div>
            ${allConf.length ? `<div class="news-section-label">🏅 All-Conference Team (${allConf.length})</div>${teamGrid(game, allConf, { gender: g })}` : ''}
          </div>`;
        }).join('') || `<div class="card" style="color:var(--text-dim);">No ${Utils.escapeHtml(awardConf)} honors recorded for this season yet.</div>`;
      }
    }

    body.innerHTML = `
      <div class="news-subtabs">${scopeTabs}${divTabs}${confSelector}</div>
      ${recap ? `<div class="talk-blurb">${Utils.escapeHtml(recap)}</div>` : ''}
      <div style="color:var(--text-faint); font-size:12px; margin-bottom:12px;">${year} season${year !== game.year ? ' (most recent completed)' : ''}</div>
      ${content}`;

    body.querySelectorAll('[data-ascope]').forEach((b) => b.addEventListener('click', () => { awardScope = b.dataset.ascope; render(UI._newsContainer); }));
    body.querySelectorAll('[data-adiv]').forEach((b) => b.addEventListener('click', () => { awardDiv = b.dataset.adiv; awardConf = null; render(UI._newsContainer); }));
    const confSel = body.querySelector('#award-conf');
    if (confSel) confSel.addEventListener('change', () => { awardConf = confSel.value; render(UI._newsContainer); });
    wireProfiles(game, body);
  }

  /* ================= WATCH TAB ================= */
  function renderWatch(game, body) {
    if (watchDiv == null) watchDiv = playerDivision(game);
    const preds = game.season && game.season.predictions;
    const divs = divisionsPresent(game);

    const divTabs = `<div class="news-subtabs"><div class="pill-tabs">
        ${divs.map((d) => `<button data-wdiv="${d}" class="${watchDiv === d ? 'active' : ''}">${DIV_SHORT[d]}</button>`).join('')}
      </div></div>`;

    if (!preds || !preds.divisions || !preds.divisions[watchDiv]) {
      body.innerHTML = `${divTabs}<div class="card" style="color:var(--text-dim);">The season outlook publishes at the start of each season. Advance into a new season to see the projected podiums and title contenders.</div>`;
      body.querySelectorAll('[data-wdiv]').forEach((b) => b.addEventListener('click', () => { watchDiv = b.dataset.wdiv; render(UI._newsContainer); }));
      return;
    }

    const slate = preds.divisions[watchDiv];
    const genderBlock = (g) => {
      const gs = slate[g] || { podium: [], contenders: [] };
      const gLabel = g === 'M' ? 'Men' : 'Women';
      const podium = (gs.podium || []).map((t, i) => teamCard(game, t, { rank: i + 1 })).join('');
      const contenders = (gs.contenders || []).map((c, i) => playerCard(game, c, { rank: i + 1, showClass: true, gender: g })).join('');
      return `<div class="card" style="margin-bottom:16px;">
        <h2>${gLabel} — ${divLabel(watchDiv)}</h2>
        <div class="news-section-label">🏆 Predicted Podium</div>
        ${podium ? `<div class="pcard-grid">${podium}</div>` : '<div style="color:var(--text-dim);">No teams to project yet.</div>'}
        <div class="news-section-label">🎯 Title Contenders</div>
        ${contenders ? `<div class="pcard-grid">${contenders}</div>` : '<div style="color:var(--text-dim);">No individual projections yet.</div>'}
      </div>`;
    };

    const darkhorse = slate.darkhorse
      ? `<div class="watch-callout"><span class="wc-tag">Dark horse</span>${teamCard(game, slate.darkhorse)}</div>`
      : '';
    const rising = slate.rising
      ? `<div class="watch-callout rise"><span class="wc-tag">On the rise</span>${teamCard(game, slate.rising)}</div>`
      : '';

    body.innerHTML = `
      ${divTabs}
      ${slate.writeup ? `<div class="talk-blurb">${Utils.escapeHtml(slate.writeup)}</div>` : ''}
      ${genderBlock('M')}
      ${genderBlock('W')}
      ${(darkhorse || rising) ? `<div class="card"><h2>Storylines to Watch</h2>${darkhorse}${rising}</div>` : ''}`;

    body.querySelectorAll('[data-wdiv]').forEach((b) => b.addEventListener('click', () => { watchDiv = b.dataset.wdiv; render(UI._newsContainer); }));
    wireProfiles(game, body);
  }

  /* ================= ROUTER ================= */
  function render(container) {
    UI._newsContainer = container;
    const game = UI.state.game;
    container.innerHTML = `
      <div class="screen-header">
        <h1>News</h1>
        <div class="actions">
          <div class="pill-tabs">
            <button data-ntab="news" class="${activeTab === 'news' ? 'active' : ''}">📰 News</button>
            <button data-ntab="awards" class="${activeTab === 'awards' ? 'active' : ''}">🏅 Awards</button>
            <button data-ntab="watch" class="${activeTab === 'watch' ? 'active' : ''}">🔭 Teams to Watch</button>
          </div>
        </div>
      </div>
      <div id="news-body"></div>`;

    const body = container.querySelector('#news-body');
    if (activeTab === 'awards') renderAwards(game, body);
    else if (activeTab === 'watch') renderWatch(game, body);
    else renderNews(game, body);

    container.querySelectorAll('[data-ntab]').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.ntab; render(container); });
    });
  }

  UI.screens.news = { render };
})();
