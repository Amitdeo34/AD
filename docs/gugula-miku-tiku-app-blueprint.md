# Gugula, Miku and Tiku: App Blueprint & Copy Deck

*Anything in [brackets] is a placeholder. Swap in your real prices, specs and policies.*

---

## 1. App Navigation & Screen Structure

**Bottom navigation (5 tabs)**
- **Home:** today's rain check, the hero, the three collections, fan favorites, reviews
- **Shop:** browse Gugula · Miku · Tiku, filter, search, compare
- **Weather:** the Live Weather Tracker for rain, wind and UV, plus a "which umbrella today?" tip
- **Cart:** your picks, a free-shipping progress bar, express checkout
- **Account:** orders, saved items, My Umbrellas, alerts, help

**Nav notes**
- Tab labels stay one plain word. The brand's personality goes inside the screens.
- The Weather icon is live (sun, cloud or rain for your location), so the tab bar alone tells you whether to pack an umbrella.
- The Cart icon shows an item-count badge.

**First launch (3 quick screens, all skippable)**
1. **Welcome:** the three mascots wave hello. *"Hi, we're Gugula, Miku and Tiku. Our job? Keeping you dry."*
2. **Location ask** (a friendly explainer shown before the system pop-up): *"Mind if we check your local sky? We'll warn you before the rain does."* → [Sure, go ahead] [Maybe later]
3. **Alerts ask:** *"Want a quick heads-up before it pours?"* → [Yes, keep me dry] [Not now]
4. Next comes an optional 30-second **Find Your Match** quiz, which lands on a personalized Home.

- No sign-up wall. People can browse and buy as guests, and we offer an account after the first order: *"Save your details for next time?"*

**Screen map**
- **Home (top to bottom)**
  - Rain-check strip (live local forecast + umbrella tip)
  - Hero + main CTA
  - Meet the family (Gugula, Miku and Tiku collection cards)
  - Find Your Match quiz card
  - Fan favorites carousel
  - "Spotted in the rain" (customer photos + reviews)
  - Promise strip (shipping, warranty, returns)
- **Shop**
  - Collection pages: Gugula (storm-proof), Miku (colors & patterns), Tiku (ultra-compact)
  - Product grid with filters (wind rating, folded size, canopy size, color, price) and sorting
  - Search that understands plain language: "fits in a handbag," "big enough for two," "windy commute"
  - Compare tray: up to 3 umbrellas side by side
  - **Product page:** photo gallery + 360° spin, Try It Open (AR), color picker, benefits, specs, reviews, Q&A, Add to Cart pinned to the bottom of the screen
- **Weather (Live Weather Tracker)**
  - "Your sky right now": rain chance, wind gusts, UV index
  - Umbrella verdict card: *"Gusty afternoon. Today's a Gugula day."* On sunny days: *"UV is high. Your umbrella doubles as shade."*
  - Hour-by-hour forecast for the next 12 hours + 7-day outlook
  - Saved places (Home, Work, School) and commute times
  - Alert settings: rain threshold, timing, quiet hours (approximate location is enough)
- **Cart & Checkout**
  - Free-shipping progress bar: *"You're [amount] away from free shipping!"*
  - Pocket-sized add-on: *"Add a Tiku for your work bag?"*
  - Gift wrap + personal note toggle
  - One-page checkout with express pay (Apple Pay, Google Pay, UPI) and guest checkout
  - Confirmation: delivery date, live tracking, care tips
- **Account**
  - Orders & live tracking
  - Saved for a Rainy Day (wishlist)
  - My Umbrellas: registered umbrellas, warranty, care guide, Bring-It-Home tag
  - Alerts & preferences, addresses & payments
  - Help: chat with a real person, FAQs, easy returns
  - Refer a friend

**UX ground rules**
- **Thumb-first:** key actions live in the bottom third of the screen. Add to Cart stays pinned on product pages.
- **Mascots as guides:** Gugula hosts wind and storm warnings, Miku hosts style and the quiz, and Tiku hosts travel and on-the-go picks.
- **Accessible by default:** every color and pattern has a text name, text meets 4.5:1 contrast, tap targets are at least 44 pt (48 dp on Android), and layouts scale with large text.

---

## 2. Unique App Features

**1. Rain Heads-Up (localized rain & wind alerts)**
- **What it does:** sends a nudge [30–60 minutes] before rain reaches your saved places, plus an optional morning "umbrella check" at a time you choose.
- **The clever bit:** it matches the umbrella to the weather. Gusty? Gugula. A quick shower on a busy day? Tiku. A gloomy gray morning? Miku, to brighten it up.
- **You're in control:** pick your places, rain-chance threshold and quiet hours. Never more than [2] alerts a day.
- **Why it sells:** it gives people a genuinely useful reason to open the app every day, and the "right umbrella" tips introduce all three lines without a hard sell.
- **Sample alerts:**
  - "Rain rolling in near Work around 5:40 pm. Tiku in your bag? You're all set ☔"
  - "Gusts up to [55 km/h] this afternoon. Today's a Gugula day. Hold on tight!"
  - "Clear skies all day! Your umbrella can take the day off ☀️"
  - *Telling people when they don't need an umbrella is what makes them trust the alerts that say they do.*

