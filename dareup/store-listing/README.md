# DareUp store listing kit

Everything needed to list DareUp on app stores and game sites. Text is ready to
paste; character counts are already inside each store's limit. Replace every
`[bracketed]` placeholder first.

Files here:

| File | Use |
| --- | --- |
| `../android/store/play-icon-512.png` | App icon, 512×512 (Google Play, Indus, Samsung) |
| `feature-graphic-1024x500.png` | Google Play feature graphic |
| `screenshots/phone-*.png` | Phone screenshots, 1080×1920 |
| `feature-graphic.html`, `make-graphics.mjs`, `screenshots.mjs` | Sources; `node make-graphics.mjs --shots` re-renders all images |

Which build goes where:

| Store | Upload | Premium buying |
| --- | --- | --- |
| Google Play | `DareUp-<version>.aab` | Hidden (Play needs Google Play Billing) |
| Indus Appstore, APKPure, Uptodown, your own site | `DareUp-<version>.apk` | Razorpay |
| Samsung Galaxy Store | `.apk` (see below) | Check Samsung's rules first |
| itch.io (web game) | zip of `index.html` | Razorpay, through your deployed site |

Each store needs its own developer account in your name, identity checks, and
(for Google Play) a one-time registration fee. Those steps cannot be done for
you.

---

## Google Play

**App name** (30 max)

```
DareUp: Truth or Dare Party
```

**Short description** (80 max)

```
Truth or Dare party game for friends and family. Fun cards, timers and scores.
```

**Full description** (4,000 max)

```
DareUp is the Truth or Dare game for parties, sleepovers, road trips and family nights. Add your players, pick a pack, and pass the phone around.

HOW IT WORKS
• Add up to 6 players
• On your turn, choose Truth, Dare or Random
• Finish the card to score a point, or chicken out (3 skips each)
• Optional dare timer: 30, 60 or 90 seconds
• Scoreboard and a winner at the end of the game

PACKS INCLUDED
• Classic: the questions and dares everyone knows, with a twist
• Friends: inside jokes, confessions and silly challenges
• Family & Kids: clean, safe fun for all ages

MADE FOR REAL GROUPS
• No card repeats until the pack runs out
• Plays fully offline, no sign-up, no ads
• Light and dark themes, sound and vibration you can switch off
• Every dare is safe: no alcohol, no dangerous stunts, no pranks on strangers

Your game data stays on your phone.

Privacy policy: [your-site]/privacy.html
```

**Category:** Game → Casual. **Tags:** Party, Casual, Multiplayer (local).

**Contact email:** [support email]. **Website:** [your-site].
**Privacy policy URL:** `[your-site]/privacy.html` (deployed with the web app).

**Data safety form (Play channel):** the Play build makes no purchases and
sends nothing anywhere.

- Does your app collect or share any of the required user data types? **No.**
- Is all user data encrypted in transit? **Yes** (HTTPS only).
- Do you provide a way for users to request deletion? Data is on the device
  only; uninstalling or "Clear data" removes it.

**Content rating (IARC questionnaire):** answer honestly; the Play build ships
only the free packs. Category: Game. No violence, no gambling, no user-to-user
chat, no sharing of location, no purchases of digital goods. Expect an
all-ages to Teen rating depending on how you answer the "suggestive themes"
question for party dares.

**Target audience:** 13+ is the simplest choice. Choosing ages under 13 puts
the app under the Families policy, which adds extra requirements.

**Google Play extra steps for new personal developer accounts:** Google asks
new personal accounts to run a closed test with a minimum number of testers
for a set number of days before production access. Check the current numbers
in Play Console → Dashboard. An organisation account (needs a D-U-N-S number)
skips this.

---

## Other Android stores (APK with premium)

Use the same title and icon. These builds sell premium through Razorpay.

**Short description** (80 max)

```
Truth or Dare with 500+ cards, a Hinglish pack, dare timers and premium packs.
```

**Full description**

```
DareUp is the Truth or Dare game for parties, sleepovers, road trips and date nights. Add your players, pick a pack, and pass the phone around.

FREE PACKS
• Classic, Friends, and Family & Kids: [free card count] cards in all

PREMIUM PACKS
• Party Animals: loud, silly, made for big groups
• Couples (18+): flirty, sweet, never explicit
• Desi Masti: a full Hinglish pack
• Office Safe: team-outing friendly
• Deep Talk: questions that get real
• Challenge Mode: quick, safe physical challenges
• Create your own packs, up to 20 players, extra colour themes

PREMIUM PASS
• Monthly ₹49 · Yearly ₹199 · Lifetime ₹499
• One-time payment through Razorpay (UPI, cards, net banking, wallets). No auto-renewal.
• Restore your pass on a new phone with your payment ID and email.

MADE FOR REAL GROUPS
• No card repeats until the pack runs out
• Free packs play fully offline, no sign-up, no ads
• Every dare is safe: no alcohol, no dangerous stunts, no pranks on strangers

Privacy policy: [your-site]/privacy.html
```

**Indus Appstore** (India): lets developers use their own payment gateway, so
the Razorpay APK can go there as is. Upload the APK, icon, screenshots and the
text above.

**Samsung Galaxy Store:** check its in-app payment rules before submitting the
Razorpay APK. If it requires Samsung's own billing, build an APK with buying
hidden: `APK_CHANNEL=play bash build.sh`.

**APKPure / Uptodown / your own website:** upload the APK. Tell users to allow
"Install unknown apps" for their browser when installing from a website.

---

## Web game sites

**itch.io** (HTML5 games): create a project, Kind of project → HTML, upload a
zip containing `index.html` (and `privacy.html`, `terms.html`), tick "This file
will be played in the browser", viewport 390×844, enable "Mobile friendly" and
fullscreen button. Set `API_BASE_REMOTE` in `index.html` to your deployed site
first, so premium works from itch.io's domain.

Portals such as CrazyGames and Poki do not allow outside payments; they require
their own SDK and ads, so list the free version there only if you want reach.

---

## Launch checklist

- [ ] Web app deployed on Vercel, Razorpay live keys set, test purchase done
- [ ] `privacy.html` and `terms.html` placeholders filled and live
- [ ] Package name chosen (`APP_ID`) and kept forever
- [ ] Signing key backed up in two places
- [ ] APK installed and tested on a real phone: play, buy, restore, back button
- [ ] Store accounts opened: Google Play, Indus Appstore, others as needed
- [ ] Listing text, icon, feature graphic and screenshots uploaded
