import type { Idea } from "../domain/settings";
import type { IdeaChanges, IdeaService } from "../services/idea-service";

/** What the views and modals need from the plugin. Implemented by IdeaVaultPlugin. */
export interface IdeaVaultController {
  readonly service: IdeaService;
  openCapture(): void;
  openEdit(idea: Idea): void;
  showRandomIdea(excludeId?: string): void;
  openIdeaNote(idea: Idea): Promise<void>;
  /** Saves changes and tells the user if the note couldn't be fully updated. */
  updateIdea(id: string, changes: IdeaChanges, successMessage?: string): Promise<void>;
  /** Asks for confirmation, then deletes. Resolves to true when the idea was deleted. */
  deleteIdea(idea: Idea): Promise<boolean>;
  exportIdeas(): Promise<void>;
  openMindfulFocus(): Promise<void>;
}
