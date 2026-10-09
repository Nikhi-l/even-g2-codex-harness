import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const evenDisplayState = sqliteTable('even_display_state', {
  ownerId: text('owner_id').primaryKey().notNull(),
  version: integer('version').notNull(),
  body: text('body').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
