import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.875em] text-foreground"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      const label = match[2] ?? "";
      const href = match[3] ?? "";
      const external = /^https?:\/\//.test(href);
      nodes.push(
        external ? (
          <a
            key={key}
            href={href}
            className="font-medium underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
          >
            {label}
          </a>
        ) : (
          <Link
            key={key}
            href={href}
            className="font-medium underline underline-offset-4"
          >
            {label}
          </Link>
        ),
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return nodes;
}

function fenceClass(language: string) {
  return cn(
    "overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-sm leading-relaxed",
    language && "before:mb-3 before:block before:text-xs before:font-medium before:text-muted-foreground before:content-[attr(data-language)]",
  );
}

export function MarkdownRenderer({
  markdown,
  skipFirstHeading,
}: {
  markdown: string;
  skipFirstHeading?: boolean;
}) {
  const lines = markdown.trim().split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  let skippedFirstHeading = false;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index]?.startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }

      blocks.push(
        <pre
          key={`code-${index}`}
          data-language={language}
          className={fenceClass(language)}
        >
          <code>{code.join("\n")}</code>
        </pre>,
      );
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];

      if (skipFirstHeading && !skippedFirstHeading && level === 1) {
        skippedFirstHeading = true;
        index += 1;
        continue;
      }

      const id = slugify(text);
      const className =
        level === 1
          ? "text-4xl font-semibold tracking-tight text-balance"
          : level === 2
            ? "mt-10 scroll-m-20 text-2xl font-semibold tracking-tight"
            : "mt-8 scroll-m-20 text-xl font-semibold tracking-tight";
      const content = renderInline(text);

      blocks.push(
        React.createElement(
          `h${level}`,
          { key: `${level}-${id}-${index}`, id, className },
          content,
        ),
      );
      index += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index]?.startsWith("- ")) {
        items.push((lines[index] ?? "").slice(2));
        index += 1;
      }
      blocks.push(
        <ul
          key={`ul-${index}`}
          className="my-5 ml-5 flex list-disc flex-col gap-2 leading-7"
        >
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol
          key={`ol-${index}`}
          className="my-5 ml-5 flex list-decimal flex-col gap-2 leading-7"
        >
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index]?.startsWith("> ")) {
        quote.push((lines[index] ?? "").slice(2));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${index}`}
          className="my-6 border-l-2 pl-4 text-muted-foreground"
        >
          {quote.map((part, quoteIndex) => (
            <p key={`${part}-${quoteIndex}`}>{renderInline(part)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;

    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !lines[index]?.startsWith("#") &&
      !lines[index]?.startsWith("- ") &&
      !/^\d+\.\s+/.test(lines[index] ?? "") &&
      !lines[index]?.startsWith("> ") &&
      !lines[index]?.startsWith("```")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }

    blocks.push(
      <p key={`p-${index}`} className="leading-7 text-muted-foreground">
        {renderInline(paragraph.join(" "))}
      </p>,
    );
  }

  return <div className="flex flex-col gap-4">{blocks}</div>;
}
