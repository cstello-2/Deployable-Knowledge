import { createClient } from '@libsql/client';

const databaseUrl = process.env.DK_DATABASE_URL?.trim() || 'file:app.db';

const tableDefinitions = {
	profiles: `CREATE TABLE "__dk_repair_profiles" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text(255) NOT NULL,
		"provider" text(128) DEFAULT 'ollama' NOT NULL,
		"model" text(128) DEFAULT 'granite4:350m' NOT NULL,
		"max_tokens" integer DEFAULT 1024 NOT NULL,
		"temperature" real DEFAULT 0.2 NOT NULL,
		"top_k" integer DEFAULT 8 NOT NULL,
		"reasoning_budget" integer DEFAULT 512 NOT NULL,
		"retrieval_mode" text DEFAULT 'hybrid' NOT NULL,
		"rag_top_k" integer DEFAULT 5 NOT NULL,
		"agent_max_turns" integer DEFAULT 4 NOT NULL,
		"context_size" integer,
		"gpu_mode" text DEFAULT 'auto' NOT NULL,
		"enabled_tools" text DEFAULT '[]' NOT NULL,
		"prompt_template_id" text,
		"persona" text(1024),
		"created_at" integer,
		"updated_at" integer,
		FOREIGN KEY ("prompt_template_id") REFERENCES "prompt_templates"("id") ON DELETE set null
	)`,
	prompt_templates: `CREATE TABLE "__dk_repair_prompt_templates" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text(255) NOT NULL,
		"description" text(1024) DEFAULT '' NOT NULL,
		"system_prompt" text DEFAULT '' NOT NULL,
		"created_at" integer,
		"updated_at" integer
	)`,
	sessions: `CREATE TABLE "__dk_repair_sessions" (
		"id" text PRIMARY KEY NOT NULL,
		"title" text DEFAULT '' NOT NULL,
		"created_at" integer,
		"updated_at" integer
	)`,
	notebooks: `CREATE TABLE "__dk_repair_notebooks" (
		"id" text PRIMARY KEY NOT NULL,
		"title" text NOT NULL,
		"active_page_id" text,
		"sort_order" integer DEFAULT 0 NOT NULL,
		"created_at" text NOT NULL,
		"updated_at" text NOT NULL
	)`
};

const tableColumns = {
	profiles: [
		'id',
		'name',
		'provider',
		'model',
		'max_tokens',
		'temperature',
		'top_k',
		'reasoning_budget',
		'retrieval_mode',
		'rag_top_k',
		'agent_max_turns',
		'context_size',
		'gpu_mode',
		'enabled_tools',
		'prompt_template_id',
		'persona',
		'created_at',
		'updated_at'
	],
	prompt_templates: ['id', 'name', 'description', 'system_prompt', 'created_at', 'updated_at'],
	sessions: ['id', 'title', 'created_at', 'updated_at'],
	notebooks: ['id', 'title', 'active_page_id', 'sort_order', 'created_at', 'updated_at']
};

const requiredSourceColumns = {
	profiles: ['id', 'name'],
	prompt_templates: ['id', 'name'],
	sessions: ['id'],
	notebooks: ['id', 'title', 'created_at', 'updated_at']
};

const tableIndexes = {
	profiles: ['CREATE INDEX "profiles_updated_idx" ON "profiles" ("updated_at")'],
	prompt_templates: [
		'CREATE INDEX "prompt_templates_updated_idx" ON "prompt_templates" ("updated_at")'
	],
	sessions: ['CREATE INDEX "sessions_updated_idx" ON "sessions" ("updated_at")'],
	notebooks: [
		'CREATE INDEX "notebooks_sort_idx" ON "notebooks" ("sort_order")',
		'CREATE INDEX "notebooks_updated_idx" ON "notebooks" ("updated_at")'
	]
};

function quoteIdentifier(value) {
	return `"${value.replaceAll('"', '""')}"`;
}

async function listTables(executor) {
	const result = await executor.execute(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
	);
	return new Set(result.rows.map((row) => String(row.name)));
}

async function listColumns(executor, table) {
	const result = await executor.execute(`PRAGMA table_info(${quoteIdentifier(table)})`);
	return new Set(result.rows.map((row) => String(row.name)));
}

