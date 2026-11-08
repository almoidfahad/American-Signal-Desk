import { z } from "zod";

/**
 * Auth input schemas. Shared by the client form (instant feedback) and the server
 * (authoritative validation). Client-side validation is UX; the server always re-validates.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(3, "Enter your email address.")
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.")
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(200, "That password is too long.")
  // Length beats composition rules, but reject the obvious worst offenders.
  .refine((v) => !/^(password|123456|qwerty|letmein)/i.test(v), {
    message: "Choose a password that is not easily guessed.",
  });

export const loginSchema = z.object({
  email: emailSchema,
  // Sign-in must not leak password policy; only presence is checked here.
  password: z.string().min(1, "Enter your password.").max(200),
});

export const newsletterSchema = z.object({
  email: emailSchema,
  source: z.string().max(120).optional(),
  // Honeypot: real users never fill this hidden field.
  company: z.string().max(0, "Submission rejected.").optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type NewsletterInput = z.infer<typeof newsletterSchema>;
