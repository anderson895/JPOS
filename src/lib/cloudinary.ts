export const CLOUDINARY_CONFIG = {
  cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
  uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET,
  apiUrl: import.meta.env.VITE_CLOUDINARY_API_URL,
};

export async function uploadImage(file: File): Promise<string> {
  // Local test mode (npm run dev): nothing leaves this computer, so the
  // picture is a placeholder instead of a real upload.
  if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    return `https://placehold.co/600x800/png?text=${encodeURIComponent(`Local test image\n${file.name}`)}`;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);

  const response = await fetch(CLOUDINARY_CONFIG.apiUrl, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Image upload failed');
  }

  const data = await response.json();
  return data.secure_url;
}