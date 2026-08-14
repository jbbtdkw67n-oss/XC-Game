(function () {
  const D = window.XCD.data;

  D.FIRST_NAMES_M = [
    'James','Michael','Ethan','Daniel','Noah','Liam','Mason','Logan','Lucas','Jack',
    'Owen','Caleb','Wyatt','Carter','Henry','Sebastian','Jackson','Aiden','Elijah','Gabriel',
    'Samuel','David','Joseph','Matthew','Ryan','Nathan','Isaac','Dylan','Cameron','Connor',
    'Cooper','Hunter','Colton','Tyler','Jordan','Austin','Brayden','Evan','Landon','Julian',
    'Miles','Adrian','Xavier','Marcus','Andre','Malik','Jalen','DeShawn','Terrence','Isaiah',
    'Diego','Mateo','Santiago','Rafael','Emilio','Kai','Jaxon','Bennett','Silas','Theo',
    'Grant','Cole','Brody','Trevor','Garrett','Spencer','Blake','Chase','Parker','Reid'
  ];

  D.FIRST_NAMES_W = [
    'Emma','Olivia','Ava','Sophia','Isabella','Mia','Amelia','Harper','Evelyn','Abigail',
    'Emily','Ella','Scarlett','Grace','Chloe','Victoria','Riley','Aria','Lily','Zoey',
    'Hannah','Addison','Layla','Natalie','Savannah','Brooklyn','Leah','Audrey','Claire','Skylar',
    'Bella','Nora','Genesis','Hazel','Aubrey','Autumn','Kaylee','Paige','Madison','Peyton',
    'Alexis','Jasmine','Destiny','Alondra','Camila','Valentina','Ximena','Renata','Elena','Sofia',
    'Maya','Jada','Amara','Nia','Zora','Kendall','Reagan','Sydney','Morgan','Taylor',
    'Ruby','Willow','Ivy','Sage','Piper','Quinn','Delaney','Mackenzie','Bailey','Faith'
  ];

  D.LAST_NAMES = [
    'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
    'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
    'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
    'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
    'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts',
    'Gomez','Phillips','Evans','Turner','Diaz','Parker','Cruz','Edwards','Collins','Reyes',
    'Stewart','Morris','Morales','Murphy','Cook','Rogers','Gutierrez','Ortiz','Peterson','Bailey',
    'Reed','Kelly','Howard','Ramos','Cox','Ward','Richardson','Watson','Brooks','Chavez',
    'Sullivan','Russell','Bell','Coleman','Butler','Foster','Powell','Barnes','Simmons','Patterson',
    'Fisher','Grant','Larson','Fox','Newman','Owens','Marsh','Whitfield','Doyle','Sorensen',
    'Okafor','Kimani','Mensah','Adebayo','Kariuki','Osei','Boateng','Wanjiru','Kiprop','Cheruiyot'
  ];

  // Hometowns are REAL places (Realism Update). Athlete and recruit origins
  // are drawn from D.REAL_TOWNS (js/data/geography.js) — authentic towns for
  // every state — so no procedurally-assembled fictional town appears anywhere
  // in the game. The old TOWN_ROOTS/TOWN_SUFFIXES generators were removed.

  /* ---------------- Origin-realistic name pools (Update 12) ----------
   * International athletes carry names true to where they're from —
   * a Kenyan recruit reads "Vincent Kipruto", not "Tyler Smith". Each
   * pool also lists real hometown cities so scouting reports feel real.
   * Pools are keyed by the countries in D.INTERNATIONAL_COUNTRIES.
   */
  D.NAME_POOLS = {
    Kenya: {
      M: ['Vincent', 'Ronald', 'Kibiwott', 'Emmanuel', 'Geoffrey', 'Wesley', 'Titus', 'Kipchumba', 'Elkanah', 'Amos', 'Josphat', 'Cornelius', 'Bernard', 'Gilbert', 'Hillary', 'Wilfred', 'Ezekiel', 'Kiplimo', 'Nicholas', 'Festus'],
      W: ['Faith', 'Beatrice', 'Hellen', 'Mercy', 'Agnes', 'Gladys', 'Purity', 'Nancy', 'Sharon', 'Winfridah', 'Caroline', 'Joyline', 'Edna', 'Vivian', 'Naomi', 'Lilian', 'Diana', 'Sheila', 'Janeth', 'Brillian'],
      last: ['Kipruto', 'Kibet', 'Cheruiyot', 'Kiplagat', 'Chebet', 'Korir', 'Kandie', 'Kwemoi', 'Rotich', 'Chelimo', 'Kipkoech', 'Kosgei', 'Jepchirchir', 'Kimeli', 'Lagat', 'Sang', 'Tanui', 'Cherono', 'Kigen', 'Barsoton'],
      cities: ['Eldoret', 'Iten', 'Kapsabet', 'Nairobi', 'Kericho', 'Nyahururu', 'Kaptagat', 'Nandi Hills']
    },
    Ethiopia: {
      M: ['Abebe', 'Kenenisa', 'Tadesse', 'Getnet', 'Selemon', 'Yomif', 'Hagos', 'Berihu', 'Milkesa', 'Dawit', 'Tesfaye', 'Girma', 'Biniam', 'Muktar', 'Lamecha', 'Addisu', 'Samuel', 'Telahun'],
      W: ['Gudaf', 'Letesenbet', 'Tsigie', 'Hirut', 'Almaz', 'Dawit', 'Ejgayehu', 'Werkuha', 'Meseret', 'Tirunesh', 'Senbere', 'Hiwot', 'Fotyen', 'Birke', 'Aberash', 'Lemlem'],
      last: ['Bekele', 'Gebrhiwet', 'Tsegay', 'Gidey', 'Barega', 'Aregawi', 'Kejelcha', 'Girma', 'Haylu', 'Worku', 'Mengesha', 'Alemu', 'Tola', 'Ayana', 'Dibaba', 'Hailu', 'Kebede', 'Assefa'],
      cities: ['Addis Ababa', 'Bekoji', 'Arsi', 'Gondar', 'Mekelle', 'Asella', 'Bahir Dar']
    },
    Uganda: {
      M: ['Joshua', 'Jacob', 'Oscar', 'Stephen', 'Peter', 'Victor', 'Levi', 'Albert', 'Isaac', 'Denis', 'Martin', 'Boniface'],
      W: ['Peruth', 'Prisca', 'Esther', 'Docus', 'Rispa', 'Stella', 'Mercyline', 'Sarah', 'Rebecca', 'Annet'],
      last: ['Cheptegei', 'Kiplimo', 'Chemutai', 'Kissa', 'Musagala', 'Ayeko', 'Chelangat', 'Chesang', 'Kwemoi', 'Toroitich', 'Nakaayi', 'Chebet'],
      cities: ['Kapchorwa', 'Kampala', 'Bukwo', 'Mbale', 'Kween']
    },
    'Great Britain': {
      M: ['Callum', 'Rhys', 'Alistair', 'Freddie', 'Harry', 'Oliver', 'Archie', 'George', 'Jake', 'Charlie', 'Tom', 'Lewis', 'Angus', 'Rory', 'Euan', 'Fergus'],
      W: ['Poppy', 'Imogen', 'Freya', 'Millie', 'Charlotte', 'Isla', 'Amelie', 'Daisy', 'Georgia', 'Holly', 'Katie', 'Megan', 'Niamh', 'Rosie', 'Bethan'],
      last: ['Hawkins', 'Butchart', 'Wightman', 'Gourley', 'Pattison', 'Farrell', 'Whittaker', 'Milburn', 'Ashworth', 'Prescott', 'Clarke', 'Hughes', 'Davies', 'MacLeod', 'Thompson', 'Barnett'],
      cities: ['London', 'Leeds', 'Edinburgh', 'Cardiff', 'Manchester', 'Sheffield', 'Bristol', 'Glasgow']
    },
    Ireland: {
      M: ['Cian', 'Darragh', 'Eoin', 'Fionn', 'Oisin', 'Padraig', 'Cormac', 'Niall', 'Tadhg', 'Ronan', 'Colm', 'Brendan'],
      W: ['Aoife', 'Ciara', 'Niamh', 'Saoirse', 'Roisin', 'Sinead', 'Aisling', 'Orla', 'Grainne', 'Maeve', 'Eimear', 'Clodagh'],
      last: ["O'Brien", "O'Connor", 'Murphy', 'Kelly', 'Walsh', 'Byrne', 'Ryan', "O'Sullivan", 'McCarthy', 'Gallagher', 'Doyle', 'Kennedy', 'Lynch', 'Brennan'],
      cities: ['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford', 'Sligo']
    },
    Australia: {
      M: ['Lachlan', 'Jack', 'Riley', 'Cooper', 'Flynn', 'Hamish', 'Angus', 'Baxter', 'Darcy', 'Jed', 'Toby', 'Callan'],
      W: ['Matilda', 'Sienna', 'Ruby', 'Georgia', 'Tahlia', 'Bronte', 'Keely', 'Jessica', 'Abbey', 'Ellie', 'Delta', 'Maddison'],
      last: ['McSweyn', 'Ramsden', 'Stenson', 'Battocchio', 'Clarke', 'Robinson', 'Hoare', 'Gregson', 'Buckman', 'Tiernan', 'McDonald', 'Fisher', 'Bol', 'Hull'],
      cities: ['Melbourne', 'Sydney', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Ballarat']
    },
    Canada: {
      M: ['Liam', 'Ethan', 'Nathan', 'Lucas', 'Marc', 'Olivier', 'Charles', 'Graham', 'Callum', 'Brayden', 'Tristan', 'Malcolm'],
      W: ['Ava', 'Chloe', 'Madeleine', 'Camille', 'Brooke', 'Paige', 'Hannah', 'Sadie', 'Julia', 'Erin', 'Genevieve', 'Marie'],
      last: ['Tremblay', 'Gagnon', 'Levins', 'Philibert-Thiboutot', 'Hofbauer', 'McDonald', 'Fraser', 'Wilson', 'Roy', 'Gauthier', 'Sinclair', 'Knight', 'Arcand', 'Bouchard'],
      cities: ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Victoria', 'Halifax', 'Guelph']
    },
    Germany: {
      M: ['Lukas', 'Jonas', 'Finn', 'Maximilian', 'Felix', 'Moritz', 'Niklas', 'Tobias', 'Jan', 'Florian', 'Elias', 'Henrik'],
      W: ['Lena', 'Hanna', 'Greta', 'Marie', 'Johanna', 'Katharina', 'Lea', 'Franziska', 'Amelie', 'Antonia', 'Clara', 'Milena'],
      last: ['Müller', 'Schmidt', 'Fischer', 'Weber', 'Wagner', 'Becker', 'Hoffmann', 'Schäfer', 'Koch', 'Richter', 'Klein', 'Braun', 'Zimmermann', 'Krüger'],
      cities: ['Berlin', 'Munich', 'Hamburg', 'Cologne', 'Frankfurt', 'Stuttgart', 'Leipzig', 'Dresden']
    },
    Japan: {
      M: ['Haruto', 'Yuto', 'Sota', 'Ren', 'Kaito', 'Daiki', 'Kenta', 'Ryo', 'Takumi', 'Shota', 'Hayato', 'Kazuki'],
      W: ['Yui', 'Sakura', 'Hina', 'Aoi', 'Rin', 'Mio', 'Nanami', 'Kanon', 'Honoka', 'Ayaka', 'Riko', 'Mei'],
      last: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Endo'],
      cities: ['Tokyo', 'Kyoto', 'Osaka', 'Sendai', 'Fukuoka', 'Nagano', 'Sapporo', 'Hiroshima']
    },
    Norway: {
      M: ['Jakob', 'Henrik', 'Filip', 'Sondre', 'Magnus', 'Even', 'Sander', 'Eirik', 'Vebjørn', 'Tobias', 'Håkon', 'Aksel'],
      W: ['Ingrid', 'Karoline', 'Amalie', 'Nora', 'Silje', 'Hedda', 'Maren', 'Thea', 'Sigrid', 'Vilde', 'Anna', 'Live'],
      last: ['Ingebrigtsen', 'Nordås', 'Hansen', 'Johansen', 'Olsen', 'Larsen', 'Andersen', 'Berg', 'Haugen', 'Dahl', 'Moen', 'Strand', 'Solberg', 'Bakken'],
      cities: ['Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Sandnes', 'Lillehammer']
    },
    'New Zealand': {
      M: ['George', 'Sam', 'Hamish', 'Jonty', 'Callum', 'Finn', 'Angus', 'Theo', 'Jack', 'Nico', 'Reuben', 'Tama'],
      W: ['Olivia', 'Ruby', 'Maia', 'Sophie', 'Grace', 'Amber', 'Phoebe', 'Lucy', 'Kiri', 'Isabella', 'Holly', 'Anika'],
      last: ['Walker', 'Robertson', 'Beamish', 'Willis', 'Baxter', 'Gill', 'Hamilton', 'Wilson', 'Carter', 'Ngata', 'Parata', 'MacKenzie'],
      cities: ['Auckland', 'Wellington', 'Christchurch', 'Dunedin', 'Hamilton', 'Tauranga']
    },
    Spain: {
      M: ['Adrián', 'Álvaro', 'Carlos', 'Diego', 'Javier', 'Marcos', 'Pablo', 'Sergio', 'Iker', 'Mario', 'Hugo', 'Andrés'],
      W: ['Lucía', 'María', 'Paula', 'Carla', 'Marta', 'Alba', 'Claudia', 'Elena', 'Irene', 'Nerea', 'Laura', 'Blanca'],
      last: ['García', 'Fernández', 'Mechaal', 'Katir', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Gómez', 'Ortega', 'Serrano', 'Ibáñez', 'Vega', 'Navarro'],
      cities: ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Bilbao', 'Granada', 'Zaragoza']
    },
    Mexico: {
      M: ['Santiago', 'Mateo', 'Emiliano', 'Leonardo', 'Diego', 'Alejandro', 'Fernando', 'Ricardo', 'Uriel', 'Joel', 'César', 'Isaac'],
      W: ['Ximena', 'Valeria', 'Regina', 'Camila', 'Daniela', 'Fernanda', 'Guadalupe', 'Renata', 'Alondra', 'Itzel', 'Paola', 'Monserrat'],
      last: ['Hernández', 'García', 'Martínez', 'López', 'González', 'Rodríguez', 'Pérez', 'Sánchez', 'Ramírez', 'Cruz', 'Barrios', 'Quiroz', 'Cervantes', 'Ibarra'],
      cities: ['Mexico City', 'Guadalajara', 'Monterrey', 'Toluca', 'Puebla', 'Querétaro', 'Chihuahua']
    }
  };

  // The pool for a given country — USA (or an unknown country) falls back
  // to the domestic pools above.
  D.namesFor = function (country) {
    return (country && D.NAME_POOLS[country]) || { M: D.FIRST_NAMES_M, W: D.FIRST_NAMES_W, last: D.LAST_NAMES, cities: null };
  };

  /* Surname-origin classifier: used by the avatar system so appearance
   * aligns with a person's heritage (a Kimani or an Adebayo reads as
   * African, an Hernández as Hispanic) even for US-born athletes. */
  const HISPANIC_SURNAMES = new Set([
    'Garcia', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Perez', 'Sanchez',
    'Ramirez', 'Torres', 'Flores', 'Rivera', 'Gomez', 'Diaz', 'Cruz', 'Reyes', 'Morales',
    'Gutierrez', 'Ortiz', 'Chavez', 'Ramos', 'Vega', 'Navarro', 'Serrano', 'Ibáñez', 'Ibarra',
    'García', 'Fernández', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Gómez', 'Hernández',
    'González', 'Pérez', 'Ramírez', 'Ortega', 'Barrios', 'Quiroz', 'Cervantes', 'Alondra'
  ]);
  const AFRICAN_SURNAMES = new Set([
    'Okafor', 'Kimani', 'Mensah', 'Adebayo', 'Kariuki', 'Osei', 'Boateng', 'Wanjiru', 'Kiprop', 'Cheruiyot'
  ]);
  ['Kenya', 'Ethiopia', 'Uganda'].forEach((c) => D.NAME_POOLS[c].last.forEach((n) => AFRICAN_SURNAMES.add(n)));
  const EASTASIAN_SURNAMES = new Set(['Nguyen', ...D.NAME_POOLS.Japan.last]);

  /*
   * Heritage group for appearance generation. Country wins when known;
   * otherwise the surname decides; 'mixed' means a broad US distribution.
   * Returns one of: 'eastafrican' | 'african' | 'hispanic' | 'eastasian'
   * | 'nordic' | 'anglo' | 'mixed'.
   */
  D.heritageOf = function (lastName, country) {
    if (country && country !== 'USA') {
      if (country === 'Kenya' || country === 'Ethiopia' || country === 'Uganda') return 'eastafrican';
      if (country === 'Japan') return 'eastasian';
      if (country === 'Mexico' || country === 'Spain') return 'hispanic';
      if (country === 'Norway' || country === 'Germany') return 'nordic';
      return 'anglo'; // GB / Ireland / Australia / Canada / NZ
    }
    if (AFRICAN_SURNAMES.has(lastName)) return 'african';
    if (HISPANIC_SURNAMES.has(lastName)) return 'hispanic';
    if (EASTASIAN_SURNAMES.has(lastName)) return 'eastasian';
    return 'mixed';
  };

  D.STATE_NAMES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'D.C.', FL: 'Florida',
    GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
    IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
    MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
    NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
    OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
    SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
    VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
    WY: 'Wyoming'
  };
})();