**2. Try It Open (AR size preview)**
- **What it does:** shows the umbrella at true size through the camera, either open above you or folded next to your real bag.
- **Three modes:**
  - *Over me:* see how much of you (and your backpack) the canopy really covers, or whether it fits two
  - *In my bag:* place the folded umbrella beside your actual tote, backpack or glovebox
  - *Side by side:* compare Gugula, Miku and Tiku canopies in one view
- **Why it sells:** it answers the two big online doubts, "Is it big enough?" and "Will it fit?" That makes people more confident about adding to cart and cuts size-related returns.
- **Fallback:** on phones without AR, show a true-to-scale photo beside everyday objects (a phone, a water bottle, a paperback).

**3. Find Your Match (30-second quiz)**
- **What it does:** asks five tap-only questions, then gives a personal pick and explains why.
- **The questions:**
  1. How do you usually get around? *Walk · Bike or scooter · Bus or train · Car*
  2. What does the weather throw at you? *Light drizzle · Proper downpours · Wind that means business*
  3. Where will your umbrella live? *Bag or backpack · Desk or car · By the front door*
  4. What's your style? *Bold and bright · Clean and classic · Whatever works*
  5. Who's it for? *Me · A gift*
- **Result copy:** "You're a Tiku person! You're always on the go and hate lugging extra weight, so we picked the one that folds down to [18 cm] and weighs just [180 g]." → [Add to Cart] [See my runner-up] [Share my match]
- **Why it sells:** it turns "I can't decide" into a confident pick and personalizes Home and alerts (with permission). Shareable result cards ("I'm a Miku!") bring friends in.

**4. Bring-It-Home Tag + Storm Promise (My Umbrellas)**
- **What it does:** every umbrella comes with a small QR tag on the strap. One scan registers it and switches on the warranty, care tips and Lost & Found.
- **Lost & Found:** whoever finds your umbrella scans the tag and sends you a message without seeing any of your personal details. You arrange the return in the app.
- **Storm Promise:** if the wind ever wins within [2 years], you can request a repair or replacement in three taps: snap a photo, choose an option, done.
- **Why it sells:** it turns a one-time purchase into an ongoing relationship. It's also the kind of "they actually care" moment people tell their friends about, and it makes a replacement offer feel natural: "Gone for good? Here's [15%] off a new one."
- **Sample copy:**
  - Owner: "Lost your umbrella? Let's bring it home."
  - Finder: "You found someone's umbrella. Thank you, kind stranger! Leave a quick note and we'll let them know."

---

## 3. Home Screen Sales Copy

**Hero**
- **Headline:** Stay dry. Look good. Let the sky do its thing.
- **Subheadline:** Tough in wild winds, gorgeous on gray days, tiny in your bag. Whatever the forecast says, we've got you.
- **CTA button:** **Find My Umbrella** (opens the 30-second quiz)
- **Secondary link:** Or browse all umbrellas →
- **Under the button:** Free shipping over [amount] · [2-year] Storm Promise · 30-day returns
- **Headlines to A/B test:** "Let it pour. You're covered." · "Here's to dry shoulders and good-hair days."
- *Why this CTA: it promises a result (your umbrella) rather than a chore (shopping), and "My" makes the choice feel like theirs.*

**Brand story: "Meet the family that's got you covered"**

> We've all had *that* umbrella. The one that flipped inside out at the first gust. The one so forgettable you left it on the bus. The one too bulky to bother bringing.
>
> So we made three we'd genuinely love to carry, each with its own personality.
>
> **Gugula, the tough one.** Storms don't scare Gugula. Its flexible, reinforced frame stands firm in strong winds, so you can stop wrestling your umbrella and just walk. *[Meet Gugula]*
>
> **Miku, the stylish one.** Bold colors, playful patterns and a sleek shape that goes with everything you wear. Miku makes a gray day feel a little brighter. *[Meet Miku]*
>
> **Tiku, the clever little one.** Small enough to live in your bag and quick to pop open, so a surprise shower never catches you out again. *[Meet Tiku]*
>
> Three personalities. One promise: wherever today takes you, you'll get there dry.

**Supporting modules**
- **Rain-check strip (rainy day):** "Near you today: [70%] chance of rain after [4 pm]. Tiku fits right in your bag."
- **Rain-check strip (sunny day):** "Clear skies all day. Your umbrella can take a break."
- **Quiz card:** "Not sure which one's yours? Answer 5 quick questions and we'll find your match." → [Take the quiz]
- **Bestsellers:** "Fan favorites: tried, tested and properly rained on"
- **Customer photos:** "Spotted in the rain: real people, real weather, really dry shoulders"
- **Promise strip:** "Free shipping over [amount] · [2-year] Storm Promise · 30-day returns, no hard feelings"

