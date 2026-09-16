import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const systemMetadata = sqliteTable('system_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
