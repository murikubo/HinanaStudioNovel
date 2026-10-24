export type Publication = { id: string; title: string; url: string; updatedAt: string };
import type { Project, Chapter } from '../shared/core.mjs';
declare global {
  interface Window { novel?: {
    hinanaPublish(raw: string, description: string): Promise<Publication|null>; hinanaCancel(): Promise<void>; hinanaReopen(): Promise<void>; hinanaOpen(id?: string): Promise<void>;
    ready(): Promise<void>; recover(): Promise<Project|null>; autosave(raw: string): Promise<void>; resetPath(): Promise<void>;
    open(): Promise<{project: Project; path: string}|null>; save(raw: string, saveAs?: boolean): Promise<string|null>;
    importText(): Promise<Chapter[]|null>; font(): Promise<NonNullable<Project['customFont']>|null>; export(raw: string): Promise<string|null>;
    confirmUnsaved(): Promise<number>; close(): Promise<void>; onClose(callback: () => void): () => void; onCommand(callback: (command: string) => void): () => void;
  } }
}
export {};
