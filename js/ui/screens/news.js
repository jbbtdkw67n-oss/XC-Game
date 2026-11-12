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

  UI.playerCardHtml = (game, x, opts) => playerCard(game, x, opts);

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

  /* ================= NEWS TAB ================= *
   * The running feed, organized: a four-tile summary, filters by what a
   * story is about (your program, the coaching carousel, recruiting,
   * transfers, results, injuries), a search box, and the stories grouped by
   * week with the newest first. Stories about the player's program are
   * highlighted wherever they appear.
   */
  const NEWS_FILTERS = [
    ['all', 'All'],
    ['mine', 'My Program'],
    ['coaching', 'Coaching'],
    ['recruiting', 'Recruiting'],
    ['transfers', 'Transfers'],
    ['results', 'Results'],
    ['health', 'Injuries']
  ];
  const NEWS_KIND = {
    coaching: { icon: '📋', tone: 'warn' },
    recruiting: { icon: '🎯', tone: 'accent' },
    transfers: { icon: '🔄', tone: 'muted' },
    results: { icon: '🏁', tone: 'gold' },
    health: { icon: '🩹', tone: 'bad' },
    league: { icon: '📰', tone: 'muted' }
  };
  const NEWS_PAGE = 80;
  const newsView = { filter: 'all', query: '', shown: NEWS_PAGE };

  // What a story is about, read from its headline.
  function newsKind(text) {
    if (/🩹|🚑|\bDNF\b|\binjur|\bout ~\d/i.test(text)) return 'health';
    if (/\b(FIRED|POACHED|RETIREMENT|SECOND ACT|COACHING CHANGE|SHOCK EXIT|STAFF (COUP|RAID|DEPARTURE)|PROMOTION|CAREER MOVE|COACHING MOVE|FRESH START|HOT SEAT|END OF AN ERA|A NEW ERA|COACHING RÉSUMÉ)\b/.test(text) ||
        /Staff (hire|change|shake-up)|Passed over|Job market|New opening|Warm seat|head coach|head-coaching|coaching (carousel|market)|assistant (job|post|coach)|recruiting coordinator|turn down outside interest/i.test(text)) return 'coaching';
    if (/transfer|portal|summer window|FOLLOWING THE COACH|Roster (cut|deadline)/i.test(text)) return 'transfers';
    if (/commits to|SIGNING DAY|SIGNED|recruit|Late riser|GENERATIONAL|BLOCKBUSTER|NXN|NIKE CROSS|decommit/i.test(text)) return 'recruiting';
    if (/UPSET|Poll surge|#1|career win|RECORD|PRE-NATIONALS|AT-LARGE|champion|Regionals|title|climbs|wins /i.test(text)) return 'results';
    return 'league';
  }

  const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A leading emoji (or icon shortcode) becomes the story's badge.
  const LEAD_ICON = /^((?:\p{Extended_Pictographic}|️|‍|:trophy-[a-z]+:)+)\s*/u;

  function newsStories(game) {
    const school = game.getPlayerSchool();
    // The program's name as a whole name ("Colorado", not "Colorado State").
    const mineRe = new RegExp(`(^|[^A-Za-z])${escRe(school.name)}(?![A-Za-z]| State| Tech| A&M| Christian| Mesa)`);
    return game.newsLog.map((n) => {
      const lead = LEAD_ICON.exec(n.text);
      const text = lead ? n.text.slice(lead[0].length) : n.text;
      const kind = newsKind(n.text);
      return {
        n, text, kind,
        icon: lead ? lead[1] : NEWS_KIND[kind].icon,
        mine: mineRe.test(n.text) || /\b(you|your)\b/i.test(n.text)
      };
    });
  }

  function renderNews(game, body) {
    const school = game.getPlayerSchool();
    const stories = newsStories(game);
    const count = (id) => id === 'all' ? stories.length
      : id === 'mine' ? stories.filter((x) => x.mine).length
      : stories.filter((x) => x.kind === id).length;
    const thisWeek = stories.filter((x) => x.n.week === game.week && x.n.year === game.year);
    const marks = stories.filter((x) => /RECORD|UPSET/.test(x.n.text)).length;
    const tile = (label, value, sub, filter) => `
      <div class="stat-tile${filter ? ' clickable' : ''}"${filter ? ` data-news-goto="${filter}"` : ''}>
        <div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div>
      </div>`;

    if (!stories.length) {
      body.innerHTML = '<div class="card note-card">Nothing has happened yet. Advance the week to get the season moving.</div>';
      return;
    }

    body.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:16px;">
        ${tile('This Week', thisWeek.length, `${thisWeek.filter((x) => x.mine).length} about ${Utils.escapeHtml(school.name)}`, 'all')}
        ${tile(Utils.escapeHtml(school.name), count('mine'), 'stories about your program', 'mine')}
        ${tile('Coaching Carousel', count('coaching'), 'hires, firings and exits', 'coaching')}
        ${tile('Records & Upsets', marks, 'in the feed right now', 'results')}
      </div>
      <div class="filter-bar">
        <div class="pill-tabs" id="news-filters">
          ${NEWS_FILTERS.map(([id, label]) => `<button data-news-filter="${id}" class="${newsView.filter === id ? 'active' : ''}">${label} <span class="pill-count">${count(id)}</span></button>`).join('')}
        </div>
        <input type="text" id="news-search" class="search-input" placeholder="Search the news…" value="${Utils.escapeHtml(newsView.query)}">
        <span id="news-count" class="count-note"></span>
      </div>
      <div id="news-feed"></div>`;

    const feed = body.querySelector('#news-feed');
    const countEl = body.querySelector('#news-count');
    const draw = () => {
      const q = newsView.query.trim().toLowerCase();
      const rows = stories.filter((x) =>
        (newsView.filter === 'all' || (newsView.filter === 'mine' ? x.mine : x.kind === newsView.filter)) &&
        (!q || x.n.text.toLowerCase().includes(q)));
      const shown = rows.slice(0, newsView.shown);
      countEl.textContent = `${rows.length} of ${stories.length} stories`;
      // Grouped by week, newest first (the log is already newest-first).
      const groups = [];
      shown.forEach((x) => {
        const last = groups[groups.length - 1];
        if (last && last.week === x.n.week && last.year === x.n.year) last.items.push(x);
        else groups.push({ week: x.n.week, year: x.n.year, items: [x] });
      });
      const row = (x) => UI.listRow({
        badge: x.icon,
        tone: x.mine ? 'accent' : NEWS_KIND[x.kind].tone,
        mine: x.mine,
        title: `<span class="news-text">${Utils.escapeHtml(x.text)}</span>`,
        clickable: false
      });
      feed.innerHTML = groups.length
        ? groups.map((g) => `${UI.sectionLabel(g.week === game.week && g.year === game.year ? `This Week · Week ${g.week}, ${g.year}` : `Week ${g.week}, ${g.year}`)}
            <div class="card news-week">${UI.listGroup(g.items.map(row), { scroll: false })}</div>`).join('') +
          (rows.length > shown.length ? `<div style="text-align:center; margin-top:12px;"><button class="btn" id="news-more">Show more (${rows.length - shown.length} older)</button></div>` : '')
        : '<div class="card note-card">No stories match this filter.</div>';
      const more = feed.querySelector('#news-more');
      if (more) more.addEventListener('click', () => { newsView.shown += NEWS_PAGE; draw(); });
    };
    const setFilter = (id) => {
      newsView.filter = id;
      newsView.shown = NEWS_PAGE;
      body.querySelectorAll('[data-news-filter]').forEach((b) => b.classList.toggle('active', b.dataset.newsFilter === id));
      draw();
    };
    body.querySelectorAll('[data-news-filter]').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.newsFilter)));
    body.querySelectorAll('[data-news-goto]').forEach((t) => t.addEventListener('click', () => setFilter(t.dataset.newsGoto)));
    body.querySelector('#news-search').addEventListener('input', (e) => { newsView.query = e.target.value; newsView.shown = NEWS_PAGE; draw(); });
    draw();
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
    // Conference-scope honors for the selected conference. Kept separate so
    // the conference picker only redraws this block — never the <select>
    // itself (WebKit crashes if a select is destroyed mid-dismiss).
    const confContent = () => {
      if (!data.confMap || !awardConf || !data.confMap[awardConf]) {
        return `<div class="card" style="color:var(--text-dim);">Conference honors for ${divLabel(awardDiv)} are announced after the conference championships are run.</div>`;
      }
      const cb = data.confMap[awardConf];
      return ['M', 'W'].map((g) => {
        const slate = cb[g];
        if (!slate) return '';
        const gLabel = g === 'M' ? 'Men' : 'Women';
        const allConf = slate.allConference || [];
        return `<div class="card" style="margin-bottom:16px;">
          <div class="card-title"><h2>${gLabel}</h2><span class="phase-pill">${Utils.escapeHtml(awardConf)}</span></div>
          <div class="honor-row">
            ${UI.honorAthlete(game, 'Runner of the Year', slate.runnerOfYear, g)}
            ${UI.honorAthlete(game, 'Freshman of the Year', slate.freshmanOfYear, g)}
            ${UI.honorCoach(game, 'Coach of the Year', slate.coachOfYear)}
          </div>
          ${allConf.length ? `<div class="mini-label">All-Conference Team (${allConf.length})</div>${teamGrid(game, allConf, { gender: g })}` : ''}
        </div>`;
      }).join('') || `<div class="card" style="color:var(--text-dim);">No ${Utils.escapeHtml(awardConf)} honors recorded for this season yet.</div>`;
    };

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
            <div class="card-title"><h2>${gLabel}</h2><span class="phase-pill">${divLabel(awardDiv)}</span></div>
            <div class="honor-row">
              ${UI.honorAthlete(game, 'Runner of the Year', slate.runnerOfYear, g)}
              ${UI.honorAthlete(game, 'Freshman of the Year', slate.freshmanOfYear, g)}
              ${UI.honorCoach(game, 'Coach of the Year', slate.coachOfYear)}
            </div>
            ${aa.length ? `<div class="mini-label">All-America Team (${aa.length})</div>${teamGrid(game, aa, { gender: g })}` : ''}
            ${slate.academicAllAmericans && slate.academicAllAmericans.length ? `<div class="mini-label">Academic All-Americans</div>${teamGrid(game, slate.academicAllAmericans, { gender: g, rank: null })}` : ''}
          </div>`;
        }).join('');
      }
    } else { // conference scope
      content = confContent();
    }

    body.innerHTML = `
      <div class="news-subtabs">${scopeTabs}${divTabs}${confSelector}</div>
      ${recap ? `<div class="talk-blurb">${Utils.escapeHtml(recap)}</div>` : ''}
      <div style="color:var(--text-faint); font-size:12px; margin-bottom:12px;">${year} season${year !== game.year ? ' (most recent completed)' : ''}</div>
      <div id="award-content">${content}</div>`;

    body.querySelectorAll('[data-ascope]').forEach((b) => b.addEventListener('click', () => { awardScope = b.dataset.ascope; render(UI._newsContainer); }));
    body.querySelectorAll('[data-adiv]').forEach((b) => b.addEventListener('click', () => { awardDiv = b.dataset.adiv; awardConf = null; render(UI._newsContainer); }));
    const confSel = body.querySelector('#award-conf');
    if (confSel) confSel.addEventListener('change', () => {
      awardConf = confSel.value;
      // Redraw only the honors below, after the event unwinds.
      setTimeout(() => {
        const box = body.querySelector('#award-content');
        if (!box || !box.isConnected) return;
        box.innerHTML = confContent();
        wireProfiles(game, box);
      }, 0);
    });
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
        <div class="mini-label">Predicted Podium</div>
        ${podium ? `<div class="pcard-grid">${podium}</div>` : '<div style="color:var(--text-dim);">No teams to project yet.</div>'}
        <div class="mini-label">Title Contenders</div>
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
        ${UI.screenTitle('News', `Week ${game.week}, ${game.year}`)}
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

  // Back to the screen's load-in defaults (tabs, sub-tabs, toggles, filters).
  // Called by the shell whenever the player navigates INTO this screen, so
  // leaving a tab and coming back always lands on its default view.
  function reset() {
    activeTab = 'news';
    awardScope = 'national';
    awardDiv = null;
    awardConf = null;
    watchDiv = null;
    Object.assign(newsView, { filter: 'all', query: '', shown: NEWS_PAGE });
  }

  UI.screens.news = { render, reset };
})();
