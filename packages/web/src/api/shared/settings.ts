import { eq } from "drizzle-orm";
import { db } from "../database";
import { crewSettings } from "../database/schema";

export async function getSetting<T>(key: string): Promise<T | null> {
  const [r] = await db.select().from(crewSettings).where(eq(crewSettings.key, key)).limit(1);
  return (r?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown, by: string | null) {
  await db
    .insert(crewSettings)
    .values({ key, value, updated_by: by, updated_at: new Date() })
    .onConflictDoUpdate({ target: crewSettings.key, set: { value, updated_by: by, updated_at: new Date() } });
}
