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
