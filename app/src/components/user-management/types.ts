import type { SectionRefDto } from "@/types/api"

export type UserRole = "admin" | "section_manager" | "member"

export type SectionRef = SectionRefDto

export interface ManagedUser {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  employeeNumber: string | null
  department: string | null
  _count: { memberships: number }
  sections: SectionRef[]
}

/** Shared create/edit form shape (`password` only used on create). */
export interface UserFormValues {
  name: string
  email: string
  password: string
  role: UserRole
  employeeNumber: string
  department: string
  sectionIds: string[]
}

export const EMPTY_USER_FORM: UserFormValues = {
  name: "",
  email: "",
  password: "",
  role: "member",
  employeeNumber: "",
  department: "",
  sectionIds: [],
}

export { MIN_PASSWORD_LENGTH } from "@/services/users/users.schemas"
export const DEPARTMENT_LIST_ID = "kf-department-list"

export function toUserRole(role: string): UserRole {
  return role === "admin" || role === "section_manager" || role === "member" ? role : "member"
}

export function formFromUser(user: ManagedUser): UserFormValues {
  return {
    name: user.name,
    email: user.email,
    password: "",
    role: toUserRole(user.role),
    employeeNumber: user.employeeNumber ?? "",
    department: user.department ?? "",
    sectionIds: user.sections.map((s) => s.id),
  }
}
