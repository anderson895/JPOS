export const CLOUDINARY_CONFIG = {
  cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
  uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET,
  apiUrl: import.meta.env.VITE_CLOUDINARY_API_URL,
};

/**
 * What a picture is for decides how big it needs to be. Pictures are made
 * smaller in the browser before they're uploaded: a phone photo of 4 MB
 * becomes about 200 KB, which keeps every shop's storage low.
 */
export type PictureKind = 'photo' | 'logo' | 'qr' | 'screenshot';
const LIMITS: Record<PictureKind, { maxSide: number; type: 'image/jpeg' | 'image/png'; quality?: number }> = {
  // Product, staff and receipt photos
  photo: { maxSide: 1280, type: 'image/jpeg', quality: 0.82 },
  // Logos can be see-through: PNG
  logo: { maxSide: 512, type: 'image/png' },
  // A QR must stay sharp to scan: PNG
  qr: { maxSide: 1024, type: 'image/png' },
  // Screenshots sent with feedback: big enough to read the words on them
  screenshot: { maxSide: 1920, type: 'image/jpeg', quality: 0.88 },
};

/** A smaller copy of the picture (or the picture itself when it can't be read, or is already small). */
export async function shrinkPicture(file: File, kind: PictureKind = 'photo'): Promise<Blob> {
  const { maxSide, type, quality } = LIMITS[kind];
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    if (type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); } // no black behind see-through parts
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // e.g. a format this browser can't draw: upload it as it is
  }
}

/** Uploads a picture (made smaller first). `bytes`: its size in storage. */
export async function uploadPicture(file: File, kind: PictureKind = 'photo'): Promise<{ url: string; bytes: number }> {
  const picture = await shrinkPicture(file, kind);

  // Local test mode (npm run dev): nothing leaves this computer, so the
  // picture is a placeholder instead of a real upload.
  if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    return { url: `https://placehold.co/600x800/png?text=${encodeURIComponent(`Local test image\n${file.name}`)}`, bytes: picture.size };
  }

  const formData = new FormData();
  formData.append('file', picture, file.name.replace(/\.\w+$/, '') + (picture.type === 'image/png' ? '.png' : '.jpg'));
  formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);

  const response = await fetch(CLOUDINARY_CONFIG.apiUrl, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Image upload failed');
  }

  const data = await response.json();
  return { url: data.secure_url, bytes: Number(data.bytes) || picture.size };
}

export async function uploadImage(file: File, kind: PictureKind = 'photo'): Promise<string> {
  return (await uploadPicture(file, kind)).url;
}

/**
 * Feedback screenshots and files go to a separate Cloudinary account (unsigned
 * preset), apart from the shops' pictures. Only the cloud name and preset are
 * used here: the account's API key and secret never reach the browser.
 */
const ISSUES = {
  cloudName: import.meta.env.VITE_CLOUDINARY_ISSUES_CLOUD_NAME?.trim() ?? '',
  uploadPreset: import.meta.env.VITE_CLOUDINARY_ISSUES_UPLOAD_PRESET?.trim() ?? '',
};
const LOCAL_TEST = import.meta.env.VITE_USE_EMULATORS === 'true';
/** Files can be attached once that account is set up (always in local test mode, where nothing is uploaded). */
export const feedbackFilesReady = LOCAL_TEST || (!!ISSUES.cloudName && !!ISSUES.uploadPreset);
/** Cloudinary's limit for one file on the free plan. */
export const FILE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Uploads a feedback screenshot or file as it is. Pictures are made smaller
 * first, but stay sharp enough to read; animated GIFs and SVGs are sent as they are.
 */
export async function uploadFeedbackFile(file: File): Promise<{ url: string; bytes: number }> {
  const shrink = file.type.startsWith('image/') && file.type !== 'image/gif' && file.type !== 'image/svg+xml';
  const body = shrink ? await shrinkPicture(file, 'screenshot') : file;
  if (body.size > FILE_MAX_BYTES) throw new Error(`${file.name} is too big. Use files of 10 MB or less.`);

  // Local test mode (npm run dev): nothing leaves this computer
  if (LOCAL_TEST) {
    return { url: `https://placehold.co/600x400/png?text=${encodeURIComponent(`Local test file\n${file.name}`)}`, bytes: body.size };
  }
  if (!feedbackFilesReady) throw new Error("Files can't be sent right now. Send the message without them.");

  const formData = new FormData();
  formData.append('file', body, body === file ? file.name : file.name.replace(/\.\w+$/, '') + '.jpg');
  formData.append('upload_preset', ISSUES.uploadPreset);
  // "auto": Cloudinary takes pictures, videos, PDFs and documents
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(ISSUES.cloudName)}/auto/upload`, { method: 'POST', body: formData });
  if (!response.ok) throw new Error(`Couldn't attach ${file.name}. Please try another file.`);
  const data = await response.json();
  return { url: data.secure_url, bytes: Number(data.bytes) || body.size };
}
