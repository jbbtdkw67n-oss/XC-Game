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

    const timelineHtml = stints.length ? stints.map((s) => {
      const end = s.endYear ? s.endYear : (retired ? s.endYear : 'present');
      const div = s.division && s.division !== 'DI' ? ` <span style="color:var(--text-faint);">${s.division}</span>` : '';
      const roleTag = s.role === 'Assistant' ? ' <span style="color:var(--text-faint); font-size:11px;">(Assistant)</span>' : '';
      return `<div class="attr-row">
        <span>${Utils.escapeHtml(s.school)}${div}${roleTag}</span>
        <span style="color:var(--text-dim);">${s.startYear}–${end}</span>
      </div>`;
    }).join('') : '<div style="color:var(--text-dim); font-size:13px;">No coaching stops recorded.</div>';

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

      <div class="grid cols-4" style="margin-bottom:14px;">
        ${stat('Record', `${cr.wins || 0}-${cr.losses || 0}`, `${yearsCoached} yrs · ${cr.seasons || 0} seasons`)}
        ${stat('National Titles', cr.nationalTitles || 0, `${cr.conferenceTitles || 0} conf · ${cr.regionalTitles || 0} reg`)}
        ${stat('Coach of Year', `${cr.natCOY || 0}🇺🇸 ${cr.confCOY || 0}🏅`, 'national · conference')}
        ${stat('Nationals Trips', cr.nationalsAppearances || 0, `best class #${cr.bestClassRank || '—'}`)}
      </div>

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

      ${(() => {
        // Career Accolades (Update 12): the coach's full trophy ledger,
        // organized like the athlete profile — National, Regional, and
        // Conference honors in their own sections, chronological within
        // each. Team championships are reconstructed from history by
        // matching the coach's stints to each season's champions (national
        // titles match by team id; regional/conference titles match by the
        // program's name that season, realignment-safe); Coach-of-the-Year
        // awards come from the permanent coach accolade ledger.
        const H = game ? (game.history || {}) : {};
        const short = { DI: 'D1', DII: 'D2', DIII: 'D3' };
        const groups = [
          { label: 'National', rows: [] },
          { label: 'Regional', rows: [] },
          { label: 'Conference', rows: [] }
        ];
        if (game && stints.length) {
          const nowYear = game.year;
          stints.forEach((st) => {
            const end = st.endYear || nowYear;
            for (let y = st.startYear; y <= end; y++) {
              const nat = (H.nationalChampions || {})[y] || {};
              ['M', 'W'].forEach((g) => {
                const key = (st.division || 'DI') === 'DI' ? g : `${st.division}-${g}`;
                if (nat[key] && nat[key].teamId === st.schoolId) {
                  groups[0].rows.push({ year: y, html: `🏆 ${y} NCAA ${short[st.division || 'DI'] || ''} Team National Champions (${g === 'M' ? "Men's" : "Women's"})` });
                }
              });
              Object.entries((H.regionalChampions || {})[y] || {}).forEach(([rkey, name]) => {
                if (name !== st.school) return;
                const g = rkey.endsWith('-M') ? 'M' : 'W';
                groups[1].rows.push({ year: y, html: `🗺 ${y} ${Utils.escapeHtml(rkey.slice(0, -2))} Regional Champions (${g === 'M' ? "Men's" : "Women's"})` });
              });
              Object.entries((H.conferenceChampions || {})[y] || {}).forEach(([ckey, name]) => {
                if (name !== st.school) return;
                const g = ckey.endsWith('-M') ? 'M' : 'W';
                groups[2].rows.push({ year: y, html: `🥇 ${y} ${Utils.escapeHtml(ckey.slice(0, -2))} Champions (${g === 'M' ? "Men's" : "Women's"})` });
              });
            }
          });
        }
        const Legacy = window.XCD.engine.Legacy;
        (Legacy ? Legacy.coachAccoladesFor(coach) : []).forEach((a) => {
          const row = {
            year: a.year,
            html: `🏅 ${a.year} ${a.conference ? Utils.escapeHtml(a.conference) : (short[a.division] || a.division || '')} ${Utils.escapeHtml(a.label)}`
          };
          (a.conference ? groups[2] : groups[0]).rows.push(row);
        });
        const total = groups.reduce((s, gp) => s + gp.rows.length, 0);
        if (!total) return '';
        groups.forEach((gp) => gp.rows.sort((x, y) => x.year - y.year));
        return `
        <div class="card" style="padding:12px; margin-bottom:14px;">
          <h3>Career Accolades — ${total}</h3>
          <div style="max-height:260px; overflow-y:auto;">
            ${groups.filter((gp) => gp.rows.length).map((gp) => `
              <div style="margin-bottom:6px;">
                <div style="font-size:11.5px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-faint); margin:4px 0;">${gp.label} — ${gp.rows.length}</div>
                ${gp.rows.map((r) => `<div class="attr-row" style="padding:4px 0;"><span>${r.html}</span></div>`).join('')}
              </div>`).join('')}
          </div>
        </div>`;
      })()}

      <div class="card" style="padding:12px;">
        <h3>Career Timeline — ${stints.length} stop${stints.length === 1 ? '' : 's'}</h3>
        ${timelineHtml}
      </div>

      ${(() => {
        // Coaching tree (Update 6, Section 1): mentors above, protégés below.
        const mentor = coach.mentorName;
        const served = (coach.workedFor || []);
        const tree = (coach.coachingTree || []);
        if (!mentor && !served.length && !tree.length) return '';
        const protege = (t) => {
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
          return `<div class="attr-row">
            <span>↳ ${Utils.escapeHtml(t.name)} <span style="color:var(--text-faint); font-size:11.5px;">→ ${Utils.escapeHtml(t.school)} (${t.year})</span></span>
            <span style="color:var(--text-dim); font-size:11.5px;">${Utils.escapeHtml(status)}</span>
          </div>`;
        };
        return `
        <div class="card" style="padding:12px; margin-top:14px;">
          <h3>🌳 Coaching Tree</h3>
          ${mentor ? `<div class="attr-row"><span>Mentored under</span><span style="color:var(--text-dim);">${Utils.escapeHtml(mentor)}</span></div>` : ''}
          ${served.length > (mentor ? 1 : 0) ? `<div class="attr-row"><span>Worked for</span><span style="color:var(--text-dim); font-size:12px;">${served.map((w) => Utils.escapeHtml(w.name)).join(', ')}</span></div>` : ''}
          ${tree.length ? `
            <div style="font-size:12px; color:var(--text-faint); margin:8px 0 4px;">Former assistants who became head coaches — ${tree.length}</div>
            ${tree.map(protege).join('')}` : ''}
        </div>`;
      })()}
    `);
  };
})();