async function addColumnIfMissing(executor, tables, table, column, definition, changes) {
	if (!tables.has(table)) return;
	const columns = await listColumns(executor, table);
	if (columns.has(column)) return;

	await executor.execute(
		`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column)} ${definition}`
	);
	changes.add(table);
}

async function copyCompatibleRows(executor, source, destination, expectedColumns, requiredColumns) {
	const sourceColumns = await listColumns(executor, source);
	for (const column of requiredColumns) {
		if (!sourceColumns.has(column)) {
			throw new Error(`Cannot repair ${source}: required column ${column} is missing.`);
		}
	}

	const compatibleColumns = expectedColumns.filter((column) => sourceColumns.has(column));
	const columnSql = compatibleColumns.map(quoteIdentifier).join(', ');
	await executor.execute(
		`INSERT OR IGNORE INTO ${quoteIdentifier(destination)} (${columnSql}) ` +
			`SELECT ${columnSql} FROM ${quoteIdentifier(source)}`
	);
}

async function rebuildTable(executor, tables, table, changes) {
	const drizzleTemporaryTable = `__new_${table}`;
	const sources = [table, drizzleTemporaryTable].filter((source) => tables.has(source));
	if (sources.length === 0) return;

	const repairTable = `__dk_repair_${table}`;
	if (tables.has(repairTable)) await executor.execute(`DROP TABLE ${quoteIdentifier(repairTable)}`);
	await executor.execute(tableDefinitions[table]);

	for (const source of sources) {
		await copyCompatibleRows(
			executor,
			source,
			repairTable,
			tableColumns[table],
			requiredSourceColumns[table]
		);
	}
	for (const source of sources) await executor.execute(`DROP TABLE ${quoteIdentifier(source)}`);

	await executor.execute(
		`ALTER TABLE ${quoteIdentifier(repairTable)} RENAME TO ${quoteIdentifier(table)}`
	);
	for (const indexSql of tableIndexes[table]) await executor.execute(indexSql);

	tables.add(table);
	tables.delete(drizzleTemporaryTable);
	changes.add(table);
}

async function shouldRebuild(executor, tables, table) {
	if (tables.has(`__new_${table}`)) return true;
	if (!tables.has(table)) return false;

	const columns = await listColumns(executor, table);
	return columns.has('user_id') || tableColumns[table].some((column) => !columns.has(column));
}

async function ensureAppState(executor, tables, changes) {
	if (!tables.has('app_state')) {
		await executor.execute(`CREATE TABLE "app_state" (
			"id" text PRIMARY KEY DEFAULT 'app' NOT NULL,
			"active_profile_id" text,
			"active_layout_id" text,
			"theme_color" text DEFAULT 'classic' NOT NULL,
			"theme_mode" text DEFAULT 'system' NOT NULL
		)`);
		tables.add('app_state');
		changes.add('app_state');
	}

	await addColumnIfMissing(executor, tables, 'app_state', 'active_profile_id', 'text', changes);
	await addColumnIfMissing(executor, tables, 'app_state', 'active_layout_id', 'text', changes);
	await addColumnIfMissing(
		executor,
		tables,
		'app_state',
		'theme_color',
		"text DEFAULT 'classic' NOT NULL",
		changes
	);
	await addColumnIfMissing(
		executor,
		tables,
		'app_state',
		'theme_mode',
		"text DEFAULT 'system' NOT NULL",
		changes
	);

	if (tables.has('users')) {
		const userColumns = await listColumns(executor, 'users');
		if (userColumns.has('active_profile_id')) {
			await executor.execute(`INSERT INTO "app_state" ("id", "active_profile_id")
				VALUES ('app', (SELECT "active_profile_id" FROM "users"
					WHERE "active_profile_id" IS NOT NULL LIMIT 1))
				ON CONFLICT ("id") DO UPDATE SET "active_profile_id" =
					COALESCE("app_state"."active_profile_id", excluded."active_profile_id")`);
		}
	}
}

