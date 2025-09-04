import { Plugin, Notice, TFile } from "obsidian";
import { MicroblogPluginSettings, DEFAULT_SETTINGS, MicroblogSettingTab } from "./settings";
import { PhotoUploader } from "./PhotoUploader";
import { UploadStatusModal } from "./UploadStatusModal";
import { PostPublisher } from "./PostPublisher";

export default class MicroblogPlugin extends Plugin {
  settings: MicroblogPluginSettings;

  async onload() {
    console.log("Loading Micro.blog plugin...");

    await this.loadSettings();
    this.addSettingTab(new MicroblogSettingTab(this.app, this));

    // 📷 Ribbon Icon – Upload Images
    this.addRibbonIcon("camera", "Upload Images to Micro.blog", async () => {
      const file = this.app.workspace.getActiveFile();
      if (!file) {
        new Notice("No active file to upload.");
        return;
      }

      const content = await this.app.vault.read(file);
      const statusModal = new UploadStatusModal(this.app);
      statusModal.open();

      const uploader = new PhotoUploader(
        this.app,
        this.settings.apiToken,
        (status: string) => statusModal.setStatus(status),
        {
          currentFile: file,
          deleteLocal: this.settings.deleteAfterUpload,
          useGpt: this.settings.useGpt,
          gptApiKey: this.settings.gptApiKey,
          destination: this.settings.selectedBlog
        }
      );

      try {
        const { updatedContent, uploads } = await uploader.uploadAllFromMarkdown(content, this.app.vault);
        await this.app.vault.modify(file, updatedContent);
        new Notice(`Uploaded ${uploads.length} image(s) to Micro.blog.`);
      } catch (err) {
        console.error(err);
        new Notice("Image upload failed.");
      } finally {
        statusModal.close();
      }
    });

    // 🗺️ Ribbon Icon – Publish Post
    this.addRibbonIcon("map-pin", "Publish Post to Micro.blog", async () => {
      const file = this.app.workspace.getActiveFile();
      if (!file) {
        new Notice("No active file to publish.");
        return;
      }

      const statusModal = new UploadStatusModal(this.app);
      statusModal.open();

      const postPublisher = new PostPublisher(
        this.app,
        this.settings.apiToken,
        this.settings.username,
        (status: string) => statusModal.setStatus(status),
        this.settings.selectedBlog
      );

      try {
        await postPublisher.publish(file, this.app.vault);
        new Notice("Post published to Micro.blog.");
      } catch (err) {
        console.error(err);
        new Notice("Failed to publish post.");
      } finally {
        statusModal.close();
      }
    });

    // 🎛️ Command – Upload Images
    this.addCommand({
      id: "upload-images-to-microblog",
      name: "Upload Images to Micro.blog",
      editorCallback: async (editor, view) => {
        const file = view.file;
        if (!file) {
          new Notice("No file is open.");
          return;
        }

        const content = await this.app.vault.read(file);
        const statusModal = new UploadStatusModal(this.app);
        statusModal.open();

        const uploader = new PhotoUploader(
          this.app,
          this.settings.apiToken,
          (status: string) => statusModal.setStatus(status),
          {
            currentFile: file,
            deleteLocal: this.settings.deleteAfterUpload,
            useGpt: this.settings.useGpt,
            gptApiKey: this.settings.gptApiKey,
            destination: this.settings.selectedBlog
          }
        );

        try {
          const { updatedContent, uploads } = await uploader.uploadAllFromMarkdown(content, this.app.vault);
          await this.app.vault.modify(file, updatedContent);
          new Notice(`Uploaded ${uploads.length} image(s) to Micro.blog.`);
        } catch (err) {
          console.error(err);
          new Notice("Image upload failed.");
        } finally {
          statusModal.close();
        }
      }
    });

    // 🎛️ Command – Publish Post
    this.addCommand({
      id: "publish-post-to-microblog",
      name: "Publish Post to Micro.blog",
      editorCallback: async (_, view) => {
        const file = view.file;
        if (!file) {
          new Notice("No file is open.");
          return;
        }

        const statusModal = new UploadStatusModal(this.app);
        statusModal.open();

        const postPublisher = new PostPublisher(
          this.app,
          this.settings.apiToken,
          this.settings.username,
          (status: string) => statusModal.setStatus(status),
          this.settings.selectedBlog
        );

        try {
          await postPublisher.publish(file, this.app.vault);
          new Notice("Post published to Micro.blog.");
        } catch (err) {
          console.error(err);
          new Notice("Failed to publish post.");
        } finally {
          statusModal.close();
        }
      }
    });
  }

  onunload() {
    console.log("Unloading Micro.blog plugin");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  updateStatus(message: string) {
    console.log("Status:", message);
  }
}
