# Easy Hotel Booking

Hotels, homestays, resorts and guest houses across **every state, district and
village in India** — from state capitals down to settlements at the end of the
road. Next.js on the web, a Capacitor shell for Android, and direct UPI payment
so money reaches the property without an aggregator in between.

```bash
npm install
npm run seed     # demo accounts and sample bookings (optional)
npm run dev      # http://localhost:3000
```

---

## What is in it

**Pan-India location hierarchy.** 36 states and union territories → 776
districts → 1,425 settlements (176 cities, 876 towns, **373 villages**), each
with bookable inventory: 6,284 properties and 18,159 room types. Browse it as a
hierarchy at `/states`, or search any level directly.

**Search that understands the hierarchy.** Type-ahead across villages, towns,
cities, districts and states. Filter by settlement type, price band, kind of
stay and star rating; sort by price, guest rating or star rating. Results are
priced for the actual dates, with live availability.

**Photographs.** Every listing carries a five-shot gallery — exterior, room,
bathroom, view, breakfast — shown on the card, the property page and the
booking. Each image has a colour fallback, so a card never collapses when a
photo cannot load.

**Guest reviews.** Each property has a review history with a star breakdown.
Guests who completed a confirmed stay can add their own, once per property; the
headline rating is recomputed across everything shown.

**Booking.** Rooms are held the moment guest details are entered, never
double-sold — availability is computed per night across the whole stay, so a
booking only succeeds if every night has stock. GST follows the Indian slab
rules (5% up to ₹7,500 a night, 18% above), and the quote a guest sees is what
they are charged.

**Direct UPI payment.** Scan a QR or open a UPI app; the payee, the exact
amount and the booking reference are embedded in the intent. Payment goes
straight to the property's UPI ID. See "How payment works" below.

**Accounts.** Register, sign in, edit the profile, change the password. Guest
bookings made with the same email are claimed automatically at registration.
Sessions are HS256 JWTs; passwords are scrypt-hashed.

**Android app.** A signed `.aab`, buildable with one command.

---

## How payment works

Payment is **direct UPI**, not a gateway. That is what makes the earnings
direct — but it also means nothing can automatically confirm that money
arrived, because there is no PSP to ask. The flow is honest about that:

1. The guest fills in their details; the rooms are **held** (`PENDING_PAYMENT`).
2. `/api/payments/upi` returns a QR and per-app deep links for the exact amount,
   tagged with the booking reference.
3. The guest pays and submits the **UTR** their bank shows.
4. The booking stays held and the payment moves to `VERIFYING`.
5. Staff match the UTR against the bank statement in `/admin/payments` and
   accept it — which is what confirms the booking — or reject it, which returns
   the booking to unpaid.

Guests who would rather not pay in advance can **reserve and pay at the
property**, which confirms immediately.

Set `EHB_UPI_VPA` to the receiving UPI ID. Without it the app offers
pay-at-property only, and says so.

> If you later want automatic confirmation, replace `lib/upi.js` with a PSP
> integration — every route already goes through that one module.

---

## Layout

```
app/            Next.js App Router — pages and API route handlers
components/     React components (client where they need to be)
lib/            Domain logic, all of it framework-free
  data/         The geography: states, districts, settlements, inventory rules
  catalogue.js  Builds the whole catalogue in memory, deterministically
  search.js     Search, filtering, type-ahead
  bookings.js   Holds, quotes, cancellation
  availability.js  Per-night room maths
  pricing.js    Tariffs and GST
  reviews.js    Review history and ratings
  upi.js        UPI intents, QR codes, UTR handling
  store.js      Accounts, bookings, payments and reviews
mobile/         Capacitor Android shell
test/           50 tests over the domain logic and the real route handlers
```

### Where the data comes from

The **location hierarchy is real**: every state, union territory and district of
India, plus district headquarters and several hundred named towns and villages
(Chitkul, Mawlynnong, Khonoma, Spangmik, Hampi, Tarkarli and so on), each mapped
to its actual district.

The **inventory is generated** — property names, tariffs, amenities, room types
and the sample review history are produced deterministically from the settlement
they belong to, so the same catalogue is built on every machine and every
deploy. Photographs come from a placeholder photo service. Replace
`lib/data/inventory.js` and `lib/photos.js` with a real supply feed when you
have one; nothing else needs to change.

Accounts, bookings, payments and guest-written reviews are real data and live in
the store.

### Storage

`lib/store.js` keeps a small JSON document in memory and flushes it to disk on
every change (`.data/store.json` locally). It is deliberately the only module
that touches persistence, so moving to Postgres means rewriting one file.

**On serverless hosts the writable directory is per-instance and temporary.**
Set `EHB_DATA_DIR` to a mounted volume, or swap the store for a managed
database, before taking real bookings.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | The full suite — 50 tests |
| `npm run seed` | Demo accounts, bookings and a review |
| `npm run build:android` | Signed release `.aab` |
| `npm run mobile:icons` | Regenerate every icon from `mobile/assets/icon.svg` |

Demo accounts after `npm run seed`:

| Role | Email | Password |
| --- | --- | --- |
| Guest | `demo@easyhotelbooking.in` | `Demo@1234` |
| Staff | `admin@easyhotelbooking.in` | `Admin@1234` |

---

## Configuration

Copy `.env.example` to `.env`. The two that matter in production:

- `ATITHI_JWT_SECRET` — without it, sessions do not survive a restart.
- `EHB_UPI_VPA` — the UPI ID that receives payments.

---

## Deploying

The app is a standard Next.js project with no native dependencies, so it
deploys anywhere Node runs.

**Vercel:**

```bash
npx vercel link
npx vercel env add ATITHI_JWT_SECRET production
npx vercel env add EHB_UPI_VPA production
npx vercel --prod
```

`vercel.json` pins the framework, the build command and the Mumbai region.
Read the storage note above before taking real bookings on a serverless host.

**Anywhere else:** `npm run build && npm start` behind a reverse proxy.

---

## Android

```bash
EHB_APP_URL=https://your-deployment npm run build:android
```

The bundle lands at
`mobile/android/app/build/outputs/bundle/release/app-release.aab`.

The shell loads the deployed site in a web view, with a bundled offline screen
for when the device has no connection. `mobile/android/` is generated: delete it
and run `npm run add --workspace mobile` to rebuild it with every project
customisation reapplied (branding, splash, network policy, signing, versioning).

`mobile/scripts/make-keystore.sh` creates the upload keystore. **Back it up** —
Play requires every future update to be signed with the same key. The keystore
and its passwords are git-ignored.

See `mobile/README.md` for the details.
