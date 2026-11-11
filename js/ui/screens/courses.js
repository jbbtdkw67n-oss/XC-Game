/*
 * Course Records page: every cross country course in the dynasty and its
 * record book. Each course keeps its OWN men's and women's records — a
 * 23:30 on a flat course is never "better" than a 24:00 on a hilly one, so
 * courses are only ever shown standing alone, never ranked against each other
 * by raw time.
 *
 * The page is organized by what a coach comes here for:
 *   My Program            — the home course, the courses on this season's
 *                           schedule (with the marks to chase), and every
 *                           record the program holds
 *   Featured              — the national-championship venues and the famous
 *                           invitational courses
 *   All Courses           — the whole book: search, division, state, sort
 *   Record Log            — every record broken, newest first, by season
 * with the record book at a glance (summary tiles) above the tabs.
 *
 * Every course opens a profile: location, terrain, altitude, the current
 * men's/women's records (with the conditions they were set in), and the full
 * record history — every time the record has fallen, newest to oldest — so the
 * entire lineage of the course record is preserved forever.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const D = window.XCD.data;

  const TABS = [
    ['mine', 'My Program'],
    ['featured', 'Featured'],
    ['all', 'All Courses'],
    ['log', 'Record Log']
  ];
  let activeTab = 'mine';

  // All Courses: just a search box, a division picker, and a state picker —
  // every course shows both its men's and women's records side by side.
  const filters = { query: '', division: '', state: '' };

  // Record Log: whose records to show, and how many are on screen.
  const LOG_PAGE = 40;
  let logFilter = 'all'; // all | M | W | mine
  let logShown = LOG_PAGE;

  const Courses = () => window.XCD.engine.Courses;
  const ft = (t) => window.XCD.engine.Races.formatTime(t);
  const esc = (t) => Utils.escapeHtml(t);

  // Ordered distance keys with a record, for a gender (6K, 8K, 10K …).
  function genderDistances(entry, gender) {
    return Object.keys(entry.records)
      .filter((k) => k.startsWith(`${gender}-`))
      .map((k) => k.slice(2))
      .sort((a, b) => parseFloat(a) - parseFloat(b));
  }

  // The signature (headline) record for a gender — the canonical XC distance.
  function signatureRecord(game, entry, gender) {
    return Courses().recordFor(game, entry.key, gender);
  }

  function courseTypeLabel(entry) {
    const mt = entry.meetTypes || {};
    const champ = entry.championship || mt.national || mt.regional || mt.conference;
    if (entry.championship || mt.national) return 'Championship';
    if (champ) return mt.regional ? 'Regional/Conf' : 'Conference';
    return 'Regular Season';
  }

  function isChampionshipCourse(entry) {
    const mt = entry.meetTypes || {};
    return !!(entry.championship || mt.national || mt.regional || mt.conference);
  }

  // A record holder with their avatar (opens the athlete's profile).
  function holderTag(game, rec, gender, size = 18) {
    return UI.personName(game, 'ath', rec.athleteId, rec.name, { size, extra: { gender, schoolId: rec.schoolId } });
  }

  // "set 2031" — the season a record was set, shown next to every record.
  function setYear(rec) {
    return rec && rec.year ? `<span class="cr-year">set ${rec.year}</span>` : '';
  }

  function hasRealRecord(entry) {
    return Object.values(entry.records).some((r) => !r.seeded);
  }

  function stateName(code) {
    return (D.STATE_NAMES || {})[code] || code || '';
  }

  function locationOf(entry) {
    return [entry.city, stateName(entry.state)].filter(Boolean).join(', ');
  }

  // Terrain / altitude / speed in one quiet line (the same order everywhere).
  function profileLine(entry) {
    return `${D.courseTerrain(entry.hilliness)} • ${D.courseAltitude(entry.altitudeFt)} altitude • ${UI.courseSpeedTag(entry.hilliness, entry.altitudeFt)}`;
  }

  // One record on a course card: "M 8K 23:41.3 [set 2027] — holder".
  function recordLine(game, entry, gender) {
    const rec = signatureRecord(game, entry, gender);
    const label = gender === 'M' ? 'Men' : 'Women';
    if (!rec) return `<div class="cr-rec"><span class="cr-rec-g">${label}</span><span class="cr-rec-none">No record yet</span></div>`;
    const holder = rec.seeded ? '<span class="cr-rec-none">historic</span>' : holderTag(game, rec, gender);
    return `<div class="cr-rec"><span class="cr-rec-g">${label} ${rec.distanceKey}</span><strong>${ft(rec.time)}</strong> ${setYear(rec)}<span class="cr-rec-who">${holder}</span></div>`;
  }

  // The body of a course card (used by the featured grids and All Courses).
  function courseCardBody(game, e) {
    return `
      <div class="m-head">
        <div class="m-title">${e.championship ? '🏆 ' : ''}${esc(e.name)}
          <div class="m-sub">${esc(locationOf(e))}${locationOf(e) ? ' • ' : ''}${profileLine(e)}</div>
        </div>
      </div>
      <div class="cr-recs">${recordLine(game, e, 'M')}${recordLine(game, e, 'W')}</div>`;
  }

  const emptyNote = (text) => `<div class="card" style="color:var(--text-dim); font-size:13px;">${text}</div>`;

  /* ---------------- Summary tiles ---------------- */
  function summaryTiles(game) {
    const sum = Courses().summary(game);
    const school = game.getPlayerSchool();
    const prog = Courses().programStats(game, school.id);
    const tile = (label, value, sub, goto) => `
      <div class="stat-tile${goto ? ' clickable' : ''}"${goto ? ` data-cr-goto="${goto}" style="cursor:pointer;"` : ''}>
        <div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div>
      </div>`;
    return `
      <div class="grid cols-4" style="margin-bottom:16px;">
        ${tile('Courses', sum.courses, `${sum.withRecords} with a record on the books`, 'all')}
        ${tile('Records Broken', sum.brokenThisSeason, `this season • ${sum.brokenAllTime} all-time`, 'log')}
        ${tile(`${esc(school.name)} Holds`, prog.current, prog.everSet ? `${prog.everSet} broken all-time • peak ${prog.peak}` : 'current course records', 'mine')}
        ${tile('Oldest Record', sum.oldest ? sum.oldest.year : '—', sum.oldest ? esc(sum.oldest.courseName) : 'no records set yet', '')}
      </div>`;
  }

  /* ---------------- Tab: My Program ---------------- */
  function mineTab(game, el, descs) {
    const school = game.getPlayerSchool();
    const book = Courses().book(game);

    // Home course: the registered book entry, or its descriptor before the
    // course has hosted its first race.
    const homeDesc = D.homeCourseFor(school);
    const home = homeDesc ? (book[homeDesc.key] || Object.assign({ records: {}, history: {}, divisions: {}, meetTypes: {} }, homeDesc)) : null;
    if (home) descs[home.key] = home;
    const homeTile = (gender) => {
      const rec = signatureRecord(game, home, gender);
      const label = gender === 'M' ? "Men's Record" : "Women's Record";
      if (!rec) return `<div class="stat-tile"><div class="label">${label}</div><div class="value">—</div><div class="sub">not raced yet</div></div>`;
      return `<div class="stat-tile"><div class="label">${label} • ${rec.distanceKey}</div>
        <div class="value">${ft(rec.time)} ${setYear(rec)}</div>
        <div class="sub">${holderTag(game, rec, gender)}${rec.school ? ` <span style="color:var(--text-faint);">• ${esc(rec.school)}</span>` : ''}</div></div>`;
    };
    const homeHtml = home ? `
      <div class="card cr-home">
        <div class="cr-home-head">
          <div>
            <h2 style="margin:0;">${esc(home.name)}</h2>
            <div class="cr-home-sub">📍 ${esc(locationOf(home))} • ${profileLine(home)}</div>
          </div>
          <button class="btn small" data-course="${home.key}">Open record book</button>
        </div>
        <div class="cr-pair" style="margin-top:12px;">${homeTile('M')}${homeTile('W')}</div>
      </div>` : emptyNote('This program has no home course on file.');

    // This season's schedule: every course the team races, and the mark to chase.
    const season = game.season;
    const weeks = season ? Object.keys(season.playerMeetByWeek || {}).map(Number).sort((a, b) => a - b) : [];
    const sched = weeks.map((wk) => {
      const meet = season.meets[season.playerMeetByWeek[wk]];
      if (!meet) return '';
      const info = Courses().entryForMeet(game, meet);
      if (!info || !info.desc) return '';
      const e = info.entry || Object.assign({ records: {}, history: {}, divisions: {}, meetTypes: {} }, info.desc);
      descs[e.key] = e;
      const done = !!(meet.results && (meet.results.M || meet.results.W));
      const marks = ['M', 'W'].map((g) => {
        if (!meet.distances || !meet.distances[g]) return '';
        const rec = Courses().recordFor(game, e.key, g, meet.distances[g]);
        return `<div>${g} ${D.distanceKey(meet.distances[g])} <span class="${rec ? 'big' : 'small'}" style="font-size:13.5px;">${rec ? ft(rec.time) : 'open'}</span></div>`;
      }).join('');
      return UI.listRow({
        badge: `<span style="font-size:11.5px; font-weight:800;">W${wk}</span>`,
        tone: done ? 'muted' : wk === game.week ? 'accent' : 'good',
        title: esc(e.name),
        tag: done ? 'raced' : wk === game.week ? 'this week' : '',
        sub: `${esc(meet.name)} • ${profileLine(e)}`,
        meta: marks,
        attrs: { course: e.key }
      });
    }).filter(Boolean);

    // Records the program holds right now.
    const held = Courses().heldBySchool(game, school.id);
    const heldRows = held.map((h) => UI.listRow({
      badge: h.gender,
      tone: h.inaugural ? 'muted' : 'gold',
      title: esc(h.courseName),
      tag: h.inaugural ? 'opening mark' : '',
      sub: `${holderTag(game, h, h.gender)} <span style="color:var(--text-faint);">• ${h.year}${h.meet ? ' • ' + esc(h.meet) : ''}</span>`,
      meta: `<div class="big">${ft(h.time)}</div><div class="small">${h.gender === 'M' ? "Men's" : "Women's"} ${h.distanceKey}</div>`,
      attrs: { course: h.courseKey }
    }));

    el.innerHTML = `
      ${UI.sectionLabel('Home Course')}
      ${homeHtml}
      ${UI.sectionLabel('On Your Schedule')}
      ${sched.length
        ? `<div class="card">${UI.listGroup(sched, { scroll: false })}
            <div class="cr-foot">The marks shown are the course records for the distances your teams race there. “Open” means nobody has raced it yet.</div></div>`
        : emptyNote('No meets on the schedule yet. Build your season on the Schedule screen and the courses you will race appear here.')}
      ${UI.sectionLabel(`Records Held by ${school.name}`)}
      ${heldRows.length
        ? `<div class="card">${UI.listGroup(heldRows)}
            <div class="cr-foot">Gold marks beat a standing record. An opening mark is the first time ever run on that course.</div></div>`
        : emptyNote(`${esc(school.name)} doesn't hold a course record yet. Run the fastest time ever on a course and it lands here.`)}`;
  }

  /* ---------------- Tab: Featured (championship + famous) ---------------- */
  function featuredTab(game, el) {
    const all = Courses().list(game);
    const byName = (a, b) => a.name.localeCompare(b.name);
    const champs = all.filter((e) => e.championship).sort(byName);
    const famous = all.filter((e) => !e.championship && D.isNamedCourse(e.key)).sort(byName);
    const grid = (list) => `<div class="m-cards as-grid">${list.map((e) =>
      `<div class="m-card clickable" data-course="${e.key}">${courseCardBody(game, e)}</div>`).join('')}</div>`;
    el.innerHTML = `
      ${UI.sectionLabel('National Championship Venues')}
      ${champs.length ? grid(champs) : emptyNote('No championship venues on file.')}
      ${UI.sectionLabel('Famous Invitational Courses')}
      ${famous.length ? grid(famous) : emptyNote('No famous invitational courses on file.')}`;
  }

  /* ---------------- Tab: All Courses ---------------- */
  function allTab(game, el) {
    const all = Courses().list(game);
    // State options drawn from the courses that actually exist.
    const states = [...new Set(all.map((e) => e.state).filter(Boolean))]
      .sort((a, b) => stateName(a).localeCompare(stateName(b)));
    if (filters.state && !states.includes(filters.state)) filters.state = '';

    el.innerHTML = `
      <div class="cr-filters">
        <input type="text" id="cr-search" class="search-input" placeholder="Search courses, cities…" value="${esc(filters.query)}">
        <select id="cr-div" class="search-input">
          <option value="">All Divisions</option>
          ${['DI', 'DII', 'DIII'].map((d) => `<option value="${d}" ${filters.division === d ? 'selected' : ''}>${{ DI: 'D1', DII: 'D2', DIII: 'D3' }[d]}</option>`).join('')}
        </select>
        <select id="cr-state" class="search-input">
          <option value="">All States</option>
          ${states.map((st) => `<option value="${st}" ${filters.state === st ? 'selected' : ''}>${esc(stateName(st))}</option>`).join('')}
        </select>
        <span id="cr-count" class="cr-count"></span>
      </div>
      <div id="cr-table"></div>
      <div class="cr-foot" style="margin-top:10px;">Every course keeps its own book: terrain, altitude and distance differ too much to compare a time on one course with a time on another.</div>`;

    const tableEl = el.querySelector('#cr-table');
    const countEl = el.querySelector('#cr-count');

    const recCell = (e, gender) => {
      const rec = signatureRecord(game, e, gender);
      if (!rec) return '<span style="color:var(--text-faint);">—</span>';
      const holder = rec.seeded ? '<span style="color:var(--text-faint);">historic</span>' : holderTag(game, rec, gender);
      return `<strong>${ft(rec.time)}</strong> <span style="color:var(--text-faint); font-size:11px;">${rec.distanceKey}</span> ${setYear(rec)}<br>
        <span style="font-size:11.5px;">${holder}</span>`;
    };
    const columns = [
      { key: 'name', label: 'Course', render: (e) => `
        <strong>${e.championship ? '🏆 ' : ''}${esc(e.name)}</strong>
        <div style="color:var(--text-faint); font-size:11px;">${esc(locationOf(e))}</div>` },
      { key: 'state', label: 'State', sortValue: (e) => `${stateName(e.state)} ${e.name}`, render: (e) => esc(stateName(e.state)) },
      { key: 'terrain', label: 'Terrain', sortValue: (e) => e.hilliness, render: (e) => `${D.courseTerrain(e.hilliness)} <span style="color:var(--text-faint); font-size:11px;">${e.hilliness}</span>` },
      { key: 'altitude', label: 'Altitude', sortValue: (e) => e.altitudeFt || 0, render: (e) => D.courseAltitude(e.altitudeFt) },
      { key: 'speed', label: 'Speed', sortValue: (e) => ({ fast: 0, average: 1, slow: 2 }[D.courseSpeed(e.hilliness, e.altitudeFt).key]), render: (e) => UI.courseSpeedTag(e.hilliness, e.altitudeFt) },
      { key: 'type', label: 'Type', sortValue: (e) => courseTypeLabel(e), render: (e) => courseTypeLabel(e) },
      { key: 'mrec', label: "Men's Record", numeric: true, sortValue: (e) => { const r = signatureRecord(game, e, 'M'); return r ? -r.time : 1; }, render: (e) => recCell(e, 'M') },
      { key: 'wrec', label: "Women's Record", numeric: true, sortValue: (e) => { const r = signatureRecord(game, e, 'W'); return r ? -r.time : 1; }, render: (e) => recCell(e, 'W') }
    ];

    const filtered = () => {
      const q = filters.query.trim().toLowerCase();
      return all.filter((e) => {
        if (q && !(`${e.name} ${e.city} ${stateName(e.state)} ${e.conference || ''}`.toLowerCase().includes(q))) return false;
        if (filters.division) {
          const divs = Object.keys(e.divisions || {});
          if (divs.length && !e.divisions[filters.division]) return false;
        }
        if (filters.state && e.state !== filters.state) return false;
        return true;
      });
    };

    let rows = filtered();
    const table = UI.renderSortableTable(tableEl, {
      columns,
      rows,
      defaultSort: 'name', defaultDir: 'asc',
      maxRows: 900,
      emptyMessage: 'No courses match the current filters.',
      onRowClick: (e) => UI.showCourseCard(game, e.key),
      mobileCard: (e) => courseCardBody(game, e)
    });
    // Filters swap the rows in place: the search box keeps its focus and the
    // sort order survives.
    const apply = () => {
      rows = filtered();
      countEl.textContent = `${rows.length} of ${all.length}`;
      table.setRows(rows);
    };
    countEl.textContent = `${rows.length} of ${all.length}`;

    const bind = (id, ev, fn) => { const node = el.querySelector(id); if (node) node.addEventListener(ev, fn); };
    bind('#cr-search', 'input', (e) => { filters.query = e.target.value; apply(); });
    bind('#cr-div', 'change', (e) => { filters.division = e.target.value; apply(); });
    bind('#cr-state', 'change', (e) => { filters.state = e.target.value; apply(); });
  }

  /* ---------------- Tab: Record Log ---------------- */
  function logTab(game, el, rerender) {
    const school = game.getPlayerSchool();
    const log = game.history.courseRecordLog || [];
    const mineCount = log.filter((e) => e.schoolId === school.id).length;
    const rows = log.filter((e) => logFilter === 'all' ? true
      : logFilter === 'mine' ? e.schoolId === school.id
      : e.gender === logFilter);
    const shown = rows.slice(0, logShown);

    // Grouped by season, newest first (the log is already newest-first).
    const groups = [];
    shown.forEach((e) => {
      const last = groups[groups.length - 1];
      if (last && last.year === e.year) last.items.push(e);
      else groups.push({ year: e.year, items: [e] });
    });
    const row = (e) => UI.listRow({
      badge: e.gender,
      tone: e.schoolId === school.id ? 'gold' : 'accent',
      mine: e.schoolId === school.id,
      title: esc(e.courseName),
      tag: `${e.gender === 'M' ? "Men's" : "Women's"} ${e.distanceKey}${e.week ? ` • Week ${e.week}` : ''}`,
      sub: `${holderTag(game, e, e.gender)} <span style="color:var(--text-faint);">• ${esc(e.school)}${e.meet ? ' • ' + esc(e.meet) : ''}</span>`,
      meta: `<div class="big">${ft(e.time)}</div>${e.previousTime
        ? `<div class="small">was ${ft(e.previousTime)}${e.previousHolder ? ` • ${esc(e.previousHolder)}` : ''}</div>` : ''}`,
      attrs: { course: e.courseKey }
    });
    const pill = (id, label) => `<button data-cr-log="${id}" class="${logFilter === id ? 'active' : ''}">${label}</button>`;

    el.innerHTML = `
      <div class="cr-filters">
        <div class="pill-tabs">
          ${pill('all', 'All')}${pill('M', 'Men')}${pill('W', 'Women')}${pill('mine', `${esc(school.name)}${mineCount ? ` (${mineCount})` : ''}`)}
        </div>
        <span class="cr-count">${rows.length} record${rows.length === 1 ? '' : 's'} broken</span>
      </div>
      ${groups.length
        ? groups.map((g) => `${UI.sectionLabel(`${g.year} Season`)}<div class="card">${UI.listGroup(g.items.map(row), { scroll: false })}</div>`).join('')
        : emptyNote(log.length
          ? 'No records match this filter.'
          : 'No course record has been broken yet. The first time a course is raced sets its opening mark; beating a standing mark lands here.')}
      ${rows.length > shown.length ? `<div style="text-align:center; margin-top:12px;"><button class="btn" id="cr-log-more">Show more (${rows.length - shown.length} older)</button></div>` : ''}`;

    el.querySelectorAll('[data-cr-log]').forEach((btn) => {
      btn.addEventListener('click', () => { logFilter = btn.dataset.crLog; logShown = LOG_PAGE; rerender(); });
    });
    const more = el.querySelector('#cr-log-more');
    if (more) more.addEventListener('click', () => { logShown += LOG_PAGE; rerender(); });
  }

  function render(container) {
    const game = UI.state.game;
    if (!TABS.some(([id]) => id === activeTab)) activeTab = 'mine';
    // Course descriptors for cards whose course isn't in the book yet (a
    // scheduled course nobody has raced), so they still open a profile.
    const descs = {};

    container.innerHTML = `
      <div class="screen-header">
        ${UI.screenTitle('Course Records', 'Every course keeps its own record book')}
        <div class="actions">
          <div class="pill-tabs" id="cr-tabs">
            ${TABS.map(([id, label]) => `<button data-cr-tab="${id}" class="${activeTab === id ? 'active' : ''}">${label}</button>`).join('')}
          </div>
        </div>
      </div>
      <div id="cr-root">
        ${summaryTiles(game)}
        <div id="cr-body"></div>
      </div>`;

    const root = container.querySelector('#cr-root');
    const body = container.querySelector('#cr-body');
    const rerender = () => render(container);
    if (activeTab === 'mine') mineTab(game, body, descs);
    else if (activeTab === 'featured') featuredTab(game, body);
    else if (activeTab === 'all') allTab(game, body);
    else logTab(game, body, rerender);

    container.querySelectorAll('[data-cr-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.crTab; rerender(); });
    });
    // On a phone the tab strip scrolls: keep the open tab in view.
    const tabs = container.querySelector('#cr-tabs');
    const on = tabs && tabs.querySelector('.active');
    if (on && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = Math.max(0, on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2);

    // One listener for the whole page (capture, so a name inside a clickable
    // course card opens the athlete without also opening the course):
    // athletes open their profile, courses their record book, tiles a tab.
    root.addEventListener('click', (ev) => {
      const ath = ev.target.closest('[data-ath]');
      if (ath && root.contains(ath)) {
        ev.stopPropagation();
        if (ath.dataset.ath || ath.dataset.athName) UI.openAthlete(game, ath.dataset.ath, ath.dataset.athName);
        return;
      }
      const course = ev.target.closest('[data-course]');
      if (course && root.contains(course)) {
        ev.stopPropagation();
        UI.showCourseCard(game, course.dataset.course, descs[course.dataset.course]);
        return;
      }
      const tile = ev.target.closest('[data-cr-goto]');
      if (tile && root.contains(tile) && tile.dataset.crGoto !== activeTab) {
        activeTab = tile.dataset.crGoto;
        rerender();
      }
    }, true);
  }

  /* ================================================================ *
   * Course profile modal: the full record book for one course.
   * ================================================================ */
  UI.showCourseCard = function (game, courseKey, desc) {
    // `desc` (optional): the course's identity, for a course that is on a
    // schedule but hasn't hosted a race yet — its book opens blank.
    const entry = Courses().book(game)[courseKey] ||
      (desc ? Object.assign({ records: {}, history: {}, divisions: {}, meetTypes: {} }, desc) : null);
    if (!entry) { UI.toast('That course has no record book yet.', 'error'); return; }

    // Conditions block for a record (point: weather is shown alongside).
    const conditionsHtml = (rec) => {
      if (!rec || !rec.conditions) return '';
      const c = rec.conditions;
      const bits = [];
      if (c.windMph != null) bits.push(`Wind ${c.windMph} mph`);
      if (c.tempF != null) bits.push(`${c.tempF}°F`);
      bits.push(c.ground === 'Muddy' ? 'Muddy' : c.dry === false || c.rain ? 'Wet' : 'Dry');
      return `<div style="color:var(--text-faint); font-size:11px; margin-top:2px;">${bits.join(' · ')}</div>`;
    };
    const schoolLink = (rec) => rec.schoolId
      ? `<span class="clickable" data-school="${rec.schoolId}" style="cursor:pointer;">${esc(rec.school)}</span>`
      : esc(rec.school || '—');

    // The headline record for a gender: big time, holder + school (clickable),
    // meet & year, and the conditions it was set in.
    const headline = (gender) => {
      const rec = signatureRecord(game, entry, gender);
      const label = gender === 'M' ? "Men's Record" : "Women's Record";
      if (!rec) return `<div class="stat-tile"><div class="label">${label}</div><div class="value">—</div><div class="sub">not raced yet</div></div>`;
      const holder = rec.seeded
        ? '<span style="color:var(--text-faint);">Historic best</span>'
        : holderTag(game, rec, gender, 26);
      return `
        <div class="stat-tile">
          <div class="label">${label} • ${rec.distanceKey}</div>
          <div class="value" style="font-size:26px;">${ft(rec.time)} ${setYear(rec)}</div>
          <div style="font-size:13px; margin-top:4px;">${holder}</div>
          <div style="color:var(--text-dim); font-size:12px;">${schoolLink(rec)}</div>
          <div style="color:var(--text-faint); font-size:11.5px; margin-top:2px;">${esc(rec.meet || '')}${rec.year ? ` · ${rec.year}` : ''}</div>
          ${conditionsHtml(rec)}
        </div>`;
    };

    // The course at a glance.
    const speed = D.courseSpeed(entry.hilliness, entry.altitudeFt);
    const fact = (label, value, sub) => `<div class="stat-tile"><div class="label">${label}</div><div class="value" style="font-size:17px;">${value}</div><div class="sub">${sub}</div></div>`;
    const hosted = Object.keys(entry.meetTypes || {});
    const typeNames = { invite: 'invitationals', conference: 'conference', regional: 'regionals', national: 'nationals' };

    // Every distance raced here, men then women (never compared across).
    const distances = [];
    ['M', 'W'].forEach((gender) => genderDistances(entry, gender).forEach((dk) => {
      const rec = entry.records[`${gender}-${dk}`];
      if (rec) distances.push({ gender, dk, rec });
    }));
    const distanceTable = distances.length > 2 ? `
      ${UI.sectionLabel('Every Distance')}
      <div class="card" style="padding:12px;">
        <div class="table-wrap"><table class="data">
          <thead><tr><th class="col-rank">Race</th><th class="num">Time</th><th class="col-grow">Athlete</th><th>School</th></tr></thead>
          <tbody>${distances.map(({ gender, dk, rec }) => `<tr>
            <td>${gender === 'M' ? 'Men' : 'Women'} ${dk}</td>
            <td class="num"><strong>${ft(rec.time)}</strong> ${setYear(rec)}</td>
            <td>${rec.seeded ? '<span style="color:var(--text-faint);">Historic best</span>' : holderTag(game, rec, gender)}</td>
            <td style="color:var(--text-dim); font-size:12px;">${rec.seeded ? '—' : schoolLink(rec)}</td>
          </tr>`).join('')}</tbody></table></div>
      </div>` : '';

    // Record history for the signature distance of each gender (newest→oldest),
    // preserving the entire lineage of the course record.
    const historyRows = (gender) => {
      const sig = signatureRecord(game, entry, gender);
      if (!sig) return '';
      const hist = (entry.history[`${gender}-${sig.distanceKey}`] || []).filter((r) => !r.seeded);
      if (!hist.length) return '';
      return `
        <div class="card" style="padding:12px;">
          <h3 style="margin-top:0;">${gender === 'M' ? "Men's" : "Women's"} ${sig.distanceKey} <span style="color:var(--text-faint); font-weight:400; font-size:12px;">— ${hist.length} mark${hist.length === 1 ? '' : 's'}, newest first</span></h3>
          ${UI.listGroup(hist.map((r, i) => UI.listRow({
            badge: i === 0 ? '🏆' : `<span style="font-size:11px; font-weight:800;">${r.year}</span>`,
            tone: i === 0 ? 'gold' : 'muted',
            title: holderTag(game, r, gender),
            tag: i === 0 ? 'current record' : r.inaugural ? 'opening mark' : '',
            sub: `${schoolLink(r)} <span style="color:var(--text-faint);">• ${r.year}${r.meet ? ' • ' + esc(r.meet) : ''}</span>`,
            meta: `<div class="big">${ft(r.time)}</div>`,
            clickable: false
          })))}
        </div>`;
    };
    const history = historyRows('M') + historyRows('W');

    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <h2 style="margin:0 0 2px;">${entry.championship ? '🏆 ' : ''}${esc(entry.name)}</h2>
      <div style="color:var(--text-dim); font-size:13px; margin-bottom:12px;">
        📍 ${esc(locationOf(entry))}${entry.conference ? ' • ' + esc(entry.conference) : ''}${isChampionshipCourse(entry) ? ' • <span style="color:var(--accent);">Championship course</span>' : ''}
      </div>

      <div class="cr-pair" style="margin-bottom:12px;">
        ${headline('M')}
        ${headline('W')}
      </div>

      ${UI.sectionLabel('The Course')}
      <div class="grid cols-4" style="margin-bottom:12px;">
        ${fact('Terrain', D.courseTerrain(entry.hilliness), `${entry.hilliness}/100 hilliness`)}
        ${fact('Altitude', D.courseAltitude(entry.altitudeFt), `${Math.round(entry.altitudeFt || 0).toLocaleString()} ft`)}
        ${fact('Speed', `<span class="speed-tag ${speed.key}">${speed.icon ? speed.icon + ' ' : ''}${speed.label}</span>`, 'the same every year')}
        ${fact('Hosts', hosted.length ? hosted.length : '—', hosted.length ? hosted.map((t) => typeNames[t] || t).join(', ') : 'no races run yet')}
      </div>

      ${distanceTable}
      ${history ? UI.sectionLabel('Record History') + history : ''}
      ${(!hasRealRecord(entry)) ? '<div class="card" style="padding:12px; color:var(--text-dim); font-size:12.5px;">No one has raced here yet in this dynasty. The first athlete to race this course sets its opening mark, and every record after that has to beat a standing time.</div>' : ''}
    `, (modal) => {
      modal.querySelectorAll('[data-ath]').forEach((el) => {
        el.addEventListener('click', (e) => { e.stopPropagation(); if (el.dataset.ath || el.dataset.athName) UI.openAthlete(game, el.dataset.ath, el.dataset.athName); });
      });
      modal.querySelectorAll('[data-school]').forEach((el) => {
        el.addEventListener('click', (e) => { e.stopPropagation(); const s = game.getSchool(el.dataset.school); if (s) UI.showSchoolCard(s, game); });
      });
    });
  };

  /*
   * Every course record an athlete currently holds (Athlete Career Records) —
   * opened from the "Course Record Holder" accolade on any athlete profile.
   */
  UI.showAthleteCourseRecords = function (game, athleteId, name) {
    const held = Courses().heldByAthlete(game, athleteId);
    if (!held.length) { UI.toast('No course records currently held.', 'error'); return; }
    const courses = new Set(held.map((h) => h.courseKey)).size;
    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <h2 style="margin:0 0 2px;">🏆 Course Records Held</h2>
      <div style="color:var(--text-dim); font-size:13px; margin-bottom:12px;">${UI.personName(game, 'ath', athleteId, name || '', { size: 22, link: false })} — ${held.length} record${held.length > 1 ? 's' : ''} across ${courses} course${courses > 1 ? 's' : ''}.</div>
      <div class="card" style="padding:12px;">
        <div class="table-wrap" style="max-height:360px; overflow-y:auto;"><table class="data">
          <thead><tr><th class="col-grow">Course</th><th>Location</th><th></th><th class="num">Time</th></tr></thead>
          <tbody>${held.map((h) => `
            <tr class="clickable" data-course="${h.courseKey}" style="cursor:pointer;">
              <td><strong>${Utils.escapeHtml(h.courseName)}</strong></td>
              <td style="color:var(--text-dim); font-size:12px;">${Utils.escapeHtml([h.city, stateName(h.state)].filter(Boolean).join(', '))}</td>
              <td>${h.gender} ${h.distanceKey}</td>
              <td class="num"><strong>${ft(h.time)}</strong> ${setYear(h)}</td>
            </tr>`).join('')}
          </tbody></table></div>
      </div>
    `, (modal) => {
      modal.querySelectorAll('[data-course]').forEach((tr) => {
        tr.addEventListener('click', () => UI.showCourseCard(game, tr.dataset.course));
      });
    });
  };

  // Back to the screen's load-in defaults (tabs, sub-tabs, toggles, filters).
  // Called by the shell whenever the player navigates INTO this screen, so
  // leaving a tab and coming back always lands on its default view.
  function reset() {
    activeTab = 'mine';
    Object.assign(filters, { query: '', division: '', state: '' });
    logFilter = 'all';
    logShown = LOG_PAGE;
  }

  // Deep link: UI.navigate('courses', 'all' | 'featured' | 'log' | 'mine').
  function openTab(tab) {
    if (TABS.some(([id]) => id === tab)) activeTab = tab;
  }

  UI.screens.courses = { render, reset, openTab };
})();
