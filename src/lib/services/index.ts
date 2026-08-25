/**
 * Stateless protocol layer.
 *
 * Services own HTTP and streaming I/O without reactive state or user-facing side effects. Stores
 * consume services, own business behavior and errors, and expose state to components.
 */
export { ChatService } from './chat.service';
export { DocumentsService } from './documents.service';
export { LocalModelsService } from './local-models.service';
export { NotebooksService } from './notebooks.service';
export { ProfilesService } from './profiles.service';
export { PromptTemplatesService } from './prompt-templates.service';
export { ProvidersService } from './providers.service';
export { SearchService } from './search.service';
export { SetupService } from './setup.service';
export { ThemeService } from './theme.service';
export { ToolsService } from './tools.service';
export { WorkspaceLayoutsService } from './workspace-layouts.service';
export { DiagnosticsService } from './diagnostics.service';
