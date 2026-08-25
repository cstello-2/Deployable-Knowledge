import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DK_DATABASE_URL?.trim() || 'file:app.db';

export default defineConfig({
	schema: './src/lib/server/database/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: {
		url: databaseUrl
	},
	tablesFilter: ['!chunk_fts', '!chunk_fts_*']
});
