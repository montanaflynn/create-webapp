"use client";

import * as React from "react";
import { CheckIcon, ClipboardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyCurlButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <ClipboardIcon data-icon="inline-start" />
      )}
      Copy curl
    </Button>
  );
}
