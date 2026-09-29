# Rex Comicsverse — Android App

A Trusted Web Activity (TWA) wrapper for https://rexcomicsverseofficial.github.io/.
This is the same kind of app PWABuilder generates: a small native shell that opens
the website full-screen in Chrome, so site updates show up in the app instantly.

- Package name: `com.rexcomicsverse.app`
- Built automatically by `.github/workflows/android-apk.yml` on every push that touches `android-app/`
- Versions are `1.0.<build number>`; every build on `main` becomes release `v1.0.<n>`
- Newest APK, always: https://github.com/rexcomicsverseofficial/rexcomicsverseofficial.github.io/releases/latest/download/RexComicsverse.apk
- Installed apps check for new versions by themselves and show an **UPDATE TO vX** bar (`app-update.js`)

## One-time setup: signing key secrets

Android only installs an update when it's signed with the same key as the installed app.
Add these under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | contents of `keystore-base64.txt` |
| `KEYSTORE_PASSWORD` | password from `keystore-info.txt` |

Keep the `.keystore` file and password somewhere safe. If you lose them, you can never
update the app on the Play Store. Never commit them to git.

Until the secrets are added, CI signs with a throwaway key (the build log shows a warning) and does not publish a release.
CI checks every build against the fingerprint in `.github/signing-cert-sha256.txt`.

## Full screen, no address bar (Digital Asset Links)

Android checks https://rexcomicsverseofficial.github.io/.well-known/assetlinks.json to confirm the app and the site
belong together. That file lives in this repo (`.well-known/assetlinks.json`, served thanks to
`.nojekyll`) and holds the permanent signing key's SHA-256. If the key ever changes, update it
together with `.github/signing-cert-sha256.txt`.

## Build locally (optional)

Requires JDK 17 and the Android SDK:

    cd android-app
    KEYSTORE_FILE=/path/to/rexcomics-release.keystore KEYSTORE_PASSWORD=... ./gradlew assembleRelease
