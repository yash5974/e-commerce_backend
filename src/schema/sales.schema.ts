import { z } from "zod";

export const salesAnalyticsSchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .refine(
    ({ from, to }) => {
      if (!from || !to) return true;
      return new Date(from) <= new Date(to);
    },
    {
      message: "from must be less than or equal to to",
      path: ["from"],
    },
  );
