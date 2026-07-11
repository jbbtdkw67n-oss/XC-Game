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

  // Procedural hometown generation: combine a root with a suffix to create
  // plausible American town names, then pair with a real US state.
  D.TOWN_ROOTS = [
    'Spring','Oak','River','Maple','Pine','Cedar','Elm','Lake','Hill','Ash',
    'Birch','Meadow','Stone','Green','Fair','Clear','Silver','Golden','North','South',
    'East','West','Union','Franklin','Frank','Madison','Jefferson','Lincoln','Bristol','Chester',
    'Auburn','Sunset','Sunny','Ridge','Valley','Willow','Cherry','Walnut','Crystal','Windsor'
  ];
  D.TOWN_SUFFIXES = [
    'field','wood','ton','ville','burg','dale','port','view','haven','brook',
    'land','side','town','ford','grove','falls','crest','park','shire','mont'
  ];

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
