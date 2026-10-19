import { adminQuery } from './database';
export async function countOpenTimers(userId: string): Promise<number> {
  return Number((await adminQuery<{ count: string }>('select count(*)::text as count from ems.time_entries where user_id=$1 and ended_at is null', [userId]))[0].count);
}
