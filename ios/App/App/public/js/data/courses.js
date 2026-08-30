/*
 * Course Records — course identity layer.
 *
 * Cross country is run on named courses, not tracks, and no two are alike:
 * a flat, fast championship course and a brutal hilly farmland course
 * produce completely different times, so a course record is meaningful only
 * ON THAT COURSE (never compared across courses by raw time). This module is
 * the pure-data half of the Course Records system:
 *
 *   1. D.COURSES        — the canonical, real-world named courses (the NCAA
 *                         championship venues + the famous invitational
 *                         courses), deduped and tagged with terrain/altitude.
 *   2. D.homeCourseFor  — a deterministic "home course" for every program, so
 *                         a program's invitationals, its conference meet, and
 *                         its regional all race on a course with a stable
 *                         identity and terrain that accumulates its own record.
 *   3. Baseline helpers — realistic historical record times seeded from a
 *                         course's difficulty, so the record book opens
 *                         already anchored to genuinely elite marks.
 *
 * The living, per-dynasty record book (who holds what, and the full history)
 * lives in the Courses ENGINE (js/engine/courses.js) on gameState.history.
 */
(function () {
  const D = window.XCD.data;

  // A stable slug key for a course name — the identity a record book is keyed
  // on. Case/punctuation-insensitive so "Wilson's Farm" always resolves the
  // same, across seasons and saves.
  D.courseSlug = function (name) {
    return String(name || '')
      .toLowerCase()
      .replace(/['’.]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'course';
  };

  // Terrain label for a 0-100 hilliness profile (Flat / Rolling / Hilly).
  D.courseTerrain = function (hilliness) {
    return (D.hillinessLabel ? D.hillinessLabel(hilliness) : (hilliness >= 55 ? 'Hilly' : hilliness >= 30 ? 'Rolling' : 'Flat'));
  };

  // Altitude label (Low / Medium / High) for a course, from feet.
  D.courseAltitude = function (altitudeFt) {
    return D.altitudeCategory ? D.altitudeCategory(altitudeFt || 0) : 'Low';
  };

  /* ================================================================ *
   * 1. THE CANONICAL NAMED COURSES
   *
   * Built from the real venues that already drive the game: the authentic
   * NCAA championship venues (which host the national meet) and the famous
   * invitational courses (Nuttycombe, Gans Creek, Roy Griak, …). A course
   * that appears in both lists (e.g. the Thomas Zimmer course, which hosts
   * both the championship and the Nuttycombe Invitational) is stored once,
   * tagged as a championship course.
   * ================================================================ */
  const byKey = {};
  function addCourse(src, championship) {
    const name = src.name || src.course;
    if (!name) return;
    const key = D.courseSlug(name);
    if (byKey[key]) {
      // Already known — only ever UPGRADE to championship status.
      if (championship) byKey[key].championship = true;
      return;
    }
    const hilliness = src.hilliness != null ? src.hilliness : 45;
    byKey[key] = {
      key,
      name,
      city: src.city || '',
      state: src.state || '',
      altitudeFt: src.altitudeFt != null ? src.altitudeFt : 500,
      hilliness,
      championship: !!championship,
      // A real, neutral-site course belongs to no single program's conference.
      conference: null,
      prestige: src.prestige || (championship ? 'Elite' : 'High')
    };
  }
  (D.CHAMPIONSHIP_VENUES || []).forEach((v) => addCourse(v, true));
  (D.ELITE_MEETS || []).forEach((m) => { if (m.course) addCourse(m, false); });

  D.COURSES = Object.values(byKey);
  D.courseByKey = function (key) { return byKey[key] || null; };
  // Is a slug one of the authentic real-world courses (vs a program home course)?
  D.isNamedCourse = function (key) { return !!byKey[key]; };

  /* ================================================================ *
   * 2. PROGRAM HOME COURSES
   *
   * Every program calls a home course its own. It is fully deterministic —
   * derived from the school's real campus city and a stable terrain profile
   * hashed from the program name — so the SAME course (and its record book)
   * resolves every season, no matter which season the program hosts a meet.
   * Its altitude follows the school's real elevation, so a Colorado program's
   * home course races thin-air fast times slower, exactly like real life.
   * ================================================================ */
  function hashName(name) {
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  D.homeCourseFor = function (school) {
    if (!school) return null;
    const h = hashName(school.name);
    // A stable, believable terrain: most home courses are gently rolling
    // (20-64), with the occasional flat or genuinely hilly venue.
    const hilliness = 20 + (h % 45);
    const altCat = D.altitudeForSchool ? D.altitudeForSchool(school.name, school.state) : (school.weather && school.weather.altitude) || 'Low';
    const altitudeFt = altCat === 'High' ? 5800 + (h % 1600)
      : altCat === 'Medium' ? 3500 + (h % 1400)
      : 300 + (h % 700);
    const city = D.cityForSchool ? D.cityForSchool(school) : (school.city || '');
    const name = `${school.name} Cross Country Course`;
    return {
      key: D.courseSlug(name),
      name,
      city,
      state: school.state || '',
      altitudeFt,
      hilliness,
      championship: false,
      conference: school.conference || null,
      prestige: 'Standard',
      homeSchoolId: school.id
    };
  };

  /* ================================================================ *
   * 3. HISTORICAL BASELINE RECORD TIMES
   *
   * When the record book opens (or a course is raced at a new distance for
   * the first time), it is anchored to a genuinely elite historical mark for
   * that course — faster than a typical winner, so only an exceptional
   * performance breaks it, and adjusted for the course's own difficulty so a
   * flat, fast course carries a much quicker record than a hilly, high one.
   * Records are NEVER compared across courses by raw time — each stands alone.
   * ================================================================ */

  // Fallback reference elite times (seconds) if a distance isn't in the
  // seeded national record table — a strong winning mark on a neutral course.
  const REF_TIME = {
    'M-10K': 1770, 'M-8K': 1405, 'M-6K': 1035, 'M-5K': 858,
    'W-8K': 1560, 'W-6K': 1175, 'W-5K': 965, 'W-4K': 760
  };

  D.distanceKey = function (distanceM) { return `${distanceM / 1000}K`; };

  // A realistic historical course-record time for a course + gender + distance.
  // Anchored to the all-time seeded national mark for the distance (the fastest
  // realistic collegiate time), then made a touch easier — a course record only
  // has to be the best on ONE course — and adjusted up for the course's own
  // hills and altitude. Result: a fast flat course carries a near-national
  // record; a hilly, high-altitude course a much softer one.
  D.seedCourseTime = function (gender, distanceM, course) {
    const dk = D.distanceKey(distanceM);
    const rk = `${gender}-${dk}`;
    const base = (D.SEED_RECORDS && D.SEED_RECORDS[rk]) || REF_TIME[rk] ||
      // Last resort: scale the men's 8K reference by distance.
      (REF_TIME['M-8K'] * (distanceM / 8000));
    const hilliness = course && course.hilliness != null ? course.hilliness : 45;
    const altCat = D.courseAltitude(course ? course.altitudeFt : 500);
    const altFactor = altCat === 'High' ? 0.030 : altCat === 'Medium' ? 0.012 : 0;
    // +3.5% at a rolling (40) course, ~+0.5% flat, ~+8% genuinely hilly.
    const difficulty = 0.035 + (hilliness - 40) * 0.0015 + altFactor;
    return Math.round(base * (1 + Math.max(0, difficulty)) * 10) / 10;
  };
})();
