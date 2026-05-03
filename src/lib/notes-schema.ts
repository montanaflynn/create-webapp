import * as z from "zod";

export const noteInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(200, "Title must be at most 200 characters."),
  content: z
    .string()
    .max(10000, "Body must be at most 10,000 characters."),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(20, "At most 20 tags."),
});

export type NoteInput = z.infer<typeof noteInputSchema>;
