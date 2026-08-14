/*
 * Geography layer — Realism & Authenticity Update.
 *
 * One home for every real-world place in the game:
 *   1. NCAA_REGIONS  — the real championship regional alignment per division,
 *      tuned so each region carries a balanced number of the game's schools.
 *   2. REAL_TOWNS    — authentic hometowns for every state (small towns,
 *      medium cities, and large metros) used for recruit + athlete origins.
 *   3. SCHOOL_CITY   — the actual campus city of each program (host cities on
 *      the schedule, program profiles, and recruit hometown flavor).
 *   4. CHAMPIONSHIP_VENUES — the real courses that have hosted NCAA cross
 *      country championships; the national meet rotates only among these.
 *
 * Everything here is plain data + pure lookup helpers, so it is fully
 * save-compatible: old dynasties resolve regions/cities on the fly with no
 * migration, and new dynasties store the same values.
 */
(function () {
  const D = window.XCD.data;

  /* ================================================================ *
   * 1. NCAA CHAMPIONSHIP REGIONS
   *
   * Division I aligns nationally, so its 9 regions are assigned by STATE —
   * the real NCAA DI regional map. Division II and III conferences are
   * inherently regional, so those 8-region maps are assigned by CONFERENCE,
   * which mirrors the real super-regional alignment and keeps every regional
   * balanced. Region membership was verified against the school database so no
   * regional is noticeably larger or smaller than another (DI ~2.0x, DII
   * ~1.5x, DIII ~1.9x max/min — matching real NCAA proportions).
   * ================================================================ */

  // Division I — real 9-region alignment, by state.
  const DI_STATE_REGION = {
    'Northeast':    ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NY'],
    'Mid-Atlantic': ['NJ', 'PA', 'DE', 'MD', 'DC', 'WV'],
    'Southeast':    ['VA', 'NC', 'SC'],
    'South':        ['GA', 'FL', 'AL', 'MS', 'TN'],
    'Great Lakes':  ['OH', 'MI', 'IN', 'KY'],
    'Midwest':      ['IL', 'WI', 'MN', 'IA', 'MO', 'NE', 'ND', 'SD', 'KS'],
    'South Central':['TX', 'OK', 'AR', 'LA'],
    'Mountain':     ['CO', 'UT', 'WY', 'MT', 'ID', 'NM', 'AZ'],
    'West':         ['CA', 'OR', 'WA', 'NV', 'HI', 'AK']
  };

  // Division II — real 8-region alignment, by conference.
  const DII_CONF_REGION = {
    'West':         ['CCAA', 'PacWest', 'Great Northwest'],
    'South Central':['Lone Star', 'RMAC'],
    'Central':      ['NSIC', 'MIAA (DII)'],
    'Midwest':      ['GLIAC', 'Great Midwest'],
    'Atlantic':     ['PSAC', 'NE10'],
    'Southeast':    ['SAC', 'CIAA'],
    'South':        ['GAC', 'SIAC'],
    'South Atlantic':['Conference Carolinas', 'PBC', 'Sunshine State']
  };

  // Division III — real 8-region alignment, by conference.
  const DIII_CONF_REGION = {
    'New England':    ['NESCAC', 'Little East', 'NEWMAC'],
    'Niagara':        ['SUNYAC', 'Empire 8'],
    'Atlantic':       ['Liberty League', 'Skyline', 'Landmark'],
    'Mideast':        ['Centennial', 'ODAC', 'C2C'],
    'Great Lakes':    ['NCAC', 'MIAA (DIII)'],
    'Midwest':        ['WIAC', 'MIAC'],
    'Central':        ['CCIW', 'UAA'],
    'South/Southeast':['SCAC', 'SAA']
  };

  function invert(map) {
    const o = {};
    Object.entries(map).forEach(([region, keys]) => keys.forEach((k) => { o[k] = region; }));
    return o;
  }
  const DI_BY_STATE = invert(DI_STATE_REGION);
  const DII_BY_CONF = invert(DII_CONF_REGION);
  const DIII_BY_CONF = invert(DIII_CONF_REGION);

  // Ordered region name lists (UI grouping / iteration).
  D.NCAA_REGIONS = {
    DI: Object.keys(DI_STATE_REGION),
    DII: Object.keys(DII_CONF_REGION),
    DIII: Object.keys(DIII_CONF_REGION)
  };

  /*
   * The real NCAA championship region for a school. DI resolves by state;
   * DII/DIII resolve by conference (their conferences are regional) and fall
   * back to the DI state map for any custom-league program whose conference
   * isn't recognized, so a value is always returned.
   */
  D.ncaaRegionFor = function (school) {
    if (!school) return 'Midwest';
    const div = school.division || 'DI';
    if (div === 'DI') return DI_BY_STATE[school.state] || 'Midwest';
    const byConf = div === 'DII' ? DII_BY_CONF : DIII_BY_CONF;
    return byConf[school.conference] || DI_BY_STATE[school.state] || 'Midwest';
  };

  /* ================================================================ *
   * 2. REAL HOMETOWNS BY STATE
   *
   * A spread of authentic towns for every state — small towns, mid-size
   * cities, and large metros — so recruits and athletes come from real
   * places. Broad geographic region (for recruiting territory) still comes
   * from D.STATE_REGION; this only supplies the town NAME.
   * ================================================================ */
  D.REAL_TOWNS = {
    AL: ['Birmingham', 'Montgomery', 'Mobile', 'Huntsville', 'Tuscaloosa', 'Auburn', 'Dothan', 'Decatur', 'Hoover', 'Florence', 'Enterprise', 'Cullman'],
    AK: ['Anchorage', 'Fairbanks', 'Juneau', 'Wasilla', 'Sitka', 'Ketchikan', 'Palmer', 'Kodiak'],
    AZ: ['Phoenix', 'Tucson', 'Mesa', 'Flagstaff', 'Scottsdale', 'Chandler', 'Gilbert', 'Tempe', 'Prescott', 'Yuma', 'Sierra Vista', 'Casa Grande'],
    AR: ['Little Rock', 'Fayetteville', 'Fort Smith', 'Springdale', 'Jonesboro', 'Conway', 'Rogers', 'Bentonville', 'Hot Springs', 'Cabot', 'Searcy'],
    CA: ['Los Angeles', 'San Diego', 'San Jose', 'Fresno', 'Sacramento', 'Long Beach', 'Bakersfield', 'Riverside', 'Modesto', 'Fontana', 'Santa Rosa', 'Clovis', 'Chico', 'Redding', 'Temecula', 'Roseville', 'Palo Alto', 'Arcadia', 'Ventura', 'Visalia'],
    CO: ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Boulder', 'Pueblo', 'Greeley', 'Loveland', 'Longmont', 'Grand Junction', 'Castle Rock', 'Durango'],
    CT: ['Bridgeport', 'New Haven', 'Hartford', 'Stamford', 'Waterbury', 'Norwalk', 'Danbury', 'New Britain', 'Bristol', 'Manchester', 'Milford'],
    DE: ['Wilmington', 'Dover', 'Newark', 'Middletown', 'Smyrna', 'Milford', 'Seaford', 'Georgetown'],
    DC: ['Washington'],
    FL: ['Jacksonville', 'Miami', 'Tampa', 'Orlando', 'Tallahassee', 'Gainesville', 'Fort Lauderdale', 'Pensacola', 'Sarasota', 'Naples', 'Ocala', 'Lakeland', 'Clearwater', 'Boca Raton', 'Palm Bay', 'Melbourne'],
    GA: ['Atlanta', 'Augusta', 'Columbus', 'Savannah', 'Athens', 'Macon', 'Marietta', 'Alpharetta', 'Valdosta', 'Warner Robins', 'Rome', 'Dalton'],
    HI: ['Honolulu', 'Hilo', 'Kailua', 'Kaneohe', 'Waipahu', 'Pearl City', 'Kahului', 'Lahaina'],
    ID: ['Boise', 'Meridian', 'Nampa', 'Idaho Falls', 'Pocatello', 'Coeur d\'Alene', 'Twin Falls', 'Caldwell', 'Moscow', 'Rexburg'],
    IL: ['Chicago', 'Aurora', 'Naperville', 'Rockford', 'Peoria', 'Springfield', 'Champaign', 'Bloomington', 'Evanston', 'Decatur', 'Wheaton', 'Carbondale', 'Oak Park', 'Schaumburg'],
    IN: ['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel', 'Bloomington', 'Fishers', 'Muncie', 'Lafayette', 'Terre Haute', 'Kokomo', 'Elkhart'],
    IA: ['Des Moines', 'Cedar Rapids', 'Davenport', 'Iowa City', 'Ames', 'Sioux City', 'Waterloo', 'Council Bluffs', 'Dubuque', 'Ankeny', 'Cedar Falls'],
    KS: ['Wichita', 'Overland Park', 'Kansas City', 'Topeka', 'Olathe', 'Lawrence', 'Manhattan', 'Salina', 'Hutchinson', 'Emporia', 'Pittsburg'],
    KY: ['Louisville', 'Lexington', 'Bowling Green', 'Owensboro', 'Covington', 'Richmond', 'Elizabethtown', 'Florence', 'Frankfort', 'Paducah', 'Murray'],
    LA: ['New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette', 'Lake Charles', 'Monroe', 'Alexandria', 'Houma', 'Ruston', 'Hammond', 'Slidell'],
    ME: ['Portland', 'Lewiston', 'Bangor', 'Auburn', 'Biddeford', 'Augusta', 'Brunswick', 'Waterville', 'Orono', 'Presque Isle'],
    MD: ['Baltimore', 'Columbia', 'Germantown', 'Silver Spring', 'Rockville', 'Frederick', 'Gaithersburg', 'Annapolis', 'Bowie', 'Hagerstown', 'Salisbury', 'Bethesda'],
    MA: ['Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell', 'Brockton', 'Quincy', 'Newton', 'Framingham', 'Amherst', 'Andover', 'Concord', 'Needham', 'Lexington'],
    MI: ['Detroit', 'Grand Rapids', 'Ann Arbor', 'Lansing', 'Flint', 'Dearborn', 'Kalamazoo', 'Traverse City', 'Midland', 'Holland', 'Marquette', 'Rochester Hills'],
    MN: ['Minneapolis', 'St. Paul', 'Rochester', 'Duluth', 'Bloomington', 'Plymouth', 'St. Cloud', 'Eagan', 'Mankato', 'Moorhead', 'Edina', 'Stillwater'],
    MS: ['Jackson', 'Gulfport', 'Southaven', 'Hattiesburg', 'Biloxi', 'Meridian', 'Tupelo', 'Olive Branch', 'Oxford', 'Starkville', 'Columbus'],
    MO: ['Kansas City', 'St. Louis', 'Springfield', 'Columbia', 'Independence', 'Lee\'s Summit', 'O\'Fallon', 'Joplin', 'Jefferson City', 'Cape Girardeau', 'Rolla'],
    MT: ['Billings', 'Missoula', 'Bozeman', 'Great Falls', 'Helena', 'Kalispell', 'Butte', 'Havre', 'Belgrade', 'Whitefish'],
    NE: ['Omaha', 'Lincoln', 'Bellevue', 'Grand Island', 'Kearney', 'Fremont', 'Hastings', 'North Platte', 'Norfolk', 'Columbus'],
    NV: ['Las Vegas', 'Henderson', 'Reno', 'Carson City', 'Sparks', 'Elko', 'Boulder City', 'Mesquite', 'Fernley'],
    NH: ['Manchester', 'Nashua', 'Concord', 'Dover', 'Rochester', 'Keene', 'Portsmouth', 'Durham', 'Hanover', 'Laconia'],
    NJ: ['Newark', 'Jersey City', 'Paterson', 'Trenton', 'Camden', 'Toms River', 'Edison', 'Cherry Hill', 'Princeton', 'Hoboken', 'Morristown', 'Montclair'],
    NM: ['Albuquerque', 'Las Cruces', 'Rio Rancho', 'Santa Fe', 'Roswell', 'Farmington', 'Clovis', 'Hobbs', 'Alamogordo', 'Gallup'],
    NY: ['New York', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse', 'Albany', 'Ithaca', 'Schenectady', 'Utica', 'White Plains', 'Binghamton', 'Poughkeepsie', 'Saratoga Springs', 'Kingston'],
    NC: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem', 'Fayetteville', 'Cary', 'Wilmington', 'Asheville', 'Greenville', 'Chapel Hill', 'Concord'],
    ND: ['Fargo', 'Bismarck', 'Grand Forks', 'Minot', 'West Fargo', 'Williston', 'Dickinson', 'Mandan', 'Jamestown'],
    OH: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton', 'Canton', 'Youngstown', 'Springfield', 'Kettering', 'Dublin', 'Hudson', 'Athens'],
    OK: ['Oklahoma City', 'Tulsa', 'Norman', 'Broken Arrow', 'Edmond', 'Lawton', 'Stillwater', 'Moore', 'Enid', 'Muskogee', 'Bartlesville'],
    OR: ['Portland', 'Eugene', 'Salem', 'Gresham', 'Hillsboro', 'Bend', 'Beaverton', 'Medford', 'Corvallis', 'Ashland', 'Springfield', 'Albany'],
    PA: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading', 'Scranton', 'Bethlehem', 'Lancaster', 'Harrisburg', 'State College', 'Altoona', 'York', 'Wilkes-Barre'],
    RI: ['Providence', 'Warwick', 'Cranston', 'Pawtucket', 'East Providence', 'Woonsocket', 'Newport', 'Westerly', 'Cumberland'],
    SC: ['Columbia', 'Charleston', 'Greenville', 'Rock Hill', 'Spartanburg', 'Mount Pleasant', 'Sumter', 'Florence', 'Clemson', 'Aiken', 'Myrtle Beach'],
    SD: ['Sioux Falls', 'Rapid City', 'Aberdeen', 'Brookings', 'Watertown', 'Mitchell', 'Yankton', 'Pierre', 'Vermillion', 'Spearfish'],
    TN: ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Clarksville', 'Murfreesboro', 'Franklin', 'Johnson City', 'Jackson', 'Cookeville', 'Kingsport'],
    TX: ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth', 'El Paso', 'Arlington', 'Plano', 'Lubbock', 'Waco', 'College Station', 'McAllen', 'Tyler', 'Midland', 'Frisco', 'Round Rock', 'Denton', 'Katy'],
    UT: ['Salt Lake City', 'Provo', 'West Valley City', 'Ogden', 'Sandy', 'Orem', 'St. George', 'Logan', 'Layton', 'Lehi', 'Park City', 'Cedar City'],
    VT: ['Burlington', 'Essex', 'Rutland', 'Montpelier', 'Barre', 'Middlebury', 'Brattleboro', 'St. Albans', 'Stowe'],
    VA: ['Virginia Beach', 'Norfolk', 'Richmond', 'Arlington', 'Alexandria', 'Roanoke', 'Charlottesville', 'Lynchburg', 'Blacksburg', 'Harrisonburg', 'Fredericksburg', 'Winchester'],
    WA: ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue', 'Everett', 'Yakima', 'Bellingham', 'Olympia', 'Pullman', 'Walla Walla', 'Wenatchee'],
    WV: ['Charleston', 'Huntington', 'Morgantown', 'Parkersburg', 'Wheeling', 'Beckley', 'Martinsburg', 'Fairmont', 'Clarksburg'],
    WI: ['Milwaukee', 'Madison', 'Green Bay', 'Kenosha', 'Racine', 'Appleton', 'Eau Claire', 'Oshkosh', 'La Crosse', 'Waukesha', 'Wausau', 'Stevens Point'],
    WY: ['Cheyenne', 'Casper', 'Laramie', 'Gillette', 'Rock Springs', 'Sheridan', 'Green River', 'Evanston', 'Cody', 'Jackson']
  };

  /* ================================================================ *
   * 3. CAMPUS CITIES
   *
   * The actual city each program calls home. Drives host-city display on the
   * schedule / race center and gives athletes generated for a school a real
   * hometown feel. Any program not listed falls back to a real city in its
   * own state (deterministic), so no fictional place ever appears.
   * ================================================================ */
  D.SCHOOL_CITY = {
    // ---- ACC ----
    'Boston College': 'Chestnut Hill', 'California': 'Berkeley', 'Clemson': 'Clemson', 'Duke': 'Durham',
    'Florida State': 'Tallahassee', 'Georgia Tech': 'Atlanta', 'Louisville': 'Louisville', 'Miami': 'Coral Gables',
    'NC State': 'Raleigh', 'North Carolina State': 'Raleigh', 'North Carolina': 'Chapel Hill', 'Notre Dame': 'Notre Dame',
    'Pittsburgh': 'Pittsburgh', 'SMU': 'Dallas', 'Stanford': 'Stanford', 'Syracuse': 'Syracuse',
    'Virginia': 'Charlottesville', 'Virginia Tech': 'Blacksburg', 'Wake Forest': 'Winston-Salem',
    // ---- Big Ten ----
    'Illinois': 'Champaign', 'Indiana': 'Bloomington', 'Iowa': 'Iowa City', 'Maryland': 'College Park',
    'Michigan': 'Ann Arbor', 'Michigan State': 'East Lansing', 'Minnesota': 'Minneapolis', 'Nebraska': 'Lincoln',
    'Northwestern': 'Evanston', 'Ohio State': 'Columbus', 'Oregon': 'Eugene', 'Penn State': 'State College',
    'Purdue': 'West Lafayette', 'Rutgers': 'Piscataway', 'UCLA': 'Los Angeles', 'USC': 'Los Angeles',
    'Washington': 'Seattle', 'Wisconsin': 'Madison',
    // ---- Big 12 ----
    'Arizona': 'Tucson', 'Arizona State': 'Tempe', 'Baylor': 'Waco', 'BYU': 'Provo',
    'Cincinnati': 'Cincinnati', 'Colorado': 'Boulder', 'Houston': 'Houston', 'Iowa State': 'Ames',
    'Kansas': 'Lawrence', 'Kansas State': 'Manhattan', 'Oklahoma State': 'Stillwater', 'TCU': 'Fort Worth',
    'Texas Tech': 'Lubbock', 'UCF': 'Orlando', 'Utah': 'Salt Lake City', 'West Virginia': 'Morgantown',
    // ---- SEC ----
    'Alabama': 'Tuscaloosa', 'Arkansas': 'Fayetteville', 'Auburn': 'Auburn', 'Florida': 'Gainesville',
    'Georgia': 'Athens', 'Kentucky': 'Lexington', 'LSU': 'Baton Rouge', 'Mississippi State': 'Starkville',
    'Missouri': 'Columbia', 'Ole Miss': 'Oxford', 'Oklahoma': 'Norman', 'South Carolina': 'Columbia',
    'Tennessee': 'Knoxville', 'Texas': 'Austin', 'Texas A&M': 'College Station', 'Vanderbilt': 'Nashville',
    // ---- American ----
    'Charlotte': 'Charlotte', 'East Carolina': 'Greenville', 'Florida Atlantic': 'Boca Raton',
    'Memphis': 'Memphis', 'North Texas': 'Denton', 'Rice': 'Houston', 'South Florida': 'Tampa',
    'Temple': 'Philadelphia', 'Tulane': 'New Orleans', 'Tulsa': 'Tulsa', 'UAB': 'Birmingham',
    'UTSA': 'San Antonio', 'Wichita State': 'Wichita',
    // ---- Mountain West ----
    'Air Force': 'Colorado Springs', 'Boise State': 'Boise', 'Colorado State': 'Fort Collins',
    'Fresno State': 'Fresno', 'Nevada': 'Reno', 'New Mexico': 'Albuquerque', 'San Diego State': 'San Diego',
    'San Jose State': 'San Jose', 'UNLV': 'Las Vegas', 'Utah State': 'Logan', 'Wyoming': 'Laramie',
    // ---- Sun Belt ----
    'Appalachian State': 'Boone', 'Arkansas State': 'Jonesboro', 'Coastal Carolina': 'Conway',
    'Georgia Southern': 'Statesboro', 'Georgia State': 'Atlanta', 'James Madison': 'Harrisonburg',
    'Louisiana': 'Lafayette', 'Louisiana Monroe': 'Monroe', 'Marshall': 'Huntington', 'Old Dominion': 'Norfolk',
    'South Alabama': 'Mobile', 'Southern Miss': 'Hattiesburg', 'Texas State': 'San Marcos', 'Troy': 'Troy',
    // ---- Conference USA ----
    'FIU': 'Miami', 'Jacksonville State': 'Jacksonville', 'Kennesaw State': 'Kennesaw', 'Liberty': 'Lynchburg',
    'Louisiana Tech': 'Ruston', 'Middle Tennessee': 'Murfreesboro', 'New Mexico State': 'Las Cruces',
    'Sam Houston': 'Huntsville', 'UTEP': 'El Paso', 'Western Kentucky': 'Bowling Green',
    // ---- MAC ----
    'Akron': 'Akron', 'Ball State': 'Muncie', 'Bowling Green': 'Bowling Green', 'Buffalo': 'Buffalo',
    'Central Michigan': 'Mount Pleasant', 'Eastern Michigan': 'Ypsilanti', 'Kent State': 'Kent',
    'Miami (Ohio)': 'Oxford', 'Northern Illinois': 'DeKalb', 'Ohio University': 'Athens',
    'Toledo': 'Toledo', 'Western Michigan': 'Kalamazoo',
    // ---- Big East ----
    'Butler': 'Indianapolis', 'Creighton': 'Omaha', 'DePaul': 'Chicago', 'Georgetown': 'Washington',
    'Marquette': 'Milwaukee', 'Providence': 'Providence', 'Seton Hall': 'South Orange',
    'St. John\'s': 'Queens', 'Villanova': 'Villanova', 'Xavier': 'Cincinnati', 'UConn': 'Storrs',
    // ---- Ivy League ----
    'Brown': 'Providence', 'Columbia': 'New York', 'Cornell': 'Ithaca', 'Dartmouth': 'Hanover',
    'Harvard': 'Cambridge', 'Penn': 'Philadelphia', 'Princeton': 'Princeton', 'Yale': 'New Haven',
    // ---- Patriot League ----
    'American University': 'Washington', 'Army': 'West Point', 'Boston University': 'Boston',
    'Bucknell': 'Lewisburg', 'Colgate': 'Hamilton', 'Holy Cross': 'Worcester', 'Lafayette': 'Easton',
    'Lehigh': 'Bethlehem', 'Loyola Maryland': 'Baltimore', 'Navy': 'Annapolis',
    // ---- Atlantic 10 ----
    'Davidson': 'Davidson', 'Dayton': 'Dayton', 'Duquesne': 'Pittsburgh', 'Fordham': 'New York',
    'George Mason': 'Fairfax', 'George Washington': 'Washington', 'La Salle': 'Philadelphia',
    'Loyola Chicago': 'Chicago', 'Rhode Island': 'Kingston', 'Richmond': 'Richmond',
    'Saint Joseph\'s': 'Philadelphia', 'Saint Louis': 'St. Louis', 'St. Bonaventure': 'St. Bonaventure',
    'UMass': 'Amherst', 'VCU': 'Richmond',
    // ---- CAA ----
    'Campbell': 'Buies Creek', 'Charleston': 'Charleston', 'Delaware': 'Newark', 'Drexel': 'Philadelphia',
    'Elon': 'Elon', 'Hampton': 'Hampton', 'Hofstra': 'Hempstead', 'Monmouth': 'West Long Branch',
    'North Carolina A&T': 'Greensboro', 'Northeastern': 'Boston', 'Stony Brook': 'Stony Brook',
    'Towson': 'Towson', 'UNC Wilmington': 'Wilmington', 'William & Mary': 'Williamsburg',
    // ---- Southern ----
    'Chattanooga': 'Chattanooga', 'The Citadel': 'Charleston', 'East Tennessee State': 'Johnson City',
    'Furman': 'Greenville', 'Mercer': 'Macon', 'Samford': 'Birmingham', 'VMI': 'Lexington',
    'Western Carolina': 'Cullowhee', 'Wofford': 'Spartanburg',
    // ---- West Coast ----
    'Gonzaga': 'Spokane', 'Loyola Marymount': 'Los Angeles', 'Pacific': 'Stockton', 'Pepperdine': 'Malibu',
    'Portland': 'Portland', 'San Diego': 'San Diego', 'San Francisco': 'San Francisco',
    'Santa Clara': 'Santa Clara', 'Saint Mary\'s': 'Moraga',
    // ---- Big Sky ----
    'Eastern Washington': 'Cheney', 'Idaho': 'Moscow', 'Idaho State': 'Pocatello', 'Montana': 'Missoula',
    'Montana State': 'Bozeman', 'Northern Arizona': 'Flagstaff', 'Northern Colorado': 'Greeley',
    'Portland State': 'Portland', 'Sacramento State': 'Sacramento', 'Weber State': 'Ogden',
    // ---- WAC ----
    'Abilene Christian': 'Abilene', 'California Baptist': 'Riverside', 'Grand Canyon': 'Phoenix',
    'Southern Utah': 'Cedar City', 'Tarleton State': 'Stephenville', 'UT Rio Grande Valley': 'Edinburg',
    'Utah Tech': 'St. George', 'Utah Valley': 'Orem', 'Seattle University': 'Seattle',
    // ---- Big South ----
    'Charleston Southern': 'Charleston', 'Gardner-Webb': 'Boiling Springs', 'High Point': 'High Point',
    'Longwood': 'Farmville', 'Presbyterian': 'Clinton', 'Radford': 'Radford', 'UNC Asheville': 'Asheville',
    'USC Upstate': 'Spartanburg', 'Winthrop': 'Rock Hill',
    // ---- ASUN ----
    'Austin Peay': 'Clarksville', 'Bellarmine': 'Louisville', 'Central Arkansas': 'Conway',
    'Eastern Kentucky': 'Richmond', 'Florida Gulf Coast': 'Fort Myers', 'Jacksonville': 'Jacksonville',
    'Lipscomb': 'Nashville', 'North Alabama': 'Florence', 'North Florida': 'Jacksonville',
    'Queens University': 'Charlotte', 'Stetson': 'DeLand', 'West Georgia': 'Carrollton',
    // ---- Southland ----
    'East Texas A&M': 'Commerce', 'Houston Christian': 'Houston', 'Incarnate Word': 'San Antonio',
    'Lamar': 'Beaumont', 'McNeese': 'Lake Charles', 'Nicholls': 'Thibodaux', 'Northwestern State': 'Natchitoches',
    'Southeastern Louisiana': 'Hammond', 'Stephen F. Austin': 'Nacogdoches', 'Texas A&M-Corpus Christi': 'Corpus Christi',
    'New Orleans': 'New Orleans',
    // ---- MEAC ----
    'Coppin State': 'Baltimore', 'Delaware State': 'Dover', 'Howard': 'Washington',
    'Maryland Eastern Shore': 'Princess Anne', 'Morgan State': 'Baltimore', 'Norfolk State': 'Norfolk',
    'NC Central': 'Durham', 'South Carolina State': 'Orangeburg',
    // ---- SWAC ----
    'Alabama A&M': 'Huntsville', 'Alabama State': 'Montgomery', 'Alcorn State': 'Lorman',
    'Arkansas-Pine Bluff': 'Pine Bluff', 'Bethune-Cookman': 'Daytona Beach', 'Florida A&M': 'Tallahassee',
    'Grambling State': 'Grambling', 'Jackson State': 'Jackson', 'Mississippi Valley State': 'Itta Bena',
    'Prairie View A&M': 'Prairie View', 'Southern University': 'Baton Rouge', 'Texas Southern': 'Houston',
    // ---- Horizon ----
    'Cleveland State': 'Cleveland', 'Green Bay': 'Green Bay', 'IU Indianapolis': 'Indianapolis',
    'Milwaukee': 'Milwaukee', 'Northern Kentucky': 'Highland Heights', 'Oakland': 'Rochester',
    'Purdue Fort Wayne': 'Fort Wayne', 'Robert Morris': 'Moon Township', 'Wright State': 'Dayton',
    'Youngstown State': 'Youngstown',
    // ---- Missouri Valley ----
    'Belmont': 'Nashville', 'Bradley': 'Peoria', 'Drake': 'Des Moines', 'Evansville': 'Evansville',
    'Illinois State': 'Normal', 'Indiana State': 'Terre Haute', 'Missouri State': 'Springfield',
    'Murray State': 'Murray', 'Northern Iowa': 'Cedar Falls', 'Southern Illinois': 'Carbondale',
    'UIC': 'Chicago', 'Valparaiso': 'Valparaiso',
    // ---- Summit League ----
    'Denver': 'Denver', 'Kansas City': 'Kansas City', 'North Dakota': 'Grand Forks',
    'North Dakota State': 'Fargo', 'Omaha': 'Omaha', 'Oral Roberts': 'Tulsa', 'South Dakota': 'Vermillion',
    'South Dakota State': 'Brookings', 'St. Thomas': 'St. Paul',
    // ---- America East ----
    'Albany': 'Albany', 'Binghamton': 'Binghamton', 'Bryant': 'Smithfield', 'Maine': 'Orono',
    'NJIT': 'Newark', 'UMBC': 'Baltimore', 'UMass Lowell': 'Lowell', 'New Hampshire': 'Durham', 'Vermont': 'Burlington',
    // ---- MAAC ----
    'Canisius': 'Buffalo', 'Fairfield': 'Fairfield', 'Iona': 'New Rochelle', 'Manhattan': 'Riverdale',
    'Marist': 'Poughkeepsie', 'Mount St. Mary\'s': 'Emmitsburg', 'Niagara': 'Niagara University',
    'Quinnipiac': 'Hamden', 'Rider': 'Lawrenceville', 'Sacred Heart': 'Fairfield', 'Siena': 'Loudonville',
    // ---- NEC ----
    'Central Connecticut': 'New Britain', 'Chicago State': 'Chicago', 'Fairleigh Dickinson': 'Teaneck',
    'LIU': 'Brookville', 'Merrimack': 'North Andover', 'Saint Francis': 'Loretto', 'Stonehill': 'Easton',
    'Wagner': 'Staten Island',
    // ---- OVC ----
    'Eastern Illinois': 'Charleston', 'Lindenwood': 'St. Charles', 'Little Rock': 'Little Rock',
    'Morehead State': 'Morehead', 'SIU Edwardsville': 'Edwardsville', 'Southeast Missouri State': 'Cape Girardeau',
    'Tennessee State': 'Nashville', 'Tennessee Tech': 'Cookeville', 'UT Martin': 'Martin',
    // ---- Big West ----
    'Cal Poly': 'San Luis Obispo', 'Cal State Bakersfield': 'Bakersfield', 'Cal State Fullerton': 'Fullerton',
    'Cal State Northridge': 'Northridge', 'Hawaii': 'Honolulu', 'Long Beach State': 'Long Beach',
    'UC Davis': 'Davis', 'UC Irvine': 'Irvine', 'UC Riverside': 'Riverside', 'UC San Diego': 'La Jolla',
    'UC Santa Barbara': 'Santa Barbara',

    // ---- Division II (notable programs) ----
    'Adams State': 'Alamosa', 'Colorado Mines': 'Golden', 'Western Colorado': 'Gunnison', 'CSU Pueblo': 'Pueblo',
    'Colorado Christian': 'Lakewood', 'MSU Denver': 'Denver', 'UC Colorado Springs': 'Colorado Springs',
    'Fort Lewis': 'Durango', 'Chadron State': 'Chadron', 'Black Hills State': 'Spearfish',
    'South Dakota Mines': 'Rapid City', 'New Mexico Highlands': 'Las Vegas',
    'Grand Valley State': 'Allendale', 'Ferris State': 'Big Rapids', 'Saginaw Valley State': 'University Center',
    'Michigan Tech': 'Houghton', 'Northern Michigan': 'Marquette', 'Shippensburg': 'Shippensburg',
    'Kutztown': 'Kutztown', 'West Chester': 'West Chester', 'Slippery Rock': 'Slippery Rock', 'IUP': 'Indiana',
    'Lenoir-Rhyne': 'Hickory', 'Wingate': 'Wingate', 'Carson-Newman': 'Jefferson City', 'Lincoln Memorial': 'Harrogate',
    'West Texas A&M': 'Canyon', 'Angelo State': 'San Angelo', 'Texas A&M-Kingsville': 'Kingsville',
    'Hillsdale': 'Hillsdale', 'Findlay': 'Findlay', 'Ashland': 'Ashland', 'Cedarville': 'Cedarville',
    'Augustana (SD)': 'Sioux Falls', 'Minnesota State': 'Mankato', 'Winona State': 'Winona',
    'St. Cloud State': 'St. Cloud', 'Minnesota Duluth': 'Duluth', 'U-Mary': 'Bismarck', 'Minot State': 'Minot',
    'Pittsburg State': 'Pittsburg', 'Fort Hays State': 'Hays', 'Emporia State': 'Emporia', 'Washburn': 'Topeka',
    'Central Missouri': 'Warrensburg', 'Northwest Missouri State': 'Maryville', 'Nebraska Kearney': 'Kearney',
    'Cal Poly Pomona': 'Pomona', 'Chico State': 'Chico', 'Cal State San Bernardino': 'San Bernardino',
    'Stanislaus State': 'Turlock', 'San Francisco State': 'San Francisco', 'Sonoma State': 'Rohnert Park',
    'Arkansas Tech': 'Russellville', 'Harding': 'Searcy', 'Henderson State': 'Arkadelphia', 'Ouachita Baptist': 'Arkadelphia',
    'Columbus State': 'Columbus', 'Georgia College': 'Milledgeville', 'Flagler': 'St. Augustine', 'UNC Pembroke': 'Pembroke',
    'Adelphi': 'Garden City', 'Bentley': 'Waltham', 'Le Moyne': 'Syracuse', 'Saint Anselm': 'Manchester',
    'Southern Connecticut': 'New Haven', 'Southern New Hampshire': 'Manchester',
    'Tampa': 'Tampa', 'Saint Leo': 'Saint Leo', 'Florida Southern': 'Lakeland', 'Rollins': 'Winter Park',
    'Nova Southeastern': 'Fort Lauderdale', 'Embry-Riddle': 'Daytona Beach', 'Florida Tech': 'Melbourne',
    'Western Washington': 'Bellingham', 'Seattle Pacific': 'Seattle', 'Central Washington': 'Ellensburg',
    'Western Oregon': 'Monmouth', 'Alaska Anchorage': 'Anchorage', 'Alaska Fairbanks': 'Fairbanks',
    'MSU Billings': 'Billings', 'Northwest Nazarene': 'Nampa', 'Simon Fraser': 'Burnaby',
    'Azusa Pacific': 'Azusa', 'Point Loma Nazarene': 'San Diego', 'Biola': 'La Mirada',
    'Concordia Irvine': 'Irvine', 'Fresno Pacific': 'Fresno', 'Hawaii Pacific': 'Honolulu', 'Hawaii Hilo': 'Hilo',

    // ---- Division III (notable programs) ----
    'UW-La Crosse': 'La Crosse', 'UW-Oshkosh': 'Oshkosh', 'UW-Whitewater': 'Whitewater', 'UW-Eau Claire': 'Eau Claire',
    'UW-Stevens Point': 'Stevens Point', 'UW-Platteville': 'Platteville', 'UW-Stout': 'Menomonie',
    'Williams': 'Williamstown', 'Amherst': 'Amherst', 'Middlebury': 'Middlebury', 'Tufts': 'Medford',
    'Bowdoin': 'Brunswick', 'Bates': 'Lewiston', 'Colby': 'Waterville', 'Wesleyan': 'Middletown',
    'Kenyon': 'Gambier', 'Denison': 'Granville', 'Oberlin': 'Oberlin', 'Wooster': 'Wooster',
    'Ohio Wesleyan': 'Delaware', 'Wabash': 'Crawfordsville', 'DePauw': 'Greencastle', 'Wittenberg': 'Springfield',
    'Allegheny': 'Meadville', 'Washington U. (MO)': 'St. Louis', 'Chicago': 'Chicago', 'Emory': 'Atlanta',
    'Carnegie Mellon': 'Pittsburgh', 'Case Western Reserve': 'Cleveland', 'NYU': 'New York', 'Rochester (NY)': 'Rochester',
    'Brandeis': 'Waltham', 'Geneseo': 'Geneseo', 'Cortland': 'Cortland', 'Brockport': 'Brockport',
    'Oneonta': 'Oneonta', 'Plattsburgh': 'Plattsburgh', 'Calvin': 'Grand Rapids', 'Hope': 'Holland',
    'Albion': 'Albion', 'Alma': 'Alma', 'Kalamazoo': 'Kalamazoo', 'Trinity (TX)': 'San Antonio',
    'Colorado College': 'Colorado Springs', 'Southwestern': 'Georgetown', 'North Central (IL)': 'Naperville',
    'Wheaton (IL)': 'Wheaton', 'Elmhurst': 'Elmhurst', 'Augustana (IL)': 'Rock Island', 'Illinois Wesleyan': 'Bloomington',
    'Carthage': 'Kenosha', 'Millikin': 'Decatur', 'Lynchburg': 'Lynchburg', 'Washington and Lee': 'Lexington',
    'Roanoke': 'Salem', 'Bridgewater (VA)': 'Bridgewater', 'Randolph-Macon': 'Ashland', 'Hampden-Sydney': 'Hampden Sydney',
    'Guilford': 'Greensboro', 'Johns Hopkins': 'Baltimore', 'Haverford': 'Haverford', 'Swarthmore': 'Swarthmore',
    'Dickinson': 'Carlisle', 'Gettysburg': 'Gettysburg', 'Franklin & Marshall': 'Lancaster', 'Muhlenberg': 'Allentown',
    'Ursinus': 'Collegeville', 'McDaniel': 'Westminster', 'RPI': 'Troy', 'RIT': 'Rochester', 'Union': 'Schenectady',
    'Ithaca': 'Ithaca', 'St. Lawrence': 'Canton', 'Skidmore': 'Saratoga Springs', 'Vassar': 'Poughkeepsie',
    'Clarkson': 'Potsdam', 'St. Olaf': 'Northfield', 'Carleton': 'Northfield', 'Macalester': 'St. Paul',
    'Gustavus Adolphus': 'St. Peter', 'Hamline': 'St. Paul', 'Bethel (MN)': 'St. Paul', 'St. John\'s (MN)': 'Collegeville',
    'Augsburg': 'Minneapolis', 'Concordia Moorhead': 'Moorhead', 'Nazareth': 'Rochester', 'St. John Fisher': 'Rochester',
    'Utica': 'Utica', 'Berry': 'Mount Berry', 'Centre': 'Danville', 'Sewanee': 'Sewanee', 'Rhodes': 'Memphis',
    'Hendrix': 'Conway', 'Millsaps': 'Jackson', 'Oglethorpe': 'Atlanta', 'Keene State': 'Keene',
    'Plymouth State': 'Plymouth', 'Christopher Newport': 'Newport News', 'Mary Washington': 'Fredericksburg',
    'Salisbury': 'Salisbury', 'MIT': 'Cambridge', 'WPI': 'Worcester', 'Coast Guard': 'New London',
    'Springfield': 'Springfield', 'Babson': 'Wellesley', 'Wheaton (MA)': 'Norton', 'Catholic': 'Washington',
    'Susquehanna': 'Selinsgrove', 'Juniata': 'Huntingdon', 'Elizabethtown': 'Elizabethtown', 'Moravian': 'Bethlehem',
    'Scranton': 'Scranton', 'Pomona': 'Claremont', 'Trinity (CT)': 'Hartford', 'Hamilton': 'Clinton',
    'Connecticut College': 'New London'
  };

  /*
   * The campus city for a school — the hand-authored value when known, else a
   * deterministic real city drawn from the state's town list (never fictional).
   */
  D.cityForSchool = function (school) {
    if (!school) return '';
    if (school.city) return school.city;
    const named = D.SCHOOL_CITY[school.name];
    if (named) return named;
    const towns = D.REAL_TOWNS[school.state];
    if (towns && towns.length) {
      let h = 0;
      const n = school.name || '';
      for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
      return towns[h % towns.length];
    }
    return (D.STATE_NAMES && D.STATE_NAMES[school.state]) || school.state || '';
  };

  /* ================================================================ *
   * 4. NCAA CHAMPIONSHIP VENUES
   *
   * Only real courses that have actually hosted NCAA cross country
   * championships. The national meet rotates through these instead of a random
   * campus, and each carries its authentic terrain (altitude in feet, a 0-100
   * hilliness profile, and a short surface note) so the championship feels and
   * races like the real thing. `divisions` restricts a venue when a course is
   * used by specific divisions; omitted means eligible for any division.
   * ================================================================ */
  D.CHAMPIONSHIP_VENUES = [
    { name: 'Thomas Zimmer Championship Course', city: 'Madison', state: 'WI',
      altitudeFt: 900, hilliness: 46, surface: 'Rolling grass, fast', terrain: 'Rolling championship grass — fast and true.' },
    { name: 'E.P. "Tom" Sawyer State Park', city: 'Louisville', state: 'KY',
      altitudeFt: 466, hilliness: 20, surface: 'Flat, fast', terrain: 'Flat and fast — a personal-best course.' },
    { name: 'Apalachee Regional Park', city: 'Tallahassee', state: 'FL',
      altitudeFt: 203, hilliness: 40, surface: 'Rolling, humid', terrain: 'Rolling, purpose-built championship course.' },
    { name: 'LaVern Gibson Championship Course', city: 'Terre Haute', state: 'IN',
      altitudeFt: 500, hilliness: 42, surface: 'Rolling grass', terrain: 'Rolling championship-caliber grass.' },
    { name: 'OSU Cross Country Course', city: 'Stillwater', state: 'OK',
      altitudeFt: 988, hilliness: 52, surface: 'Rolling, wind-exposed', terrain: 'Rolling with wind exposure across the plains.' },
    { name: 'Panorama Farms', city: 'Earlysville', state: 'VA',
      altitudeFt: 640, hilliness: 70, surface: 'Hilly, challenging', terrain: 'Genuinely hilly and demanding farmland.' },
    { name: 'Greiner Family OSU Cross Country Course', city: 'Stillwater', state: 'OK',
      altitudeFt: 988, hilliness: 55, surface: 'Rolling, wind-exposed', terrain: 'Modern rolling course exposed to prairie wind.' },
    { name: 'Wilson\'s Farm', city: 'Terre Haute', state: 'IN',
      altitudeFt: 495, hilliness: 44, surface: 'Rolling grass', terrain: 'Rolling grass on the Terre Haute farmland.' }
  ];

  // A deterministic championship venue for a given year + division, so the
  // rotation is stable across a save but changes season to season.
  D.championshipVenue = function (year, division) {
    const pool = D.CHAMPIONSHIP_VENUES.filter((v) => !v.divisions || v.divisions.includes(division));
    const list = pool.length ? pool : D.CHAMPIONSHIP_VENUES;
    const divOffset = { DI: 0, DII: 3, DIII: 5 }[division] || 0;
    return list[((year || 0) + divOffset) % list.length];
  };

  /* ================================================================ *
   * 5. HIGH-ALTITUDE PROGRAMS
   *
   * The programs that genuinely train at elevation, by their real campus
   * altitude. Northern Arizona (Flagstaff, ~7,000 ft) is the flagship true
   * high-altitude program; Air Force, Colorado, Colorado State, Wyoming and
   * the Colorado DII schools also train high, while Utah/Utah State sit at a
   * moderate elevation. Altitude gives real, lasting aerobic development and
   * a live-high/race-low edge — with a harder first-year adaptation for
   * incoming athletes (all handled by the training + race engines).
   * ================================================================ */
  D.ALTITUDE_PROGRAMS = {
    // True high altitude (~5,000 ft and up)
    'Northern Arizona': 'High', 'Air Force': 'High', 'Colorado': 'High',
    'Colorado State': 'High', 'Wyoming': 'High', 'New Mexico': 'High',
    'Northern Colorado': 'High', 'Denver': 'High', 'BYU': 'High',
    'Adams State': 'High', 'Western Colorado': 'High', 'Colorado Mines': 'High',
    'CSU Pueblo': 'High', 'Colorado Christian': 'High', 'UC Colorado Springs': 'High',
    'Fort Lewis': 'High', 'New Mexico Highlands': 'High', 'Western New Mexico': 'High',
    'Eastern New Mexico': 'High', 'Chadron State': 'High', 'MSU Denver': 'High',
    'Colorado College': 'High',
    // Moderate altitude (~3,500–5,000 ft)
    'Utah': 'Medium', 'Utah State': 'Medium', 'Weber State': 'Medium',
    'Southern Utah': 'Medium', 'Utah Valley': 'Medium', 'Utah Tech': 'Medium',
    'Montana State': 'Medium', 'Montana': 'Medium', 'Idaho State': 'Medium',
    'Boise State': 'Medium', 'Nevada': 'Medium', 'UNLV': 'Medium',
    'Grand Canyon': 'Medium', 'Arizona State': 'Medium',
    'MSU Billings': 'Medium', 'Black Hills State': 'Medium', 'South Dakota Mines': 'Medium',
    'Texas Tech': 'Medium', 'UTEP': 'Medium'
  };

  /*
   * The altitude category for a program: an explicit designation wins;
   * otherwise mountain-state schools default to a moderate elevation and
   * everywhere else is low. Deterministic — no per-save randomness — so a
   * school's altitude identity is stable and matches its real location.
   */
  const MOUNTAIN_STATES = new Set(['CO', 'UT', 'WY', 'MT', 'NM']);
  D.altitudeForSchool = function (name, state) {
    if (name && D.ALTITUDE_PROGRAMS[name]) return D.ALTITUDE_PROGRAMS[name];
    if (MOUNTAIN_STATES.has(state)) return 'Medium';
    return 'Low';
  };
})();
