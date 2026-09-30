/** User category with its project assignments (GET /api/user/categories). */
export interface CategoryDto {
  id: string
  name: string
  color: string
  sortOrder: number
  assignments: { projectId: string }[]
}
