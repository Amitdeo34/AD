// Guest reviews.
//
// Each property carries a set of sample reviews, generated deterministically
// from its slug so the same hotel always shows the same history. Reviews left
// by real guests are stored in the store and merged in front of them, and the
// headline rating is recomputed across both.
import { rngFor } from './data/inventory.js';
import { reviewsForProperty, reviewByUserForProperty, createReview } from './store.js';

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Ananya', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Sneha', 'Arjun', 'Ishita', 'Farhan', 'Zoya', 'Nikhil', 'Priya', 'Tenzin', 'Lhamo', 'Joseph', 'Mary', 'Harpreet', 'Simran', 'Bhaskar', 'Rupa', 'Kiran', 'Deepa', 'Sameer', 'Nandini', 'Aditya', 'Kavya', 'Imran', 'Rekha'];
const LAST_NAMES = ['Sharma', 'Iyer', 'Nair', 'Reddy', 'Banerjee', 'Das', 'Patel', 'Shah', 'Singh', 'Kaur', 'Gogoi', 'Baruah', 'Rao', 'Menon', 'Pillai', 'Joshi', 'Kulkarni', 'Chauhan', 'Negi', 'Bisht', 'Lepcha', 'Tamang', 'Marak', 'Sangma', 'Khan', 'Fernandes', 'D’Souza', 'Mishra', 'Yadav', 'Thakur'];

const TITLES = {
  high: ['Exactly as described', 'Would happily come back', 'Best decision of the trip', 'Warm hosts, spotless rooms', 'Worth every rupee', 'Quiet, clean and kind'],
  mid: ['Comfortable, with a few gaps', 'Good stay overall', 'Does the job well', 'Fine for a short stay', 'Solid, nothing fancy'],
  low: ['Not quite what we expected', 'Needs some upkeep', 'Average at best', 'Would think twice'],
};

const GOOD = [
  'The room was ready when we arrived and genuinely clean.',
  'Hot water at six in the morning, which mattered more than anything else.',
  'The family running it treated us like guests rather than customers.',
  'Breakfast was simple, hot and made to order.',
  'Very quiet at night — we slept properly for the first time on the trip.',
  'They arranged a car for us at short notice and did not overcharge.',
  'The view from the balcony was worth the climb.',
  'Wi-Fi held up well enough for a video call.',
  'Staff called ahead to check our arrival time, which saved us a lot of trouble.',
];

const MIXED = [
  'The room was fine, though the bathroom fittings have seen better days.',
  'Bit of noise from the road until about ten at night.',
  'Breakfast options were limited but everything served was fresh.',
  'Slightly cramped for three people, comfortable for two.',
  'Check-in took a while as only one person was on the desk.',
  'The photographs are flattering, but nothing was misleading.',
];

const BAD = [
  'The room smelled damp and the geyser took three attempts to work.',
  'Housekeeping missed us entirely on the second day.',
  'Nobody answered the phone when we tried to confirm our booking.',
  'The heating did not keep up with the cold.',
];

const CONTEXT = {
  VILLAGE: ['Perfect base for early morning walks around the village.', 'Getting here takes effort, and that is exactly the point.', 'Almost no phone signal, which turned out to be a blessing.'],
  TOWN: ['Walkable to the market and the bus stand.', 'Handy for an overnight halt on a longer drive.', 'Close enough to the main road without hearing it all night.'],
  CITY: ['Easy to reach from the station by auto.', 'Good spot if you are in the city for work.', 'Plenty to eat within a five-minute walk.'],
};

const TRIP_TYPES = ['Family holiday', 'Solo trip', 'Work travel', 'Couple’s getaway', 'Trip with friends', 'Pilgrimage'];

/** Midnight UTC today, as a timestamp. */
function startOfToday() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Which pool of review copy suits a star rating. */
function bucket(rating) {
  return rating >= 4 ? 'high' : rating >= 3 ? 'mid' : 'low';
}

/**
 * The sample review history for a property.
 * @returns {{id:string, name:string, rating:number, title:string, body:string,
 *            tripType:string, stayedOn:string, createdAt:string, sample:true}[]}
 */
export function sampleReviews(property, place) {
  const rng = rngFor(`reviews|${property.slug}`);
  const count = Math.min(9, Math.max(3, Math.round(Math.log10(property.baseReviewCount + 10) * 3)));
  const out = [];

  for (let i = 0; i < count; i++) {
    // Ratings cluster around the property's headline score.
    const drift = (rng.float() - 0.45) * 2.2;
    const rating = Math.min(5, Math.max(1, Math.round(property.baseRating + drift)));
    const tone = bucket(rating);
    const lines = [];
    lines.push(rng.pick(tone === 'low' ? BAD : tone === 'mid' ? MIXED : GOOD));
    if (rng.chance(0.75)) lines.push(rng.pick(tone === 'high' ? GOOD : MIXED));
    if (rng.chance(0.5)) lines.push(rng.pick(CONTEXT[place.kind] ?? CONTEXT.TOWN));

    // Anchored to midnight UTC rather than the current instant, so the same
    // review has the same timestamp on every call and on every server.
    const daysAgo = rng.int(6, 430);
    const stayed = new Date(startOfToday() - daysAgo * 86400000);

    out.push({
      id: `sample-${property.slug}-${i}`,
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      rating,
      title: rng.pick(TITLES[tone]),
      body: [...new Set(lines)].join(' '),
      tripType: rng.pick(TRIP_TYPES),
      stayedOn: stayed.toISOString().slice(0, 10),
      createdAt: stayed.toISOString(),
      sample: true,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Sample history plus anything real guests have written, newest first. */
export function reviewsFor(property, place) {
  const written = reviewsForProperty(property.slug).map((r) => ({ ...r, sample: false }));
  return [...written, ...sampleReviews(property, place)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/**
 * Headline rating across the sample history and any real reviews.
 * The count is the number of reviews actually held, so it always agrees with
 * the list and the star breakdown shown beside it.
 */
export function ratingFor(property, place) {
  const all = reviewsFor(property, place);
  const total = all.reduce((sum, review) => sum + review.rating, 0);
  return {
    rating: all.length ? Number((total / all.length).toFixed(1)) : property.baseRating,
    reviewCount: all.length,
    breakdown: [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: all.filter((review) => review.rating === star).length,
    })),
  };
}

export { reviewByUserForProperty, createReview };
