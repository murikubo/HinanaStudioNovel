export type Settings = { font: 'serif'|'sans'|'mono'|'custom'; fontSize: number; lineHeight: number; letterSpacing: number; width: number; padding: number; theme: 'paper'|'sepia'|'night'; writing: 'horizontal'|'vertical'; reading: 'scroll'|'pages'; spread: 'auto'|'single'|'double'; align: 'left'|'justify'; indent: boolean };
export type Chapter = { id: string; title: string; text: string };
export type Project = { format: 'hinana-novel'; version: 1; id: string; description: string; title: string; author: string; chapters: Chapter[]; settings: Settings; customFont: { name: string; data: string } | null };
export const fonts: Record<Settings['font'], string>;
export const themes: Record<Settings['theme'], { bg: string; fg: string; muted: string; line: string }>;
export function createProject(sample?: boolean): Project;
export function parseProject(raw: string): Project;
export function escapeHTML(value: unknown): string;
export function readerHTML(project: Project, chapterId?: string): string;

export function readerPolicy(): string;
