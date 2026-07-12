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

  // Resolve the division rules for a school (or a raw division key).
  // Everything defaults to DI so pre-Update-2 saves keep working untouched.
  D.divisionFor = function (schoolOrKey) {
    const key = typeof schoolOrKey === 'string'
      ? schoolOrKey
      : (schoolOrKey && schoolOrKey.division) || 'DI';
    return D.DIVISIONS[key] || D.DIVISIONS.DI;
  };
})();
