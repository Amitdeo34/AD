import { HttpError, unauthorized, forbidden } from './errors.js';
import { verifyToken } from './tokens.js';
import { findUserById } from './store.js';

export const json = (body, init = {}) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...(init.headers ?? {}) } });

/** Wraps a route handler so thrown HttpErrors become clean JSON responses. */
export function handle(fn) {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error(err);
      return json(
        {
          error: status >= 500 ? 'Something went wrong on our side' : err.message,
          ...(err.details ? { details: err.details } : {}),
        },
        { status },
      );
    }
  };
}

/** The signed-in user, or null. Never throws on a bad token. */
export function currentUser(request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return publicUser(findUserById(verifyToken(header.slice(7)).sub));
  } catch {
    return null;
  }
}

export function requireUser(request) {
  const user = currentUser(request);
  if (!user) throw unauthorized();
  return user;
}

export function requireAdmin(request) {
  const user = requireUser(request);
  if (user.role !== 'ADMIN') throw forbidden('That area is for staff accounts');
  return user;
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

export async function body(request) {
  try {
    return (await request.json()) ?? {};
  } catch {
    return {};
  }
}

export const searchParams = (request) => new URL(request.url).searchParams;
