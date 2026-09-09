import { badRequest } from './errors.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{9}$/;

export function str(value, field, { min = 1, max = 200, required = true } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  const out = String(value).trim();
  if (out.length < min) throw badRequest(`${field} must be at least ${min} characters`);
  if (out.length > max) throw badRequest(`${field} must be at most ${max} characters`);
  return out;
}

export function int(value, field, { min = -Infinity, max = Infinity, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw badRequest(`${field} is required`);
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw badRequest(`${field} must be a whole number`);
  if (n < min || n > max) throw badRequest(`${field} must be between ${min} and ${max}`);
  return n;
}

export function date(value, field, { required = true } = {}) {
  if (!value) {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  const out = String(value).trim();
  if (!DATE_RE.test(out)) throw badRequest(`${field} must be a date in YYYY-MM-DD form`);
  const parsed = new Date(`${out}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== out) {
    throw badRequest(`${field} is not a real date`);
  }
  return out;
}

export function email(value, field = 'Email') {
  const out = str(value, field, { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(out)) throw badRequest(`${field} does not look like an email address`);
  return out;
}

export function phone(value, field = 'Phone number') {
  const out = str(value, field, { max: 20 });
  if (!PHONE_RE.test(out.replace(/[\s-]/g, '').replace(/^(\+91)/, '+91'))) {
    throw badRequest(`${field} must be a 10-digit Indian mobile number`);
  }
  return out;
}

export function password(value, field = 'Password') {
  const out = str(value, field, { min: 8, max: 128 });
  if (!/[A-Za-z]/.test(out) || !/\d/.test(out)) {
    throw badRequest(`${field} must contain at least one letter and one number`);
  }
  return out;
}

export function oneOf(value, field, allowed, { fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw badRequest(`${field} is required`);
  }
  const out = String(value);
  if (!allowed.includes(out)) throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  return out;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
