# Rex Comicsverse — Android App

A Trusted Web Activity (TWA) wrapper for https://rexraja89-oss.github.io/rexcomicsverse/.
This is the same kind of app PWABuilder generates: a small native shell that opens
the website full-screen in Chrome, so site updates show up in the app instantly.

- Package name: `com.rexcomicsverse.app`
- Built automatically by `.github/workflows/android-apk.yml` on every push that touches `android-app/`
- Download the APK from the repo's **Releases** page (`rex-comicsverse.apk`)

## One-time setup: signing key secrets

Android only installs an update when it's signed with the same key as the installed app.
Add these under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | contents of `keystore-base64.txt` |
| `KEYSTORE_PASSWORD` | password from `keystore-info.txt` |

Keep the `.keystore` file and password somewhere safe. If you lose them, you can never
update the app on the Play Store. Never commit them to git.

Until the secrets are added, CI signs with a throwaway key (the build log shows a warning).

## Remove the browser address bar (Digital Asset Links)

To make the app run full-screen with no URL bar, Android has to verify that you own the site.
Publish `assetlinks.json` (in this folder, and attached to every Release) at:

    https://rexraja89-oss.github.io/.well-known/assetlinks.json

That URL is the root of your GitHub Pages domain. It is served by a repo named
**`rexraja89-oss.github.io`**, not by this repo. Create that repo if needed, add the file at
`.well-known/assetlinks.json`, and add an empty `.nojekyll` file so GitHub Pages serves the
dot-folder.

## Build locally (optional)

Requires JDK 17 and the Android SDK:

    cd android-app
    KEYSTORE_FILE=/path/to/rexcomics-release.keystore KEYSTORE_PASSWORD=... ./gradlew assembleRelease
