import {
  formatLongDate,
  replaceExactLine,
  replaceOwnedSection,
  serializeFrontmatter,
  singleLine,
  stripMarkdownExtension,
  transformHeader,
  type FrontmatterValue,
} from "@orbitkit/shared";
import type { Idea } from "./settings";
import { categoryOf, EXPORT_STATUS_ORDER, statusOf } from "./taxonomy";

export const IDEA_HEADING = "## 💭 Idea";
export const NOTES_HEADING = "## 📝 Notes";
/** Frontmatter key that ties a note to its idea. */
export const ID_KEY = "idea-id";
/** Frontmatter marker of export notes; only notes carrying it are ever replaced by an export. */
export const EXPORT_MARKER = "idea-vault-export";

const EMPTY_DETAILS = "_No details yet._";
/** Placeholder written by version 1. */
const LEGACY_EMPTY_DETAILS = "*No details added yet.*";

/** Frontmatter fields the plugin owns. Other keys the user adds are never touched. */
export function ideaFrontmatter(idea: Idea): Record<string, FrontmatterValue> {
  return {
    title: idea.title,
    category: idea.category,
    status: idea.status,
    tags: idea.tags,
    created: idea.created,
    updated: idea.updated,
    [ID_KEY]: idea.id,
  };
}

/**
 * The owned fields that differ between two versions of an idea (plus `updated`
 * and the id). Unchanged fields aren't written, so a status change can't undo
 * tags or a title the user edited directly in the note.
 */
export function changedFrontmatter(before: Idea, after: Idea): Record<string, FrontmatterValue> {
  const previous = ideaFrontmatter(before);
  const fields: Record<string, FrontmatterValue> = {};
  for (const [key, value] of Object.entries(ideaFrontmatter(after))) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(value)) fields[key] = value;
  }
  fields.updated = after.updated;
  fields[ID_KEY] = after.id;
  return fields;
}

function titleLine(idea: Idea): string {
  return `# ${categoryOf(idea.category).icon} ${singleLine(idea.title)}`;
}

function detailsBody(idea: Idea): string {
  return idea.content.trim() || EMPTY_DETAILS;
}

export function buildIdeaNote(idea: Idea): string {
  return [
    serializeFrontmatter(ideaFrontmatter(idea)).trimEnd(),
    "",
    titleLine(idea),
    "",
    IDEA_HEADING,
    "",
    detailsBody(idea),
    "",
    NOTES_HEADING,
    "",
    "",
  ].join("\n");
}

/** Version 1 notes repeated the metadata as bold lines under the title; keep those in sync. */
function updateLegacyMetadataLines(header: string, idea: Idea): string {
  const category = categoryOf(idea.category);
  const status = statusOf(idea.status);
  const tags = idea.tags.map((tag) => `#${tag}`).join(", ");
  return header
    .replace(/^\*\*Category:\*\* .*$/m, () => `**Category:** ${category.icon} ${category.name}`)
    .replace(/^\*\*Status:\*\* .*$/m, () => `**Status:** ${status.icon} ${status.name}`)
    .replace(/^\*\*Tags:\*\* .*$/m, () => (tags ? `**Tags:** ${tags}` : "**Tags:** —"));
}

export interface NoteUpdate {
  content: string;
  /** True when a part the plugin wanted to change had been edited by the user and was kept. */
  keptEdits: boolean;
}

/**
 * Brings the note body in line with an edited idea. The title line and the
 * "Idea" section are only rewritten when they still contain exactly what the
 * plugin wrote for the previous version; anything the user edited is kept.
 */
export function syncIdeaNote(content: string, before: Idea, after: Idea): NoteUpdate {
  let next = content;
  let keptEdits = false;

  const oldTitle = titleLine(before);
  const newTitle = titleLine(after);
  if (oldTitle !== newTitle) {
    let replaced = false;
    next = transformHeader(next, (header) => {
      const result = replaceExactLine(header, [oldTitle], newTitle);
      replaced = result !== null;
      return result ?? header;
    });
    if (!replaced) keptEdits = true;
  }

  const oldBody = detailsBody(before);
  const newBody = detailsBody(after);
  if (oldBody !== newBody) {
    const previous = before.content.trim() ? [oldBody] : [oldBody, LEGACY_EMPTY_DETAILS];
    const replaced = replaceOwnedSection(next, IDEA_HEADING, previous, newBody);
    if (replaced === null) keptEdits = true;
    else next = replaced;
  }

  const metadataChanged =
    before.category !== after.category || before.status !== after.status || before.tags.join() !== after.tags.join();
  if (metadataChanged) next = transformHeader(next, (header) => updateLegacyMetadataLines(header, after));

  return { content: next, keptEdits };
}

/** A Markdown digest of all ideas grouped by status. */
export function buildExport(ideas: readonly Idea[], now: Date): string {
  const lines = [
    serializeFrontmatter({ [EXPORT_MARKER]: true }).trimEnd(),
    "",
    "# 💡 Idea Vault export",
    "",
    `_Generated ${formatLongDate(now)}. This file is replaced on every export._`,
    "",
  ];
  for (const statusId of EXPORT_STATUS_ORDER) {
    const group = ideas.filter((idea) => idea.status === statusId);
    if (group.length === 0) continue;
    const status = statusOf(statusId);
    lines.push(`## ${status.icon} ${status.name} (${group.length})`, "");
    for (const idea of group) {
      lines.push(`### ${categoryOf(idea.category).icon} ${singleLine(idea.title)}`, "");
      if (idea.content.trim()) lines.push(idea.content.trim(), "");
      const meta = [`Created ${new Date(idea.created).toLocaleDateString()}`];
      if (idea.tags.length > 0) meta.push(idea.tags.map((tag) => `#${tag}`).join(" "));
      if (idea.filePath) meta.push(`[[${stripMarkdownExtension(idea.filePath)}|Open note]]`);
      lines.push(`_${meta.join(" · ")}_`, "");
    }
  }
  if (ideas.length === 0) lines.push("_No ideas yet._", "");
  return lines.join("\n");
}
