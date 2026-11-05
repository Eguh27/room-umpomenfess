import { z } from 'zod';
import { APP_DEFAULTS } from './config';

export const slugSchema = z.string().regex(/^[A-Za-z0-9_-]{12,32}$/);

export const joinRequestSchema = z.object({
  slug: slugSchema,
  // Opsional: hanya room PRIVATE yang butuh password. Kosong/absen -> null
  // (kontrak bagian 7: server kirim null bila kosong).
  password: z
    .string()
    .max(64)
    .optional()
    .transform((value) => (value ? value : null)),
  turnstileToken: z.string().min(1).max(4096),
});
export type JoinRequest = z.infer<typeof joinRequestSchema>;

export const reportReasons = ['SPAM', 'ABUSE', 'ILLEGAL', 'OTHER'] as const;

export const reportRequestSchema = z.object({
  roomId: z.uuid(),
  reason: z.enum(reportReasons),
  turnstileToken: z.string().min(1).max(4096),
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

export const publicRoomsQuerySchema = z.object({
  sort: z.enum(['ACTIVE', 'NEW']).default('ACTIVE'),
  category: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => value || null),
  q: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => value || null),
  // Kursor = slug baris terakhir halaman sebelumnya.
  cursor: slugSchema.optional().transform((value) => value ?? null),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PublicRoomsQuery = z.infer<typeof publicRoomsQuerySchema>;

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(80),
  maxGuests: z.number().int().min(2).max(75),
  approvalRequired: z.boolean(),
  idleTimeoutMinutes: z
    .number()
    .int()
    .min(APP_DEFAULTS.idleTimeoutMinutesMin)
    .max(APP_DEFAULTS.idleTimeoutMinutesMax),
  typingEnabled: z.boolean(),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const messageSchema = z.object({
  content: z.string().trim().min(1).max(APP_DEFAULTS.messageMaxLength),
  clientMsgId: z.uuid(),
});
