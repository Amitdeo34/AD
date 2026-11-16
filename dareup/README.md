# DareUp

A Truth or Dare party game for India: friends, family, couples and office teams.
The whole game is one file, `index.html`. It opens by double-click, plays the free
packs fully offline and works at phone width. A small serverless API on Vercel sells
premium passes through Razorpay and sends the premium packs to people who bought one.

- **Free:** Classic (40 truths / 40 dares), Friends (30/30), Family & Kids (25/25), up to 6 players.
- **Premium:** Party Animals (40/40), Couples 18+ (30/30), Desi Masti in Hinglish (40/40),
  Office Safe (25/25), Deep Talk (40/10), Challenge Mode (30/30); your own custom packs;
  up to 20 players; Neon, Mango and Ocean colour themes.
- **Passes** (one-time payments, nothing renews): Monthly ₹49 for 30 days, Yearly ₹199 for 365 days, Lifetime ₹499.

No npm dependencies and no build step. Node 20 or newer.

## What is where

| Path | What it is |
| --- | --- |
| `index.html` | The game: inline CSS, JS, free packs, icons. Config block at the top of the main script. |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA bits, used only on the hosted site. `icons/icon.svg` and `icons/icon-maskable.svg` are the sources. |
| `privacy.html`, `terms.html` | Policy pages (fill in the `[placeholders]`). |
| `api/*.js` | Vercel functions: `plans`, `create-order`, `verify-payment`, `restore`, `packs`. |
| `api/_lib/` | Shared server code. `plans.js` holds the prices. `premium-packs.js` holds the premium cards. Not routes, not served. |
| `dev-server.mjs` | Local server: static files plus `/api/*` with a Vercel-style `req`/`res`. |
| `test/` | `npm test` (node:test) and `test/smoke.mjs` (Playwright, run separately). |
| `scripts/` | `make-icons.mjs` (SVG to PNG), `rename.mjs` (rename the game). |

## Run it locally

```bash
cd dareup
npm run dev                                   # http://localhost:3000
```

To try the whole premium flow without Razorpay, use demo mode. "Buy" then unlocks a free demo pass:

```bash
DEMO_MODE=1 PASS_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))") npm run dev
```

Or copy `.env.example` to `.env` and fill it in; the dev server reads it. Restart after changing API code.

You can also just double-click `index.html`. The free packs work; Premium will say the
game is not connected to a server until `API_BASE_REMOTE` is set (see below). For testing,
`index.html?api=http://localhost:3000` points a `file://` copy at your dev server.

## Tests

```bash
npm test                                      # API, tokens, signatures, CORS, content rules
node test/smoke.mjs                           # browser run: phone, desktop, offline, file://, Android host
SHOTS_DIR=/tmp/shots node test/smoke.mjs      # same, and save phone screenshots
```

The smoke test needs Playwright with Chromium already installed (it is not a dependency).

## Deploy to Vercel

1. In Vercel, **Add New → Project** and import this GitHub repository.
2. Set **Root Directory** to `dareup`. Framework preset: **Other**. Leave Build and Output settings empty.
3. Under **Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `RAZORPAY_KEY_ID` | `rzp_test_...` to start, `rzp_live_...` when going live |
   | `RAZORPAY_KEY_SECRET` | the matching key secret |
   | `PASS_SECRET` | 32+ random characters (command in `.env.example`). Changing it signs everyone out of Premium. |
   | `ALLOWED_ORIGINS` | optional. Leave empty to allow any origin. If you set it, include `https://appassets.androidplatform.net` for the Android app. The site's own domain is always allowed. |
   | `DEMO_MODE` | optional, `1` only for trying the flow. Never on the live site. |

4. **Deploy.** Open `https://<your-project>.vercel.app/api/plans`: `paymentsReady` should be `true`.
5. In `index.html`, set `API_BASE_REMOTE` to that address. It is used by `file://` copies and the Android app; the hosted site always calls its own origin.

Without the keys, and with `DEMO_MODE` unset, buying returns a clear
"payments are not set up" message (HTTP 503). The server never gives away a pass.

`vercel.json` adds security headers (including a CSP that allows Razorpay Checkout), uses
clean URLs, pins the Mumbai region and redirects `/api/_lib/*` away. `.vercelignore` keeps
`android/`, `test/` and the dev tools out of the deployment.

## Razorpay setup

1. Create a Razorpay account and finish KYC (live payments need it; test mode does not).
2. **Test mode first:** in the Dashboard, switch to Test Mode and generate keys on the **API Keys** page (under Account & Settings).
   Put them in Vercel and redeploy. Buy a pass using Razorpay's test cards or test UPI ID.
3. **Payment capture:** in the Dashboard's payment capture settings, choose **automatic capture**, so payments
   are captured straight away. The server only unlocks Premium for captured payments; uncaptured ones are refunded by Razorpay.
