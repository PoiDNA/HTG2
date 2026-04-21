import { z } from "zod";

export const sessionKindSchema = z.enum(["live", "recorded"]);
export const sessionStatusSchema = z.enum([
  "scheduled",
  "live",
  "ended",
  "published",
]);

export const sessionSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  coverUrl: z.string().url().nullable(),
  durationSec: z.number().int().nonnegative().nullable(),
  kind: sessionKindSchema,
  status: sessionStatusSchema,
  startsAt: z.string().datetime().nullable(),
  publishedAt: z.string().datetime().nullable(),
  isEntitled: z.boolean(),
  locale: z.string(),
});

export const playbackUrlSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().datetime(),
  mediaVersion: z.number().int().nonnegative(),
  mimeType: z.enum(["application/vnd.apple.mpegurl", "audio/mpeg"]),
});

export const savePositionSchema = z.object({
  positionSec: z.number().nonnegative().max(60 * 60 * 24),
});

export const liveRoomTokenSchema = z.object({
  wsUrl: z.string().url(),
  token: z.string().min(10),
  roomId: z.string(),
  identity: z.string(),
  expiresAt: z.string().datetime(),
});
