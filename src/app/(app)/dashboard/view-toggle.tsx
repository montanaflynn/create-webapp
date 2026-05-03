"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGridIcon, Rows3Icon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type NotesView = "card" | "table";

export function ViewToggle({ value }: { value: NotesView }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(next: string[]) {
    // base-ui's ToggleGroup uses an array even when behaviorally exclusive.
    // Pick the value that *isn't* the current one (the just-clicked option),
    // or fall back to the first entry. Empty array = user clicked the active
    // button to deselect; ignore so one option is always selected.
    const picked = next.find((v) => v !== value) ?? next[0];
    if (picked !== "card" && picked !== "table") return;

    const params = new URLSearchParams(searchParams);
    if (picked === "card") params.delete("view");
    else params.set("view", picked);
    const qs = params.toString();
    router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
  }

  return (
    <ToggleGroup
      size="sm"
      value={[value]}
      onValueChange={handleChange}
      aria-label="Notes view"
    >
      <ToggleGroupItem value="card" aria-label="Card view">
        <LayoutGridIcon className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="table" aria-label="Table view">
        <Rows3Icon className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
