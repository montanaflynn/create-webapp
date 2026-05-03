"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { noteInputSchema, type NoteInput } from "@/lib/notes-schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TagsInput } from "@/components/tags-input";

type NoteEditorProps = {
  cardTitle: string;
  cardDescription?: string;
  submitLabel: string;
  initialValues?: NoteInput;
  tagSuggestions?: string[];
  onSubmit: (values: NoteInput) => Promise<{ error?: string } | undefined>;
  /**
   * Where the Cancel button navigates. Defaults to the dashboard list; pass
   * the read view URL when editing an existing note.
   */
  cancelHref?: string;
};

export function NoteEditor({
  cardTitle,
  cardDescription,
  submitLabel,
  initialValues,
  tagSuggestions = [],
  onSubmit,
  cancelHref = "/dashboard",
}: NoteEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<NoteInput>({
    resolver: zodResolver(noteInputSchema),
    defaultValues: initialValues ?? { title: "", content: "", tags: [] },
  });

  function handleSubmit(values: NoteInput) {
    // useTransition keeps `pending` true through the server action AND any
    // subsequent navigation, eliminating the button-state flicker between
    // "Saving…" and the unmount/redirect. The action throws via redirect()
    // on success, so we only see `result` when validation fails.
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
          {cardDescription && (
            <CardDescription>{cardDescription}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Controller
            name="title"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Title</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  placeholder="A short title"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="content"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Body</FieldLabel>
                <Textarea
                  {...field}
                  id={field.name}
                  rows={6}
                  placeholder="Write something…"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="tags"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Tags</FieldLabel>
                <TagsInput
                  id={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  suggestions={tagSuggestions}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  Press Enter or comma to add. Backspace removes the last tag.
                </FieldDescription>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </CardContent>
        <CardFooter className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(cancelHref)}
            disabled={pending}
          >
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
