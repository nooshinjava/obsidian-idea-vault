/** Fixed idea categories and statuses. Ids are stored in data.json and note frontmatter. */

export const IDEA_CATEGORIES = [
  { id: "research", name: "Research", icon: "🔬", description: "Paper ideas, hypotheses, analysis approaches" },
  { id: "project", name: "Project", icon: "💼", description: "Improvements to current projects" },
  { id: "creative", name: "Creative", icon: "🎨", description: "Art, writing, personal expression" },
  { id: "thought", name: "Thought", icon: "💭", description: "Reflections, observations, insights" },
  { id: "connection", name: "Connection", icon: "🔗", description: "Links between papers or concepts" },
] as const;

export const IDEA_STATUSES = [
  { id: "new", name: "New", icon: "💫" },
  { id: "developing", name: "Developing", icon: "🌱" },
  { id: "hot", name: "Hot", icon: "🔥" },
  { id: "implemented", name: "Implemented", icon: "✅" },
  { id: "archived", name: "Archived", icon: "📦" },
] as const;

export type IdeaCategoryId = (typeof IDEA_CATEGORIES)[number]["id"];
export type IdeaStatusId = (typeof IDEA_STATUSES)[number]["id"];

export const CATEGORY_IDS: readonly IdeaCategoryId[] = IDEA_CATEGORIES.map((category) => category.id);
export const STATUS_IDS: readonly IdeaStatusId[] = IDEA_STATUSES.map((status) => status.id);

export const DEFAULT_CATEGORY: IdeaCategoryId = "thought";
export const DEFAULT_STATUS: IdeaStatusId = "new";

/** Statuses that "Random idea" skips because the idea is finished. */
export const RESTING_STATUSES: readonly IdeaStatusId[] = ["implemented", "archived"];

/** Order of status groups in the Markdown export. */
export const EXPORT_STATUS_ORDER: readonly IdeaStatusId[] = ["hot", "developing", "new", "implemented", "archived"];

export function categoryOf(id: IdeaCategoryId): (typeof IDEA_CATEGORIES)[number] {
  return IDEA_CATEGORIES.find((category) => category.id === id) ?? IDEA_CATEGORIES[3];
}

export function statusOf(id: IdeaStatusId): (typeof IDEA_STATUSES)[number] {
  return IDEA_STATUSES.find((status) => status.id === id) ?? IDEA_STATUSES[0];
}
