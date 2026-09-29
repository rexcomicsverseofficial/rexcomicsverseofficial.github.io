# Claude Code Instructions — Rex Comicsverse

This file tells Claude Code exactly what to do when you open this project.

## Project
Rex Comicsverse — Indian superhero comic platform
Main site: index.html | Guide: setup-guide.html

## When I say "deploy" — do this:
1. Check if git is initialized, if not: git init
2. Add all files: git add .
3. Commit: git commit -m "Update Rex Comicsverse"
4. Push to GitHub: git push origin main
5. Tell me the live URL

## When I say "run locally" — do this:
1. Check if Python is available
2. Run: python3 -m http.server 8080
3. Tell me to open: http://localhost:8080

## When I say "setup Firebase" — do this:
1. Ask me for my Firebase config keys
2. Find the placeholder text in index.html
3. Replace all 6 placeholder values with my real values
4. Save the file

## When I say "add my comic" — do this:
1. Ask me for the episode number, title, and image files
2. Find the EPISODES array in index.html
3. Add the new episode with my details
4. Save and deploy

## When I say "change logo" — do this:
1. Ask me for the logo image file path
2. Convert it to base64 or get the URL
3. Update the logo in the HTML
4. Save and deploy

## Important files:
- index.html = the entire website (all pages in one file)
- manifest.json = PWA/Android app config
- sw.js = offline support
- setup.sh = auto deployment script

## Android app and updates (same process as XARVIS)
Rex isn't an Android developer: explain in plain language, do the work yourself, and say exactly what to test on the phone after installing.

- The app is `android-app/`: a Trusted Web Activity (package `com.rexcomicsverse.app`) that opens the live site full-screen. Site changes (characters, art, episodes) reach app users without a new APK; build a new APK only when `android-app/` changes.
- `.github/workflows/android-apk.yml` runs on pushes touching `android-app/`, `tests/`, `app-update.js` or the workflow. It runs the unit tests (`node --test tests/*.test.js`), builds the APK and checks its signature. A green run is the build check (no Android SDK in the sandbox).
- Versions: versionCode = GitHub run number, versionName = `1.0.<run>`. Builds on `main` are published as release `v1.0.<run>` (marked latest) with `RexComicsverse-v1.0.<run>.apk`, `RexComicsverse.apk` and `assetlinks.json`. **Always-newest link: https://github.com/rexcomicsverseofficial/rexcomicsverseofficial.github.io/releases/latest/download/RexComicsverse.apk** (the site's "Get Android App" buttons use it).
- In-app updates (`app-update.js`, like XARVIS's `update/Updates.kt`): the app opens the site with `?app=<versionName>`; the page then checks GitHub's latest release on open, when it comes back to the screen and every 30 min, and shows an **UPDATE TO vX** bar that downloads the new APK in Chrome (download, Open, Update). The footer shows `App v1.0.<run>`. When a fix "doesn't work", first check that version.
- Signing: every build uses one permanent key from the **KEYSTORE_BASE64** (base64 keystore, alias `rexcomics`) and **KEYSTORE_PASSWORD** repo secrets. CI fails if it doesn't match `.github/signing-cert-sha256.txt`. Without the secrets CI signs with a throwaway key and refuses to publish on main, because such an APK can't update installed apps ("App not installed"). Never commit the keystore; Rex adds the secrets himself.
- Site address: **https://rexcomicsverseofficial.github.io** (free GitHub organization `rexcomicsverseofficial`, repo `rexcomicsverseofficial/rexcomicsverseofficial.github.io`). The old https://rexraja89-oss.github.io/rexcomicsverse moved here.
- Full-screen without the URL bar: `.well-known/assetlinks.json` in this repo (served because of `.nojekyll`) holds the permanent key's SHA-256; keep it equal to `.github/signing-cert-sha256.txt`.
- Service worker (`sw.js`): images cache-first (offline), everything else network-first so updates show immediately. Bump `CACHE` when changing precached files.
