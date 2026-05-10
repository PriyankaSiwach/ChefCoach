export function normalizePantryName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
