import { useCallback, useEffect, useId, useRef } from 'react';
import { Button } from '../../components/ui';
import type { Theme } from '../../hooks/useTheme';
import { SCREENSHOT_HEIGHT, SCREENSHOT_WIDTH, SCREENSHOTS, screenshotAlt, screenshotSrc } from './screenshots';

export function ScreenshotViewer({
  index,
  theme,
  onChange,
  onClose,
}: Readonly<{
  index: number;
  theme: Theme;
  onChange: (index: number) => void;
  onClose: () => void;
}>) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const shot = SCREENSHOTS[index];
  const count = SCREENSHOTS.length;
  const go = useCallback((delta: number) => onChange((index + delta + count) % count), [index, count, onChange]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
    el.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  return (
    <dialog
      ref={dialog}
      className="landing-viewer"
      tabIndex={-1}
      aria-labelledby={titleId}
      onCancel={(e) => e.preventDefault()}
    >
      <div className="landing-viewer-head">
        <div>
          <h2 id={titleId} className="preview-title">
            {shot.label}
          </h2>
          <div className="muted small">
            {index + 1} din {count} · {shot.caption}
          </div>
        </div>
        <Button size="sm" icon="x" onClick={onClose}>
          Închide
        </Button>
      </div>
      <div className="landing-viewer-body">
        <img
          className="landing-viewer-img"
          src={screenshotSrc(import.meta.env.BASE_URL, shot.id, theme)}
          alt={screenshotAlt(shot)}
          width={SCREENSHOT_WIDTH}
          height={SCREENSHOT_HEIGHT}
        />
      </div>
      <div className="landing-viewer-nav">
        <Button size="sm" icon="chevron" className="landing-viewer-prev" onClick={() => go(-1)}>
          Anterioara
        </Button>
        <Button size="sm" icon="chevron" className="landing-viewer-next" onClick={() => go(1)}>
          Următoarea
        </Button>
      </div>
    </dialog>
  );
}
