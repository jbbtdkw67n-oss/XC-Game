/*
 * Raw roster of 350+ NCAA Division I member institutions used to seed the
 * game world. Each entry is [Name, State abbreviation, Conference].
 * Conference assignments are a reasonable real-world approximation for
 * flavor/grouping purposes (schedule generation, rivalries, regional
 * recruiting) rather than an exact legal record of athletic affiliation.
 */
(function () {
  window.XCD.data.RAW_SCHOOLS = [
    // ACC
    ['Boston College','MA','ACC'],['California','CA','ACC'],['Clemson','SC','ACC'],['Duke','NC','ACC'],
    ['Florida State','FL','ACC'],['Georgia Tech','GA','ACC'],['Louisville','KY','ACC'],['Miami','FL','ACC'],
    ['NC State','NC','ACC'],['North Carolina','NC','ACC'],['Notre Dame','IN','ACC'],['Pittsburgh','PA','ACC'],
    ['SMU','TX','ACC'],['Stanford','CA','ACC'],['Syracuse','NY','ACC'],['Virginia','VA','ACC'],
    ['Virginia Tech','VA','ACC'],['Wake Forest','NC','ACC'],
    // Big Ten
    ['Illinois','IL','Big Ten'],['Indiana','IN','Big Ten'],['Iowa','IA','Big Ten'],['Maryland','MD','Big Ten'],
    ['Michigan','MI','Big Ten'],['Michigan State','MI','Big Ten'],['Minnesota','MN','Big Ten'],['Nebraska','NE','Big Ten'],
    ['Northwestern','IL','Big Ten'],['Ohio State','OH','Big Ten'],['Oregon','OR','Big Ten'],['Penn State','PA','Big Ten'],
    ['Purdue','IN','Big Ten'],['Rutgers','NJ','Big Ten'],['UCLA','CA','Big Ten'],['USC','CA','Big Ten'],
    ['Washington','WA','Big Ten'],['Wisconsin','WI','Big Ten'],
    // Big 12
    ['Arizona','AZ','Big 12'],['Arizona State','AZ','Big 12'],['Baylor','TX','Big 12'],['BYU','UT','Big 12'],
    ['Cincinnati','OH','Big 12'],['Colorado','CO','Big 12'],['Houston','TX','Big 12'],['Iowa State','IA','Big 12'],
    ['Kansas','KS','Big 12'],['Kansas State','KS','Big 12'],['Oklahoma State','OK','Big 12'],['TCU','TX','Big 12'],
    ['Texas Tech','TX','Big 12'],['UCF','FL','Big 12'],['Utah','UT','Big 12'],['West Virginia','WV','Big 12'],
    // SEC
    ['Alabama','AL','SEC'],['Arkansas','AR','SEC'],['Auburn','AL','SEC'],['Florida','FL','SEC'],
    ['Georgia','GA','SEC'],['Kentucky','KY','SEC'],['LSU','LA','SEC'],['Mississippi State','MS','SEC'],
    ['Missouri','MO','SEC'],['Ole Miss','MS','SEC'],['Oklahoma','OK','SEC'],['South Carolina','SC','SEC'],
    ['Tennessee','TN','SEC'],['Texas','TX','SEC'],['Texas A&M','TX','SEC'],['Vanderbilt','TN','SEC'],
    // American
    ['Charlotte','NC','American'],['East Carolina','NC','American'],['Florida Atlantic','FL','American'],
    ['Memphis','TN','American'],['North Texas','TX','American'],['Rice','TX','American'],
    ['South Florida','FL','American'],['Temple','PA','American'],['Tulane','LA','American'],
    ['Tulsa','OK','American'],['UAB','AL','American'],['UTSA','TX','American'],['Wichita State','KS','American'],
    // Mountain West
    ['Air Force','CO','Mountain West'],['Boise State','ID','Mountain West'],['Colorado State','CO','Mountain West'],
    ['Fresno State','CA','Mountain West'],['Nevada','NV','Mountain West'],['New Mexico','NM','Mountain West'],
    ['San Diego State','CA','Mountain West'],['San Jose State','CA','Mountain West'],['UNLV','NV','Mountain West'],
    ['Utah State','UT','Mountain West'],['Wyoming','WY','Mountain West'],
    // Sun Belt
    ['Appalachian State','NC','Sun Belt'],['Arkansas State','AR','Sun Belt'],['Coastal Carolina','SC','Sun Belt'],
    ['Georgia Southern','GA','Sun Belt'],['Georgia State','GA','Sun Belt'],['James Madison','VA','Sun Belt'],
    ['Louisiana','LA','Sun Belt'],['Louisiana Monroe','LA','Sun Belt'],['Marshall','WV','Sun Belt'],
    ['Old Dominion','VA','Sun Belt'],['South Alabama','AL','Sun Belt'],['Southern Miss','MS','Sun Belt'],
    ['Texas State','TX','Sun Belt'],['Troy','AL','Sun Belt'],
    // Conference USA
    ['FIU','FL','Conference USA'],['Jacksonville State','AL','Conference USA'],['Kennesaw State','GA','Conference USA'],
    ['Liberty','VA','Conference USA'],['Louisiana Tech','LA','Conference USA'],['Middle Tennessee','TN','Conference USA'],
    ['New Mexico State','NM','Conference USA'],['Sam Houston','TX','Conference USA'],['UTEP','TX','Conference USA'],
    ['Western Kentucky','KY','Conference USA'],
    // MAC
    ['Akron','OH','MAC'],['Ball State','IN','MAC'],['Bowling Green','OH','MAC'],['Buffalo','NY','MAC'],
    ['Central Michigan','MI','MAC'],['Eastern Michigan','MI','MAC'],['Kent State','OH','MAC'],
    ['Miami (Ohio)','OH','MAC'],['Northern Illinois','IL','MAC'],['Ohio University','OH','MAC'],
    ['Toledo','OH','MAC'],['Western Michigan','MI','MAC'],
    // Big East
    ['Butler','IN','Big East'],['Creighton','NE','Big East'],['DePaul','IL','Big East'],['Georgetown','DC','Big East'],
    ['Marquette','WI','Big East'],['Providence','RI','Big East'],['Seton Hall','NJ','Big East'],
    ['St. John\'s','NY','Big East'],['Villanova','PA','Big East'],['Xavier','OH','Big East'],['UConn','CT','Big East'],
    // Ivy League
    ['Brown','RI','Ivy League'],['Columbia','NY','Ivy League'],['Cornell','NY','Ivy League'],['Dartmouth','NH','Ivy League'],
    ['Harvard','MA','Ivy League'],['Penn','PA','Ivy League'],['Princeton','NJ','Ivy League'],['Yale','CT','Ivy League'],
    // Patriot League
    ['American University','DC','Patriot League'],['Army','NY','Patriot League'],['Boston University','MA','Patriot League'],
    ['Bucknell','PA','Patriot League'],['Colgate','NY','Patriot League'],['Holy Cross','MA','Patriot League'],
    ['Lafayette','PA','Patriot League'],['Lehigh','PA','Patriot League'],['Loyola Maryland','MD','Patriot League'],
    ['Navy','MD','Patriot League'],
    // Atlantic 10
    ['Davidson','NC','Atlantic 10'],['Dayton','OH','Atlantic 10'],['Duquesne','PA','Atlantic 10'],
    ['Fordham','NY','Atlantic 10'],['George Mason','VA','Atlantic 10'],['George Washington','DC','Atlantic 10'],
    ['La Salle','PA','Atlantic 10'],['Loyola Chicago','IL','Atlantic 10'],['Rhode Island','RI','Atlantic 10'],
    ['Richmond','VA','Atlantic 10'],['Saint Joseph\'s','PA','Atlantic 10'],['Saint Louis','MO','Atlantic 10'],
    ['St. Bonaventure','NY','Atlantic 10'],['UMass','MA','Atlantic 10'],['VCU','VA','Atlantic 10'],
    // CAA
    ['Campbell','NC','CAA'],['Charleston','SC','CAA'],['Delaware','DE','CAA'],['Drexel','PA','CAA'],
    ['Elon','NC','CAA'],['Hampton','VA','CAA'],['Hofstra','NY','CAA'],['Monmouth','NJ','CAA'],
    ['North Carolina A&T','NC','CAA'],['Northeastern','MA','CAA'],['Stony Brook','NY','CAA'],
    ['Towson','MD','CAA'],['UNC Wilmington','NC','CAA'],['William & Mary','VA','CAA'],
    // Southern
    ['Chattanooga','TN','Southern'],['The Citadel','SC','Southern'],['East Tennessee State','TN','Southern'],
    ['Furman','SC','Southern'],['Mercer','GA','Southern'],['Samford','AL','Southern'],['VMI','VA','Southern'],
    ['Western Carolina','NC','Southern'],['Wofford','SC','Southern'],
    // West Coast
    ['Gonzaga','WA','West Coast'],['Loyola Marymount','CA','West Coast'],['Pacific','CA','West Coast'],
    ['Pepperdine','CA','West Coast'],['Portland','OR','West Coast'],['San Diego','CA','West Coast'],
    ['San Francisco','CA','West Coast'],['Santa Clara','CA','West Coast'],['Saint Mary\'s','CA','West Coast'],
    // Big Sky
    ['Eastern Washington','WA','Big Sky'],['Idaho','ID','Big Sky'],['Idaho State','ID','Big Sky'],
    ['Montana','MT','Big Sky'],['Montana State','MT','Big Sky'],['Northern Arizona','AZ','Big Sky'],
    ['Northern Colorado','CO','Big Sky'],['Portland State','OR','Big Sky'],['Sacramento State','CA','Big Sky'],
    ['Weber State','UT','Big Sky'],
    // WAC
    ['Abilene Christian','TX','WAC'],['California Baptist','CA','WAC'],['Grand Canyon','AZ','WAC'],
    ['Southern Utah','UT','WAC'],['Tarleton State','TX','WAC'],['UT Rio Grande Valley','TX','WAC'],
    ['Utah Tech','UT','WAC'],['Utah Valley','UT','WAC'],['Seattle University','WA','WAC'],
    // Big South
    ['Charleston Southern','SC','Big South'],['Gardner-Webb','NC','Big South'],['High Point','NC','Big South'],
    ['Longwood','VA','Big South'],['Presbyterian','SC','Big South'],['Radford','VA','Big South'],
    ['UNC Asheville','NC','Big South'],['USC Upstate','SC','Big South'],['Winthrop','SC','Big South'],
    // ASUN
    ['Austin Peay','TN','ASUN'],['Bellarmine','KY','ASUN'],['Central Arkansas','AR','ASUN'],
    ['Eastern Kentucky','KY','ASUN'],['Florida Gulf Coast','FL','ASUN'],['Jacksonville','FL','ASUN'],
    ['Lipscomb','TN','ASUN'],['North Alabama','AL','ASUN'],['North Florida','FL','ASUN'],
    ['Queens University','NC','ASUN'],['Stetson','FL','ASUN'],['West Georgia','GA','ASUN'],
    // Southland
    ['East Texas A&M','TX','Southland'],['Houston Christian','TX','Southland'],['Incarnate Word','TX','Southland'],
    ['Lamar','TX','Southland'],['McNeese','LA','Southland'],['Nicholls','LA','Southland'],
    ['Northwestern State','LA','Southland'],['Southeastern Louisiana','LA','Southland'],
    ['Stephen F. Austin','TX','Southland'],['Texas A&M-Corpus Christi','TX','Southland'],['New Orleans','LA','Southland'],
    // MEAC
    ['Coppin State','MD','MEAC'],['Delaware State','DE','MEAC'],['Howard','DC','MEAC'],
    ['Maryland Eastern Shore','MD','MEAC'],['Morgan State','MD','MEAC'],['Norfolk State','VA','MEAC'],
    ['NC Central','NC','MEAC'],['South Carolina State','SC','MEAC'],
    // SWAC
    ['Alabama A&M','AL','SWAC'],['Alabama State','AL','SWAC'],['Alcorn State','MS','SWAC'],
    ['Arkansas-Pine Bluff','AR','SWAC'],['Bethune-Cookman','FL','SWAC'],['Florida A&M','FL','SWAC'],
    ['Grambling State','LA','SWAC'],['Jackson State','MS','SWAC'],['Mississippi Valley State','MS','SWAC'],
    ['Prairie View A&M','TX','SWAC'],['Southern University','LA','SWAC'],['Texas Southern','TX','SWAC'],
    // Horizon
    ['Cleveland State','OH','Horizon'],['Green Bay','WI','Horizon'],['IU Indianapolis','IN','Horizon'],
    ['Milwaukee','WI','Horizon'],['Northern Kentucky','KY','Horizon'],['Oakland','MI','Horizon'],
    ['Purdue Fort Wayne','IN','Horizon'],['Robert Morris','PA','Horizon'],['Wright State','OH','Horizon'],
    ['Youngstown State','OH','Horizon'],
    // Missouri Valley
    ['Belmont','TN','Missouri Valley'],['Bradley','IL','Missouri Valley'],['Drake','IA','Missouri Valley'],
    ['Evansville','IN','Missouri Valley'],['Illinois State','IL','Missouri Valley'],['Indiana State','IN','Missouri Valley'],
    ['Missouri State','MO','Missouri Valley'],['Murray State','KY','Missouri Valley'],['Northern Iowa','IA','Missouri Valley'],
    ['Southern Illinois','IL','Missouri Valley'],['UIC','IL','Missouri Valley'],['Valparaiso','IN','Missouri Valley'],
    // Summit League
    ['Denver','CO','Summit League'],['Kansas City','MO','Summit League'],['North Dakota','ND','Summit League'],
    ['North Dakota State','ND','Summit League'],['Omaha','NE','Summit League'],['Oral Roberts','OK','Summit League'],
    ['South Dakota','SD','Summit League'],['South Dakota State','SD','Summit League'],['St. Thomas','MN','Summit League'],
    // America East
    ['Albany','NY','America East'],['Binghamton','NY','America East'],['Bryant','RI','America East'],
    ['Maine','ME','America East'],['NJIT','NJ','America East'],['UMBC','MD','America East'],
    ['UMass Lowell','MA','America East'],['New Hampshire','NH','America East'],['Vermont','VT','America East'],
    // MAAC
    ['Canisius','NY','MAAC'],['Fairfield','CT','MAAC'],['Iona','NY','MAAC'],['Manhattan','NY','MAAC'],
    ['Marist','NY','MAAC'],['Mount St. Mary\'s','MD','MAAC'],['Niagara','NY','MAAC'],['Quinnipiac','CT','MAAC'],
    ['Rider','NJ','MAAC'],['Sacred Heart','CT','MAAC'],['Siena','NY','MAAC'],
    // NEC
    ['Central Connecticut','CT','NEC'],['Chicago State','IL','NEC'],['Fairleigh Dickinson','NJ','NEC'],
    ['LIU','NY','NEC'],['Merrimack','MA','NEC'],['Saint Francis','PA','NEC'],['Stonehill','MA','NEC'],['Wagner','NY','NEC'],
    // OVC
    ['Eastern Illinois','IL','OVC'],['Lindenwood','MO','OVC'],['Little Rock','AR','OVC'],['Morehead State','KY','OVC'],
    ['SIU Edwardsville','IL','OVC'],['Southeast Missouri State','MO','OVC'],['Tennessee State','TN','OVC'],
    ['Tennessee Tech','TN','OVC'],['UT Martin','TN','OVC'],
    // Big West
    ['Cal Poly','CA','Big West'],['Cal State Bakersfield','CA','Big West'],['Cal State Fullerton','CA','Big West'],
    ['Cal State Northridge','CA','Big West'],['Hawaii','HI','Big West'],['Long Beach State','CA','Big West'],
    ['UC Davis','CA','Big West'],['UC Irvine','CA','Big West'],['UC Riverside','CA','Big West'],
    ['UC San Diego','CA','Big West'],['UC Santa Barbara','CA','Big West']
  ];
})();
