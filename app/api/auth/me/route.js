import { handle, json, body, requireUser, publicUser } from '@/lib/http';
import { unauthorized, notFound } from '@/lib/errors';
import { hashPassword, verifyPassword } from '@/lib/passwords';
import { str, phone as parsePhone, password as parsePassword } from '@/lib/validate';
import { findUserById, updateUser } from '@/lib/store';

export const GET = handle(async (request) => json({ user: requireUser(request) }));

export const PATCH = handle(async (request) => {
  const session = requireUser(request);
  const current = findUserById(session.id);
  if (!current) throw notFound('Account no longer exists');
  const input = await body(request);

  const changes = {
    name: input.name === undefined ? current.name : str(input.name, 'Name', { min: 2, max: 80 }),
    phone: input.phone === undefined ? current.phone : parsePhone(input.phone),
  };

  if (input.newPassword !== undefined) {
    const newPassword = parsePassword(input.newPassword, 'New password');
    const currentPassword = str(input.currentPassword, 'Current password', { max: 128 });
    if (!verifyPassword(currentPassword, current.passwordHash)) {
      throw unauthorized('Your current password is not correct');
    }
    changes.passwordHash = hashPassword(newPassword);
  }

  return json({ user: publicUser(updateUser(current.id, changes)) });
});
