import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { rateLimits } from '../db/schema';

export async function consumeRateLimit(
  binding: D1Database,
  key: string,
  limit: number,
  windowSeconds: number,
  now = new Date(),
): Promise<boolean> {
  const db = drizzle(binding);
  const windowMs = windowSeconds * 1000;
  const windowStartedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStartedAt.getTime() + windowMs);
  await db
    .insert(rateLimits)
    .values({ key, windowStartedAt, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStartedAt} = ${windowStartedAt.getTime()} then ${rateLimits.count} + 1 else 1 end`,
        windowStartedAt,
        expiresAt,
      },
    });
  const bucket = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(eq(rateLimits.key, key))
    .get();
  return (bucket?.count ?? limit + 1) <= limit;
}
