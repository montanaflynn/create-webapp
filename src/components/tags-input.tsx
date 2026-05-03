"use client";

import * as React from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";

type TagsInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  id?: string;
  "aria-invalid"?: boolean;
};

export function TagsInput({
  value,
  onChange,
  suggestions = [],
  id,
  ...rest
}: TagsInputProps) {
  const anchor = useComboboxAnchor();
  const [inputValue, setInputValue] = React.useState("");

  // Items shown in the dropdown:
  //   - any existing suggestion the user hasn't already added
  //   - the currently-typed value, if it's non-empty and not already a suggestion
  // The typed value being in `items` is what lets the user "create" a new tag —
  // it's just selected like any other option.
  const items = React.useMemo(() => {
    const trimmed = inputValue.trim().toLowerCase();
    const base = suggestions.filter((s) => !value.includes(s));
    if (!trimmed) return base;
    if (base.includes(trimmed)) return base;
    if (value.includes(trimmed)) return base;
    return [trimmed, ...base];
  }, [suggestions, inputValue, value]);

  function handleValueChange(next: string[]) {
    // Normalize: lowercase, trim, dedupe — defensive in case anything slipped past `items`.
    const normalized = Array.from(
      new Set(next.map((t) => t.trim().toLowerCase()).filter(Boolean)),
    );
    onChange(normalized);
    setInputValue("");
  }

  return (
    <Combobox
      multiple
      autoHighlight
      items={items}
      value={value}
      onValueChange={handleValueChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
    >
      <ComboboxChips ref={anchor} aria-invalid={rest["aria-invalid"]}>
        <ComboboxValue>
          {(values: string[]) => (
            <>
              {values.map((v) => (
                <ComboboxChip key={v}>{v}</ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                placeholder={value.length === 0 ? "Add tags…" : ""}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {suggestions.includes(item) ? (
                item
              ) : (
                <>
                  Create{" "}
                  <span className="font-medium text-foreground">
                    &ldquo;{item}&rdquo;
                  </span>
                </>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
