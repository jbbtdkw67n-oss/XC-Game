/*
 * First-Season Tutorial (Update 15).
 *
 * A brand-new dynasty opens on the coach's origin story, then offers a
 * skippable, step-by-step walkthrough of the whole game — recruiting,
 * training, racing, the transfer portal, and where everything lives.
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

  const STORY = 'After winning back to back state championships at a small Kansas high school you decide to test your abilities at the collegiate level. Recruit, train, and race your way to being the next legendary college coach.';

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
        <br><br>Use <strong>⏩ Sim to Race</strong> to fast-forward quiet weeks straight to your next meet.`
    },
    {
      icon: '📋', title: 'Training',
      body: () => `On the <strong>Training</strong> screen (the "Train" tab) you set each squad's
        Monday–Sunday workout plan and weekly mileage. Match the plan to the season phase —
        aerobic base early, quality work mid-season, a sharp taper for championships —
        and watch each runner's <strong>fatigue</strong>: overtraining causes injuries.
        Freshmen absorb less volume; the mileage presets handle common situations in one tap.`
    },
    {
      icon: '🎯', title: 'Recruiting',
      body: () => `On the <strong>Recruiting</strong> screen, search the national class and add targets to your board.
        Each week you get <strong>recruiting points</strong> (plus a yearly budget) to spend on letters, calls,
        scouting trips, and visits — these build the <strong>relationship</strong> and <strong>interest</strong> that
        decide where a recruit signs. Scout to lift the fog off their ratings, then offer a scholarship.
        <br><br>💬 <strong>Sway is YOUR edge:</strong> once a recruit is genuinely considering you, a Sway visit
        swings their momentum your way far more reliably than any CPU program can manage —
        it's how you close five-stars. Signing Day is Week 19.`
    },
    {
      icon: '🔄', title: 'The Transfer Portal',
      body: () => `After nationals the portal opens (find it under <strong>Portal</strong> in the menu).
        Your program earns a <strong>Transfer Points</strong> budget from its prestige and your recruiting skill.
        Tap a portal athlete and <strong>slide points onto them</strong>: enough points locks the commit at
        <strong>100%</strong>, or divide the budget across several targets and take your published odds when
        the window closes. Matching what an athlete is looking for makes them cheaper to land —
        and a national title fattens next window's budget.`
    },
    {
      icon: '👟', title: 'Your Roster',
      body: () => `The <strong>Roster</strong> screen ("Team" tab) is your depth chart. Your top seven race varsity;
        the top five score. Every athlete gets <strong>five full years of eligibility</strong> — develop them
        across their whole career. Division I squads carry a hard limit of 14 per gender — each new season opens
        with a <strong>Week 1 checklist</strong> (roster, schedule, staff) on the Dashboard before Week 2 unlocks.`
    },
    {
      icon: '🏁', title: 'Race Days',
      body: () => `Meets run in weeks 4, 6, 8, 10, and 12, then <strong>Conference (13) → Regionals (14) →
        Nationals (15)</strong>. The <strong>Race Center</strong> replays every race with live scoring.
        Your meet schedule is editable only during Week 1 — bigger invitationals mean better poll credit
        against tougher fields.`
    },
    {
      icon: '🗺', title: 'Finding Everything',
      body: () => `${UI.isMobile()
        ? 'The bottom tab bar holds the weekly essentials; everything else lives under <strong>☰ More</strong>'
        : 'The left sidebar holds every screen'} —
        <strong>Rankings</strong> (polls), <strong>My Program</strong> (facilities, staff, philosophies),
        <strong>Shop</strong>, <strong>History</strong> (records & Hall of Fame), <strong>News</strong>, and
        <strong>Save / Load</strong>. The game autosaves every week you advance.
        <br><br>💡 During your first season, one-time tips appear at the top of each screen you visit —
        dismiss them with ✕. Good luck, Coach!`
    }
  ];

  /* One-time, first-season tip banners per screen. */
  const TIPS = {
    dashboard: 'Your home base: weekly tasks, team snapshots, and each season\'s Week 1 setup checklist all live here. Follow the 1-2-3 steps in the top bar every week.',
    roster: 'Tap any runner for their full card. Your best seven race varsity; the top five score. Every athlete gets five full years of eligibility to develop.',
    training: 'Set the weekly plan and mileage for each squad, then press Confirm Plan. Match the season phase (shown above the planner) and keep fatigue under control — tired legs get injured.',
    recruiting: 'Spend weekly points on calls, visits, and scouting to build relationships. Offer scholarships to your top targets, and use Sway to close recruits who are already considering you — it\'s your biggest edge.',
    portal: 'Slide Transfer Points onto portal athletes — enough points locks a commit at 100%. Your budget comes from prestige and your recruiting skill, so spend it where the fit is right.',
    schedule: 'Your season schedule locks after Week 1. Bigger invitationals carry more poll weight — race the best if you can hang with them.',
    racecenter: 'Watch full race replays with live team scoring here after every meet.',
    rankings: 'National, regional, and conference polls plus individual rankings. Poll position seeds the championship fields.',
    school: 'My Program: upgrade facilities, manage staff, set your race philosophy, and fundraise. Facilities sell recruits.',
    shop: 'Spend dynasty points earned from titles and top classes on permanent program perks.',
    history: 'Every champion, record, award, and Hall of Famer your world produces is archived here forever.',
    world: 'Browse every program in all three divisions — rosters, coaches, prestige, and history.',
    news: 'The national wire: commits, flips, upsets, the coaching carousel, and portal moves.',
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
        <p class="tutorial-story-text">Want a quick walkthrough of how everything works — recruiting, training,
          race weeks, and the transfer portal? It takes about a minute, and helpful tips will appear on each
          screen during your first season.</p>
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
