import { requestUrl, App, PluginSettingTab, Setting, Notice } from "obsidian";
import MicroblogPlugin from "./main";

export interface MicroblogPluginSettings {
  apiToken: string;
  username: string; 
  selectedBlog: string;
  categories: string;
  deleteAfterUpload: boolean;
  useGpt: boolean;
  gptApiKey?: string;
}


export const DEFAULT_SETTINGS: MicroblogPluginSettings = {
  apiToken: "",
  username: "", 
  selectedBlog: "",
  categories: "",
  deleteAfterUpload: false,
  useGpt: false,
  gptApiKey: "",
};


export class MicroblogSettingTab extends PluginSettingTab {
  plugin: MicroblogPlugin;

  constructor(app: App, plugin: MicroblogPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Micro.blog Settings" });

    // Blog Selection
    new Setting(containerEl)
      .setName("Micro.blog Blog")
      .setDesc("Select the blog to use for publishing. ⚠️ Images always upload to your default Micro.blog site, which you can change at https://micro.blog/account.")
      .addDropdown(async (dropdown) => {
        const res = await requestUrl({
          url: "https://micro.blog/micropub?q=config",
          method: "GET",
          headers: { Authorization: `Bearer ${this.plugin.settings.apiToken}` },
        });

        const destinations = res.json.destination;
        destinations.forEach((dest: any) => {
          dropdown.addOption(dest.uid, dest.name);
        });

        dropdown.setValue(this.plugin.settings.selectedBlog);
        dropdown.onChange(async (value) => {
          this.plugin.settings.selectedBlog = value;
          await this.plugin.saveSettings();
        });
      });

    // Categories
    new Setting(containerEl)
      .setName("Categories")
      .setDesc("Default list of categories for new posts.")
      .addText(text =>
        text
          .setPlaceholder("category1, category2")
          .setValue(this.plugin.settings.categories)
          .onChange(async (value) => {
            this.plugin.settings.categories = value;
            await this.plugin.saveSettings();
          })
      );

    // Delete images after upload
    new Setting(containerEl)
      .setName("Delete images after upload")
      .setDesc("Removes local image file after uploading to Micro.blog.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.deleteAfterUpload)
          .onChange(async (value) => {
            this.plugin.settings.deleteAfterUpload = value;
            await this.plugin.saveSettings();
          })
      );

    // GPT Alt Text Toggle
    new Setting(containerEl)
      .setName("Use GPT for alt text")
      .setDesc("Generate AI-based alt text for uploaded images.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.useGpt)
          .onChange(async (value) => {
            this.plugin.settings.useGpt = value;
            await this.plugin.saveSettings();
            this.display(); // Re-render to show/hide GPT key field
          })
      );

    // GPT API Key (conditionally shown)
    if (this.plugin.settings.useGpt) {
      new Setting(containerEl)
        .setName("ChatGPT API Key")
        .setDesc("Used to generate AI-based alt text for uploaded images.")
        .addText(text =>
          text
            .setPlaceholder("sk-...")
            .setValue(this.plugin.settings.gptApiKey || "")
            .onChange(async (value) => {
              this.plugin.settings.gptApiKey = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // API Token
    new Setting(containerEl)
      .setName("Micro.blog API Token")
      .setDesc("Used to publish posts and fetch your username.")
      .addText(text =>
        text
          .setPlaceholder("Your Micro.blog API token")
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            this.plugin.settings.apiToken = value;

            // Attempt to fetch the username silently
            try {
              const res = await requestUrl({
                url: "https://micro.blog/account",
                method: "GET",
                headers: { Authorization: `Bearer ${value}` }
              });

              const username = res.json.username;
              if (username) {
                this.plugin.settings.username = username;
                new Notice(`Fetched Micro.blog username: ${username}`);
              }
            } catch (err) {
              console.warn("Failed to fetch Micro.blog username:", err);
            }

            await this.plugin.saveSettings();
            this.display(); // Re-render to show username
          })
      );

    // ✅ Username display (read-only)
    new Setting(containerEl)
      .setName("Micro.blog Username")
      .setDesc("Detected from your API token. Used for XML-RPC updates.")
      .addText(text =>
        text
          .setValue(this.plugin.settings.username || "")
          .setDisabled(true)
      );
  }
}
