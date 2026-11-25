import { z } from "zod";

export const sendTestEmailSchema = z.object({
  email: z.email().trim(),
});

export type SendTestEmailInput = z.infer<typeof sendTestEmailSchema>;
