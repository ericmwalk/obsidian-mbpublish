// src/PostPublisher.ts
import { App, TFile, requestUrl, Vault, Notice } from "obsidian";
import matter from "gray-matter";
import yaml from "js-yaml"; // Only needed if you use it directly elsewhere
import { Buffer } from "buffer";

// Patch for mobile where Buffer may not be defined (iOS/Android WebView)
if (typeof window !== "undefined" && typeof (window as any).Buffer === "undefined") {
  (window as any).Buffer = Buffer;
}

import { updatePostViaXmlRpc } from "updatePostViaXmlRpc";
import { normalizeFrontmatterDate, toUtcIsoString, toLocalDateString } from "./dateUtils";

export interface PublishResult {
  url: string;
  postId: string;
}

export class PostPublisher {
  private app: App;
  private apiToken: string;
  private username: string;
  private destination?: string;
  private updateStatus: (msg: string) => void;

  constructor(app: App, apiToken: string, username: string, updateStatus: (msg: string) => void, destination?: string) {
    this.app = app;
    this.apiToken = apiToken;
    this.username = username;
    this.destination = destination;
    this.updateStatus = updateStatus;
  }

  async publish(file: TFile, vault: Vault): Promise<PublishResult> {
    const rawContent = await vault.read(file);

    // ✅ Basic status validation before parsing more deeply
      const { data: fmCheck } = matter(rawContent);
      const statusLine = (fmCheck.status || "").toString().toLowerCase();
      if (statusLine !== "published") {
        new Notice("Not publishing: 'status: published' missing from frontmatter.");
        throw new Error("Frontmatter missing 'status: published'");
      }

    // 🛡️ Use custom YAML engine to prevent auto-conversion of date strings to Date objects
    const { data: frontmatterRaw, content: body } = matter(rawContent, {
      engines: {
        yaml: {
          parse: (src: string) => yaml.load(src, { schema: yaml.JSON_SCHEMA }) as any,
        }
      }
    });

    const frontmatter: Record<string, any> = { ...frontmatterRaw };

    const title = typeof frontmatter.title === "string" ? frontmatter.title : "";
    const status = frontmatter.status ?? "published";
    const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags ?? []];
    const postId = frontmatter.microblog_id ?? null;

    const rawDate = frontmatter.date;
    const localDate = normalizeFrontmatterDate(rawDate);
    const utcISOString = toUtcIsoString(localDate);

    // --- Build Micropub Payload ---
    const payload: Record<string, any> = {
      h: "entry",
      content: body.trim(),
      "post-status": status,
      published: utcISOString
    };

    if (title) payload.name = title;
    if (tags.length) payload.category = tags;
    if (this.destination) payload["mp-destination"] = this.destination;

    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (Array.isArray(value)) {
        for (const item of value) form.append(key, item);
      } else {
        form.append(key, value);
      }
    }

    // --- Debug ---
    console.log("📝 frontmatter.date (raw):", frontmatter.date);
    console.log("🕓 parsed localDate:", localDate.toString());
    console.log("🌐 sent UTC ISO:", utcISOString);

    this.updateStatus(postId ? "Updating Micro.blog post..." : "Publishing new post to Micro.blog...");

    if (postId) {
      console.log("🛠 Updating via XML-RPC with date:", localDate.toString());
      await updatePostViaXmlRpc(
        postId,
        this.username,
        this.apiToken,
        title,
        body.trim(),
        localDate, // ← this is local, not UTC
        tags,
        status
      );
      return { url: `https://micro.blog/posts/${postId}`, postId };
    } else {
      const res = await requestUrl({
        url: "https://micro.blog/micropub",
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: form.toString()
      });

      const json = res.json;
      const newPostId = json?.edit?.split("/").pop();
      const postUrl = json?.url ?? res.headers["location"] ?? "";

      if (!newPostId) throw new Error("Could not determine post ID from Micro.blog response");

      const updatedFrontmatter = {
        ...frontmatter,
        microblog_id: newPostId,
        url: postUrl,
        title,
        date: toLocalDateString(localDate)
      };

      const updated = matter.stringify(body, updatedFrontmatter);
      await vault.modify(file, updated);

      return { url: postUrl, postId: newPostId };
    }
  }
}
