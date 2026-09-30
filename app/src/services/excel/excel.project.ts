import type { ProjectType } from "@/lib/project-type-labels"
import type { Db } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { notDeleted } from "@/services/_shared/soft-delete"

/** Name (for the file name) and type (for field wording) of a live project; 404 otherwise. */
export async function findExportProject(db: Db, projectId: string): Promise<{ name: string; projectType: ProjectType }> {
  const project = await db.project.findFirst({ where: notDeleted({ id: projectId }), select: { name: true, projectType: true } })
  if (!project) throw new NotFoundError("Project not found")
  return { name: project.name, projectType: project.projectType as ProjectType }
}
