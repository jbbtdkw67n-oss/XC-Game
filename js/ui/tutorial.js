/*
 * First-Season Tutorial (Update 15).
 *
 * A brand-new dynasty opens on the coach's origin story, then offers a
 * skippable, step-by-step walkthrough of the whole game — the weekly
 * rhythm and Inbox, Week 1 setup and the Schedule Builder, training (Base,
 * Sharpening, the one peak per season), development, the Race-Day Top 7,
 * recruiting, race days and NCAA selection, expectations and the Hot Seat,
 * the offseason (job market, followers, the portal), and where everything
 * lives.
 * Accepting it also turns on one-time tip banners on every screen for the
 * FIRST SEASON ONLY. The tutorial belongs to the dynasty's FIRST coach:
 * it never appears again for a successor coach created inside the same
 * dynasty (Careers.retireAndSucceed clears it), and never for loaded
 * dynasties that already saw it.
 *
 * State lives on gameState.tutorial = { pending, tipsYear, seen } and is
 * persisted with the save.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  const STORY = 'After winning back to back state championships at a small high school you decide to test your abilities at the collegiate level. Recruit, train, and race your way to being the next legendary college coach.';

  /* The guided walkthrough — one card per system. */
  const STEPS = [
    {
      icon: '🏫', title: 'Welcome, Coach',
      body: () => {
        const game = UI.state.game;
        const school = game.getPlayerSchool();
        return `You now run <strong>${Utils.escapeHtml(school.name)}</strong> (${Utils.escapeHtml(school.conference)}).
          Your job: build the nation's best cross country program — <strong>recruit</strong> talent,
          <strong>train</strong> it into champions, and <strong>race</strong> for conference, regional, and national titles.
          A dynasty spans decades: when you eventually retire, a successor coach carries the same world forward.`;
      }
    },
    {
      icon: '🔁', title: 'The Weekly Rhythm',
      body: () => `Every week follows the same three steps, shown in the bar at the top of the screen:
        <br><br><strong>1 · Training Plan</strong> — confirm the week's workouts.
        <br><strong>2 · Recruiting</strong> — work your board, then press "Done Recruiting".
        <br><strong>3 · Advance</strong> — the <strong>Advance Week ▸</strong> button plays the week out.
        <br><br>📥 The <strong>Inbox</strong> keeps a <strong>Needs you now</strong> list of every open decision
        (training, recruiting, job offers, roster cuts…) above a feed of injuries, commits, and results.
        <br>⏩ <strong>Sim to Race</strong> fast-forwards quiet weeks; the ▾ beside it sims to Conference, Nationals,
        Signing Day, or next season, stopping early when something needs you and showing a Sim Report.`
    },
    {
      icon: '📅', title: 'Week 1: Season Setup',
      body: () => `Each season opens with a <strong>Week 1 checklist</strong> at the top of the Dashboard —
        Week 2 stays locked until it's done. Review the summer's progress, confirm your roster
        (Division I carries a hard limit of 14 per gender, so cut down if you're over), check your staff,
        and build your schedule.
        <br><br>In the <strong>Schedule Builder</strong> pick <strong>3–7 meets</strong> across Weeks 4–12.
        Every meet shows its trip cost, bus or flight, ⚡ fast or 🐢 slow course, and field size, and your
        <strong>travel budget</strong> is a hard limit. Bigger invitationals with strong fields earn more
        poll credit — but only if you can hang with them. Finalizing locks the slate for the season.`
    },
    {
      icon: '📋', title: 'Training: Base & Sharpening',
      body: () => `On the <strong>Training</strong> screen you set each squad's Monday–Sunday plan and mileage.
        Mileage, threshold, and long runs build <strong>Base</strong> — slow to build, slow to fade, and the ceiling
        for everything else. Intervals, speed, and racing build <strong>Sharpening</strong> fast, but hard sharp work
        held week after week goes <strong>stale</strong>. Every workout shows what it builds and its weekly limit.
        <br><br>There's no single right way: big aerobic volume, sharp low-volume speed, or the balanced middle —
        the <strong>Training approaches</strong> guide explains each. <strong>🎯 Ideal Mileage</strong> sets every runner
        to the most their body can absorb right now. Ramp up gradually: big jumps in miles or quality work are
        <strong>load spikes</strong> that raise injury risk.`
    },
    {
      icon: '⚡', title: 'One Peak Per Season',
      body: () => `Normal training charges your <strong>taper</strong>. Run the <strong>Championship taper</strong>
        preset (about a 30% cut, with a quality session) the week <em>before</em> the race that matters most and your
        squad peaks for it — then the peak fades. Taper for Conference and you'll fly there, but you won't have it at
        Nationals. You get one per season, so choose wisely.
        <br><br>Above about 35 fatigue, part of each week's work is banked (<strong>Absorbing</strong>) and lands
        as fatigue comes down. A 🛌 <strong>Down Week</strong> sheds fatigue and staleness without spending your peak.
        The <strong>Squad Form</strong> card tracks your top 7's Base, Sharpening, Staleness, and taper charge.`
    },
    {
      icon: '🌱', title: 'How Runners Develop',
      body: () => `Every athlete grows by the same rules, in season and over the summer: the
        <strong>room to grow</strong> between their overall and their ceiling, their <strong>development curve</strong>
        (Early Riser, Late Bloomer, Phenom, Limited…), your program (coaching and facilities), and the quality of
        their training. Raw, high-potential runners can jump 20–30 overall in a year.
        <br><br>The player card's <strong>Ceiling Here</strong> line shows how far a runner will go at your program.
        Every runner also has a <strong>build</strong> — a real strength and a real weakness (the kicker who fades at
        10K, the engine with no finishing gear) — and learns Race IQ on the course. Injuries cost overall,
        but it comes back quickly once they're training again.`
    },
    {
      icon: '👟', title: 'Your Roster & Race-Day Top 7',
      body: () => `The <strong>Roster</strong> screen ("Team" tab) is your depth chart. Seven runners race varsity
        and the top five score. The <strong>Race-Day Top 7</strong> card races your seven best by default — switch to
        <strong>Custom</strong> (or tap <strong>Top 7</strong> on any runner) to choose your own lineup.
        <br><br>Every athlete gets <strong>five full years of eligibility</strong>. Watch <strong>transfer risk</strong>:
        a good runner you keep out of the lineup feels buried, and each athlete has their own relationship with you.
        Racing them builds trust; benching them wears it down.`
    },
    {
      icon: '🎯', title: 'Recruiting',
      body: () => `On the <strong>Recruiting</strong> screen, search the national class and add targets to your board.
        Each week you get <strong>recruiting points</strong> (plus a yearly budget) to spend on letters, calls,
        scouting trips, and visits — these build the <strong>relationship</strong> and <strong>interest</strong> that
        decide where a recruit signs. Scout to lift the fog off their ratings, then offer a scholarship.
        <br><br>💬 <strong>Sway is YOUR edge:</strong> once a recruit is genuinely considering you, a Sway visit
        swings their momentum your way far more reliably than any CPU program can manage.
        <strong>Auto Recruiting</strong> has your staff work your board for you. Signing Day is Week 19.`
    },
    {
      icon: '🏁', title: 'Race Days & the Postseason',
      body: () => `Your meets run on the weeks you scheduled, then <strong>Conference (Week 13) → Regionals (14) →
        Nationals (15)</strong>. The <strong>Race Center</strong> replays every race with live scoring and 1 km splits.
        Weather matters — heat is slow, cold is fast, and wind, rain, and mud cost time — and at championships every
        team has a good or bad day, so close title races can flip.
        <br><br>The <strong>polls</strong> are driven by head-to-head results: beat ranked teams to climb. After
        Regionals, the top 2 per region qualify for Nationals and at-large bids go by <strong>Kolas points</strong>
        (wins over teams already in the field) — see <strong>Rankings → 🎟 Selection</strong>.`
    },
    {
      icon: '🔥', title: 'Expectations & Your Job',
      body: () => `Each preseason your athletic director sets a <strong>target finish</strong> for each squad from last
        season's finish, the preseason poll, your roster's talent, and program prestige — it's on the Dashboard under
        <strong>Program Expectations</strong>. Fall short and your seat heats up; too many straight seasons on the
        <strong>Hot Seat</strong> and you're fired. Beat expectations and the seat cools.
        <br><br>⚙ <strong>Settings</strong> lets you tune the challenge — CPU recruiting strength, injuries, Hot Seat
        patience, transfer pressure — with Rookie, Normal, Veteran, and Legend presets.`
    },
    {
      icon: '🔄', title: 'The Offseason',
      body: () => `After Nationals comes the awards week, then the <strong>coaching market</strong>: an
        <strong>Available Jobs</strong> popup lists every chair that wants you, with a side-by-side comparison against
        your program. Take one, turn them down, or decide later from the Dashboard. Take a new head job and up to
        <strong>three of your runners</strong> may follow you.
        <br><br>The <strong>Transfer Portal</strong> (under Portal) opens too. You get a <strong>Transfer Points</strong>
        budget — slide enough points onto an athlete to lock the commit at <strong>100%</strong>, or spread them out
        and take your odds. Over the summer your runners develop and every injury heals before the new season.`
    },
    {
      icon: '🗺', title: 'Finding Everything',
      body: () => `${UI.isMobile()
        ? 'The bottom tab bar holds the weekly essentials; everything else lives under <strong>☰ More</strong>'
        : 'The left sidebar holds every screen'} —
        <strong>Rankings</strong>, <strong>My Program</strong> (facilities, staff, philosophies, travel budget),
        <strong>News</strong> (the wire, season Awards, and preseason Teams to Watch), <strong>History</strong>
        (records, GOAT lists, Hall of Fame), <strong>Course Records</strong>, <strong>World</strong>, and
        <strong>Save / Load</strong>. The game autosaves every week you advance.
        <br><br>💡 ${UI.isMobile() ? 'Long-press' : 'Hover over'} any control or label to read what it does.
        During your first season, one-time tips appear at the top of each screen you visit —
        dismiss them with ✕. Good luck, Coach!`
    }
  ];

  /* One-time, first-season tip banners per screen. */
  const TIPS = {
    dashboard: 'Your home base: weekly tasks, your Program Expectations, team snapshots, and each season\'s Week 1 setup checklist all live here. Follow the 1-2-3 steps in the top bar every week.',
    inbox: 'Everything that needs a decision sits under Needs you now; below it is a feed of injuries, commits, results, and job news. Open jumps straight to the right screen.',
    roster: 'Tap any runner for their full card. Seven race and the top five score — use the Race-Day Top 7 card to pick your own lineup. Ideal Mileage sets every runner\'s miles in one tap.',
    training: 'Set the weekly plan and mileage for each squad, then press Confirm Plan. Build Base early, sharpen late, and save the Championship taper for the race that matters most — you only get one peak per season.',
    recruiting: 'Spend weekly points on calls, visits, and scouting to build relationships. Offer scholarships to your top targets, and use Sway to close recruits who are already considering you — it\'s your biggest edge.',
    portal: 'Slide Transfer Points onto portal athletes — enough points locks a commit at 100%. Your budget comes from prestige and your recruiting skill, so spend it where the fit is right.',
    schedule: 'Pick 3–7 meets in Week 1 within your travel budget, then finalize — the schedule locks for the season. Bigger invitationals carry more poll weight, so race the best if you can hang with them.',
    racecenter: 'Watch full race replays with live team scoring and 1 km splits here after every meet.',
    rankings: 'Polls move on head-to-head results. Selection shows how the NCAA at-large bids fall by Kolas points.',
    school: 'My Program: upgrade facilities and the travel program, manage staff, set your training and race philosophies, and fundraise. Facilities sell recruits.',
    shop: 'Spend dynasty points earned from titles and top classes on permanent program perks.',
    news: 'The national wire, the season\'s Awards (national and conference), and the preseason Teams to Watch.',
    history: 'Every champion, record, award, and Hall of Famer your world produces is archived here forever.',
    courses: 'Every course keeps its own record book, men\'s and women\'s, set only by real races.',
    world: 'Browse every program in all three divisions — rosters, coaches, prestige, and history.',
    settings: 'Tune the difficulty (or pick a preset), switch between light and dark themes, and change the text size.',
    saves: 'Each dynasty saves independently, and the game autosaves weekly. Export a save file here for safekeeping.'
  };

  function overlayEl() { return document.getElementById('tutorial-overlay'); }
  function removeOverlay() { const el = overlayEl(); if (el) el.remove(); }

  function showOverlay(html, onMount) {
    removeOverlay();
    const el = document.createElement('div');
    el.id = 'tutorial-overlay';
    el.innerHTML = `<div class="tutorial-card">${html}</div>`;
    document.body.appendChild(el);
    if (onMount) onMount(el);
  }

  /* ---------------- The origin story ---------------- */
  function showIntro(game) {
    const coach = game.getPlayerCoach();
    showOverlay(`
      <div class="tutorial-story">
        <div class="tutorial-emblem">🏆</div>
        <h2>The Road to Legendary</h2>
        <p class="tutorial-story-text">${STORY}</p>
        <div class="tutorial-signature">— Coach ${Utils.escapeHtml(coach ? coach.lastName : '')}, ${game.year}</div>
        <button class="btn primary" id="tut-begin" style="width:100%; margin-top:18px;">🏁 Begin Your Journey</button>
      </div>
    `, (el) => {
      el.querySelector('#tut-begin').addEventListener('click', () => showPrompt(game));
    });
  }

  /* ---------------- Take the tutorial? ---------------- */
  function showPrompt(game) {
    showOverlay(`
      <div class="tutorial-story">
        <div class="tutorial-emblem">📖</div>
        <h2>First Season at the College Level</h2>
        <p class="tutorial-story-text">Want a quick walkthrough of how everything works — season setup, training
          and peaking, recruiting, race weeks, your job, and the offseason? It takes a couple of minutes, and helpful
          tips will appear on each screen during your first season.</p>
        <button class="btn primary" id="tut-start" style="width:100%; margin-top:16px;">📖 Show Me the Ropes</button>
        <button class="btn" id="tut-skip" style="width:100%; margin-top:8px;">Skip — I Know What I'm Doing</button>
      </div>
    `, (el) => {
      el.querySelector('#tut-start').addEventListener('click', () => showStep(game, 0));
      el.querySelector('#tut-skip').addEventListener('click', () => finish(game, false));
    });
  }

  /* ---------------- The walkthrough steps ---------------- */
  function showStep(game, i) {
    const step = STEPS[i];
    const last = i === STEPS.length - 1;
    showOverlay(`
      <div class="tutorial-step">
        <div class="tutorial-dots">${STEPS.map((s, j) =>
          `<span class="tutorial-dot ${j === i ? 'active' : j < i ? 'done' : ''}"></span>`).join('')}</div>
        <div class="tutorial-emblem">${step.icon}</div>
        <h2>${step.title}</h2>
        <p class="tutorial-step-text">${step.body()}</p>
        <div style="display:flex; gap:8px; margin-top:18px;">
          ${i > 0 ? '<button class="btn" id="tut-back">← Back</button>' : ''}
          <button class="btn primary" id="tut-next" style="flex:1;">${last ? '🏁 Let’s Coach!' : 'Next →'}</button>
        </div>
        ${last ? '' : '<button class="btn tutorial-skip-link" id="tut-skip">Skip the rest</button>'}
      </div>
    `, (el) => {
      const back = el.querySelector('#tut-back');
      if (back) back.addEventListener('click', () => showStep(game, i - 1));
      el.querySelector('#tut-next').addEventListener('click', () => {
        if (last) finish(game, true);
        else showStep(game, i + 1);
      });
      const skip = el.querySelector('#tut-skip');
      if (skip) skip.addEventListener('click', () => finish(game, true));
    });
  }

  /* ---------------- Wrap-up ---------------- */
  function finish(game, withTips) {
    if (game.tutorial) {
      game.tutorial.pending = false;
      // First-season tips ride along with the walkthrough; a full skip means
      // no tutorial and no tips — the player asked to be left alone.
      game.tutorial.tipsYear = withTips ? game.year : null;
      game.tutorial.seen = game.tutorial.seen || {};
    }
    removeOverlay();
    try { window.XCD.engine.SaveManager.autoSave(game); } catch (e) { /* best-effort */ }
    UI.renderShell(); // surface the first screen tip right away
    UI.toast(withTips
      ? 'Tips are on for your first season — dismiss any tip with ✕.'
      : `Welcome to ${game.getPlayerSchool().name}, Coach!`, 'success', 3600);
  }

  /*
   * Shell hook, called after every screen render. Shows the intro flow once
   * for a brand-new dynasty, then first-season tip banners per screen.
   */
  function onShellRender(game, wrapper) {
    if (!game || !game.tutorial) return;
    const t = game.tutorial;
    if (t.pending) { showIntro(game); return; }
    if (overlayEl()) return; // mid-walkthrough — don't stack banners under it
    // Tip banners: first season only, once per screen, dismissible.
    if (t.tipsYear !== game.year) return;
    const screenId = UI.state.currentScreen;
    t.seen = t.seen || {};
    if (t.seen[screenId] || !TIPS[screenId]) return;
    const div = document.createElement('div');
    div.className = 'tip-banner';
    div.innerHTML = `<span class="tip-icon">💡</span>
      <div class="tip-text">${TIPS[screenId]}</div>
      <button class="tip-close" aria-label="Dismiss tip">✕</button>`;
    wrapper.prepend(div);
    div.querySelector('.tip-close').addEventListener('click', () => {
      t.seen[screenId] = true;
      div.remove();
      try { window.XCD.engine.SaveManager.autoSave(game); } catch (e) { /* best-effort */ }
    });
  }

  UI.tutorial = { onShellRender, showIntro, TIPS, STEPS };
})();
