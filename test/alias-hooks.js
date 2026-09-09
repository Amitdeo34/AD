// Resolves the "@/..." alias — which Next understands natively via jsconfig —
// when the route handlers are imported directly by the test runner.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const target = path.join(root, specifier.slice(2));
    const candidates = [target, `${target}.js`, `${target}.jsx`, path.join(target, 'index.js')];
    for (const candidate of candidates) {
      try {
        return await next(pathToFileURL(candidate).href, context);
      } catch {
        // try the next extension
      }
    }
  }
  return next(specifier, context);
}
