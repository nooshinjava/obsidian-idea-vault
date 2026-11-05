import { formatIsoDate, pickRandom, slugify } from "@orbitkit/shared";
import type { Idea } from "./settings";
import {
  IDEA_CATEGORIES,
  IDEA_STATUSES,
  RESTING_STATUSES,
  type IdeaCategoryId,
  type IdeaStatusId,
} from "./taxonomy";

export type IdeaFilter = "all" | IdeaStatusId | IdeaCategoryId;

export interface FilterOption {
  id: IdeaFilter;
  label: string;
}

/** Filter chips shown in the sidebar: all, the active statuses, then every category. */
export const FILTER_OPTIONS: readonly FilterOption[] = [
  { id: "all", label: "All" },
  ...IDEA_STATUSES.filter((status) => !RESTING_STATUSES.includes(status.id)).map((status) => ({
    id: status.id,
    label: `${status.icon} ${status.name}`,
  })),
  ...IDEA_CATEGORIES.map((category) => ({ id: category.id, label: `${category.icon} ${category.name}` })),
];

export function matchesFilter(idea: Idea, filter: IdeaFilter): boolean {
  return filter === "all" || idea.status === filter || idea.category === filter;
}

export function matchesQuery(idea: Idea, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    idea.title.toLowerCase().includes(needle) ||
    idea.content.toLowerCase().includes(needle) ||
    idea.tags.some((tag) => tag.toLowerCase().includes(needle))
  );
}

/** Ideas matching the filter and search, newest first. */
export function visibleIdeas(ideas: readonly Idea[], filter: IdeaFilter, query: string): Idea[] {
  return ideas
    .filter((idea) => matchesFilter(idea, filter) && matchesQuery(idea, query))
    .sort((a, b) => b.created.localeCompare(a.created));
}

export function countByStatus(ideas: readonly Idea[]): Record<IdeaStatusId, number> {
  const counts = Object.fromEntries(IDEA_STATUSES.map((status) => [status.id, 0])) as Record<IdeaStatusId, number>;
  for (const idea of ideas) counts[idea.status] += 1;
  return counts;
}

/** A random idea that is still in play, optionally excluding one (for "Another"). */
export function pickRandomIdea(
  ideas: readonly Idea[],
  excludeId?: string,
  random: () => number = Math.random,
): Idea | undefined {
  const candidates = ideas.filter((idea) => !RESTING_STATUSES.includes(idea.status) && idea.id !== excludeId);
  return pickRandom(candidates, random);
}

/** Default note name for a new idea: "YYYY-MM-DD-short-slug". */
export function suggestFileName(title: string, date: Date): string {
  const slug = slugify(title);
  return slug ? `${formatIsoDate(date)}-${slug}` : `${formatIsoDate(date)}-idea`;
}
