#!/usr/bin/env node
// Writes capacitor.config.json from the environment.
//
// The app is a shell around the deployed Easy Hotel Booking site, so the URL it
// loads has to be baked in at build time. EHB_APP_URL sets it.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const appUrl = process.env.EHB_APP_URL ?? '';

const config = {
  appId: process.env.EHB_ANDROID_APP_ID ?? 'in.easyhotelbooking.app',
  appName: 'Easy Hotel Booking',
  webDir: 'www',
  android: {
    allowMixedContent: false,
    backgroundColor: '#0f5132',
  },
  server: {
    androidScheme: 'https',
    // Without a URL the shell shows the bundled offline page, which is the
    // correct behaviour for a build that has nowhere to point yet.
    ...(appUrl ? { url: appUrl, cleartext: appUrl.startsWith('http://') } : {}),
    errorPath: 'error.html',
  },
};

fs.writeFileSync(path.join(root, 'capacitor.config.json'), `${JSON.stringify(config, null, 2)}\n`);
console.log(appUrl
  ? `capacitor.config.json → ${appUrl}`
  : 'capacitor.config.json written with no site URL (set EHB_APP_URL before a release build)');
