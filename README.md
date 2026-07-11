# Cross Country Dynasty

A browser-based college cross country coaching dynasty game. Manage a Division I program over decades: recruit, train, race, and build the greatest dynasty in NCAA history.

Built entirely in vanilla HTML/CSS/JavaScript — no build step, no backend.

## How to Play

Open `index.html` in any modern browser. That's it.

(If your browser restricts `file://` pages, serve the folder with any static server, e.g. `python3 -m http.server` and open http://localhost:8000.)

## Current Status — Phase 1 (Foundation)

- **World generation**: 354 D1 schools across 31 real conferences, each with prestige, academics, campus appeal, facilities (8 types), budgets, weather/altitude profiles, program history, and in-state rivalries. Seeded RNG makes worlds reproducible.
- **Coaches**: every school has an AI head coach with 8 ratings and a personality; coaches age and retire, and schools hire replacements.
- **Athletes**: ~9,000 generated runners with 21 physical ratings, 9 mental/makeup ratings, hometowns, majors, preferences, potential, fatigue/morale/fitness state, and eligibility tracking.
- **Game loop**: weekly advancement with season phases (summer training → regular season → conference/regional/national championships → offseason), yearly rollover with graduation and incoming classes.
- **UI**: dark-mode dashboard, sortable/searchable roster, full player cards, program page (coach, facilities, budget, history), world browser with conference filters and school pop-ups, news feed.
- **Saves**: IndexedDB multi-slot saves, weekly autosave, JSON export/import.

## Project Structure

```
index.html            entry point, script load order
css/main.css          full dark theme + components
js/core/              namespace, seeded RNG, utilities
js/data/              constants, name pools, 354-school dataset
js/models/            Athlete / Coach / School classes
js/engine/            worldgen, game state + weekly loop, save manager
js/ui/                UI framework (routing, tables, modals, toasts)
js/ui/screens/        menu, dashboard, roster, program, world, news, saves
```

## Roadmap

- **Phase 2**: full recruiting engine (thousands of recruits, actions, interest, signing day) + AI school recruiting
- **Phase 3**: weekly training plans, development engine, fatigue & injury systems
- **Phase 4**: live race simulation, NCAA team scoring, rankings, championships
- **Phase 5**: transfer portal, news engine, awards, historical records
- **Phase 6**: polish, animations, balancing
