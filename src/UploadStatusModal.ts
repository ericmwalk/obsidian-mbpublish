// src/ui/UploadStatusModal.ts
import { App, Modal } from "obsidian";

export class UploadStatusModal extends Modal {
  private statusEl: HTMLElement;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "📤 Uploading to Micro.blog…" });
    this.statusEl = contentEl.createEl("p", { text: "Initializing..." });
  }

  setStatus(message: string) {
    if (this.statusEl) {
      this.statusEl.setText(message);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
