import { handle, json, body, publicUser } from '@/lib/http';
import { unauthorized } from '@/lib/errors';
import { verifyPassword } from '@/lib/passwords';
import { signToken } from '@/lib/tokens';
import { str, email as parseEmail } from '@/lib/validate';
import { findUserByEmail } from '@/lib/store';

export const POST = handle(async (request) => {
  const input = await body(request);
  const email = parseEmail(input.email);
  const password = str(input.password, 'Password', { max: 128 });

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw unauthorized('That email and password do not match');
  }
  return json({ token: signToken({ sub: user.id }), user: publicUser(user) });
});
