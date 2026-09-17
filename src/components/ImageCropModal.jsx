'use client';

import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import { getCroppedImageBlob } from '@/lib/cropImage';
import styles from './ImageCropModal.module.css';

export default function ImageCropModal({ imageSrc, aspect = 1, round = false, onCancel, onValidate }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function handleValidate() {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels);
      onValidate(blob);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>Cadrer l'image</div>
        <div className={styles.cropArea}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={round ? 'round' : 'rect'}
            showGrid={!round}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className={styles.controls}>
          <i className="ph ph-magnifying-glass-minus" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className={styles.zoomSlider}
          />
          <i className="ph ph-magnifying-glass-plus" />
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={onCancel}>Annuler</button>
          <button type="button" className={styles.btnPrimary} onClick={handleValidate} disabled={saving}>
            {saving ? 'Validation…' : 'Valider le cadrage'}
          </button>
        </div>
      </div>
    </div>
  );
}
