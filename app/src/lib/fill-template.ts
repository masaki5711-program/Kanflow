/**
 * Fill `{name}` placeholders of a translation string (pure). Unknown
 * placeholders are left as-is so a missing value is visible, not silent.
 */
export function fillTemplate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}
