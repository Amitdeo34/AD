import { handle, json, body } from '@/lib/http';
import { quoteStay, parseStay } from '@/lib/bookings';
import { int } from '@/lib/validate';

export const POST = handle(async (request) => {
  const input = await body(request);
  return json(quoteStay({
    roomTypeId: int(input.roomTypeId, 'roomTypeId', { min: 1 }),
    rooms: int(input.rooms, 'rooms', { min: 1, max: 10, fallback: 1 }),
    guests: int(input.guests, 'guests', { min: 1, max: 40, fallback: 2 }),
    ...parseStay(input, { required: true }),
  }));
});
