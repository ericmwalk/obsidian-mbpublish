import { App, Vault, TFile, requestUrl } from "obsidian";

export interface PhotoUploadResult {
  original: string;
  uploadedUrl: string;
  altText: string;
}

export class PhotoUploader {
  private app: App;
  private apiToken: string;
  private useGpt: boolean;  
  private gptApiKey?: string;
  private deleteLocal: boolean;
  private updateStatus: (msg: string) => void;
  private currentFile?: TFile;
  private destination?: string;

  constructor(
    app: App,
    apiToken: string,
    updateStatus: (msg: string) => void,
    options?: {
      useGpt?: boolean;
      gptApiKey?: string;
      deleteLocal?: boolean;
      currentFile?: TFile;
      destination?: string;
    }
  ) {
    this.app = app;
    this.apiToken = apiToken;
    this.useGpt = options?.useGpt ?? false;
    this.gptApiKey = options?.gptApiKey;
    this.deleteLocal = options?.deleteLocal ?? false;
    this.updateStatus = updateStatus;
    this.currentFile = options?.currentFile;
    this.destination = options?.destination;
  }

  async uploadAllFromMarkdown(content: string, vault: Vault): Promise<{ updatedContent: string; uploads: PhotoUploadResult[] }> {
    const imageLinks = this.extractImageLinks(content);
    const uploads: PhotoUploadResult[] = [];
    let updatedContent = content;

    for (let i = 0; i < imageLinks.length; i++) {
      const link = imageLinks[i];
      this.updateStatus(`Uploading image ${i + 1} of ${imageLinks.length}...`);

      const file = this.resolveFileFromLink(link);
      if (!file) {
        console.warn(`Image not found: ${link}`);
        continue;
      }

      const arrayBuffer = await vault.readBinary(file);
      const blob = new Blob([arrayBuffer]);

      const uploadedUrl = await this.uploadToMicroblog(blob, file.name);

      let altText = this.generateFallbackAltText(file.name);
      if (this.useGpt && this.gptApiKey) {
        this.updateStatus(`Generating alt text for ${file.name}...`);
        try {
          altText = await this.generateAltText(uploadedUrl);
        } catch (e) {
          console.warn("GPT alt text generation failed, using fallback.", e);
        }
      }

      const markdownImage = `![${altText}](${uploadedUrl})`;
      updatedContent = updatedContent.replace(`![[${link}]]`, markdownImage);

      if (this.deleteLocal) {
        await vault.trash(file, true);
      }

      uploads.push({ original: link, uploadedUrl, altText });
    }

    return { updatedContent, uploads };
  }

  private extractImageLinks(content: string): string[] {
    const matches = [...content.matchAll(/!\[\[([^\]]+)\]\]/g)];
    return matches.map(match => match[1].split(/[#|]/)[0]); // Remove subpath or alias
  }

  private resolveFileFromLink(link: string): TFile | null {
    const cleanLink = link.split(/[#|]/)[0];
    const sourcePath = this.currentFile?.path ?? "";
    return this.app.metadataCache.getFirstLinkpathDest(cleanLink, sourcePath);
  }

  private generateFallbackAltText(filename: string): string {
    return filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
  }

  private async generateAltText(imageUrl: string): Promise<string> {
    const res = await requestUrl({
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.gptApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Write a short, descriptive alt text for the image. Keep it concise and relevant." },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 60
      })
    });

    const altText = res.json.choices?.[0]?.message?.content?.trim();
    return altText?.length ? altText : this.generateFallbackAltText(imageUrl);
  }

  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split(".").pop();
    switch (ext) {
      case "png": return "image/png";
      case "gif": return "image/gif";
      case "webp": return "image/webp";
      case "jpg":
      case "jpeg": return "image/jpeg";
      default: return "application/octet-stream";
    }
  }

  private async uploadToMicroblog(blob: Blob, filename: string): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    const mimeType = this.getMimeType(filename);

    const boundary = "----ObsidianMicroblogBoundary" + crypto.randomUUID().replace(/-/g, "");
    
    const pre = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const post = `\r\n--${boundary}--\r\n`;

    const preBytes = new TextEncoder().encode(pre);
    const postBytes = new TextEncoder().encode(post);
    const fileBytes = new Uint8Array(arrayBuffer);

    const combined = new Uint8Array(preBytes.length + fileBytes.length + postBytes.length);
    combined.set(preBytes, 0);
    combined.set(fileBytes, preBytes.length);
    combined.set(postBytes, preBytes.length + fileBytes.length);

    console.log("Uploading to Micro.blog destination:", this.destination);

    const res = await requestUrl({
      url: "https://micro.blog/micropub/media",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: combined.buffer
    });

    const location = res.headers["Location"] || res.headers["location"];
    if (!location) throw new Error("No image URL returned from Micro.blog.");
    return location;
  }
}