async function ensureWorkspaceLayouts(executor, tables, changes) {
	if (tables.has('workspace_layouts')) return;

	await executor.execute(`CREATE TABLE "workspace_layouts" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text(64) NOT NULL,
		"sort_order" integer DEFAULT 0 NOT NULL,
		"snapshot" text NOT NULL,
		"created_at" integer,
		"updated_at" integer
	)`);
	await executor.execute(
		'CREATE INDEX "workspace_layouts_sort_idx" ON "workspace_layouts" ("sort_order")'
	);
	tables.add('workspace_layouts');
	changes.add('workspace_layouts');
}

async function rebuildNotebookState(executor, tables, changes) {
	if (!tables.has('notebook_state')) return;
	const columns = await listColumns(executor, 'notebook_state');
	if (!columns.has('user_id') || columns.has('id')) return;

	await executor.execute(`CREATE TABLE "__dk_repair_notebook_state" (
		"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
		"active_notebook_id" text,
		"updated_at" text NOT NULL
	)`);
	await executor.execute(`INSERT INTO "__dk_repair_notebook_state"
		("id", "active_notebook_id", "updated_at")
		SELECT 'default', "active_notebook_id", "updated_at" FROM "notebook_state"
		ORDER BY CASE WHEN "user_id" = 'default' THEN 0 ELSE 1 END LIMIT 1`);
	await executor.execute('DROP TABLE "notebook_state"');
	await executor.execute('ALTER TABLE "__dk_repair_notebook_state" RENAME TO "notebook_state"');
	changes.add('notebook_state');
}

async function repairDatabase(client) {
	const initialTables = await listTables(client);
	const applicationTables = [
		'profiles',
		'prompt_templates',
		'sessions',
		'notebooks',
		'documents',
		'users',
		'user_sessions'
	];
	if (!applicationTables.some((table) => initialTables.has(table))) return [];

	await client.execute('PRAGMA foreign_keys = OFF');
	const transaction = await client.transaction('write');
	const changes = new Set();

	try {
		const tables = await listTables(transaction);
		await ensureAppState(transaction, tables, changes);
		await ensureWorkspaceLayouts(transaction, tables, changes);

		await addColumnIfMissing(
			transaction,
			tables,
			'documents',
			'origin',
			"text DEFAULT 'FILE' NOT NULL",
			changes
		);
		await addColumnIfMissing(
			transaction,
			tables,
			'documents',
			'active',
			'integer DEFAULT true NOT NULL',
			changes
		);
		await addColumnIfMissing(
			transaction,
			tables,
			'notebook_pages',
			'sort_order',
			'integer DEFAULT 0 NOT NULL',
			changes
		);
		await addColumnIfMissing(transaction, tables, 'session_messages', 'metadata', 'text', changes);
		await addColumnIfMissing(
			transaction,
			tables,
			'document_chunks',
			'start_ms',
			'integer',
			changes
		);
		await addColumnIfMissing(transaction, tables, 'document_chunks', 'end_ms', 'integer', changes);

		for (const table of ['prompt_templates', 'profiles', 'sessions', 'notebooks']) {
			if (await shouldRebuild(transaction, tables, table)) {
				await rebuildTable(transaction, tables, table, changes);
			}
		}
		await rebuildNotebookState(transaction, tables, changes);

		for (const obsoleteTable of ['user_sessions', 'users']) {
			if (!tables.has(obsoleteTable)) continue;
			await transaction.execute(`DROP TABLE ${quoteIdentifier(obsoleteTable)}`);
			changes.add(obsoleteTable);
		}

		const violations = await transaction.execute('PRAGMA foreign_key_check');
		if (violations.rows.length > 0) {
			throw new Error('The repaired database failed its foreign-key integrity check.');
		}

		await transaction.commit();
		return [...changes].sort();
	} catch (error) {
		await transaction.rollback();
		throw error;
	} finally {
		transaction.close();
		await client.execute('PRAGMA foreign_keys = ON');
	}
}

const client = createClient({ url: databaseUrl });

try {
	const repairedTables = await repairDatabase(client);
	if (repairedTables.length > 0) {
		console.log(`Repaired legacy database schema: ${repairedTables.join(', ')}`);
	}
} finally {
	client.close();
}
