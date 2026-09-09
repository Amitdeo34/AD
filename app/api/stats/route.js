import { catalogue } from '@/lib/catalogue';
import { handle, json } from '@/lib/http';

export const GET = handle(async () => json(catalogue().stats));
