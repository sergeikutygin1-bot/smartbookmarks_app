import { z } from 'zod'

/**
 * Bookmark form validation schema
 * Matches backend validation rules for consistency
 */
export const bookmarkFormSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters'),

  url: z
    .string()
    .refine(
      (url) => {
        // Allow empty string for untitled bookmarks
        if (!url || url === '') return true

        try {
          const parsed = new URL(url)
          // Only allow http and https protocols
          return ['http:', 'https:'].includes(parsed.protocol)
        } catch {
          return false
        }
      },
      { message: 'Please enter a valid URL starting with http:// or https://' }
    ),

  summary: z
    .string()
    .max(5000, 'Summary must be less than 5000 characters')
    .optional()
    .default(''),

  tags: z
    .array(z.string().min(1).max(50))
    .max(20, 'Maximum 20 tags allowed')
    .default([]),
})

/**
 * Infer TypeScript type from schema
 * Use this type for form data instead of manually defining it
 */
export type BookmarkFormData = z.infer<typeof bookmarkFormSchema>
