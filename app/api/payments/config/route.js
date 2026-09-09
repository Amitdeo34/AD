import { handle, json } from '@/lib/http';
import { paymentConfig } from '@/lib/upi';

export const GET = handle(async () => json(paymentConfig()));
