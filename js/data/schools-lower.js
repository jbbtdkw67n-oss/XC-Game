/*
 * NCAA Division II and Division III member institutions (Update 3).
 *
 * Each entry is [Name, State abbreviation, Conference] — the same shape as
 * the Division I roster in schools-data.js. Conference assignments and
 * memberships are a reasonable real-world approximation for flavor and
 * grouping (scheduling, regional recruiting, rivalries), not a legal record
 * of current athletic affiliation. Worldgen scales prestige, budgets,
 * facilities, and athlete ability down by division so the three levels feel
 * distinct while sharing one living NCAA ecosystem.
 *
 * Conference tier here is prestige WITHIN the division (1 = flagship, 4 =
 * developing); the division's budgetScale (divisions.js) handles the money
 * gap between DI, DII, and DIII.
 */
(function () {
  const D = window.XCD.data;

  /* ---------------- Division II ---------------- */
  D.RAW_SCHOOLS_DII = [
    // RMAC — Rocky Mountain Athletic Conference
    ['Adams State','CO','RMAC'],['Colorado Mines','CO','RMAC'],['Western Colorado','CO','RMAC'],
    ['CSU Pueblo','CO','RMAC'],['Colorado Christian','CO','RMAC'],['MSU Denver','CO','RMAC'],
    ['UC Colorado Springs','CO','RMAC'],['Fort Lewis','CO','RMAC'],['Chadron State','NE','RMAC'],
    ['Black Hills State','SD','RMAC'],['South Dakota Mines','SD','RMAC'],['New Mexico Highlands','NM','RMAC'],
    // GLIAC — Great Lakes Intercollegiate
    ['Grand Valley State','MI','GLIAC'],['Ferris State','MI','GLIAC'],['Saginaw Valley State','MI','GLIAC'],
    ['Wayne State (MI)','MI','GLIAC'],['Davenport','MI','GLIAC'],['Northwood','MI','GLIAC'],
    ['Michigan Tech','MI','GLIAC'],['Northern Michigan','MI','GLIAC'],['Lake Superior State','MI','GLIAC'],
    ['Purdue Northwest','IN','GLIAC'],['Roosevelt','IL','GLIAC'],
    // PSAC — Pennsylvania State Athletic Conference
    ['Shippensburg','PA','PSAC'],['Kutztown','PA','PSAC'],['Millersville','PA','PSAC'],
    ['West Chester','PA','PSAC'],['Slippery Rock','PA','PSAC'],['IUP','PA','PSAC'],
    ['PennWest California','PA','PSAC'],['Bloomsburg','PA','PSAC'],['East Stroudsburg','PA','PSAC'],
    ['Lock Haven','PA','PSAC'],['Gannon','PA','PSAC'],['Mercyhurst','PA','PSAC'],
    ['Seton Hill','PA','PSAC'],['Shepherd','WV','PSAC'],
    // SAC — South Atlantic Conference
    ['Lenoir-Rhyne','NC','SAC'],['Catawba','NC','SAC'],['Wingate','NC','SAC'],['Mars Hill','NC','SAC'],
    ['Carson-Newman','TN','SAC'],['Tusculum','TN','SAC'],['Anderson (SC)','SC','SAC'],
    ['Newberry','SC','SAC'],['Lincoln Memorial','TN','SAC'],['Coker','SC','SAC'],
    ['Emory & Henry','VA','SAC'],['UVA Wise','VA','SAC'],['Limestone','SC','SAC'],
    // Lone Star Conference
    ['West Texas A&M','TX','Lone Star'],['Angelo State','TX','Lone Star'],['UT Tyler','TX','Lone Star'],
    ['Texas A&M-Kingsville','TX','Lone Star'],['Lubbock Christian','TX','Lone Star'],['St. Edward\'s','TX','Lone Star'],
    ['St. Mary\'s (TX)','TX','Lone Star'],['Dallas Baptist','TX','Lone Star'],['UT Permian Basin','TX','Lone Star'],
    ['Western New Mexico','NM','Lone Star'],['Eastern New Mexico','NM','Lone Star'],['Cameron','OK','Lone Star'],
    // G-MAC — Great Midwest Athletic Conference
    ['Hillsdale','MI','Great Midwest'],['Findlay','OH','Great Midwest'],['Malone','OH','Great Midwest'],
    ['Cedarville','OH','Great Midwest'],['Tiffin','OH','Great Midwest'],['Ashland','OH','Great Midwest'],
    ['Ohio Dominican','OH','Great Midwest'],['Walsh','OH','Great Midwest'],['Kentucky Wesleyan','KY','Great Midwest'],
    ['Thomas More','KY','Great Midwest'],['Trevecca Nazarene','TN','Great Midwest'],['Lake Erie','OH','Great Midwest'],
    // CIAA — Central Intercollegiate Athletic Association
    ['Fayetteville State','NC','CIAA'],['Bowie State','MD','CIAA'],['Virginia State','VA','CIAA'],
    ['Virginia Union','VA','CIAA'],['Winston-Salem State','NC','CIAA'],['Livingstone','NC','CIAA'],
    ['Johnson C. Smith','NC','CIAA'],['Shaw','NC','CIAA'],['Elizabeth City State','NC','CIAA'],
    ['Lincoln (PA)','PA','CIAA'],['Claflin','SC','CIAA'],
    // SIAC — Southern Intercollegiate Athletic Conference
    ['Albany State','GA','SIAC'],['Fort Valley State','GA','SIAC'],['Clark Atlanta','GA','SIAC'],
    ['Morehouse','GA','SIAC'],['Kentucky State','KY','SIAC'],['Lane','TN','SIAC'],
    ['Miles','AL','SIAC'],['Tuskegee','AL','SIAC'],['Benedict','SC','SIAC'],['Savannah State','GA','SIAC'],
    // NSIC — Northern Sun Intercollegiate Conference
    ['Augustana (SD)','SD','NSIC'],['Minnesota State','MN','NSIC'],['MSU Moorhead','MN','NSIC'],
    ['Winona State','MN','NSIC'],['Bemidji State','MN','NSIC'],['St. Cloud State','MN','NSIC'],
    ['Concordia St. Paul','MN','NSIC'],['Minnesota Duluth','MN','NSIC'],['Northern State','SD','NSIC'],
    ['Wayne State (NE)','NE','NSIC'],['Sioux Falls','SD','NSIC'],['Southwest Minnesota State','MN','NSIC'],
    ['Minot State','ND','NSIC'],['U-Mary','ND','NSIC'],
    // MIAA — Mid-America Intercollegiate Athletics Association
    ['Pittsburg State','KS','MIAA (DII)'],['Fort Hays State','KS','MIAA (DII)'],['Emporia State','KS','MIAA (DII)'],
    ['Washburn','KS','MIAA (DII)'],['Central Missouri','MO','MIAA (DII)'],['Missouri Southern','MO','MIAA (DII)'],
    ['Missouri Western','MO','MIAA (DII)'],['Northwest Missouri State','MO','MIAA (DII)'],['Northeastern State','OK','MIAA (DII)'],
    ['Rogers State','OK','MIAA (DII)'],['Nebraska Kearney','NE','MIAA (DII)'],['Central Oklahoma','OK','MIAA (DII)'],
    ['Newman','KS','MIAA (DII)'],
    // CCAA — California Collegiate Athletic Association
    ['Cal Poly Pomona','CA','CCAA'],['Chico State','CA','CCAA'],['Cal State San Bernardino','CA','CCAA'],
    ['Stanislaus State','CA','CCAA'],['Cal State LA','CA','CCAA'],['Cal State East Bay','CA','CCAA'],
    ['San Francisco State','CA','CCAA'],['Sonoma State','CA','CCAA'],['Cal State Monterey Bay','CA','CCAA'],
    ['Cal State Dominguez Hills','CA','CCAA'],['Cal State San Marcos','CA','CCAA'],
    // GAC — Great American Conference
    ['Arkansas Tech','AR','GAC'],['Harding','AR','GAC'],['Henderson State','AR','GAC'],
    ['Southern Arkansas','AR','GAC'],['Ouachita Baptist','AR','GAC'],['Southern Nazarene','OK','GAC'],
    ['Southeastern Oklahoma State','OK','GAC'],['Southwestern Oklahoma State','OK','GAC'],['East Central','OK','GAC'],
    ['Oklahoma Baptist','OK','GAC'],['Arkansas-Monticello','AR','GAC'],
    // PBC — Peach Belt Conference
    ['Columbus State','GA','PBC'],['Georgia College','GA','PBC'],['Georgia Southwestern','GA','PBC'],
    ['Flagler','FL','PBC'],['Lander','SC','PBC'],['USC Aiken','SC','PBC'],['USC Beaufort','SC','PBC'],
    ['Young Harris','GA','PBC'],['Clayton State','GA','PBC'],['UNC Pembroke','NC','PBC'],
    // NE10 — Northeast-10 Conference
    ['Adelphi','NY','NE10'],['American International','MA','NE10'],['Assumption','MA','NE10'],
    ['Bentley','MA','NE10'],['Franklin Pierce','NH','NE10'],['Le Moyne','NY','NE10'],
    ['New Haven','CT','NE10'],['Pace','NY','NE10'],['Saint Anselm','NH','NE10'],
    ['Saint Michael\'s','VT','NE10'],['Southern Connecticut','CT','NE10'],['Southern New Hampshire','NH','NE10'],
    // SSC — Sunshine State Conference
    ['Tampa','FL','Sunshine State'],['Saint Leo','FL','Sunshine State'],['Florida Southern','FL','Sunshine State'],
    ['Rollins','FL','Sunshine State'],['Eckerd','FL','Sunshine State'],['Nova Southeastern','FL','Sunshine State'],
    ['Lynn','FL','Sunshine State'],['Palm Beach Atlantic','FL','Sunshine State'],['Embry-Riddle','FL','Sunshine State'],
    ['Florida Tech','FL','Sunshine State'],
    // Conference Carolinas
    ['Belmont Abbey','NC','Conference Carolinas'],['Barton','NC','Conference Carolinas'],['Mount Olive','NC','Conference Carolinas'],
    ['Lees-McRae','NC','Conference Carolinas'],['King','TN','Conference Carolinas'],['Emmanuel (GA)','GA','Conference Carolinas'],
    ['Southern Wesleyan','SC','Conference Carolinas'],['Erskine','SC','Conference Carolinas'],['Converse','SC','Conference Carolinas'],
    ['Chowan','NC','Conference Carolinas'],['North Greenville','SC','Conference Carolinas'],['Francis Marion','SC','Conference Carolinas'],
    // GNAC — Great Northwest Athletic Conference
    ['Western Washington','WA','Great Northwest'],['Seattle Pacific','WA','Great Northwest'],['Central Washington','WA','Great Northwest'],
    ['Western Oregon','OR','Great Northwest'],['Alaska Anchorage','AK','Great Northwest'],['Alaska Fairbanks','AK','Great Northwest'],
    ['MSU Billings','MT','Great Northwest'],['Northwest Nazarene','ID','Great Northwest'],['Saint Martin\'s','WA','Great Northwest'],
    // PacWest Conference
    ['Azusa Pacific','CA','PacWest'],['Point Loma Nazarene','CA','PacWest'],['Biola','CA','PacWest'],
    ['Concordia Irvine','CA','PacWest'],['Fresno Pacific','CA','PacWest'],['Hawaii Pacific','HI','PacWest'],
    ['Chaminade','HI','PacWest'],['Hawaii Hilo','HI','PacWest'],['Academy of Art','CA','PacWest'],['Dominican (CA)','CA','PacWest']
  ];

  /* ---------------- Division III ---------------- */
  D.RAW_SCHOOLS_DIII = [
    // WIAC — Wisconsin Intercollegiate Athletic Conference
    ['UW-La Crosse','WI','WIAC'],['UW-Oshkosh','WI','WIAC'],['UW-Whitewater','WI','WIAC'],
    ['UW-Eau Claire','WI','WIAC'],['UW-Stevens Point','WI','WIAC'],['UW-Platteville','WI','WIAC'],
    ['UW-River Falls','WI','WIAC'],['UW-Stout','WI','WIAC'],['UW-Superior','WI','WIAC'],
    // NESCAC — New England Small College Athletic Conference
    ['Williams','MA','NESCAC'],['Amherst','MA','NESCAC'],['Middlebury','VT','NESCAC'],['Tufts','MA','NESCAC'],
    ['Bowdoin','ME','NESCAC'],['Bates','ME','NESCAC'],['Colby','ME','NESCAC'],['Wesleyan','CT','NESCAC'],
    ['Trinity (CT)','CT','NESCAC'],['Hamilton','NY','NESCAC'],['Connecticut College','CT','NESCAC'],
    // NCAC — North Coast Athletic Conference
    ['Kenyon','OH','NCAC'],['Denison','OH','NCAC'],['Oberlin','OH','NCAC'],['Wooster','OH','NCAC'],
    ['Ohio Wesleyan','OH','NCAC'],['Wabash','IN','NCAC'],['DePauw','IN','NCAC'],['Wittenberg','OH','NCAC'],
    ['Hiram','OH','NCAC'],['Allegheny','PA','NCAC'],
    // UAA — University Athletic Association
    ['Washington U. (MO)','MO','UAA'],['Chicago','IL','UAA'],['Emory','GA','UAA'],['Carnegie Mellon','PA','UAA'],
    ['Case Western Reserve','OH','UAA'],['NYU','NY','UAA'],['Rochester (NY)','NY','UAA'],['Brandeis','MA','UAA'],
    // SUNYAC — State University of New York Athletic Conference
    ['Geneseo','NY','SUNYAC'],['Cortland','NY','SUNYAC'],['Brockport','NY','SUNYAC'],['Oneonta','NY','SUNYAC'],
    ['Fredonia','NY','SUNYAC'],['Plattsburgh','NY','SUNYAC'],['Potsdam','NY','SUNYAC'],['Oswego','NY','SUNYAC'],
    ['New Paltz','NY','SUNYAC'],['Buffalo State','NY','SUNYAC'],
    // MIAA — Michigan Intercollegiate Athletic Association
    ['Calvin','MI','MIAA (DIII)'],['Hope','MI','MIAA (DIII)'],['Albion','MI','MIAA (DIII)'],['Alma','MI','MIAA (DIII)'],
    ['Kalamazoo','MI','MIAA (DIII)'],['Olivet','MI','MIAA (DIII)'],['Adrian','MI','MIAA (DIII)'],['Trine','IN','MIAA (DIII)'],
    ['Saint Mary\'s (IN)','IN','MIAA (DIII)'],
    // SCAC — Southern Collegiate Athletic Conference
    ['Trinity (TX)','TX','SCAC'],['Colorado College','CO','SCAC'],['Southwestern','TX','SCAC'],
    ['Texas Lutheran','TX','SCAC'],['Schreiner','TX','SCAC'],['Austin College','TX','SCAC'],
    ['St. Thomas (TX)','TX','SCAC'],['Dallas','TX','SCAC'],
    // CCIW — College Conference of Illinois and Wisconsin
    ['North Central (IL)','IL','CCIW'],['Wheaton (IL)','IL','CCIW'],['Elmhurst','IL','CCIW'],
    ['Augustana (IL)','IL','CCIW'],['Illinois Wesleyan','IL','CCIW'],['Carthage','WI','CCIW'],
    ['Millikin','IL','CCIW'],['North Park','IL','CCIW'],
    // ODAC — Old Dominion Athletic Conference
    ['Lynchburg','VA','ODAC'],['Washington and Lee','VA','ODAC'],['Roanoke','VA','ODAC'],['Bridgewater (VA)','VA','ODAC'],
    ['Randolph-Macon','VA','ODAC'],['Hampden-Sydney','VA','ODAC'],['Guilford','NC','ODAC'],
    ['Virginia Wesleyan','VA','ODAC'],['Shenandoah','VA','ODAC'],['Eastern Mennonite','VA','ODAC'],
    // Centennial Conference
    ['Johns Hopkins','MD','Centennial'],['Haverford','PA','Centennial'],['Swarthmore','PA','Centennial'],
    ['Dickinson','PA','Centennial'],['Gettysburg','PA','Centennial'],['Franklin & Marshall','PA','Centennial'],
    ['Muhlenberg','PA','Centennial'],['Ursinus','PA','Centennial'],['McDaniel','MD','Centennial'],['Washington (MD)','MD','Centennial'],
    // Liberty League
    ['RPI','NY','Liberty League'],['RIT','NY','Liberty League'],['Union','NY','Liberty League'],['Ithaca','NY','Liberty League'],
    ['St. Lawrence','NY','Liberty League'],['Skidmore','NY','Liberty League'],['Hobart & William Smith','NY','Liberty League'],
    ['Vassar','NY','Liberty League'],['Bard','NY','Liberty League'],['Clarkson','NY','Liberty League'],
    // MIAC — Minnesota Intercollegiate Athletic Conference
    ['St. Olaf','MN','MIAC'],['Carleton','MN','MIAC'],['Macalester','MN','MIAC'],['Gustavus Adolphus','MN','MIAC'],
    ['Hamline','MN','MIAC'],['Bethel (MN)','MN','MIAC'],['St. John\'s (MN)','MN','MIAC'],['Augsburg','MN','MIAC'],
    ['Concordia Moorhead','MN','MIAC'],['Saint Mary\'s (MN)','MN','MIAC'],
    // Empire 8
    ['Nazareth','NY','Empire 8'],['St. John Fisher','NY','Empire 8'],['Utica','NY','Empire 8'],['Alfred','NY','Empire 8'],
    ['Elmira','NY','Empire 8'],['Hartwick','NY','Empire 8'],['Houghton','NY','Empire 8'],['Sage','NY','Empire 8'],
    // SAA — Southern Athletic Association
    ['Berry','GA','SAA'],['Centre','KY','SAA'],['Sewanee','TN','SAA'],['Rhodes','TN','SAA'],
    ['Hendrix','AR','SAA'],['Millsaps','MS','SAA'],['Oglethorpe','GA','SAA'],
    // Skyline Conference
    ['Mount Saint Mary (NY)','NY','Skyline'],['Farmingdale State','NY','Skyline'],['Old Westbury','NY','Skyline'],
    ['Sarah Lawrence','NY','Skyline'],['Purchase','NY','Skyline'],['St. Joseph\'s (LI)','NY','Skyline'],['Yeshiva','NY','Skyline'],
    // Little East Conference
    ['Keene State','NH','Little East'],['Plymouth State','NH','Little East'],['UMass Dartmouth','MA','Little East'],
    ['UMass Boston','MA','Little East'],['Rhode Island College','RI','Little East'],['Eastern Connecticut','CT','Little East'],
    ['Western Connecticut','CT','Little East'],['Southern Maine','ME','Little East'],['Castleton','VT','Little East'],
    // C2C — Coast To Coast Athletic Conference
    ['Christopher Newport','VA','C2C'],['Mary Washington','VA','C2C'],['Salisbury','MD','C2C'],
    ['Southern Virginia','VA','C2C'],['York (PA)','PA','C2C'],['Pfeiffer','NC','C2C'],
    // NEWMAC — New England Women's and Men's Athletic Conference
    ['MIT','MA','NEWMAC'],['WPI','MA','NEWMAC'],['Coast Guard','CT','NEWMAC'],['Springfield','MA','NEWMAC'],
    ['Babson','MA','NEWMAC'],['Wheaton (MA)','MA','NEWMAC'],['Clark (MA)','MA','NEWMAC'],['Emerson','MA','NEWMAC'],
    // Landmark Conference
    ['Catholic','DC','Landmark'],['Susquehanna','PA','Landmark'],['Juniata','PA','Landmark'],['Elizabethtown','PA','Landmark'],
    ['Moravian','PA','Landmark'],['Scranton','PA','Landmark'],['Goucher','MD','Landmark'],['Drew','NJ','Landmark']
  ];

  /*
   * Conference metadata for the lower divisions. Tier is prestige WITHIN the
   * division. Merged into D.CONFERENCES (defined in constants.js) so every
   * lookup keeps working. The `division` hint lets the UI group correctly
   * when two divisions reuse a name (MIAA exists in both DII and DIII).
   */
  D.CONFERENCES_DII = {
    'RMAC': 1, 'GLIAC': 1, 'PSAC': 1, 'NSIC': 1, 'Lone Star': 1,
    'SAC': 2, 'Great Midwest': 2, 'MIAA (DII)': 2, 'CCAA': 2, 'Sunshine State': 2,
    'NE10': 2, 'Great Northwest': 2, 'PacWest': 2, 'GAC': 3, 'PBC': 3,
    'Conference Carolinas': 3, 'CIAA': 3, 'SIAC': 3
  };
  D.CONFERENCES_DIII = {
    'WIAC': 1, 'NESCAC': 1, 'NCAC': 1, 'UAA': 1, 'MIAC': 1,
    'SUNYAC': 2, 'MIAA (DIII)': 2, 'CCIW': 2, 'ODAC': 2, 'Centennial': 2,
    'Liberty League': 2, 'Little East': 2, 'NEWMAC': 2,
    'SCAC': 3, 'Empire 8': 3, 'SAA': 3, 'Skyline': 3, 'C2C': 3, 'Landmark': 3
  };

  Object.entries(D.CONFERENCES_DII).forEach(([name, tier]) => {
    D.CONFERENCES[name] = D.CONFERENCES[name] || { tier, division: 'DII' };
  });
  Object.entries(D.CONFERENCES_DIII).forEach(([name, tier]) => {
    D.CONFERENCES[name] = D.CONFERENCES[name] || { tier, division: 'DIII' };
  });
})();
