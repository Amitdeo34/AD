import { handle, json, body, publicUser } from '@/lib/http';
import { conflict } from '@/lib/errors';
import { hashPassword } from '@/lib/passwords';
import { signToken } from '@/lib/tokens';
import { str, email as parseEmail, phone as parsePhone, password as parsePassword } from '@/lib/validate';
import { createUser, findUserByEmail, bookingsForEmail, updateBooking } from '@/lib/store';

export const POST = handle(async (request) => {
  const input = await body(request);
  const name = str(input.name, 'Name', { min: 2, max: 80 });
  const email = parseEmail(input.email);
  const phone = parsePhone(input.phone);
  const password = parsePassword(input.password);

  if (findUserByEmail(email)) {
    throw conflict('An account with this email already exists — sign in instead');
  }
  const user = createUser({ name, email, phone, passwordHash: hashPassword(password) });

  // Bookings made as a guest with this email now belong to the new account.
  for (const booking of bookingsForEmail(email)) {
    if (booking.userId == null) updateBooking(booking.reference, { userId: user.id });
  }

  return json({ token: signToken({ sub: user.id }), user: publicUser(user) }, { status: 201 });
});
