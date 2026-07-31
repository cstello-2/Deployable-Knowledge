import { json } from '@sveltejs/kit';

import { toolRegistry } from '$lib/server/tools';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json(toolRegistry.catalog());
