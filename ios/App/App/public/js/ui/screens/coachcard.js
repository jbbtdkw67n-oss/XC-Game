/*
 * Shared coach profile modal (Update 3): a detailed résumé for any coach —
 * active or retired — mirroring the athlete card. Age, career record,
 * schools coached with a timeline, reputation, Coach of the Year awards,
 * team and individual championships, athletes coached, winning percentage,
 * recruiting rankings, personality, coaching style, and career prestige.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const D = window.XCD.data;

  function tendencyLabels(coach) {
    return (coach.tendencies || [])
      .map((k) => (D.COACH_TENDENCIES.find((t) => t.key === k) || {}).label || k);
  }

  function philosophyLine(coach) {
    const tp = D.trainingPhilosophy(coach.trainingPhilosophy);
    const rp = D.racePhilosophy(coach.racePhilosophy);
    return `${tp.icon} ${tp.label} · ${rp.icon} ${rp.label}`;
  }

  /*
   * `coach` is a live Coach instance (has schoolId, ratings) OR a retired
   * registry record (has careerRecord, stints, reputationLabel). Both share
   * enough shape to render a profile; missing live-only fields degrade gracefully.
   */
  UI.showCoachCard = function (coach, game, opts = {}) {
    const cr = coach.careerRecord || {};
    const retired = !!opts.retired || (!coach.schoolId && !coach.id);
    const school = (coach.schoolId && game) ? game.getSchool(coach.schoolId) : null;
    const repLabel = coach.reputationLabel ||
      ((D.reputationLevel(coach.reputation || 0, coach.role) || {}).label || '');
    const repIcon = (D.reputationLevel(coach.reputation || 0, coach.role) || {}).icon || '';
    const archIcon = (D.COACH_ARCHETYPES.find((a) => a.key === coach.archetype) || {}).icon || '🧢';

    const winPct = coach.winPct !== undefined ? coach.winPct
      : (() => { const g = (cr.wins || 0) + (cr.losses || 0); return g ? Math.round((cr.wins / g) * 1000) / 10 : 0; })();

    // Career timeline from stints (schools coached, in order, with years).
    const stints = (coach.stints || []).slice().sort((a, b) => a.startYear - b.startYear);
    const yearsCoached = cr.seasons || stints.reduce((s, st) => s + Math.max(0, (st.endYear || (game ? game.year : st.startYear)) - st.startYear), 0);

    const ratingRow = (label, val) => `
      <div class="attr-row"><span class="attr-name">${label}</span>${UI.ratingBadge(Math.round(val || 0))}</div>`;

    const stat = (label, val, sub) => `
      <div class="stat-tile"><div class="label">${label}</div><div class="value">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;


    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <div class="player-card-header">
        <div style="flex:0 0 auto; margin-right:14px;">${UI.avatar(coach, { size: 64, outfit: 'suit' })}</div>
        <div class="who">
          <h2>${archIcon} ${Utils.escapeHtml(coach.fullName || coach.name || `${coach.firstName || ''} ${coach.lastName || ''}`)}${coach.isPlayer ? ' <span style="color:var(--accent);">(You)</span>' : ''}</h2>
          <div class="sub">
            ${retired ? '<span style="color:var(--text-faint);">Retired</span> • ' : ''}Age ${coach.age || '—'} •
            ${school ? Utils.escapeHtml(school.name) + ' (' + Utils.escapeHtml(school.conference) + ')' : (retired ? 'Career complete' : 'Free agent')}
          </div>
          <div class="sub">${repIcon} ${Utils.escapeHtml(repLabel)} • ${Utils.escapeHtml(coach.archetype || 'Developer')}${coach.role === 'Assistant' ? ` • <span style="color:var(--accent);">${coach.isPlayer ? 'Recruiting Coordinator' : 'Assistant Coach'}</span>` : ''}</div>
          ${(coach.hometown || coach.almaMater) ? `<div class="sub">${coach.hometown ? `🏠 ${Utils.escapeHtml(coach.hometown)}` : ''}${coach.hometown && coach.almaMater ? ' • ' : ''}${coach.almaMater ? `🎓 ${Utils.escapeHtml(coach.almaMater)}` : ''}${coach.careerRecord && coach.careerRecord.seasons ? ` • ${coach.careerRecord.seasons} yr${coach.careerRecord.seasons === 1 ? '' : 's'} experience` : ''}</div>` : ''}
          <div class="sub">${philosophyLine(coach)}</div>
          ${(!retired && school && coach.role !== 'Assistant' && coach.reputation !== undefined) ? (() => {
            const st = D.seatStatus(coach.hotSeat || 0);
            const color = st.key === 'hot' ? 'var(--danger)' : st.key === 'warm' ? 'var(--warning)' : 'var(--success)';
            // Hot Seat counter (Update 13): three consecutive Hot Seat seasons
            // and the job is gone — surface the clock so it's never a surprise.
            const yrs = coach.hotSeatYears || 0;
            const clock = (st.key === 'hot' && yrs >= 1)
              ? ` <span style="color:var(--danger); font-weight:600;">— Year ${yrs} of 3</span>` : '';
            return `<div class="sub" title="${st.desc} Three straight seasons on the Hot Seat ends the tenure.">Job security: <span style="color:${color}; font-weight:600;">${st.icon} ${st.label}</span>${clock}</div>`;
          })() : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:26px; font-weight:800;">${Math.round(coach.reputation || 0)}</div>
          <div style="font-size:12px; color:var(--text-dim);">CAREER PRESTIGE</div>
          <div style="font-size:12px; color:var(--text-faint); margin-top:2px;">${winPct}% win rate</div>
        </div>
      </div>

      <div class="grid cols-4" style="margin-bottom:16px;">
        ${stat('Record', `${cr.wins || 0}-${cr.losses || 0}`, `${yearsCoached} yrs · ${cr.seasons || 0} seasons`)}
        ${stat('National Titles', cr.nationalTitles || 0, `${cr.conferenceTitles || 0} conf · ${cr.regionalTitles || 0} reg`)}
        ${stat('Coach of Year', `${cr.natCOY || 0}🇺🇸 ${cr.confCOY || 0}🏅`, 'national · conference')}
        ${stat('Nationals Trips', cr.nationalsAppearances || 0, `best class #${cr.bestClassRank || '—'}`)}
      </div>

      <div class="pc-tabs" role="tablist">
        <button data-pctab="overview" class="active">Overview</button>
        <button data-pctab="accolades">Accolades</button>
        <button data-pctab="history">History</button>
        <button data-pctab="tree">Tree</button>
      </div>

      <div class="pc-tabpane" data-pcpane="overview">
      <div class="grid cols-2" style="margin-bottom:14px;">
        <div class="card" style="padding:12px;">
          <h3>Athletes Coached</h3>
          <div class="attr-row"><span class="attr-name">All-Americans</span><span><strong>${cr.allAmericans || 0}</strong></span></div>
          <div class="attr-row"><span class="attr-name">All-Conference</span><span><strong>${cr.allConference || 0}</strong></span></div>
          <div class="attr-row"><span class="attr-name">National Champions</span><span><strong>${cr.indivNatChamps || 0}</strong></span></div>
          <div class="attr-row"><span class="attr-name">Conference Champions</span><span><strong>${cr.indivConfChamps || 0}</strong></span></div>
          <div class="attr-row"><span class="attr-name">Best Recruiting Class</span><span><strong>${cr.bestClassRank ? '#' + cr.bestClassRank : '—'}</strong></span></div>
        </div>
        <div class="card" style="padding:12px;">
          <h3>Coaching Craft</h3>
          ${coach.recruiting !== undefined ? `
            ${ratingRow('Recruiting', coach.recruiting)}
            ${ratingRow('Training', coach.training)}
            ${ratingRow('Peaking', coach.peaking)}
            ${ratingRow('Team Culture', coach.culture)}
          ` : '<div style="color:var(--text-dim); font-size:13px;">Ratings not tracked for retired coaches.</div>'}
          <div class="attr-row" style="margin-top:6px;"><span class="attr-name">Style</span><span style="font-size:12px; color:var(--text-dim);">${tendencyLabels(coach).join(', ') || '—'}</span></div>
        </div>
      </div>
      </div>

      <div class="pc-tabpane" data-pcpane="accolades" hidden>
      ${(() => {
        // Organized Career Accolades (History & Legacy update, Phase 9):
        // every accomplishment CATEGORY is grouped together with its years
        // listed chronologically — "D1 National Championships: 2028 · 2030",
        // "National Coach of the Year: 2026 · 2027 · 2028" — instead of one
        // long chronological list. Team championships are reconstructed from
        // history by matching the coach's stints to each season's champions
        // (national titles by team id; regional/conference titles by the
        // program's name that season, realignment-safe); Coach-of-the-Year
        // awards come from the permanent coach accolade ledger.
        const H = game ? (game.history || {}) : {};
        const short = { DI: 'D1', DII: 'D2', DIII: 'D3' };
        // section: 0 National · 1 Regional · 2 Conference. Categories keep
        // insertion order within their section.
        const cats = new Map(); // key -> { section, icon, label, entries: [{year, ctx}] }
        const add = (section, key, icon, label, year, ctx) => {
          if (!cats.has(key)) cats.set(key, { section, icon, label, entries: [] });
          cats.get(key).entries.push({ year, ctx: ctx || '' });
        };
        if (game && stints.length) {
          const nowYear = game.year;
          stints.forEach((st) => {
            const end = st.endYear || nowYear;
            const div = st.division || 'DI';
            for (let y = st.startYear; y <= end; y++) {
              const nat = (H.nationalChampions || {})[y] || {};
              ['M', 'W'].forEach((g) => {
                const key = div === 'DI' ? g : `${div}-${g}`;
                if (nat[key] && nat[key].teamId === st.schoolId) {
                  add(0, `nat-${div}`, '🏆', `${short[div] || div} National Championships`, y, g);
                }
              });
              Object.entries((H.regionalChampions || {})[y] || {}).forEach(([rkey, name]) => {
                if (name !== st.school) return;
                add(1, 'reg', '🗺', 'Regional Championships', y, `${rkey.slice(0, -2)}, ${rkey.endsWith('-M') ? 'M' : 'W'}`);
              });
              Object.entries((H.conferenceChampions || {})[y] || {}).forEach(([ckey, name]) => {
                if (name !== st.school) return;
                add(2, 'conf', '🥇', 'Conference Championships', y, `${ckey.slice(0, -2)}, ${ckey.endsWith('-M') ? 'M' : 'W'}`);
              });
            }
          });
        }
        const Legacy = window.XCD.engine.Legacy;
        (Legacy ? Legacy.coachAccoladesFor(coach) : []).forEach((a) => {
          if (a.type === 'natCOY') {
            add(0, 'natCOY', '🏅', 'National Coach of the Year', a.year, short[a.division] || a.division || '');
          } else if (a.type === 'confCOY') {
            add(2, 'confCOY', '🏅', 'Conference Coach of the Year', a.year, a.conference || '');
          } else {
            add(a.conference ? 2 : 0, `x-${a.type}`, '🏅', a.label || a.type, a.year, a.conference || short[a.division] || '');
          }
        });
        const total = [...cats.values()].reduce((s, c) => s + c.entries.length, 0);
        if (!total) return '<div class="card" style="padding:14px; color:var(--text-dim);">No championships or major awards yet.</div>';
        // Clean, scrollable accolade rows — a leading medal circle toned by
        // level (national → gold, regional → accent, conference → good), the
        // honor's name and count, and every year it was won on the right.
        const toneFor = (section) => section === 0 ? 'gold' : section === 1 ? 'accent' : 'good';
        const yearTag = (e) => e.ctx
          ? `${e.year} <span style="color:var(--text-faint);">(${Utils.escapeHtml(e.ctx)})</span>`
          : `${e.year}`;
        const rows = [...cats.values()]
          .sort((a, b) => a.section - b.section)
          .map((c) => {
            c.entries.sort((x, y) => x.year - y.year);
            return UI.listRow({
              badge: c.icon, tone: toneFor(c.section),
              title: Utils.escapeHtml(c.label),
              tag: c.entries.length > 1 ? `×${c.entries.length}` : '',
              sub: c.entries.map(yearTag).join(' · ')
            });
          });
        return `
        <div class="card" style="padding:12px; margin-bottom:14px;">
          <h3>Career Accolades — ${total}</h3>
          ${UI.listGroup(rows)}
        </div>`;
      })()}
      </div>

      <div class="pc-tabpane" data-pcpane="history" hidden>
      <div class="card" style="padding:12px;">
        <h3>Career Timeline — ${stints.length} stop${stints.length === 1 ? '' : 's'}</h3>
        ${stints.length
          ? UI.listGroup(stints.slice().reverse().map((s) => {
              const end = s.endYear ? s.endYear : (retired ? s.endYear : 'present');
              const div = s.division && s.division !== 'DI' ? ` <span class="tag">${s.division}</span>` : '';
              return UI.listRow({
                badge: s.role === 'Assistant' ? '👔' : '🏫',
                tone: s.role === 'Assistant' ? 'muted' : 'accent',
                title: `${Utils.escapeHtml(s.school)}${div}`,
                sub: s.role === 'Assistant' ? 'Assistant Coach' : 'Head Coach',
                meta: `${s.startYear}–${end}`
              });
            }))
          : '<div style="color:var(--text-dim); font-size:13px;">No coaching stops recorded.</div>'}
      </div>
      </div>

      <div class="pc-tabpane" data-pcpane="tree" hidden>
      ${(() => {
        // Coaching tree (Update 6, Section 1): mentors above, protégés below.
        const mentor = coach.mentorName;
        const served = (coach.workedFor || []);
        const tree = (coach.coachingTree || []);
        if (!mentor && !served.length && !tree.length) {
          return '<div class="card" style="padding:14px; color:var(--text-dim);">No coaching-tree connections recorded — this career stands on its own.</div>';
        }
        const protegeRow = (t) => {
          // A protégé may still be coaching (live lookup) or long retired
          // (registry lookup) — show where their own career went.
          let status = '';
          if (game) {
            const live = t.coachId && game.world.coaches[t.coachId];
            if (live) {
              const s = live.schoolId && game.getSchool(live.schoolId);
              status = `${s ? 'now at ' + s.name : 'between jobs'} • ${(live.careerRecord || {}).nationalTitles || 0} natl titles`;
            } else {
              const reg = (game.history.coachRegistry || []).slice().reverse().find((r) => r.name === t.name);
              if (reg) status = `retired • ${(reg.careerRecord || {}).nationalTitles || 0} natl titles`;
            }
          }
          return UI.listRow({
            badge: '🧢', tone: 'muted',
            title: Utils.escapeHtml(t.name),
            sub: `→ ${Utils.escapeHtml(t.school)} (${t.year})`,
            meta: `<span class="small">${Utils.escapeHtml(status)}</span>`
          });
        };
        return `
        <div class="card" style="padding:12px;">
          <h3>🌳 Coaching Tree</h3>
          ${mentor ? `<div class="attr-row"><span>Mentored under</span><span style="color:var(--text-dim);">${Utils.escapeHtml(mentor)}</span></div>` : ''}
          ${served.length > (mentor ? 1 : 0) ? `<div class="attr-row"><span>Worked for</span><span style="color:var(--text-dim); font-size:12px;">${served.map((w) => Utils.escapeHtml(w.name)).join(', ')}</span></div>` : ''}
          ${tree.length ? `
            <div style="font-size:12px; color:var(--text-faint); margin:10px 0 4px;">Former assistants who became head coaches — ${tree.length}</div>
            ${UI.listGroup(tree.map(protegeRow))}` : ''}
        </div>`;
      })()}
      </div>
    `, (modal) => { UI.wireProfileTabs(modal); });
  };
})();