---

## 4. Product Page Copy Template (Flagship: Gugula Storm)

**Page order (top to bottom):** gallery → name, rating, price → color picker → Add to Cart → shipping highlights → hook → benefits → specs → reviews → Q&A → "pairs well with"

**Header**
- **Name:** Gugula Storm
- **Descriptor:** Windproof Auto Open & Close Compact Umbrella
- **Tagline:** Stays calm when the weather doesn't.
- **Rating:** ★ [4.8] · [1,240] reviews
- **Color label:** Color: [Midnight Navy]

**The hook**

> **Sunny at 8. Sideways rain by 5. Sound familiar?**
> You know the moment: the sky opens, the wind grabs your umbrella, and suddenly you're wrestling it inside out in front of everyone. Gugula Storm was made for exactly that moment. When a gust hits, it flexes, bounces back and keeps you dry, so you walk home calm, comfy and maybe just a little smug.

**Why you'll love it**
- **Laughs off strong winds.** [9] flexible fiberglass ribs bend with each gust and spring right back, while a vented double canopy lets the wind slip through instead of flipping it inside out. Wind-tested to [90 km/h].
- **A frame built for years, not weeks.** The [aluminum-alloy] shaft is reinforced, the joints are rust-resistant, and the mechanism is tested through [5,000] open-and-close cycles. It'll still be going strong next rainy season, and the one after that.
- **Sun protection, built in.** The [UPF 50+] canopy blocks [98%+] of UV rays, so it's just as handy on a scorching afternoon as in a downpour.
- **Big coverage, bag-sized fold.** Opens to a generous [105 cm] canopy that covers you and your bag, then folds down to just [29 cm] and [450 g]. It slips into a backpack, a tote or your car door pocket.
- **One-touch open and close.** Press once to pop it open, press again to fold it away. Perfect when your other hand is busy with coffee, groceries or a small human.
- **Dries in a shake.** Water-repellent fabric makes rain bead up and roll right off. One good shake and it's ready for your bag. No puddles under your desk.

**Quick specs**

| Spec | Detail |
|---|---|
| Canopy (open) | [105 cm] across |
| Folded length | [29 cm] |
| Weight | [450 g] |
| Frame | [9] fiberglass ribs, [aluminum-alloy] shaft |
| Wind tested | Up to [90 km/h] |
| UV protection | [UPF 50+] |
| Opening | One-touch auto open & close |
| In the box | Umbrella, quick-dry sleeve, Bring-It-Home QR tag |
| Warranty | [2-year] Storm Promise |

**Button & UI micro-copy**
- **Main button:** Add to Cart · [price] → after tap: ✓ Added! View Cart
- **Express:** Buy now with [Apple Pay / Google Pay]
- **Wishlist (heart):** Save for a rainy day → "Saved! It'll be right here when you need it."
- **AR:** Try it open
- **Size helper:** Will it fit in my bag?
- **Added-to-cart sheet:** "Great pick! Gugula Storm is in your cart." [Checkout] [Keep browsing]
- **Pairs well with:** "Tiku: the little backup that lives in your work bag"
- **Sold out:** "Sold out in this color (it's been a rainy week!)" → [Notify me when it's back] → "Done! You'll be the first to know."
- **Low stock (only when it's true):** Only [3] left in [Midnight Navy]
- **Questions:** "Ask us anything. A real person replies within [24 hours]."
- **Gift toggle:** Make it a gift (wrapping + a personal note)
- **Share:** Send to the friend who's always soaked

**Shipping highlights**
- **Free shipping** on orders over [amount]
- **Order in the next [2h 14m]** and it ships today (live countdown; show it only when the cutoff is real)
- **Arrives by [Fri, Oct 9]** to [postcode] · Change
- **30-day returns.** Changed your mind? Send it back, no hard feelings.
- **[2-year] Storm Promise.** If the wind ever wins, we'll repair or replace it.

**Before launch:** swap every [bracketed] value for your tested specs, and convert units and currency for each market. Wind, UPF and durability claims need lab results behind them.

---

## Bonus: Voice Cheat Sheet

- **Sound like a friend at the door, not a brochure.** "Grab Tiku, it's about to pour" beats "Ensure optimal rain protection."
- **Start with their day, then the product.** Soggy socks, frizzy hair, the dash to the bus stop. Then show how we fix it.
- **Short sentences, contractions, plain words.** If you wouldn't say it out loud, rewrite it.
- **One pun per screen, max.** Charming, not cheesy.
- **No fake urgency.** A reliable friend never pressures you.
