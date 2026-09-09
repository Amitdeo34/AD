# Easy Hotel Booking for Android

A Capacitor shell around the deployed Easy Hotel Booking site. The web app runs
in the system web view; a small bundled page in `www/` is shown when the device
is offline or the site cannot be reached.

## Building a release bundle

From the repository root:

```bash
EHB_APP_URL=https://your-deployment npm run build:android
```

The bundle lands at `android/app/build/outputs/bundle/release/app-release.aab`.

`EHB_APP_URL` is baked into the bundle at build time, so a new deployment URL
means a new build.

## Regenerating the Android project

`android/` is generated, not hand-maintained. Delete it and run:

```bash
npm run add --workspace mobile
```

That runs `cap add android` and then `scripts/configure-android.mjs`, which
reapplies every project-specific change: brand colours, the adaptive and
monochrome launcher icons, the splash screen, the HTTPS-only network policy
(with localhost and `10.0.2.2` open for development), the `easyhotelbooking://`
deep link, release signing, versioning and bundle splits.

## Signing

`scripts/make-keystore.sh` generates an upload keystore at
`android/keystore/easy-hotel-booking-release.jks` and writes its credentials to
`android/keystore.properties`. Both are git-ignored.

**Keep a backup.** Google Play requires every future update to be signed with
the same upload key.

To use an existing key, set `EHB_KEYSTORE_PATH`, `EHB_KEYSTORE_PASSWORD`,
`EHB_KEY_ALIAS` and `EHB_KEY_PASSWORD` instead.

## Versioning

`EHB_VERSION_CODE` and `EHB_VERSION_NAME` feed straight into the manifest. Play
rejects a bundle whose version code is not higher than the last upload.

## Icons

`assets/icon.svg` is the single source. `npm run mobile:icons` rasterises every
launcher density, the adaptive-icon foreground, the Play Store listing icon and
the PWA icons the browser build uses.

## Running against a laptop during development

The release network policy is HTTPS-only, with cleartext allowed for `10.0.2.2`
(the emulator's route to the host), `localhost` and `127.0.0.1`:

```bash
EHB_APP_URL=http://10.0.2.2:3000 npm run sync --workspace mobile
cd mobile/android && ./gradlew assembleDebug
```
