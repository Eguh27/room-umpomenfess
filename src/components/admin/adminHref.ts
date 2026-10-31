/**
 * Tautan internal konsol Admin (T-32). Saat QA dev memakai `?state=preview`,
 * query itu harus ikut supaya perpindahan tab tidak jatuh ke guard login.
 */
export function adminHref(path: string, preview: boolean): string {
  return preview ? `${path}?state=preview` : path;
}
