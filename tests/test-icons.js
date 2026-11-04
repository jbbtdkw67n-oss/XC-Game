// Emoji Update: every emoji the game shows is drawn as one of its own
// illustrated icons (js/ui/icons.js).
// Verifies:
//   - every icon in the set has a symbol in the page's sprite
//   - after a full season, every screen (and every tab on it) shows icons
//     and no leftover emoji from the set, in text, tooltips, dropdown options
//     or screen-reader labels
//   - every icon on screen points at a symbol that exists
//   - news text written into the save keeps its emoji (the save format is
//     unchanged) but is shown as icons
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  page.setDefaultTimeout(600000);
  await newDynasty(page, {});

  const sprite = await page.evaluate(() => {
    const I = window.XCD.icons;
    return {
      count: I.list.length,
      missing: I.list.filter((i) => !document.getElementById('gi-' + i.id)).map((i) => i.id),
      byEmoji: I.svg('🏆').includes('#gi-trophy') && I.svg('⚠️').includes('#gi-warning')
    };
  });
  ok(sprite.count >= 149, 'icon set covers every emoji: ' + sprite.count);
  ok(!sprite.missing.length, 'every icon has a sprite symbol: ' + sprite.missing.join(', '));
  ok(sprite.byEmoji, 'icons resolve by emoji, with or without the variation selector');

  // Play a full season so news, inbox, results and history all have content.
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game; const y = g.year;
    while (g.year === y) {
      if (g.week1) Object.assign(g.week1, { progressionReviewed: true, rosterConfirmed: true, scheduleFinalized: true, staffConfirmed: true, setupConfirmed: true });
      g.weeklyFlow = { trainingConfirmed: true, recruitingDone: true };
      g.advanceWeek();
    }
  });

  const sweep = await page.evaluate(async () => {
    const UI = window.XCD.ui;
    const I = window.XCD.icons;
    const known = new RegExp(I.list.map((i) => i.emoji.replace(/️/g, '')).sort((a, b) => b.length - a.length).join('|'), 'u');
    const wait = () => new Promise((r) => setTimeout(r, 40));
    const out = { screens: 0, tabs: 0, icons: 0, leftovers: [], broken: [] };
    const check = (where) => {
      const root = document.getElementById('app') || document.body;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const tag = n.parentNode && n.parentNode.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') continue;
        if (known.test(n.data.replace(/️/g, ''))) out.leftovers.push(where + ' text: ' + n.data.trim().slice(0, 60));
      }
      root.querySelectorAll('[title],[aria-label],[placeholder]').forEach((el) => {
        ['title', 'aria-label', 'placeholder'].forEach((a) => {
          const v = el.getAttribute(a);
          if (v && known.test(v.replace(/️/g, ''))) out.leftovers.push(where + ' ' + a + ': ' + v.slice(0, 60));
        });
      });
      root.querySelectorAll('svg.gi use, use[href^="#gi-"]').forEach((u) => {
        const id = (u.getAttribute('href') || '').slice(1);
        if (!document.getElementById(id)) out.broken.push(where + ': ' + id);
      });
      out.icons = Math.max(out.icons, root.querySelectorAll('svg.gi').length);
    };
    for (const n of UI.NAV_ITEMS) {
      UI.navigate(n.id);
      await wait();
      out.screens++;
      check(n.id);
      // Open each tab on the screen once.
      const tabs = [...document.querySelectorAll('#screen-container [data-tab], #screen-container [data-ntab], #screen-container [data-hsub], #screen-container [data-goat]')]
        .map((b) => [...b.attributes].find((a) => /^data-(tab|ntab|hsub|goat)$/.test(a.name)))
        .filter(Boolean).map((a) => [a.name, a.value]);
      for (const [attr, val] of tabs) {
        const b = document.querySelector(`#screen-container [${attr}="${val}"]`);
        if (!b) continue;
        b.click();
        await wait();
        out.tabs++;
        check(`${n.id}/${val}`);
      }
    }
    return out;
  });
  ok(sweep.screens >= 10, 'swept every screen: ' + sweep.screens);
  ok(sweep.icons > 0, 'screens show game icons');
  ok(!sweep.leftovers.length, 'no emoji left on any screen:\n   ' + sweep.leftovers.slice(0, 15).join('\n   '));
  ok(!sweep.broken.length, 'every icon points at a real symbol: ' + sweep.broken.slice(0, 10).join(', '));

  const news = await page.evaluate(async () => {
    const g = window.XCD.ui.state.game;
    const raw = (g.newsLog || []).map((n) => n.text || '').join(' ');
    window.XCD.ui.navigate('news');
    await new Promise((r) => setTimeout(r, 40));
    return { savedHasEmoji: /\p{Extended_Pictographic}/u.test(raw), shownIcons: document.querySelectorAll('#screen-container svg.gi').length };
  });
  ok(news.savedHasEmoji, 'news stored in the save keeps its original text');
  ok(news.shownIcons > 0, 'news feed shows icons: ' + news.shownIcons);

  // Text-only spots: a dropdown option and a tooltip drop the emoji, keep the words.
  const textOnly = await page.evaluate(async () => {
    const box = document.createElement('div');
    box.innerHTML = '<select><option>😴 Off week — training block</option></select><span title="🔒 Locked until Week 2">x</span>';
    document.getElementById('screen-container').appendChild(box);
    await new Promise((r) => setTimeout(r, 0));
    const res = { option: box.querySelector('option').textContent, title: box.querySelector('span').getAttribute('title') };
    box.remove();
    return res;
  });
  // Championship trophies: the national and conference titles each have their
  // own trophy, written as shortcodes, and old saved news lines that used a
  // plain trophy show the right one.
  const titles = await page.evaluate(async () => {
    const box = document.createElement('div');
    box.innerHTML = '<p id="t1">:trophy-national: Team National Championships</p>' +
      '<p id="t2">:trophy-conference: CONFERENCE CHAMPIONS! Your men win the title!</p>' +
      '<p id="t3">🏆🏆 NATIONAL CHAMPIONS! Your men\'s team wins the NCAA title!</p>' +
      '<p id="t4">🏆 CONFERENCE CHAMPIONS! Your women win the title!</p>' +
      '<p id="t7">:trophy-regional: REGIONAL CHAMPIONS! Your women win the Mountain Regional!</p>' +
      '<p id="t8">🏆 REGIONAL CHAMPIONS! Your men win the West Regional!</p>' +
      '<p id="t5">🏆 NEW COURSE RECORD</p><span id="t6" title=":trophy-national: 3 titles">x</span>';
    document.getElementById('screen-container').appendChild(box);
    await new Promise((r) => setTimeout(r, 0));
    const icons = (id) => [...box.querySelectorAll(`#${id} use`)].map((u) => u.getAttribute('href'));
    const res = {
      regional: icons('t7'), oldRegional: icons('t8'),
      national: icons('t1'), conference: icons('t2'), oldNational: icons('t3'), oldConference: icons('t4'),
      plain: icons('t5'), text: box.querySelector('#t1').textContent.trim(), title: box.querySelector('#t6').getAttribute('title')
    };
    box.remove();
    return res;
  });
  ok(titles.national.join() === '#gi-trophy-national', 'national shortcode shows the national trophy: ' + titles.national);
  ok(titles.conference.join() === '#gi-trophy-conference', 'conference shortcode shows the conference trophy: ' + titles.conference);
  ok(titles.oldNational.join() === '#gi-trophy-national', 'saved national-title news shows one national trophy: ' + titles.oldNational);
  ok(titles.oldConference.join() === '#gi-trophy-conference', 'saved conference-title news shows the conference trophy: ' + titles.oldConference);
  ok(titles.regional.join() === '#gi-trophy-regional', 'regional shortcode shows the regional trophy: ' + titles.regional);
  ok(titles.oldRegional.join() === '#gi-trophy-regional', 'saved regional-title news shows the regional trophy: ' + titles.oldRegional);
  ok(titles.plain.join() === '#gi-trophy', 'other trophies stay the plain trophy: ' + titles.plain);
  ok(titles.text === 'Team National Championships', 'no shortcode text is left on screen: ' + titles.text);
  ok(titles.title === '3 titles', 'tooltips drop shortcodes too: ' + titles.title);
  ok(textOnly.option === 'Off week — training block', 'dropdown option keeps its words: ' + textOnly.option);
  ok(textOnly.title === 'Locked until Week 2', 'tooltip keeps its words: ' + textOnly.title);

  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 5).join('\n'));
  await browser.close();
  if (fails.length) {
    console.log('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-icons', JSON.stringify({ screens: sweep.screens, tabs: sweep.tabs, maxIcons: sweep.icons }));
}

run().catch((e) => { console.error('FAIL', e); process.exit(1); });
