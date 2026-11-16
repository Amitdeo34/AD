# DareUp for Android

A small, plain-Java WebView app around `../index.html`. The whole game is
bundled inside the app, so the free packs work with no internet. Only buying
premium and downloading premium packs use the network.

| Output | For | Premium buying |
| --- | --- | --- |
| `build/DareUp-<version>.apk` | Direct download, WhatsApp/Drive sharing, Indus Appstore, APK sites | Razorpay (channel `direct`) |
| `build/DareUp-<version>.aab` | Google Play | Hidden (channel `play`): Play requires Google Play Billing for in-app digital purchases |

## Build

Ubuntu or Debian (or WSL on Windows):

```bash
sudo apt-get install -y aapt apksigner zipalign dalvik-exchange openjdk-17-jdk zip unzip curl python3
cd dareup/android
API_BASE_REMOTE=https://your-site.vercel.app VERSION_CODE=1 VERSION_NAME=1.0.0 bash build.sh
```

No Android Studio, SDK manager or Gradle needed. The first run downloads the
Android framework jar (~140 MB) from Maven Central into `.sdk/` and checks its
SHA-1.

| Variable | Default | Meaning |
| --- | --- | --- |
| `API_BASE_REMOTE` | (unset) | Your deployed web app. Written into the bundled `index.html` so premium works in the app. Without it, free packs work and premium shows "unavailable". |
| `APP_ID` | `app.dareup` | Package name on the stores. **Choose once; it can never change after the first upload.** |
| `APP_NAME` | `DareUp` | Launcher label. |
| `VERSION_CODE` | `1` | Must go up by at least 1 for every store upload. |
| `VERSION_NAME` | `1.0.0` | Version shown to users. |
| `APK_CHANNEL` | `direct` | `direct` sells premium with Razorpay; `play` hides buying (for stores that require their own billing). The AAB is always `play`. |
| `KEYSTORE`, `KEY_ALIAS`, `KEYSTORE_PASS` | `keystore/dareup-upload.jks`, `dareup`, from `keystore/keystore.properties` | Signing key. |

## The signing key

The first build creates `keystore/dareup-upload.jks` and
`keystore/keystore.properties` (password inside). Both are git-ignored and
must never be committed.

**Back both files up somewhere safe.** Every update of the app has to be
signed with the same key, or phones will refuse to install it over the old
version. On Google Play, turn on Play App Signing (the default): then this is
only your *upload* key, and Google can reset it if it is ever lost.

## What the wrapper does

- Serves the bundled files from `https://appassets.androidplatform.net/assets/www/`,
  a secure origin, so `localStorage` and Razorpay Checkout work.
- Keeps web links inside the app (game, Razorpay, bank pages) and hands
  `upi:`, `intent:`, `tel:`, `mailto:` and `whatsapp:` links to the phone's apps,
  so UPI apps open during checkout.
- Back button: asks the game first (`window.onAndroidBack()`), exits only from
  the home screen. Works with Android 13–16 predictive back.
- Draws edge to edge and pads for the status bar, navigation bar and keyboard.
- `window.AndroidBridge`: `share(text)`, `vibrate(ms)`, `openUrl(url)`,
  `setTheme(hex, isDark)`, `storeChannel()`, `platform()`, `appVersion()`.
- Targets Android 16 (API 36), runs on Android 7.0 (API 24) and later.
  Permissions: internet and vibrate only.

## Icons

Edit `icon/background.svg`, `icon/foreground.svg` and `icon/monochrome.svg`
(108×108 adaptive-icon canvas; keep the art inside the central 66 units), then:

```bash
node make-icons.mjs   # needs Playwright + Chromium
```

This writes every `res/mipmap-*` size and `store/play-icon-512.png`.

## Selling premium on Google Play

Google Play's payments policy requires Google Play Billing for in-app digital
purchases such as premium packs, so the `.aab` hides the buying screens. To
sell premium on Play, add the Google Play Billing Library (needs Google's Maven
repository and a Gradle build) and verify purchases on the server with the
Google Play Developer API; the web game already keeps the purchase logic in
one function for that swap.
