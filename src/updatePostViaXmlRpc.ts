// src/updatePostViaXmlRpc.ts
import { requestUrl } from "obsidian";

// Build XML for category tags
function buildCategoriesXml(categories: string[]): string {
  if (!categories.length) return "";
  const categoryXml = categories
    .map((cat) => `<value><string>${cat}</string></value>`)
    .join("");
  return `
    <member>
      <name>categories</name>
      <value>
        <array>
          <data>${categoryXml}</data>
        </array>
      </value>
    </member>`;
}

// Build XML for post status
function buildStatusXml(status?: string): string {
  if (!status) return "";
  return `
    <member>
      <name>post_status</name>
      <value><string>${status}</string></value>
    </member>`;
}

// Convert JS Date → XML-RPC datetime string (in UTC)
function formatToXmlRpcDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

// Update existing post via XML-RPC
export async function updatePostViaXmlRpc(
  postId: string,
  username: string,
  apiToken: string,
  title: string,
  content: string,
  date: Date,
  categories: string[],
  status?: string // ← NEW optional parameter
): Promise<void> {
  const basicAuth = btoa(`${username}:${apiToken}`);
  const formattedDate = formatToXmlRpcDate(date);
  const categoriesXml = buildCategoriesXml(categories);
  const statusXml = buildStatusXml(status);

  const xml = `<?xml version="1.0"?>
<methodCall>
  <methodName>microblog.editPost</methodName>
  <params>
    <param><value><string>${postId}</string></value></param>
    <param><value><string>${username}</string></value></param>
    <param><value><string>${apiToken}</string></value></param>
    <param>
      <value>
        <struct>
          <member><name>title</name><value><string>${title}</string></value></member>
          <member><name>description</name><value><string>${content}</string></value></member>
          <member><name>dateCreated</name><value><dateTime.iso8601>${formattedDate}</dateTime.iso8601></value></member>
          ${categoriesXml}
          ${statusXml}
        </struct>
      </value>
    </param>
  </params>
</methodCall>`;

  const response = await requestUrl({
    url: "https://micro.blog/xmlrpc",
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: xml,
  });

  if (!response.text.includes("<boolean>1</boolean>")) {
    throw new Error("❌ Failed to update post via XML-RPC. Response: " + response.text);
  }
}
