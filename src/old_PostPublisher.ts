// src/PostPublisher.ts
import { App, TFile, requestUrl, Vault, normalizePath } from "obsidian";
import matter from "gray-matter";

export interface PublishResult {
  url: string;
  postId: string;
}

export class PostPublisher {
  private app: App;
  private apiToken: string;
  private destination?: string;
  private updateStatus: (msg: string) => void;

  constructor(app: App, apiToken: string, updateStatus: (msg: string) => void, destination?: string) {
    this.app = app;
    this.apiToken = apiToken;
    this.destination = destination;
    this.updateStatus = updateStatus;
  }

async publish(file: TFile, vault: Vault): Promise<PublishResult> {
  const rawContent = await vault.read(file);
  const { data: frontmatter, content: body } = matter(rawContent);

  const title = frontmatter.title ?? "";
  const status = frontmatter.status ?? "published";
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags ?? []];
  const postId = frontmatter.microblog_post_id ?? null;
  const date = frontmatter.date ? new Date(frontmatter.date) : null;

  const payload: Record<string, any> = {
    h: "entry",
    content: body.trim(),
    "post-status": status,
  };

  if (title) payload.name = title;
  if (tags.length) payload.category = tags;
  if (date && !isNaN(date.getTime())) {
    payload.published = date.toISOString();
  }
  if (this.destination) payload["mp-destination"] = this.destination;

  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, item);
    } else {
      form.append(key, value);
    }
  }

  this.updateStatus(postId ? "Updating Micro.blog post..." : "Publishing new post to Micro.blog...");

  if (postId) {
    // PATCH to update existing post
    await requestUrl({
      url: `https://micro.blog/posts/${postId}`,
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });

    const postUrl = `https://micro.blog/posts/${postId}`;
    return { url: postUrl, postId };
  } else {
    // POST to create new post
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

    // Save microblog_post_id into frontmatter
    const updatedFrontmatter = { ...frontmatter, microblog_post_id: newPostId };
    const updated = matter.stringify(body, updatedFrontmatter);
    await vault.modify(file, updated);

    return { url: postUrl, postId: newPostId };
  }
}


}
