import { PluginSettingTab, Setting, type App, type Plugin, type SettingDefinitionItem } from "obsidian";
import { isSafeVaultPath } from "@orbitkit/shared";
import { countByStatus } from "../domain/ideas";
import { DEFAULT_IDEAS_FOLDER } from "../domain/settings";
import { IDEA_STATUSES } from "../domain/taxonomy";
import type { IdeaService } from "../services/idea-service";

const FOLDER_NAME = "Ideas folder";
const FOLDER_DESC = "Where idea notes and exports are saved, relative to the vault root.";
const OPEN_NAME = "Open note after capture";
const OPEN_DESC = "Open the new idea's note right after quick capture.";

function folderProblem(value: string): string | undefined {
  return value.trim() === "" || isSafeVaultPath(value)
    ? undefined
    : "Please choose a folder inside this vault (no \"..\" and no hidden folders).";
}

export class IdeaVaultSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly service: IdeaService,
    private readonly save: () => Promise<void>,
  ) {
    super(app, plugin);
  }

  /** Obsidian 1.13+ renders these and includes them in settings search. */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: FOLDER_NAME,
        desc: FOLDER_DESC,
        control: { type: "folder", key: "ideasFolderPath", placeholder: DEFAULT_IDEAS_FOLDER, validate: folderProblem },
      },
      { name: OPEN_NAME, desc: OPEN_DESC, control: { type: "toggle", key: "openAfterCapture" } },
      {
        type: "group",
        heading: "Statistics",
        items: [{ name: "Your ideas", searchable: false, render: (setting) => { setting.setDesc(this.summary()); } }],
      },
    ];
  }

  override getControlValue(key: string): unknown {
    const { settings } = this.service;
    if (key === "ideasFolderPath") return settings.ideasFolderPath;
    if (key === "openAfterCapture") return settings.openAfterCapture;
    return undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    const { settings } = this.service;
    if (key === "ideasFolderPath" && typeof value === "string") settings.ideasFolderPath = value;
    else if (key === "openAfterCapture" && typeof value === "boolean") settings.openAfterCapture = value;
    else return;
    await this.save();
  }

  /** Settings screen for Obsidian versions before 1.13. */
  override display(): void {
    const { containerEl, service } = this;
    containerEl.empty();

    const folderSetting = new Setting(containerEl).setName(FOLDER_NAME).setDesc(FOLDER_DESC);
    const warning = containerEl.createDiv({ cls: "orbitkit-field-hint mod-warning" });
    folderSetting.addText((text) =>
      text
        .setPlaceholder(DEFAULT_IDEAS_FOLDER)
        .setValue(service.settings.ideasFolderPath)
        .onChange(async (value) => {
          const problem = folderProblem(value);
          warning.setText(problem ?? "");
          if (problem) return;
          service.settings.ideasFolderPath = value;
          await this.save();
        }),
    );

    new Setting(containerEl)
      .setName(OPEN_NAME)
      .setDesc(OPEN_DESC)
      .addToggle((toggle) =>
        toggle.setValue(service.settings.openAfterCapture).onChange(async (value) => {
          service.settings.openAfterCapture = value;
          await this.save();
        }),
      );

    new Setting(containerEl).setName("Statistics").setHeading();
    new Setting(containerEl).setName("Your ideas").setDesc(this.summary());
  }

  private summary(): string {
    const counts = countByStatus(this.service.ideas);
    const parts = IDEA_STATUSES.map((status) => `${counts[status.id]} ${status.name.toLowerCase()}`);
    return `${this.service.ideas.length} in total: ${parts.join(", ")}.`;
  }
}
