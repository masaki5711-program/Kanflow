/** User fields embedded in a project membership (GET /api/projects/:id/members). */
export interface MemberUserDto {
  id: string
  name: string
  email: string
  employeeNumber: string | null
  department: string | null
  avatarUrl?: string | null
}

/** One row of GET /api/projects/:id/members. */
export interface ProjectMemberDto {
  id: string
  userId: string
  role: string
  joinedAt?: string
  user: MemberUserDto
}
