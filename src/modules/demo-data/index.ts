// API de servidor. Nenhuma entrada de criacao e exposta como Server Action.
export { getDemoDataSummary, seedDemoData, removeDemoData } from './service';
export type { DemoSummary, DemoOperationResult } from './service';
export { requireDemoTarget, DemoTargetError } from './config';
