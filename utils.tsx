import React from "react";
import { Text } from "ink";
import { highlight } from "cli-highlight";
import { convert } from "html-to-text";
import open from "open";
import { DB } from "./db.ts";

// Sort columns type
export type SortColumn = "id" | "date" | "score" | "views" | "answers";
export type SortDirection = "asc" | "desc";

// Content line interface
export interface ContentLine {
  text: string;
  type:
    | "text"
    | "code"
    | "title"
    | "header"
    | "url"
    | "separator"
    | "comment"
    | "link"
    | "erwin_header"
    | "erwin_text"
    | "erwin_code"
    | "erwin_link";
  linkQuestionId?: number; // For SO question links
  linkUrl?: string; // For external links
  inDb?: boolean; // Pre-computed database existence check
}

// Format Unix timestamp to date string
export function formatDate(timestamp: number): string {
  if (!timestamp) return "N/A";
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

// Format number with K/M suffix
export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

// Open URL in browser without freezing the TUI
export function openInBrowser(url: string): void {
  open(url, { wait: false });
}

// Syntax highlight code (tries to auto-detect language, defaults to sql)
export function highlightCode(code: string, lang?: string): string {
  try {
    return highlight(code, { language: lang || "sql", ignoreIllegals: true });
  } catch {
    try {
      return highlight(code, { ignoreIllegals: true });
    } catch {
      return code;
    }
  }
}

// Check if author is Erwin Brandstetter
export function isErwin(authorName: string): boolean {
  return authorName.toLowerCase().includes("erwin");
}

// Highlight Erwin Brandstetter's name in magenta wherever it appears
export function highlightErwinName(text: string): React.ReactNode {
  const regex = /(Erwin Brandstetter)/gi;
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    regex.test(part) ? (
      <Text key={i} color="magentaBright" bold>
        {part}
      </Text>
    ) : (
      <Text key={i}>{part}</Text>
    ),
  );
}

// Extract SO question IDs from URLs
export function extractSoQuestionId(url: string): number | null {
  const match = url.match(/stackoverflow\.com\/(?:questions|q)\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Convert HTML to formatted plain text, returns array of lines with metadata
export function htmlToLines(
  html: string,
  width: number,
  db: DB,
): ContentLine[] {
  const lines: ContentLine[] = [];

  // Extract SO question links before processing
  const soLinks: { questionId: number; text: string; url: string }[] = [];
  const processedHtmlWithLinks = html.replace(
    /<a[^>]*href="([^"]*stackoverflow\.com\/(?:questions|q)\/(\d+)[^"]*)"[^>]*>([^<]+)<\/a>/gi,
    (_, url, id, text) => {
      const questionId = parseInt(id, 10);
      soLinks.push({
        questionId,
        text,
        url: url.startsWith("http") ? url : `https://${url}`,
      });
      return `__SO_LINK_${soLinks.length - 1}__`;
    },
  );

  // Extract code blocks first and replace with placeholders
  const codeBlocks: string[] = [];
  let processedHtml = processedHtmlWithLinks.replace(
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    (_, code) => {
      // Decode HTML entities in code
      const decoded = code
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      codeBlocks.push(decoded);
      return `\n__CODE_BLOCK_${codeBlocks.length - 1}__\n`;
    },
  );

  // Convert remaining HTML to text
  const text = convert(processedHtml, {
    wordwrap: width,
    preserveNewlines: false,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "img", format: "skip" },
      { selector: "code", format: "inlineCode" },
      { selector: "ul", options: { itemPrefix: "  • " } },
      { selector: "ol", options: { itemPrefix: " " } },
    ],
    formatters: {
      inlineCode: (elem, walk, builder) => {
        builder.addInline("`");
        walk(elem.children, builder);
        builder.addInline("`");
      },
    },
  });

  // Process lines and expand code block and link placeholders
  for (const line of text.split("\n")) {
    const codeMatch = line.match(/__CODE_BLOCK_(\d+)__/);
    if (codeMatch) {
      const codeIndex = parseInt(codeMatch[1], 10);
      const code = codeBlocks[codeIndex];
      // Add highlighted code lines
      const highlighted = highlightCode(code.trim());
      for (const codeLine of highlighted.split("\n")) {
        lines.push({ text: "    " + codeLine, type: "code" });
      }
    } else {
      // Check for SO link placeholders and replace with link-type lines
      let processedLine = line;
      const linkMatches = [...line.matchAll(/__SO_LINK_(\d+)__/g)];

      if (linkMatches.length > 0) {
        // Replace placeholders with link text and create line with link metadata
        for (const linkMatch of linkMatches) {
          const linkIndex = parseInt(linkMatch[1], 10);
          const link = soLinks[linkIndex];
          processedLine = processedLine.replace(linkMatch[0], `[${link.text}]`);
        }
        // Use the first link's data for this line (simplification)
        const firstLinkIndex = parseInt(linkMatches[0][1], 10);
        const firstLink = soLinks[firstLinkIndex];
        lines.push({
          text: processedLine,
          type: "link",
          linkQuestionId: firstLink.questionId,
          linkUrl: firstLink.url,
          inDb: db.questionExists(firstLink.questionId), // Pre-compute database lookup
        });
      } else {
        lines.push({ text: processedLine, type: "text" });
      }
    }
  }

  return lines;
}

// Scrollbar indicator
export function getScrollIndicator(
  current: number,
  total: number,
  visible: number,
): string {
  if (total <= visible) return "";
  const percentage = Math.round((current / Math.max(1, total - visible)) * 100);
  return `${percentage}%`;
}
