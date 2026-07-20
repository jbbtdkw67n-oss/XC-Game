/*
 * Division layer — Update 2 (Part 13 foundation).
 *
 * Every rule that used to be a hard-coded Division I assumption lives here
 * as data: scholarship limits, championship structure, recruiting scope,
 * budgets, NIL, and award counts. Schools carry a `division` key and every
 * engine resolves rules through XCD.data.divisionFor(school) instead of
 * assuming DI. Division II and III are fully specified but not yet
 * populated with schools — activating them is a data change (add schools
 * with division:'DII'/'DIII' + conferences), not an engine rewrite.
 */
(function () {
  const D = window.XCD.data;

  D.DIVISIONS = {
    DI: {
      key: 'DI',
      label: 'Division I',
      active: true,
      // Equivalency scholarship limits per gender (full-ride equivalents).
      scholarships: { M: 12.6, W: 18 },
      scholarshipModel: 'full',        // full | partial | none
      nil: true,                        // NIL money exists at this level
      budgetScale: 1.0,                 // multiplier on the base budget model
      recruitingScope: 'national',      // national | regional
      internationalRecruiting: true,
      academicEmphasis: 0.9,            // how much academics drive recruiting (DIII: high)
      developmentEmphasis: 1.0,         // training/development weight in identity
      coachSalaryTier: 3,               // relative pay band (drives coach mobility)
      expectations: 1.0,                // pressure multiplier for hot seats
      // NCAA eligibility (accurate per-division rules): Division I runs a
      // five-year clock with five seasons of competition available; a season
      // in which the athlete never toes a line doesn't burn one.
      eligibility: { seasons: 5, clockYears: 5 },
      championship: {
        nationalsFieldSize: 31,
        autoQualifiersPerRegional: 2,
        individualQualifiersPerRegional: 10,
        allAmericans: 40,
        allConference: 14,
        nationalsDistanceM: { M: 10000, W: 6000 }
      }
    },
    DII: {
      key: 'DII',
      label: 'Division II',
      active: true, // Update 3: fully populated with real schools
      scholarships: { M: 12.6, W: 12.6 },
      scholarshipModel: 'partial',
      nil: false,
      budgetScale: 0.45,
      recruitingScope: 'regional',
      internationalRecruiting: false,
      academicEmphasis: 1.0,
      developmentEmphasis: 1.25,
      coachSalaryTier: 2,
      expectations: 0.8,
      // DII regulations: four seasons of competition inside the ten-semester
      // (five-year) window; redshirt and non-competition years preserve seasons.
      eligibility: { seasons: 4, clockYears: 5 },
      championship: {
        nationalsFieldSize: 32,
        autoQualifiersPerRegional: 3,
        individualQualifiersPerRegional: 5,
        allAmericans: 25,
        allConference: 10,
        nationalsDistanceM: { M: 10000, W: 6000 }
      }
    },
    DIII: {
      key: 'DIII',
      label: 'Division III',
      active: true, // Update 3: fully populated with real schools
      scholarships: { M: 0, W: 0 },
      scholarshipModel: 'none',
      nil: false,
      budgetScale: 0.2,
      recruitingScope: 'regional',
      internationalRecruiting: false,
      academicEmphasis: 1.5,     // academics & campus fit drive DIII recruiting
      developmentEmphasis: 1.4,  // coaching and culture over recruiting rankings
      coachSalaryTier: 1,
      expectations: 0.6,
      // DIII regulations: four seasons of participation within the athlete's
      // first ten semesters of enrollment (modeled as a five-year window).
      eligibility: { seasons: 4, clockYears: 5 },
      championship: {
        nationalsFieldSize: 32,
        autoQualifiersPerRegional: 2,
        individualQualifiersPerRegional: 7,
        allAmericans: 40,
        allConference: 7,
        nationalsDistanceM: { M: 8000, W: 6000 }
      }
    }
  };

  D.DIVISION_ORDER = ['DI', 'DII', 'DIII'];

  /* ================================================================ *
   * Custom League overrides (Update 13)
   *
   * A dynasty can be created from a custom league spec — imported in the New
   * Dynasty flow — that renames divisions, adds conferences, and supplies
   * custom meet names and award names. Team/roster overrides are handled in
   * worldgen; the GLOBAL, name-only overrides live here because they touch the
   * shared data tables (division labels, conference list). The active game's
   * spec is re-applied on load and reset when a non-custom game starts.
   * ================================================================ */
  const DEFAULT_DIVISION_LABELS = { DI: 'Division I', DII: 'Division II', DIII: 'Division III' };
  D.CUSTOM = null; // { meetNames?, awardNames? } for the active custom league

  D.applyCustomLeague = function (spec) {
    D.resetCustomLeague();
    if (!spec) return;
    if (spec.divisionNames) {
      Object.keys(spec.divisionNames).forEach((k) => {
        if (D.DIVISIONS[k] && spec.divisionNames[k]) D.DIVISIONS[k].label = String(spec.divisionNames[k]);
      });
    }
    if (Array.isArray(spec.conferences)) {
      spec.conferences.forEach((c) => {
        if (c && c.name) D.CONFERENCES[c.name] = { tier: Math.max(1, Math.min(4, c.tier || 3)) };
      });
    }
    D.CUSTOM = {
      meetNames: Array.isArray(spec.meetNames) ? spec.meetNames.filter(Boolean) : null,
      awardNames: (spec.awardNames && typeof spec.awardNames === 'object') ? spec.awardNames : null
    };
  };

  D.resetCustomLeague = function () {
    Object.keys(DEFAULT_DIVISION_LABELS).forEach((k) => {
      if (D.DIVISIONS[k]) D.DIVISIONS[k].label = DEFAULT_DIVISION_LABELS[k];
    });
    D.CUSTOM = null;
  };

  // A custom invitational name (deterministic by index), or '' to use the
  // default host-based name.
  D.customMeetName = function (index) {
    const pool = D.CUSTOM && D.CUSTOM.meetNames;
    if (!pool || !pool.length) return '';
    return String(pool[Math.abs(index) % pool.length]);
  };

  // A custom award label for a known key, falling back to the default name.
  D.awardLabel = function (key, fallback) {
    const map = D.CUSTOM && D.CUSTOM.awardNames;
    return (map && map[key]) ? String(map[key]) : fallback;
  };

  // Eligibility rules for a school/division key. Defaults to a 4-season /
  // 5-year model when the division carries no explicit block (old saves).
  D.eligibilityFor = function (schoolOrKey) {
    return D.divisionFor(schoolOrKey).eligibility || { seasons: 4, clockYears: 5 };
  };

  // Resolve the division rules for a school (or a raw division key).
  // Everything defaults to DI so pre-Update-2 saves keep working untouched.
  D.divisionFor = function (schoolOrKey) {
    const key = typeof schoolOrKey === 'string'
      ? schoolOrKey
      : (schoolOrKey && schoolOrKey.division) || 'DI';
    return D.DIVISIONS[key] || D.DIVISIONS.DI;
  };

  /*
   * Offer terminology (Update X, Part 3). Division III programs may NOT
   * offer athletic scholarships — they offer roster spots. The recruiting
   * mechanics are identical; only the language changes, and it changes
   * EVERYWHERE an offer is referenced. DI/DII keep "scholarship" wording.
   */
  D.offerTerms = function (schoolOrKey) {
    const div = D.divisionFor(schoolOrKey);
    if (div.scholarshipModel === 'none') {
      return {
        action: 'Offer Roster Spot',
        offered: 'Roster Spot Offered',
        already: 'Roster spot already offered.',
        made: 'Roster spot offered to',
        capped: 'No roster spots left for this class (offers + commits at cap).',
        noun: 'roster spot',
        plural: 'roster spots'
      };
    }
    return {
      action: 'Offer Scholarship',
      offered: 'Scholarship Offered',
      already: 'Scholarship already offered.',
      made: 'Scholarship offered to',
      capped: 'No scholarship slots left for this class (offers + commits at cap).',
      noun: 'scholarship',
      plural: 'scholarships'
    };
  };
})();
