/*
 * CoursesEngine — the Course Records system.
 *
 * The living, per-dynasty record book. Every cross country course keeps its
 * OWN record (men's and women's, per distance), because a 23:30 on a flat
 * course and a 24:00 on a hilly one are not comparable — each course stands
 * alone and is never ranked against another by raw time.
 *
 * When a dynasty begins, the real named courses open with realistic historical
 * baselines; from there each dynasty writes its own record book. A record holds
 * until an athlete actually runs faster on that same course — then it updates,
 * the performance joins the athlete's résumé and the school's history, the meet
 * and conditions are stamped, and the whole chain of past records is preserved.
 *
 * State lives on gameState.history.courseRecords, keyed by a stable course slug:
 *   {
 *     key, name, city, state, altitudeFt, hilliness, championship, conference,
 *     homeSchoolId, divisions:{DI:true}, meetTypes:{invite:true},
 *     records: { 'M-8K': RecordEntry, ... },        // the current record
 *     history: { 'M-8K': [RecordEntry, newest→oldest] }  // every record ever
 *   }
 */
(function () {
  const D = window.XCD.data;
  const Utils = window.XCD.core.Utils;

  // The real-world championship + famous-invitational courses are notable
  // enough that a record there is national news; a program's home course is
  // reported only to that program (and the player).
  function isNotableCourse(entry) {
    return !!(entry.championship || D.isNamedCourse(entry.key));
  }

  /* ---------------- Course identity ---------------- */

  // A courseMeta-shaped object for a program's deterministic home course, so
  // meets built without a famous course still race a stable, identifiable
  // venue whose terrain and altitude are consistent season to season.
  function homeCourseMeta(school) {
    const hc = D.homeCourseFor(school);
    if (!hc) return undefined;
    return {
      course: hc.name, city: hc.city, state: hc.state,
      altitudeFt: hc.altitudeFt, hilliness: hc.hilliness,
      prestige: hc.prestige, homeSchoolId: hc.homeSchoolId, conference: hc.conference
    };
  }

  // Resolve a meet to its canonical course descriptor (stable terrain/altitude,
  // NOT the per-race weather). Famous/championship courses resolve to their
  // authentic profile; everything else to the host program's home course.
  function identify(gameState, meet) {
    if (!meet) return null;
    const cm = meet.courseMeta || {};
    const name = meet.venue || cm.course;
    if (name) {
      const key = D.courseSlug(name);
      const canon = D.courseByKey(key);
      if (canon) {
        // A real named course — keep its authentic identity, but a national
        // meet held here confirms championship status.
        return { ...canon, championship: canon.championship || meet.type === 'national' };
      }
      // A named course we don't have canonical data for (home course meta,
      // custom-league meet names): build the descriptor from the meta.
      const homeSchoolId = cm.homeSchoolId || null;
      const homeSchool = homeSchoolId ? gameState.getSchool(homeSchoolId) : null;
      return {
        key, name,
        city: cm.city || '', state: cm.state || '',
        altitudeFt: cm.altitudeFt != null ? cm.altitudeFt : 500,
        hilliness: cm.hilliness != null ? cm.hilliness : 45,
        championship: meet.type === 'national',
        conference: cm.conference || (homeSchool ? homeSchool.conference : null),
        prestige: cm.prestige || (meet.elite ? 'High' : 'Standard'),
        homeSchoolId
      };
    }
    // Legacy meets with no course meta at all → the host's home course.
    const host = gameState.getSchool(meet.hostId);
    if (!host) return null;
    const hc = D.homeCourseFor(host);
    return hc ? { ...hc } : null;
  }

  /* ---------------- The record book ---------------- */

  function book(gameState) {
    gameState.history.courseRecords = gameState.history.courseRecords || {};
    return gameState.history.courseRecords;
  }

  // Register a course into this dynasty's record book (idempotent). Stores a
  // stable snapshot of the course's identity the first time it is seen.
  function ensure(gameState, desc) {
    if (!desc || !desc.key) return null;
    const B = book(gameState);
    let entry = B[desc.key];
    if (!entry) {
      entry = B[desc.key] = {
        key: desc.key,
        name: desc.name,
        city: desc.city || '',
        state: desc.state || '',
        altitudeFt: desc.altitudeFt != null ? desc.altitudeFt : 500,
        hilliness: desc.hilliness != null ? desc.hilliness : 45,
        championship: !!desc.championship,
        conference: desc.conference || null,
        homeSchoolId: desc.homeSchoolId || null,
        divisions: {},
        meetTypes: {},
        records: {},
        history: {}
      };
    }
    // A course only ever gains championship status (a venue that later hosts
    // the national meet), never loses it.
    if (desc.championship) entry.championship = true;
    if (!entry.conference && desc.conference) entry.conference = desc.conference;
    return entry;
  }

  function recKey(gender, distanceM) { return `${gender}-${D.distanceKey(distanceM)}`; }

  // Seed a realistic historical baseline for a course + gender + distance if
  // none exists yet, so the very first race never sets a trivial record and
  // every course opens anchored to a genuinely elite historical mark.
  function ensureBaseline(gameState, entry, gender, distanceM) {
    const gk = recKey(gender, distanceM);
    if (entry.records[gk]) return entry.records[gk];
    const time = D.seedCourseTime(gender, distanceM, entry);
    // Date the historical mark somewhere in the decade before the dynasty,
    // deterministically, so "some records have stood for decades" reads true.
    let h = 0; const s = entry.key + gk;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const startYear = (gameState.year || 2026);
    const rec = {
      time,
      athleteId: null,
      name: 'Historic Course Best',
      schoolId: null,
      school: '—',
      division: null,
      gender,
      distanceKey: D.distanceKey(distanceM),
      year: startYear - 1 - (h % 12),
      meet: 'Established record',
      meetType: null,
      conditions: null,
      seeded: true
    };
    entry.records[gk] = rec;
    entry.history[gk] = [rec];
    return rec;
  }

  // A weather/conditions snapshot to stamp onto a record, so the record book
  // shows the conditions the record was set in (makes it believable).
  function conditionsSnapshot(meet) {
    const c = meet.conditions || {};
    return {
      tempF: c.tempF,
      windMph: c.windMph != null ? c.windMph : null,
      rain: !!c.rain,
      dry: !c.rain,
      hilliness: c.hilliness,
      altitude: c.altitude || 'Low'
    };
  }

  /* ---------------- Record breaking ---------------- */

  /*
   * After a race, compare the field against the course record for this
   * gender/distance. If the fastest finisher beat it, update the record,
   * preserve the old one in the course's history, and fire every downstream
   * effect (athlete résumé, school history, news, season history). Marks the
   * record-setting finisher with `cr = 'NCR'`. Returns the new record (or null).
   */
  function considerRace(gameState, meet, gender, finishers, distanceM) {
    if (!finishers || !finishers.length) return null;
    const desc = identify(gameState, meet);
    if (!desc) return null;
    const entry = ensure(gameState, desc);
    const division = meet.division || (gameState.getSchool((finishers[0] || {}).schoolId) || {}).division || 'DI';
    entry.divisions[division] = true;
    if (meet.type) entry.meetTypes[meet.type] = true;

    const gk = recKey(gender, distanceM);
    const current = ensureBaseline(gameState, entry, gender, distanceM);

    // The fastest finisher is the only one who can set the record.
    const fastest = finishers.reduce((a, b) => (b.time < a.time ? b : a), finishers[0]);
    // A hair of epsilon so floating-point equality never counts as "faster".
    if (!(fastest.time < current.time - 0.05)) {
      // Nobody broke it. Mark a dead-even tie of a standing record as CR (rare).
      if (Math.abs(fastest.time - current.time) <= 0.05 && !current.seeded) fastest.cr = 'CR';
      return null;
    }

    const athlete = gameState.world.athletes[fastest.athleteId];
    const school = gameState.getSchool(fastest.schoolId);
    const dk = D.distanceKey(distanceM);
    const newRec = {
      time: fastest.time,
      athleteId: fastest.athleteId,
      name: fastest.name,
      schoolId: fastest.schoolId,
      school: school ? school.name : '?',
      division,
      gender,
      distanceKey: dk,
      year: gameState.year,
      meet: meet.name,
      meetType: meet.type || 'invite',
      conditions: conditionsSnapshot(meet),
      seeded: false
    };

    const previous = entry.records[gk];
    entry.records[gk] = newRec;
    entry.history[gk] = entry.history[gk] || [];
    entry.history[gk].unshift(newRec);
    // The full history is preserved (never trimmed), but keep it bounded so a
    // century of racing on one course can't grow without limit.
    if (entry.history[gk].length > 60) entry.history[gk].length = 60;

    fastest.cr = 'NCR';

    applyRecordEffects(gameState, entry, newRec, previous, meet, athlete, school);
    return newRec;
  }

  function applyRecordEffects(gameState, entry, rec, previous, meet, athlete, school) {
    const Legacy = window.XCD.engine.Legacy;
    const ft = window.XCD.engine.Races.formatTime;
    const genderWord = rec.gender === 'M' ? "men's" : "women's";

    // 1) The athlete's career résumé — a permanent accolade (a course record
    //    set is remembered even if it is later broken).
    if (athlete && Legacy) {
      Legacy.recordAccolade(athlete, {
        year: gameState.year, division: rec.division, conference: null,
        type: 'courseRecord', label: `${entry.name} Course Record`,
        schoolId: rec.schoolId, course: entry.key, distanceKey: rec.distanceKey
      });
    }

    // 2) The school's program history + course-record ledgers.
    if (school && Legacy) {
      const prog = Legacy.program(gameState, school.id);
      prog.courseRecordsEverSet = (prog.courseRecordsEverSet || 0) + 1;
      const held = countHeldBySchool(gameState, school.id);
      prog.courseRecordsPeak = Math.max(prog.courseRecordsPeak || 0, held);
      Legacy.recordProgramMilestone(gameState, school.id,
        `${rec.name} set the ${genderWord} course record at ${entry.name} (${ft(rec.time)}).`);
    }

    // 3) Season history — a chronological, dynasty-wide course-record log.
    gameState.history.courseRecordLog = gameState.history.courseRecordLog || [];
    gameState.history.courseRecordLog.unshift({
      year: gameState.year, week: meet.week || null,
      courseKey: entry.key, courseName: entry.name,
      gender: rec.gender, distanceKey: rec.distanceKey,
      time: rec.time, athleteId: rec.athleteId, name: rec.name,
      schoolId: rec.schoolId, school: rec.school, meet: rec.meet,
      division: rec.division,
      previousTime: previous ? previous.time : null,
      previousHolder: previous && !previous.seeded ? previous.name : null
    });
    if (gameState.history.courseRecordLog.length > 500) gameState.history.courseRecordLog.length = 500;

    // 4) The news feed — a major notification. Notable (championship / famous)
    //    courses are national news; a home-course record is reported to that
    //    program (and always to the player).
    const isPlayer = rec.schoolId === gameState.playerSchoolId;
    if (isPlayer || isNotableCourse(entry)) {
      const prevBit = previous && !previous.seeded
        ? ` — breaking ${previous.name}'s ${ft(previous.time)} from ${previous.year}`
        : previous && previous.seeded
          ? ` — erasing a historic mark that had stood since ${previous.year}`
          : '';
      gameState.logNews(`🏆 NEW COURSE RECORD: ${rec.name} of ${rec.school} broke the ${genderWord} course record at ${entry.name} with a time of ${ft(rec.time)}${prevBit}.`);
    }
    if (isPlayer) {
      gameState.logNews(`🏫 ${rec.school} enters the record books: ${rec.name}'s ${ft(rec.time)} is the fastest ${genderWord} time ever run at ${entry.name}.`);
    }
  }

  /* ---------------- Queries (for the UI) ---------------- */

  // How many current course records a program holds right now (scans the book,
  // which is the authority — records change hands, so this is always live).
  function countHeldBySchool(gameState, schoolId) {
    let n = 0;
    const B = book(gameState);
    Object.values(B).forEach((entry) => {
      Object.values(entry.records).forEach((rec) => { if (rec.schoolId === schoolId) n++; });
    });
    return n;
  }

  // Program course-record stats for the school profile (Program Records).
  function programStats(gameState, schoolId) {
    const Legacy = window.XCD.engine.Legacy;
    const prog = Legacy ? Legacy.program(gameState, schoolId) : {};
    return {
      current: countHeldBySchool(gameState, schoolId),
      everSet: prog.courseRecordsEverSet || 0,
      peak: prog.courseRecordsPeak || 0
    };
  }

  // Every current course record held by an athlete (for the athlete profile
  // accolade — "Course Record Holder — N Courses"). One entry per record.
  function heldByAthlete(gameState, athleteId) {
    if (!athleteId) return [];
    const out = [];
    const B = book(gameState);
    Object.values(B).forEach((entry) => {
      Object.entries(entry.records).forEach(([gk, rec]) => {
        if (rec.athleteId === athleteId) {
          out.push({
            courseKey: entry.key, courseName: entry.name,
            gender: rec.gender, distanceKey: rec.distanceKey,
            time: rec.time, year: rec.year, meet: rec.meet,
            city: entry.city, state: entry.state
          });
        }
      });
    });
    // Distinct courses first, then quicker marks — a stable, readable order.
    out.sort((a, b) => a.courseName.localeCompare(b.courseName) || a.distanceKey.localeCompare(b.distanceKey));
    return out;
  }

  // Distinct number of courses an athlete currently holds a record on.
  function courseHoldCount(gameState, athleteId) {
    const held = heldByAthlete(gameState, athleteId);
    return new Set(held.map((h) => h.courseKey)).size;
  }

  // The current record for a course + gender + distance (or the best available
  // record for that gender if no distance given), for compact display.
  function recordFor(gameState, courseKey, gender, distanceM) {
    const entry = book(gameState)[courseKey];
    if (!entry) return null;
    if (distanceM) return entry.records[`${gender}-${D.distanceKey(distanceM)}`] || null;
    // Signature record: prefer the canonical XC distance for the gender.
    const pref = gender === 'M' ? ['8K', '10K', '6K', '5K'] : ['6K', '5K', '8K'];
    for (const dk of pref) { if (entry.records[`${gender}-${dk}`]) return entry.records[`${gender}-${dk}`]; }
    const any = Object.keys(entry.records).find((k) => k.startsWith(`${gender}-`));
    return any ? entry.records[any] : null;
  }

  // The course record book entry for a meet (used to surface records on a
  // course/meet profile anywhere in the game). Read-only — does not register.
  function entryForMeet(gameState, meet) {
    const desc = identify(gameState, meet);
    if (!desc) return null;
    return { desc, entry: book(gameState)[desc.key] || null };
  }

  // Every registered course, for the Course Records page.
  function list(gameState) { return Object.values(book(gameState)); }

  /* ---------------- Dynasty setup ---------------- */

  // At dynasty start, open the record book for the real named courses with
  // realistic historical baselines (championship venues + famous invitational
  // courses), so the record book reads as historic from the very first frame.
  // Idempotent — safe to run on load to backfill older saves.
  function seedRealCourses(gameState) {
    (D.COURSES || []).forEach((c) => {
      const entry = ensure(gameState, c);
      // Men race 8K/10K, women 6K on these courses — seed the canonical marks.
      ensureBaseline(gameState, entry, 'M', 8000);
      ensureBaseline(gameState, entry, 'W', 6000);
      if (entry.championship) ensureBaseline(gameState, entry, 'M', 10000);
    });
  }

  window.XCD.engine.Courses = {
    identify, homeCourseMeta, ensure, ensureBaseline, considerRace,
    countHeldBySchool, programStats, heldByAthlete, courseHoldCount,
    recordFor, entryForMeet, list, seedRealCourses, isNotableCourse,
    book
  };
})();
