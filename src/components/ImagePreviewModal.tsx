'use client';

interface ImagePreviewModalProps {
  imageUrl: string;
  onClose: () => void;
}

export default function ImagePreviewModal({ imageUrl, onClose }: ImagePreviewModalProps) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = imageUrl.split('/').pop() || 'image.png';
    a.click();
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          maxWidth: '95vw',
          maxHeight: '95vh',
        }}
      >
        <img
          src={imageUrl}
          alt="Preview"
          style={{
            maxWidth: '90vw',
            maxHeight: '80vh',
            objectFit: 'contain',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleDownload}>
            📥 Download
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
}
