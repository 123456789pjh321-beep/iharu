import { z } from "zod";
const child = z.object({
  id: z.uuid(),
  nickname: z.string(),
  version: z.number(),
  canManage: z.boolean(),
  locationConsent: z.boolean(),
  managed: z.boolean(),
  deviceCount: z.number(),
});
export const householdStatusSchema = z.object({
  families: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      owner: z.boolean(),
      version: z.number(),
      children: z.array(child),
    }),
  ),
  pending: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type HouseholdStatus = z.infer<typeof householdStatusSchema>;
