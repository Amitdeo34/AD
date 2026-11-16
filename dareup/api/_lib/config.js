// Server configuration, read from environment variables on every call so tests
// (and Vercel env changes) take effect without reloading modules.
// Files in api/_lib are shared code, not routes (Vercel skips names that start with "_").

// Internal identifier written into Razorpay order notes. Keep it stable even if
// the display name changes: verify/restore only accept orders carrying it, so a
// Razorpay account shared with another app never hands out passes for that app.
export const APP_ID = 'dareup';

// Display name returned to the client (the game uses its own APP_NAME config).
export function appName() {
  return String(process.env.APP_NAME || 'DareUp').slice(0, 40);
}

// DEMO_MODE only counts when it is explicitly "1" or "true".
export function isDemoMode() {
  const v = String(process.env.DEMO_MODE || '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

export function razorpayKeys() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  return keyId && keySecret ? { keyId, keySecret } : null;
}

export const MIN_PASS_SECRET_LENGTH = 32;

// Returns the signing secret, or null when it is missing or too short.
export function passSecret() {
  const s = String(process.env.PASS_SECRET || '');
  return s.length >= MIN_PASS_SECRET_LENGTH ? s : null;
}

export function nowSec() {
  return Math.floor(Date.now() / 1000);
}
