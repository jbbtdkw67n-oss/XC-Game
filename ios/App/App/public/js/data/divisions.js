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
      // Eligibility (Update 20 — redshirts removed): every athlete gets five
      // straight years of eligibility on a five-year clock; each season on
      // campus burns one year.
      eligibility: { seasons: 5, clockYears: 5 },
      // NCAA Division I qualification (real structure): 9 regional meets, the
      // top 2 teams in each region qualify automatically (18), and 13 at-large
      // teams are selected on season merit to complete the 31-team field. The
      // top 4 individuals in each region NOT on a qualifying team advance on
      // their own (~36 individuals). All-America honors go to the top 40.
      championship: {
        nationalsFieldSize: 31,
        autoQualifiersPerRegional: 2,
        atLargeTeams: 13,
        individualQualifiersPerRegional: 4,
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
      // Eligibility unification: for gameplay consistency, D2 uses the SAME
      // eligibility rules as D1 — five straight years on a five-year clock
      // (Update 20 — redshirts removed). This keeps progression and remaining
      // eligibility identical across divisions, so a transfer never gains or
      // loses eligibility simply by changing divisions.
      eligibility: { seasons: 5, clockYears: 5 },
      // NCAA Division II qualification (real structure): 8 regional meets, the
      // top 2 teams in each region qualify automatically (16), and at-large
      // selections on season merit complete the 32-team national field. The
      // top 5 individuals per region not on a qualifying team advance. Division
      // II awards All-America honors to the TOP 40 finishers at the national
      // championship (matches real NCAA DII).
      championship: {
        nationalsFieldSize: 32,
        autoQualifiersPerRegional: 2,
        atLargeTeams: 16,
        individualQualifiersPerRegional: 5,
        allAmericans: 40,
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
      // Eligibility unification: D3 uses the SAME eligibility rules as D1 —
      // five straight years on a five-year clock (Update 20 — redshirts
      // removed) — so years of eligibility, progression, and remaining
      // eligibility are consistent across every division and transfers carry
      // eligibility intact.
      eligibility: { seasons: 5, clockYears: 5 },
      // NCAA Division III qualification (real structure): 8 regional meets, the
      // top 2 teams in each region qualify automatically (16), with at-large
      // selections completing the 32-team field. The top 5 individuals per
      // region not on a qualifying team advance. All-America honors go to the
      // top 40. Division III men race the 8K championship distance.
      championship: {
        nationalsFieldSize: 32,
        autoQualifiersPerRegional: 2,
        atLargeTeams: 16,
        individualQualifiersPerRegional: 5,
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

  // Eligibility rules for a school/division key. Defaults to a 5-season /
  // 5-year model when the division carries no explicit block (old saves).
  D.eligibilityFor = function (schoolOrKey) {
    // Unified collegiate eligibility across all divisions (5 seasons / 5-year
    // clock); the fallback matches so any edge case stays consistent.
    return D.divisionFor(schoolOrKey).eligibility || { seasons: 5, clockYears: 5 };
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
