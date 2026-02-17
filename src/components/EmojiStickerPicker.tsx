'use client';

import { useState, useEffect } from 'react';

interface EmojiStickerPickerProps {
  onEmojiSelect: (emoji: string) => void;
 onStickerSelect: (stickerId: string, stickerUrl: string) => void;
  onGifSelect: (gifId: string, gifUrl: string, format: string) => void;
  onClose: () => void;
  dir: 'rtl' | 'ltr';
  t: (key: string) => string;
}

interface Sticker {
  id: string;
  fileUrl: string;
  fileName: string;
}

interface Gif {
  id: string;
  fileUrl: string;
  fileName: string;
  format: string;
}

type Tab = 'emoji' | 'stickers' | 'gifs';

// Comprehensive emoji list organized by categories
const COMMON_EMOJIS = [
  // Faces & Emotions
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
  '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
  '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪',
  '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨',
  '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
  '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
  '🤢', '🤮', '🤧', '🥵', '🥶', '😎', '🤓', '🧐',
  '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳',
  '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭',
  '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱',
  '😤', '😡', '😠', '🤬', '💀', '☠️', '💩', '🤡',
  
  // Gestures & People
  '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️',
  '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇',
  '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏',
  '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '🦿',
  
  // Animals & Nature
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
  '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺',
  '🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '🌱', '🌿',
  '🍀', '🌾', '🌵', '🌴', '🌳', '🌲', '⭐', '🌟',
  '✨', '💫', '☀️', '🌙', '⛅', '🌈', '🔥', '💧',
  
  // Food & Drink
  '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍑',
  '🍒', '🍍', '🥝', '🥥', '🍅', '🍆', '🥑', '🥦',
  '🥬', '🥒', '🌶️', '🌽', '🥕', '🍞', '🥐', '🥖',
  '🥨', '🥯', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔',
  '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥙', '🧆',
  '🍿', '🧂', '🥗', '🍜', '🍝', '🍛', '🍣', '🍱',
  '🥟', '🍦', '🍧', '🍰', '🎂', '🧁', '🍮', '🍭',
  '🍬', '🍫', '🍩', '🍪', '☕', '🍵', '🧃', '🥤',
  '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧊',
  
  // Activities & Objects
  '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉',
  '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏',
  '🎮', '🕹️', '🎲', '🎯', '🎳', '🎨', '🎭', '🎪',
  '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺',
  '🎸', '🎻', '🏆', '🥇', '🥈', '🥉', '🏅',
  '🎖️', '🎗️', '🏵️', '🎫', '🎟️',
  
  // Travel & Places  
  '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑',
  '🚒', '🚐', '🚚', '🚛', '🚜', '🛴', '🚲', '🛵',
  '🏍️', '✈️', '🚁', '🚂', '🚊', '🚝', '🚄', '🚅',
  '🚆', '🚇', '🚈', '🚉', '🚞', '🚋', '🚃', '🚟',
  '🚠', '🚡', '🛰️', '🚀', '🛸', '🚢', '⛵', '🛥️',
  '⛴️', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢',
  '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫',
  
  // Symbols
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
  '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️',
  '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈',
  '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐',
  '♑', '♒', '♓', '🆔', '⚛️', '🈵', '✅', '☑️',
  '✔️', '✖️', '❌', '❎', '➕', '➖', '➗', '➰',
  '➿', '〽️', '✳️', '✴️', '❇️', '‼️', '⁉️', '❓',
  '❔', '❕', '❗', '〰️', '©️', '®️', '™️', '💯',
  '🔠', '🔡', '🔢', '🔣', '🔤', '🅰️', '🆎', '🅱️',
];

export default function EmojiStickerPicker({
  onEmojiSelect,
  onStickerSelect,
  onGifSelect,
  onClose,
  dir,
  t,
}: EmojiStickerPickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('emoji');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loadingStickers, setLoadingStickers] = useState(false);
  const [loadingGifs, setLoadingGifs] = useState(false);

  // Lazy load stickers when tab is clicked
  useEffect(() => {
    if (activeTab === 'stickers' && stickers.length === 0) {
      fetchStickers();
    }
  }, [activeTab]);

  // Lazy load gifs when tab is clicked
  useEffect(() => {
    if (activeTab === 'gifs' && gifs.length === 0) {
      fetchGifs();
    }
  }, [activeTab]);

  const fetchStickers = async () => {
    setLoadingStickers(true);
    try {
      const res = await fetch('/api/stickers');
      const data = await res.json();
      if (data.stickers) {
        setStickers(data.stickers);
      }
    } catch (error) {
      console.error('Failed to fetch stickers:', error);
    }
    setLoadingStickers(false);
  };

  const fetchGifs = async () => {
    setLoadingGifs(true);
    try {
      const res = await fetch('/api/gifs');
      const data = await res.json();
      if (data.gifs) {
        setGifs(data.gifs);
      }
    } catch (error) {
      console.error('Failed to fetch gifs:', error);
    }
    setLoadingGifs(false);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        [dir === 'rtl' ? 'right' : 'left']: 0,
        marginBottom: 8,
        width: 360,
        maxWidth: 'calc(100vw - 40px)',
        height: 400,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
      }}
    >
      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          padding: '8px 12px',
          gap: 8,
        }}
      >
        {(['emoji', 'stickers', 'gifs'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="btn btn-sm"
            style={{
              flex: 1,
              background: activeTab === tab ? 'var(--bg-hover)' : 'transparent',
              border: 'none',
              fontSize: 13,
            }}
          >
            {t(`picker.${tab}`)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {activeTab === 'emoji' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              gap: 8,
            }}
          >
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onEmojiSelect(emoji);
                  onClose();
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  padding: 8,
                  borderRadius: 4,
                  transition: 'background 0.15s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'stickers' && (
          <>
            {loadingStickers ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <div className="spinner" style={{ width: 30, height: 30 }} />
              </div>
            ) : stickers.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 40 }}>
                {t('picker.noStickers')}
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8,
                }}
              >
                {stickers.map((sticker) => (
                  <button
                    key={sticker.id}
                    onClick={() => {
                      onStickerSelect(sticker.id, sticker.fileUrl);
                      onClose();
                    }}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: 'none',
                      borderRadius: 8,
                      padding: 8,
                      cursor: 'pointer',
                      aspectRatio: '1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 0.15s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                    onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <img
                      src={sticker.fileUrl}
                      alt={sticker.fileName}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                      }}
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'gifs' && (
          <>
            {loadingGifs ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <div className="spinner" style={{ width: 30, height: 30 }} />
              </div>
            ) : gifs.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 40 }}>
                {t('picker.noGifs')}
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8,
                }}
              >
                {gifs.map((gif) => (
                  <button
                    key={gif.id}
                    onClick={() => {
                      onGifSelect(gif.id, gif.fileUrl, gif.format);
                      onClose();
                    }}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: 'none',
                      borderRadius: 8,
                      padding: 8,
                      cursor: 'pointer',
                      aspectRatio: '1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 0.15s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                    onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    {gif.format === 'mp4' ? (
                      <video
                        src={gif.fileUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <img
                        src={gif.fileUrl}
                        alt={gif.fileName}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                        }}
                        loading="lazy"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
