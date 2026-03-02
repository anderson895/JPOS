export const CLOUDINARY_CONFIG = {
  cloudName: 'dt2hauvef',
  uploadPreset: 'jposUpload',
  apiUrl: 'https://api.cloudinary.com/v1_1/dt2hauvef/image/upload',
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
