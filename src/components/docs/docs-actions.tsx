"use client";

import * as React from "react";
import Link from "next/link";
import {
  BotIcon,
  CheckIcon,
  ClipboardIcon,
  CodeIcon,
  ExternalLinkIcon,
  FileTextIcon,
  TerminalIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AgentCommand = {
  label: string;
  value: string;
};

type DocsActionsProps = {
  markdown: string;
  markdownHref: string;
  repoUrl: string;
  agentPrompt: string;
  commands: AgentCommand[];
};

type CopyState = "idle" | "markdown" | "prompt" | string;

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function DocsActions({
  markdown,
  markdownHref,
  repoUrl,
  agentPrompt,
  commands,
}: DocsActionsProps) {
  const [copied, setCopied] = React.useState<CopyState>("idle");

  const onCopy = React.useCallback(async (key: CopyState, value: string) => {
    await copyText(value);
    setCopied(key);
    window.setTimeout(() => setCopied("idle"), 1800);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={markdownHref}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <FileTextIcon data-icon="inline-start" />
        Open .md
      </Link>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onCopy("markdown", markdown)}
      >
        {copied === "markdown" ? (
          <CheckIcon data-icon="inline-start" />
        ) : (
          <ClipboardIcon data-icon="inline-start" />
        )}
        Copy .md
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onCopy("prompt", agentPrompt)}
      >
        {copied === "prompt" ? (
          <CheckIcon data-icon="inline-start" />
        ) : (
          <BotIcon data-icon="inline-start" />
        )}
        Copy prompt
      </Button>
      {commands.map((command) => (
        <Button
          key={command.label}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onCopy(command.label, command.value)}
        >
          {copied === command.label ? (
            <CheckIcon data-icon="inline-start" />
          ) : (
            <TerminalIcon data-icon="inline-start" />
          )}
          {command.label}
        </Button>
      ))}
      <a
        href={repoUrl}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        target="_blank"
        rel="noreferrer"
      >
        <CodeIcon data-icon="inline-start" />
        GitHub
        <ExternalLinkIcon data-icon="inline-end" />
      </a>
    </div>
  );
}
