/*
 * Course Records page: browse every cross country course in the dynasty and
 * its record book. Each course keeps its OWN men's and women's records — a
 * 23:30 on a flat course is never "better" than a 24:00 on a hilly one, so
 * courses are only ever shown standing alone, never ranked against each other
 * by raw time.
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

  // Just a search box, a division picker, and a state picker — every course
  // shows both its men's and women's records side by side.
  const filters = { query: '', division: '', state: '' };

  const Courses = () => window.XCD.engine.Courses;
  const ft = (t) => window.XCD.engine.Races.formatTime(t);

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

  function render(container) {
    const game = UI.state.game;
    const all = Courses().list(game);
    // State options drawn from the courses that actually exist.
    const states = [...new Set(all.map((e) => e.state).filter(Boolean))]
      .sort((a, b) => stateName(a).localeCompare(stateName(b)));
    if (filters.state && !states.includes(filters.state)) filters.state = '';

    container.innerHTML = `
      <div class="screen-header">
        ${UI.screenTitle('Course Records', 'Every course keeps its own record book')}
      </div>
      <div class="card" style="margin-bottom:14px; color:var(--text-dim); font-size:12.5px;">
        Every course keeps its own record book. Because courses differ dramatically — terrain, altitude,
        distance — a time on one course is never compared to a time on another. Each course's record book
        starts blank: the first athlete to race a course sets its opening mark, and beating a standing
        record from there is a genuinely rare accomplishment.
      </div>
      ${(() => {
        // Season history: the most recent course records set across the dynasty
        // (spec — a course record fires a season-history entry). Each opens the
        // course record book; the athlete opens their profile.
        const log = (game.history.courseRecordLog || []).slice(0, 10);
        if (!log.length) return '';
        return `<div class="card cr-holders" style="margin-bottom:14px;">
          <h2 style="margin:0 0 8px;">🏆 Recent Course Records</h2>
          <div class="table-wrap" style="max-height:230px; overflow-y:auto;"><table class="data">
            <thead><tr><th class="col-rank">Year</th><th>Course</th><th></th><th class="col-grow">Athlete</th><th>School</th><th class="num">Time</th></tr></thead>
            <tbody>${log.map((e) => `
              <tr>
                <td>${e.year}</td>
                <td><span class="clickable" data-cr-log-course="${e.courseKey}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(e.courseName)}</span></td>
                <td>${e.gender} ${e.distanceKey}</td>
                <td>${holderTag(game, e, e.gender)}</td>
                <td style="color:var(--text-dim); font-size:12px;">${Utils.escapeHtml(e.school)}</td>
                <td class="num"><strong>${ft(e.time)}</strong></td>
              </tr>`).join('')}
            </tbody></table></div>
        </div>`;
      })()}
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:14px;">
        <input type="text" id="cr-search" class="search-input" placeholder="Search courses, cities…" value="${Utils.escapeHtml(filters.query)}" style="max-width:200px;">
        <select id="cr-div" class="search-input" style="padding:6px 10px;">
          <option value="">All Divisions</option>
          ${['DI', 'DII', 'DIII'].map((d) => `<option value="${d}" ${filters.division === d ? 'selected' : ''}>${{ DI: 'D1', DII: 'D2', DIII: 'D3' }[d]}</option>`).join('')}
        </select>
        <select id="cr-state" class="search-input" style="padding:6px 10px; max-width:170px;">
          <option value="">All States</option>
          ${states.map((st) => `<option value="${st}" ${filters.state === st ? 'selected' : ''}>${Utils.escapeHtml(stateName(st))}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <h2 style="margin:0;">Courses</h2>
          <span id="cr-count" style="color:var(--text-faint); font-size:12px;"></span>
        </div>
        <div style="color:var(--text-faint); font-size:11.5px; margin-bottom:8px;">Click any course to open its full record book and history.</div>
        <div id="cr-table" class="cr-holders"></div>
      </div>`;

    const tableEl = container.querySelector('#cr-table');
    const countEl = container.querySelector('#cr-count');

    function apply() {
      const q = filters.query.trim().toLowerCase();
      const rows = all.filter((e) => {
        if (q && !(`${e.name} ${e.city} ${stateName(e.state)} ${e.conference || ''}`.toLowerCase().includes(q))) return false;
        if (filters.division) {
          const divs = Object.keys(e.divisions || {});
          if (divs.length && !e.divisions[filters.division]) return false;
        }
        if (filters.state && e.state !== filters.state) return false;
        return true;
      });
      countEl.textContent = `${rows.length} of ${all.length}`;

      const recCell = (e, gender) => {
        const rec = signatureRecord(game, e, gender);
        if (!rec) return '<span style="color:var(--text-faint);">—</span>';
        const holder = rec.seeded ? '<span style="color:var(--text-faint);">historic</span>'
          : holderTag(game, rec, gender);
        return `<strong>${ft(rec.time)}</strong> <span style="color:var(--text-faint); font-size:11px;">${rec.distanceKey}</span> ${setYear(rec)}<br>
          <span style="font-size:11.5px;">${holder}</span>`;
      };

      const columns = [
        { key: 'name', label: 'Course', render: (e) => `
          <strong>${e.championship ? '🏆 ' : ''}${Utils.escapeHtml(e.name)}</strong>
          <div style="color:var(--text-faint); font-size:11px;">${Utils.escapeHtml(locationOf(e))}</div>` },
        { key: 'terrain', label: 'Terrain', sortValue: (e) => e.hilliness, render: (e) => `${D.courseTerrain(e.hilliness)} <span style="color:var(--text-faint); font-size:11px;">${e.hilliness}</span>` },
        { key: 'altitude', label: 'Altitude', sortValue: (e) => e.altitudeFt || 0, render: (e) => D.courseAltitude(e.altitudeFt) },
        { key: 'speed', label: 'Speed', sortValue: (e) => ({ fast: 0, average: 1, slow: 2 }[D.courseSpeed(e.hilliness, e.altitudeFt).key]), render: (e) => UI.courseSpeedTag(e.hilliness, e.altitudeFt) },
        { key: 'type', label: 'Type', render: (e) => courseTypeLabel(e) }
      ];
      columns.push({ key: 'mrec', label: "Men's Record", numeric: true, sortValue: (e) => { const r = signatureRecord(game, e, 'M'); return r ? -r.time : 1; }, render: (e) => recCell(e, 'M') });
      columns.push({ key: 'wrec', label: "Women's Record", numeric: true, sortValue: (e) => { const r = signatureRecord(game, e, 'W'); return r ? -r.time : 1; }, render: (e) => recCell(e, 'W') });

      UI.renderSortableTable(tableEl, {
        columns,
        rows,
        defaultSort: 'name', defaultDir: 'asc',
        searchKeys: ['name', 'city'],
        maxRows: 900,
        emptyMessage: 'No courses match the current filters.',
        onRowClick: (e) => UI.showCourseCard(game, e.key),
        mobileCard: (e) => `
          <div class="m-head">
            <div class="m-title">${e.championship ? '🏆 ' : ''}${Utils.escapeHtml(e.name)}
              <div class="m-sub">${Utils.escapeHtml(locationOf(e))} • ${D.courseTerrain(e.hilliness)} • ${D.courseAltitude(e.altitudeFt)} altitude • ${UI.courseSpeedTag(e.hilliness, e.altitudeFt)}</div>
            </div>
          </div>
          <div class="m-sub" style="margin-top:4px;">
            ${['M', 'W'].map((gd) => { const r = signatureRecord(game, e, gd); return r ? `<div>${gd} ${r.distanceKey}: <strong>${ft(r.time)}</strong> ${setYear(r)}${r.seeded ? '' : ' — ' + holderTag(game, r, gd)}</div>` : ''; }).join('')}
          </div>`
      });
    }
    apply();

    // Recent-records panel: courses open the record book, athletes their profile.
    container.querySelectorAll('[data-cr-log-course]').forEach((el) => {
      el.addEventListener('click', () => UI.showCourseCard(game, el.dataset.crLogCourse));
    });
    // Record holders anywhere on the page (recent log + the course table)
    // open the athlete — without also opening the course row underneath.
    container.querySelectorAll('.cr-holders').forEach((zone) => {
      zone.addEventListener('click', (ev) => {
        const hit = ev.target.closest('[data-ath]');
        if (!hit || !zone.contains(hit)) return;
        ev.stopPropagation();
        if (hit.dataset.ath || hit.dataset.athName) UI.openAthlete(game, hit.dataset.ath, hit.dataset.athName);
      }, true);
    });

    const bind = (id, ev, fn) => { const el = container.querySelector(id); if (el) el.addEventListener(ev, fn); };
    bind('#cr-search', 'input', (e) => { filters.query = e.target.value; apply(); });
    bind('#cr-div', 'change', (e) => { filters.division = e.target.value; apply(); });
    bind('#cr-state', 'change', (e) => { filters.state = e.target.value; apply(); });
  }

  /* ================================================================ *
   * Course profile modal: the full record book for one course.
   * ================================================================ */
  UI.showCourseCard = function (game, courseKey) {
    const entry = Courses().book(game)[courseKey];
    if (!entry) { UI.toast('That course has no record book yet.', 'error'); return; }

    const mDist = genderDistances(entry, 'M');
    const wDist = genderDistances(entry, 'W');

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

    // The headline record for a gender: big time, holder + school (clickable),
    // meet & year, and the conditions it was set in.
    const headline = (gender) => {
      const rec = signatureRecord(game, entry, gender);
      const label = gender === 'M' ? "Men's Course Record" : "Women's Course Record";
      if (!rec) return `<div class="stat-tile"><div class="label">${label}</div><div class="value">—</div></div>`;
      const holder = rec.seeded
        ? '<span style="color:var(--text-faint);">Historic best</span>'
        : holderTag(game, rec, gender, 26);
      const school = rec.schoolId
        ? `<span class="clickable" data-school="${rec.schoolId}" style="cursor:pointer;">${Utils.escapeHtml(rec.school)}</span>`
        : Utils.escapeHtml(rec.school || '—');
      return `
        <div class="card" style="padding:12px;">
          <div style="font-size:11.5px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-faint);">${label} — ${rec.distanceKey}</div>
          <div style="font-size:26px; font-weight:800; margin:2px 0;">${ft(rec.time)} ${setYear(rec)}</div>
          <div style="font-size:13px;">${holder}</div>
          <div style="color:var(--text-dim); font-size:12px;">${school}</div>
          <div style="color:var(--text-faint); font-size:11.5px; margin-top:2px;">${Utils.escapeHtml(rec.meet || '')}${rec.year ? ` · ${rec.year}` : ''}</div>
          ${conditionsHtml(rec)}
        </div>`;
    };

    // Per-distance record rows for a gender (respects "never compare distances").
    const distRows = (gender, dists) => dists.map((dk) => {
      const rec = entry.records[`${gender}-${dk}`];
      if (!rec) return '';
      const holder = rec.seeded ? '<span style="color:var(--text-faint);">Historic best</span>'
        : holderTag(game, rec, gender);
      return `<tr>
        <td>${dk}</td>
        <td class="num"><strong>${ft(rec.time)}</strong> ${setYear(rec)}</td>
        <td>${holder}</td>
        <td style="color:var(--text-dim); font-size:12px;">${rec.seeded ? '—' : Utils.escapeHtml(rec.school)}</td>
      </tr>`;
    }).join('');

    const distTable = (gender, dists) => dists.length > 1 ? `
      <div class="card" style="padding:12px; margin-bottom:12px;">
        <h3>${gender === 'M' ? "Men's" : "Women's"} Records by Distance</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th class="col-rank">Dist</th><th class="num">Time</th><th class="col-grow">Athlete</th><th>School</th></tr></thead>
          <tbody>${distRows(gender, dists)}</tbody></table></div>
      </div>` : '';

    // Record history for the signature distance of each gender (newest→oldest),
    // preserving the entire lineage of the course record.
    const historyTable = (gender) => {
      const sig = signatureRecord(game, entry, gender);
      if (!sig) return '';
      const gk = `${gender}-${sig.distanceKey}`;
      const hist = (entry.history[gk] || []).filter((r) => !r.seeded);
      if (!hist.length) return '';
      return `
        <div class="card" style="padding:12px; margin-bottom:12px;">
          <h3>${gender === 'M' ? "Men's" : "Women's"} Record History — ${sig.distanceKey}</h3>
          <div class="table-wrap" style="max-height:240px; overflow-y:auto;"><table class="data">
            <thead><tr><th class="col-rank">Year</th><th>Athlete</th><th>School</th><th class="num">Time</th><th class="col-grow">Meet</th></tr></thead>
            <tbody>${hist.map((r) => `
              <tr>
                <td>${r.year}</td>
                <td>${holderTag(game, r, gender)}</td>
                <td><span class="${r.schoolId ? 'clickable' : ''}" ${r.schoolId ? `data-school="${r.schoolId}" style="cursor:pointer;"` : ''}>${Utils.escapeHtml(r.school)}</span></td>
                <td class="num">${ft(r.time)}</td>
                <td style="color:var(--text-dim); font-size:12px;">${Utils.escapeHtml(r.meet || '')}</td>
              </tr>`).join('')}
            </tbody></table></div>
        </div>`;
    };

    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <h2 style="margin:0 0 2px;">${entry.championship ? '🏆 ' : ''}${Utils.escapeHtml(entry.name)}</h2>
      <div style="color:var(--text-dim); font-size:13px; margin-bottom:12px;">
        📍 ${Utils.escapeHtml(locationOf(entry))} • ${D.courseTerrain(entry.hilliness)} terrain (${entry.hilliness}/100) •
        ${D.courseAltitude(entry.altitudeFt)} altitude • ${UI.courseSpeedTag(entry.hilliness, entry.altitudeFt)}${entry.conference ? ' • ' + Utils.escapeHtml(entry.conference) : ''}
        ${isChampionshipCourse(entry) ? ' • <span style="color:var(--accent);">Championship course</span>' : ''}
      </div>

      <div class="grid cols-2" style="margin-bottom:14px;">
        ${headline('M')}
        ${headline('W')}
      </div>

      ${distTable('M', mDist)}
      ${distTable('W', wDist)}
      ${historyTable('M')}
      ${historyTable('W')}
      ${(!hasRealRecord(entry)) ? '<div class="card" style="padding:12px; color:var(--text-dim); font-size:12.5px;">No dynasty record has been set here yet — the marks above are the historical baseline. Run a fast enough time on this course and your athlete will enter the record book.</div>' : ''}
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

  UI.screens.courses = { render };
})();
