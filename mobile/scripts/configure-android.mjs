#!/usr/bin/env node
// Applies the project's Android configuration to the folder Capacitor generates.
//
// `npx cap add android` produces a stock project; everything that makes it ours
// — branding, the splash screen, the network policy, signing and versioning —
// is applied here so android/ can be deleted and rebuilt at any time.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const android = path.join(root, 'android');
const res = path.join(android, 'app', 'src', 'main', 'res');

if (!fs.existsSync(android)) {
  console.error('android/ does not exist — run `npx cap add android` first.');
  process.exit(1);
}

const write = (relative, contents) => {
  const file = path.join(android, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
};

const patch = (relative, replacements) => {
  const file = path.join(android, relative);
  let text = fs.readFileSync(file, 'utf8');
  for (const [from, to] of replacements) {
    if (!text.includes(from)) {
      if (text.includes(to)) continue; // already applied
      throw new Error(`Could not find the expected block in ${relative}:\n${from.slice(0, 80)}…`);
    }
    text = text.replace(from, to);
  }
  fs.writeFileSync(file, text);
};

// ---------------------------------------------------------------- branding
write('app/src/main/res/values/colors.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#0F5132</color>
    <color name="colorPrimaryDark">#0A3A24</color>
    <color name="colorAccent">#E0A458</color>
    <color name="ic_launcher_background">#0F5132</color>
    <color name="splashBackground">#0F5132</color>
</resources>
`);

// The stock adaptive icon points at placeholder drawables; ours uses the
// generated foreground over the brand colour, and supplies a monochrome layer
// for themed icons on Android 13 and later.
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  write(`app/src/main/res/mipmap-anydpi-v26/${name}`, `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`);
}
// Capacitor ships its own launcher-background colour and foreground drawable;
// both are replaced above, so the originals would be duplicate resources.
for (const stale of [
  'app/src/main/res/values/ic_launcher_background.xml',
  'app/src/main/res/drawable/ic_launcher_background.xml',
  'app/src/main/res/drawable-v24/ic_launcher_foreground.xml',
]) {
  fs.rmSync(path.join(android, stale), { force: true });
}

write('app/src/main/res/drawable/splash_layers.xml', `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splashBackground" />
    <item android:gravity="center">
        <bitmap android:src="@mipmap/ic_launcher_foreground" android:gravity="center" />
    </item>
</layer-list>
`);

write('app/src/main/res/values/styles.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>

    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
        <item name="android:statusBarColor">@color/colorPrimary</item>
    </style>

    <!-- Shown while the web view boots. -->
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash_layers</item>
        <item name="windowSplashScreenBackground">@color/splashBackground</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>
`);

// ------------------------------------------------------------ network policy
write('app/src/main/res/xml/network_security_config.xml', `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Production traffic is HTTPS only. -->
    <base-config cleartextTrafficPermitted="false" />
    <!-- The emulator loopback and localhost stay open in cleartext so a debug
         build can talk to a site running on the developer's machine. -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
    </domain-config>
</network-security-config>
`);

patch('app/src/main/AndroidManifest.xml', [
  [
    `    <application
        android:allowBackup="true"`,
    `    <application
        android:allowBackup="false"
        android:fullBackupContent="false"
        android:networkSecurityConfig="@xml/network_security_config"
        android:usesCleartextTraffic="false"
        android:hardwareAccelerated="true"`,
  ],
  [
    `            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
`,
    `            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- easyhotelbooking://bookings/EHB-XXXXXX opens a booking from an email or SMS. -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="easyhotelbooking" android:host="bookings" />
            </intent-filter>
`,
  ],
]);

// ------------------------------------------------- signing, versioning, bundle
patch('app/build.gradle', [
  [
    `apply plugin: 'com.android.application'

android {`,
    `apply plugin: 'com.android.application'

// Release signing comes from android/keystore.properties, or the matching
// EHB_* environment variables. Neither the keystore nor its passwords belong in
// version control.
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

def signingValue = { String propertyKey, String envKey ->
    return keystoreProperties.getProperty(propertyKey) ?: System.getenv(envKey)
}

def storeFilePath = signingValue("storeFile", "EHB_KEYSTORE_PATH")
// Relative paths resolve against mobile/android/; absolute paths are used as given.
def hasReleaseKeystore = storeFilePath != null && !storeFilePath.isEmpty() && rootProject.file(storeFilePath).exists()

android {`,
  ],
  [
    `        versionCode 1
        versionName "1.0"`,
    `        versionCode System.getenv("EHB_VERSION_CODE") ? System.getenv("EHB_VERSION_CODE").toInteger() : 1
        versionName System.getenv("EHB_VERSION_NAME") ?: "1.0.0"`,
  ],
  [
    `    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}`,
    `    signingConfigs {
        if (hasReleaseKeystore) {
            release {
                storeFile rootProject.file(storeFilePath)
                storePassword signingValue("storePassword", "EHB_KEYSTORE_PASSWORD")
                keyAlias signingValue("keyAlias", "EHB_KEY_ALIAS")
                keyPassword signingValue("keyPassword", "EHB_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // R8 stays off: the app is a web view shell with almost no Java to
            // shrink, and leaving it off removes a class of release-only
            // failures that cannot be caught without a device test pass.
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
            if (hasReleaseKeystore) {
                signingConfig signingConfigs.release
            } else {
                logger.warn("No release keystore found — the bundle will be unsigned. " +
                        "Run scripts/make-keystore.sh, or set EHB_KEYSTORE_PATH and its passwords.")
            }
        }
        debug {
            applicationIdSuffix ".debug"
            versionNameSuffix "-debug"
        }
    }

    bundle {
        language { enableSplit = true }
        density { enableSplit = true }
        abi { enableSplit = true }
    }
}`,
  ],
]);

console.log('Android project configured.');
