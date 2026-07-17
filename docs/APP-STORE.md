# Getting XC Dynasty on the iPhone & into the App Store

The game is a pure static web app (vanilla HTML/CSS/JS, no backend, saves in
the browser's IndexedDB). That is the *ideal* starting point for iOS: the
whole game can be wrapped in a native shell with **Capacitor** and shipped to
the App Store in its exact, feature-complete form — no rewrite, no feature
cuts.

Update 13 already laid the groundwork in this repo:

| Piece | File(s) | What it does |
|---|---|---|
| Web app manifest | `manifest.webmanifest` | Name, icons, standalone display, theme color |
| App icons | `assets/icon.svg` → `assets/icon-180/192/512.png` | Home-screen + App Store artwork source |
| iOS meta tags | `index.html` | Full-screen standalone mode, notch-aware viewport, status-bar styling |
| Safe areas & touch | `css/main.css` | Notch/home-indicator insets, `100dvh` viewport, no tap flashes, fast taps |
| Offline play | `sw.js` | Service worker that precaches the entire game |
| Native shell config | `capacitor.config.json`, `package.json` | Capacitor iOS project definition |
| Web bundle build | `scripts/build-www.js` (`npm run build:www`) | Copies the shippable files into `www/` for Capacitor |

Two ways to play on iPhone, in increasing order of effort:

## Option A — today, no App Store: install as a web app

Serve the folder over HTTPS (GitHub Pages works out of the box: repo
Settings → Pages → deploy from the main branch), open the URL in Safari on
the iPhone, tap **Share → Add to Home Screen**. Thanks to the manifest,
icons, and service worker, it launches full-screen, keeps its saves, and
works offline. This is the fastest way to playtest on the actual phone —
do this first even if the App Store is the goal.

## Option B — the App Store: wrap with Capacitor

### What you need (one-time)

1. **A Mac.** Building iOS apps requires Xcode, which only runs on macOS.
2. **Xcode** — free from the Mac App Store.
3. **Node.js** — <https://nodejs.org> (LTS is fine).
4. **An Apple Developer Program membership** — <https://developer.apple.com/programs/>,
   **$99/year**. Required to distribute on the App Store (a free account can
   only install to your own devices for 7 days at a time).

### Build the iOS project (on the Mac, in this repo)

```bash
npm install          # pulls @capacitor/core, @capacitor/ios, @capacitor/cli
npm run ios:add      # builds www/ and generates the native ios/ project
npm run ios:open     # opens the project in Xcode
```

After any game code change, refresh the shell with:

```bash
npm run ios:sync
```

The app id is `com.xcdynasty.app` in `capacitor.config.json` — change it to
your own reverse-domain id (e.g. `com.yourname.xcdynasty`) **before** the
first `ios:add`, because the App Store id is permanent.

### In Xcode

1. Select the project → **Signing & Capabilities** → pick your Team (your
   developer account). Xcode handles certificates automatically.
2. Plug in your iPhone and hit **Run** — the full game is now on your phone.
3. Set the version/build number, and add the App Store icon set (Xcode's
   asset catalog; generate all sizes from `assets/icon.svg` — tools like
   <https://icon.kitchen> do this in one step).

### Submitting to the App Store

1. Create the app record at <https://appstoreconnect.apple.com> (name,
   category: Games → Sports/Simulation, age rating, privacy: "no data
   collected" — the game has no backend, saves stay on device).
2. Prepare 6.7" and 6.1" iPhone screenshots (run in the Simulator and use
   `Cmd+S`).
3. In Xcode: **Product → Archive → Distribute App → App Store Connect**.
4. Submit for review. First reviews typically take a few days.

**Review risk to know about:** Apple's guideline 4.2 dislikes "just a
website in a wrapper". A fully offline game with local saves is normally
fine, but the more native it feels, the smoother review goes. Worthwhile
cheap wins (all optional, none required to build): haptic feedback on race
finishes (`@capacitor/haptics`), a native splash screen
(`@capacitor/splash-screen`), and App Store leaderboards later via Game
Center.

### Things to watch on a phone (polish backlog, not blockers)

- The layout is desktop-first (fixed sidebar, dense tables). It *runs* on an
  iPhone today, but a responsive pass — collapsing the sidebar into a bottom
  tab bar under ~700px width, larger touch targets on table rows — is the
  single biggest playability win. The CSS groundwork (safe areas, dvh,
  touch-action) is in.
- Long sim runs (Sim to Race, offseason) block the main thread; on older
  phones iOS may show a brief hang. Fine for now; a Web Worker is the
  eventual fix.
- Saves live in IndexedDB inside the app's own web view — they persist
  across app updates, and deleting the app deletes the saves. The existing
  JSON export/import in Saves is the player's backup path.