4. Keep **email** required at checkout (the default). Restore purchase matches on payment ID plus email.
5. **Go live:** generate live keys, replace both variables in Vercel, redeploy, and make one small real purchase.

Orders carry `notes.app = "dareup"`. The server ignores payments for any other app, so you can share a Razorpay account with other apps safely.

## How premium works

1. The game calls `POST /api/create-order` with a plan id (`monthly`, `yearly` or `lifetime`). Prices live only in `api/_lib/plans.js`.
2. Razorpay Checkout opens (the script loads only when someone taps Buy). After payment, the game sends the
   order ID, payment ID and signature to `POST /api/verify-payment`.
3. The server checks the signature (HMAC-SHA256 with the key secret), fetches the order and payment from Razorpay,
   takes the plan from the order's notes and returns a **signed pass token**:
   `base64url(JSON {v, plan, pid, oid, iat, exp})` + `.` + `base64url(HMAC-SHA256(PASS_SECRET, payload))`.
   The pass runs from the payment time; lifetime passes have `exp: null`.
4. The game stores the token on the device, calls `GET /api/packs` with `Authorization: Bearer <token>` and caches the packs
   so they play offline until the pass ends.
5. **Restore purchase** (`POST /api/restore` with payment ID and email) re-issues the token on a new device.

There is no database. The server stores nothing.

### Honest limits

- **The token can be shared.** Anyone who copies a token can use it until it expires. There is no device limit and no way to revoke a single pass, short of changing `PASS_SECRET` (which signs everyone out).
- **Cached packs stay on the device until the pass ends**, and someone who knows how could copy them out of browser storage.
- **Custom packs, 20 players and the extra themes are unlocked on the device.** They are not server-enforced, so a determined user could switch them on by editing local storage. The premium card text is the part the server protects.
- **This repository is public**, so the premium card text in `api/_lib/premium-packs.js` can be read on GitHub. If that matters, move the packs to a private repository or a storage service.
- Restore needs the email used at checkout. Payments made without an email cannot be restored this way.
- No rate limiting on restore (there is no database). Payment IDs are long and random, and a wrong email returns the same "not found" as an unknown ID.

## Change the name or prices

- **Name:** `npm run rename -- "New Name"` updates `APP_NAME` in `index.html` (everything in the game reads it), the
  manifest, the policy pages and the server default. Storage keys and the Razorpay note stay `dareup`, so existing players keep their data and passes.
- **Prices:** edit `amount` (in paise) in `api/_lib/plans.js`. Also update `FALLBACK_PLANS` in `index.html` (shown only when the server
  cannot be reached) and the table in `terms.html`.
- **Brand colours:** primary `#7c3aed`, secondary `#db2777`, light background `#fff7f0`, dark background `#120c24`.

## API reference

| Route | Request | Response |
| --- | --- | --- |
| `GET /api/plans` | | `{ currency, plans: [{id, label, description, amount, price, currency, days}], paymentsReady, demo }` |
| `POST /api/create-order` | `{ plan }` | `{ orderId, amount, currency, keyId, plan, name }` (+ `demo: true` in demo mode) |
| `POST /api/verify-payment` | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | `{ token, plan, exp, paymentId }` |
| `POST /api/restore` | `{ paymentId, email }` | `{ token, plan, exp, paymentId }` |
| `GET /api/packs` | header `Authorization: Bearer <token>` | `{ version, plan, exp, packs: [{id, name, description, adult, truths, dares}] }` |

Errors are JSON `{ error, message }`. Codes: `400 invalid_plan / invalid_request / invalid_signature / unknown_order / payment_mismatch / invalid_json / demo_not_restorable`,
`401 unauthorized / expired`, `402 payment_pending / refunded`, `403 origin_not_allowed`, `404 not_found`, `405 method_not_allowed`,
`410 expired`, `413 body_too_large`, `502 payment_provider_error`, `503 payments_not_configured`. Every route answers CORS preflight (`OPTIONS`).

## Android app

`android/` wraps this same `index.html` in a small native app (no Gradle or
Android Studio needed). One command builds both store files:

```bash
cd android
API_BASE_REMOTE=https://your-site.vercel.app VERSION_CODE=1 VERSION_NAME=1.0.0 bash build.sh
```

- `android/build/DareUp-<version>.apk`: install directly, or upload to Indus
  Appstore and APK sites. Sells premium through Razorpay.
- `android/build/DareUp-<version>.aab`: upload to Google Play. In-app buying
  is hidden, because Google Play requires Google Play Billing for digital
  purchases.

Set `API_BASE_REMOTE` to your deployed site first, or the app's Premium screen
says it is not connected (free packs still work). Back up the signing key the
first build creates in `android/keystore/`; every update needs it. Details,
icons and options: [`android/README.md`](android/README.md). Store listing
text, feature graphic and screenshots: [`store-listing/`](store-listing/README.md).
