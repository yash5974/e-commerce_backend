import { z } from "zod";

export const revenueAnalyticsSchema = z
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

export const topProductsAnalyticsSchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .refine(
    ({ from, to }) => {
      if (!from || !to) return true;
      return new Date(from) <= new Date(to);
    },
    {
      path: ["from"],
      message: "from must be less than or equal to to",
    },
  );
