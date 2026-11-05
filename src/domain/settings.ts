import {
  createId,
  isMarkdownPath,
  isRecord,
  isSafeVaultPath,
  normalizeVaultPath,
  parseTags,
  readBoolean,
  readEnum,
  readIsoTimestamp,
  readString,
  readStringArray,
} from "@orbitkit/shared";
import {
  CATEGORY_IDS,
  DEFAULT_CATEGORY,
  DEFAULT_STATUS,
  STATUS_IDS,
  type IdeaCategoryId,
  type IdeaStatusId,
} from "./taxonomy";

export const SCHEMA_VERSION = 2;
export const DEFAULT_IDEAS_FOLDER = "Idea Vault";

export interface Idea {
  id: string;
  title: string;
  content: string;
  category: IdeaCategoryId;
  status: IdeaStatusId;
  tags: string[];
  /** ISO timestamps. */
  created: string;
  updated: string;
  /** Vault path of the idea's note, or null when it has none. */
  filePath: string | null;
}

export interface IdeaVaultSettings {
  schemaVersion: typeof SCHEMA_VERSION;
  ideasFolderPath: string;
  /** Open the new note after Quick capture. */
  openAfterCapture: boolean;
  ideas: Idea[];
}

export function defaultSettings(): IdeaVaultSettings {
  return { schemaVersion: SCHEMA_VERSION, ideasFolderPath: DEFAULT_IDEAS_FOLDER, openAfterCapture: true, ideas: [] };
}

function readNotePath(value: unknown): string | null {
  const path = normalizeVaultPath(readString(value));
  return path && isSafeVaultPath(path) && isMarkdownPath(path) ? path : null;
}

function migrateIdea(raw: unknown, fallbackTime: string): Idea | null {
  if (!isRecord(raw)) return null;
  const title = readString(raw.title).trim();
  if (!title) return null;
  const created = readIsoTimestamp(raw.created, fallbackTime);
  return {
    id: readString(raw.id).trim() || createId(),
    title,
    content: readString(raw.content),
    category: readEnum(raw.category, CATEGORY_IDS, DEFAULT_CATEGORY),
    status: readEnum(raw.status, STATUS_IDS, DEFAULT_STATUS),
    tags: parseTags(readStringArray(raw.tags)),
    created,
    updated: readIsoTimestamp(raw.updated, created),
    filePath: readNotePath(raw.filePath),
  };
}

/**
 * Turns whatever is in data.json (v1, v2, hand-edited or corrupt) into valid
 * v2 settings. Never throws. v1 stored copies of the categories and statuses;
 * those are now constants and are dropped.
 */
export function migrateSettings(raw: unknown, now: Date = new Date()): IdeaVaultSettings {
  const data = isRecord(raw) ? raw : {};
  const settings = defaultSettings();
  settings.ideasFolderPath = readString(data.ideasFolderPath, DEFAULT_IDEAS_FOLDER);
  settings.openAfterCapture = readBoolean(data.openAfterCapture, true);

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const rawIdeas: unknown[] = Array.isArray(data.ideas) ? data.ideas : [];
  for (const rawIdea of rawIdeas) {
    const idea = migrateIdea(rawIdea, now.toISOString());
    if (!idea) continue;
    if (seenIds.has(idea.id)) idea.id = createId();
    seenIds.add(idea.id);
    // Version 1 could point two ideas at the same note; only the first keeps the link,
    // so editing or deleting one idea can never touch another idea's note.
    if (idea.filePath) {
      const key = idea.filePath.toLowerCase();
      if (seenPaths.has(key)) idea.filePath = null;
      else seenPaths.add(key);
    }
    settings.ideas.push(idea);
  }
  return settings;
}
