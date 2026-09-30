import { z } from "zod"

export const PROJECT_MEMBER_ROLES = ["po", "sm", "dev"] as const

export const addMemberSchema = z
  .object({
    email: z.string().email().optional(),
    userId: z.string().min(1).optional(),
    userIds: z.array(z.string().min(1)).min(1).max(50).optional(),
    role: z.enum(PROJECT_MEMBER_ROLES),
  })
  .refine((v) => !!v.email || !!v.userId || (!!v.userIds && v.userIds.length > 0), {
    message: "email / userId / userIds のいずれかが必要です",
  })

export const updateMemberSchema = z.object({
  role: z.enum(PROJECT_MEMBER_ROLES),
})

export type AddMemberInput = z.infer<typeof addMemberSchema>
export type MemberRole = (typeof PROJECT_MEMBER_ROLES)[number]
