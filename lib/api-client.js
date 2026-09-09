'use client';

// Browser-side API client. Paths are relative in the browser; the Android shell
// is built with NEXT_PUBLIC_API_BASE pointing at the deployed site.
const BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'ehb.token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private browsing: the session just does not persist */
    }
  },
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, { body, auth = true, signal } = {}) {
  const token = auth ? tokenStore.get() : null;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, payload?.error ?? 'Something went wrong', payload?.details);
  return payload;
}

const qs = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
};

export const api = {
  suggest: (q, signal) => request('GET', `/api/places/search${qs({ q })}`, { signal }),
  properties: (params, signal) => request('GET', `/api/properties${qs(params)}`, { signal }),
  property: (slug, params) => request('GET', `/api/properties/${slug}${qs(params)}`),
  reviews: (slug, params) => request('GET', `/api/properties/${slug}/reviews${qs(params)}`),
  writeReview: (slug, body) => request('POST', `/api/properties/${slug}/reviews`, { body }),

  register: (body) => request('POST', '/api/auth/register', { body, auth: false }),
  login: (body) => request('POST', '/api/auth/login', { body, auth: false }),
  me: () => request('GET', '/api/auth/me'),
  updateMe: (body) => request('PATCH', '/api/auth/me', { body }),

  quote: (body) => request('POST', '/api/bookings/quote', { body }),
  book: (body) => request('POST', '/api/bookings', { body }),
  myBookings: () => request('GET', '/api/bookings'),
  booking: (reference, email) => request('GET', `/api/bookings/${reference}${qs({ email })}`),
  cancelBooking: (reference, email) => request('POST', `/api/bookings/${reference}/cancel`, { body: { email } }),

  paymentConfig: () => request('GET', '/api/payments/config'),
  startUpi: (reference, email) => request('POST', '/api/payments/upi', { body: { reference, email } }),
  submitUtr: (body) => request('POST', '/api/payments/upi/submit', { body }),
  payAtHotel: (reference, email) => request('POST', '/api/payments/pay-at-hotel', { body: { reference, email } }),

  adminPayments: () => request('GET', '/api/admin/payments'),
  verifyPayment: (id, body) => request('POST', `/api/admin/payments/${id}/verify`, { body }),
};
