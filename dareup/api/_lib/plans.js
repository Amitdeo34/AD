// Premium pass plans. This file is the ONLY place prices live: the client sends a
// plan id, never an amount. Amounts are in paise (₹1 = 100 paise).
// To change a price, edit `amount` here (and the display copy in index.html,
// FALLBACK_PLANS, which is only shown when the server cannot be reached).

export const CURRENCY = 'INR';
const DAY = 86400;

export const PLANS = Object.freeze({
  monthly: Object.freeze({
    id: 'monthly',
    label: 'Monthly pass',
    amount: 4900,
    days: 30,
    description: '30 days of Premium',
  }),
  yearly: Object.freeze({
    id: 'yearly',
    label: 'Yearly pass',
    amount: 19900,
    days: 365,
    description: '365 days of Premium',
  }),
  lifetime: Object.freeze({
    id: 'lifetime',
    label: 'Lifetime pass',
    amount: 49900,
    days: null, // never expires
    description: 'Premium for good, pay once',
  }),
});

// Own-property lookup only, so ids like "__proto__" or "toString" never match.
export function getPlan(id) {
  return typeof id === 'string' && Object.hasOwn(PLANS, id) ? PLANS[id] : null;
}

// Expiry (unix seconds) for a pass that starts at `startSec`; null = lifetime.
export function expiryFor(plan, startSec) {
  return plan.days == null ? null : startSec + plan.days * DAY;
}

export function publicPlans() {
  return Object.values(PLANS).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    amount: p.amount,
    price: p.amount / 100,
    currency: CURRENCY,
    days: p.days,
  }));
}
