(function () {
  const D = window.XCD.data;

  // Every US state (plus DC) mapped to a broad recruiting/geographic region.
  // Used for regional recruiting territory logic, weather profiles, and travel.
  D.STATE_REGION = {
    CT: 'Northeast', ME: 'Northeast', MA: 'Northeast', NH: 'Northeast', RI: 'Northeast',
    VT: 'Northeast', NJ: 'Northeast', NY: 'Northeast', PA: 'Northeast',
    DE: 'Mid-Atlantic', MD: 'Mid-Atlantic', VA: 'Mid-Atlantic', WV: 'Mid-Atlantic', DC: 'Mid-Atlantic',
    NC: 'Southeast', SC: 'Southeast', GA: 'Southeast', FL: 'Southeast', AL: 'Southeast',
    MS: 'Southeast', TN: 'Southeast', KY: 'Southeast', LA: 'Southeast', AR: 'Southeast',
    OH: 'Midwest', MI: 'Midwest', IN: 'Midwest', IL: 'Midwest', WI: 'Midwest',
    MN: 'Midwest', IA: 'Midwest', MO: 'Midwest', ND: 'Midwest', SD: 'Midwest', NE: 'Midwest', KS: 'Midwest',
    TX: 'South', OK: 'South',
    AZ: 'Southwest', NM: 'Southwest',
    CO: 'Mountain', UT: 'Mountain', WY: 'Mountain', MT: 'Mountain', ID: 'Mountain', NV: 'Mountain',
    WA: 'Pacific', OR: 'Pacific', CA: 'Pacific', AK: 'Pacific', HI: 'Pacific'
  };

  // Conference metadata: prestige tier drives starting budget/facilities/talent baseline.
  // tier 1 = Power conferences, tier 2 = strong mid-major, tier 3 = mid-major, tier 4 = low-major
  D.CONFERENCES = {
    'ACC': { tier: 1 }, 'Big Ten': { tier: 1 }, 'Big 12': { tier: 1 }, 'SEC': { tier: 1 },
    'Big East': { tier: 2 }, 'American': { tier: 2 }, 'Mountain West': { tier: 2 }, 'Atlantic 10': { tier: 2 },
    'West Coast': { tier: 2 }, 'Ivy League': { tier: 2 },
    'Sun Belt': { tier: 3 }, 'Conference USA': { tier: 3 }, 'MAC': { tier: 3 }, 'CAA': { tier: 3 },
    'Patriot League': { tier: 3 }, 'Missouri Valley': { tier: 3 }, 'Southern': { tier: 3 }, 'Big Sky': { tier: 3 },
    'WAC': { tier: 3 }, 'Big West': { tier: 3 },
    'ASUN': { tier: 4 }, 'Big South': { tier: 4 }, 'Southland': { tier: 4 }, 'MEAC': { tier: 4 },
    'SWAC': { tier: 4 }, 'Horizon': { tier: 4 }, 'Summit League': { tier: 4 }, 'America East': { tier: 4 },
    'MAAC': { tier: 4 }, 'NEC': { tier: 4 }, 'OVC': { tier: 4 }, 'Independent': { tier: 4 }
  };

  D.CLASS_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];

  D.GENDERS = ['M', 'W'];

  D.COACH_PERSONALITIES = [
    'Aggressive Recruiter', 'Development Guru', 'Distance Specialist', 'Transfer Hunter',
    'Prestige Chaser', 'Loyal', 'Builder', 'Win Now'
  ];

  D.ATHLETE_PERSONALITIES = [
    'Grinder', 'Confident', 'Laid Back', 'Fiery Competitor', 'Team-First', 'Individualist',
    'Perfectionist', 'Free Spirit', 'Cerebral', 'Anxious'
  ];

  D.PREFERRED_DISTANCES = ['5K', '8K', '10K', 'All-Around'];

  D.PREFERRED_CLIMATES = ['Warm', 'Cold', 'Temperate', 'No Preference'];

  D.PREFERRED_SCHOOL_SIZES = ['Small', 'Medium', 'Large', 'No Preference'];

  D.MAJORS = [
    'Exercise Science', 'Business', 'Biology', 'Communications', 'Engineering', 'Psychology',
    'Nursing', 'Education', 'Kinesiology', 'Economics', 'Undecided', 'Political Science',
    'Computer Science', 'Sports Management', 'Marketing', 'Public Health'
  ];

  // Broad regional weather/altitude flavor, used for training & race conditions later phases.
  D.REGION_WEATHER = {
    'Northeast': { tempBase: 55, altitude: 'Low', humidity: 'Medium' },
    'Mid-Atlantic': { tempBase: 60, altitude: 'Low', humidity: 'Medium' },
    'Southeast': { tempBase: 72, altitude: 'Low', humidity: 'High' },
    'Midwest': { tempBase: 54, altitude: 'Low', humidity: 'Medium' },
    'South': { tempBase: 75, altitude: 'Low', humidity: 'High' },
    'Southwest': { tempBase: 78, altitude: 'Medium', humidity: 'Low' },
    'Mountain': { tempBase: 50, altitude: 'High', humidity: 'Low' },
    'Pacific': { tempBase: 62, altitude: 'Medium', humidity: 'Medium' }
  };

  D.INJURY_TYPES = [
    'Stress Fracture', 'Shin Splints', 'Hamstring Strain', 'Achilles Tendinitis',
    'Foot Injury', 'Illness', 'IT Band Syndrome', 'Overtraining Fatigue'
  ];
})();
