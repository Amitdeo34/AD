import { handle, json, body, currentUser, requireUser } from '@/lib/http';
import { holdBooking, shapeBooking, parseStay } from '@/lib/bookings';
import { str, int, email as parseEmail, phone as parsePhone } from '@/lib/validate';
import { bookingsForUser } from '@/lib/store';

export const POST = handle(async (request) => {
  const input = await body(request);
  const user = currentUser(request);

  const booking = holdBooking({
    roomTypeId: int(input.roomTypeId, 'roomTypeId', { min: 1 }),
    rooms: int(input.rooms, 'rooms', { min: 1, max: 10, fallback: 1 }),
    guests: int(input.guests, 'guests', { min: 1, max: 40, fallback: 2 }),
    guestName: str(input.guestName, 'Guest name', { min: 2, max: 80 }),
    email: parseEmail(input.email),
    phone: parsePhone(input.phone),
    specialRequests: input.specialRequests ? str(input.specialRequests, 'Special requests', { max: 500 }) : null,
    userId: user?.id ?? null,
    ...parseStay(input, { required: true }),
  });

  return json({ booking: shapeBooking(booking) }, { status: 201 });
});

/** The signed-in guest's own bookings, newest stay first. */
export const GET = handle(async (request) => {
  const user = requireUser(request);
  const bookings = bookingsForUser(user.id)
    .slice()
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
    .map(shapeBooking);
  return json({ bookings });
});
