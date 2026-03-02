export const CLOUDINARY_CONFIG = {
  cloudName: '469594518417695',
  uploadPreset: 'jposUpload',
  apiUrl: 'https://api.cloudinary.com/v1_1/469594518417695/image/upload',
};

export async function uploadImage(file: File): Promise<string> {
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
