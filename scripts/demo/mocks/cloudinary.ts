// DEMO ONLY — stand-in for src/lib/cloudinary: no upload, returns a fake https URL.
// (demo.jpos.test images are served locally by the recorder / screenshot tools.)
export const CLOUDINARY_CONFIG = { cloudName: 'demo', uploadPreset: 'demo', apiUrl: '' };

export async function uploadImage(file: File): Promise<string> {
  await new Promise(r => setTimeout(r, 800));
  return `https://demo.jpos.test/uploaded-${encodeURIComponent(file.name || 'image.png')}`;
}
