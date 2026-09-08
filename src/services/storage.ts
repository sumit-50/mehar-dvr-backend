// Standalone storage service (Pure Node.js)

export async function signPhotoUrls(paths: Array<string | null>): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const map: Record<string, string> = {};
  for (const p of unique) {
    map[p] = p;
  }
  return map;
}

export async function uploadVisitPhoto(_userId: string, photoBase64: string): Promise<string> {
  // Returns base64 / data URL directly
  return photoBase64;
}

export async function removeVisitPhoto(_path: string): Promise<void> {
  // No-op for direct storage
}

export async function signAvatarUrls(paths: Array<string | null>): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const p of paths) {
    if (p) map[p] = p;
  }
  return map;
}

export async function uploadAvatarPhoto(_userId: string, photoBase64: string): Promise<string> {
  return photoBase64;
}

export async function removeAvatarPhotos(_userId: string): Promise<void> {
  // No-op
}
