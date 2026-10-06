const ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function extensionOf(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

export function sanitizeFileName(fileName: string): string {
  const base = (fileName.split(/[/\\]/).pop() ?? "file")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  const cleaned = base.slice(0, 180);
  return cleaned || "file";
}

export function validateUpload(fileName: string, contentType: string, sizeBytes: number): string | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "The file is empty.";
  if (sizeBytes > MAX_UPLOAD_BYTES) return "Files must be 10 MB or smaller.";
  const extension = extensionOf(fileName);
  const allowed = ALLOWED_TYPES[contentType];
  if (!allowed || !allowed.includes(extension)) {
    return "Upload a PDF, DOCX, XLSX, CSV, TXT, or PNG, JPG, or WebP image.";
  }
  return null;
}

export function isPreviewable(contentType: string): boolean {
  return contentType === "application/pdf" || contentType.startsWith("image/");
}
