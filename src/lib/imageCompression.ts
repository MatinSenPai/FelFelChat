import imageCompression from 'browser-image-compression';

/**
 * Compress avatar image before upload
 * - Max size: 200KB
 * - Max dimensions: 512x512px
 * - Format: WebP (better compression)
 */
export async function compressAvatar(file: File): Promise<File> {
  const options = {
    maxSizeMB: 0.2,           // Max 200KB
    maxWidthOrHeight: 512,    // Max 512x512px
    useWebWorker: true,
    fileType: 'image/webp',   // Convert to WebP for best compression
  };

  try {
    const compressed = await imageCompression(file, options);
    console.log(`Avatar compressed: ${(file.size / 1024).toFixed(2)}KB → ${(compressed.size / 1024).toFixed(2)}KB`);
    return compressed;
  } catch (error) {
    console.error('Avatar compression failed:', error);
    return file; // Fallback to original file
  }
}

/**
 * Compress regular image before upload (for messages)
 * - Max size: 1MB
 * - Max dimensions: 1920px
 * - Preserves original format
 */
export async function compressImage(file: File): Promise<File> {
  const options = {
    maxSizeMB: 1,             // Max 1MB
    maxWidthOrHeight: 1920,   // Max 1920px
    useWebWorker: true,
  };

  try {
    const compressed = await imageCompression(file, options);
    console.log(`Image compressed: ${(file.size / 1024).toFixed(2)}KB → ${(compressed.size / 1024).toFixed(2)}KB`);
    return compressed;
  } catch (error) {
    console.error('Image compression failed:', error);
    return file; // Fallback to original file
  }
}
