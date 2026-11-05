import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import { isSafeVaultPath } from "@orbitkit/shared";
import { countByStatus } from "../domain/ideas";
import { DEFAULT_IDEAS_FOLDER } from "../domain/settings";
import { IDEA_STATUSES } from "../domain/taxonomy";
import type { IdeaService } from "../services/idea-service";

export class IdeaVaultSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly service: IdeaService,
    private readonly save: () => Promise<void>,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl, service } = this;
    containerEl.empty();

    const folderSetting = new Setting(containerEl)
      .setName("Ideas folder")
      .setDesc("Where idea notes and exports are saved, relative to the vault root.");
    const warning = containerEl.createDiv({ cls: "orbitkit-field-hint mod-warning" });
    const showWarning = (value: string) => {
      const valid = value.trim() === "" || isSafeVaultPath(value);
      warning.setText(valid ? "" : `That path can't be used, so "${DEFAULT_IDEAS_FOLDER}" will be used instead.`);
    };
    folderSetting.addText((text) =>
      text
        .setPlaceholder(DEFAULT_IDEAS_FOLDER)
        .setValue(service.settings.ideasFolderPath)
        .onChange(async (value) => {
          service.settings.ideasFolderPath = value;
          showWarning(value);
          await this.save();
        }),
    );
    showWarning(service.settings.ideasFolderPath);

    new Setting(containerEl)
      .setName("Open note after capture")
      .setDesc("Open the new idea's note right after Quick capture.")
      .addToggle((toggle) =>
        toggle.setValue(service.settings.openAfterCapture).onChange(async (value) => {
          service.settings.openAfterCapture = value;
          await this.save();
        }),
      );

    new Setting(containerEl).setName("Statistics").setHeading();
    const counts = countByStatus(service.ideas);
    const list = containerEl.createEl("ul");
    list.createEl("li", { text: `Total ideas: ${service.ideas.length}` });
    for (const status of IDEA_STATUSES) list.createEl("li", { text: `${status.name}: ${counts[status.id]}` });
  }
}
