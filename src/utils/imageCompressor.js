import { IMAGE_FILE_POLICY, validateSelectedFile } from '../security/permissionPolicy.js';

/**
 * Image compressor utility using canvas
 * Compresses images client-side before storing or uploading
 */
export function compressImage(file, maxWidth = 1280, maxHeight = 720, quality = 0.7) {
  return new Promise((resolve, reject) => {
    try {
      validateSelectedFile(file, IMAGE_FILE_POLICY);
    } catch (error) {
      reject(error);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Calculate target dimensions keeping aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        if (!width || !height || width * height > 40_000_000) {
          reject(new Error('Kích thước ảnh không hợp lệ hoặc quá lớn.'));
          return;
        }

        // Re-encoding through canvas strips embedded metadata such as GPS/EXIF.
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert canvas back to compressed base64 JPEG
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      
      img.onerror = (err) => reject(err);
      img.src = event.target.result;
    };
    
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
