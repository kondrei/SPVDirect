import { useCallback, useState } from 'react';
import type { Theme } from '../../hooks/useTheme';
import { ScreenshotViewer } from './ScreenshotViewer';
import { SCREENSHOT_HEIGHT, SCREENSHOT_WIDTH, SCREENSHOTS, screenshotSrc } from './screenshots';

export function AppPreview({ theme }: Readonly<{ theme: Theme }>) {
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  return (
    <>
      <ul className="landing-gallery">
        {SCREENSHOTS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className="spv-card landing-gallery-item"
              aria-haspopup="dialog"
              aria-label={s.label}
              aria-describedby={`screenshot-${s.id}-caption`}
              onClick={() => setOpen(i)}
            >
              <img
                className="landing-gallery-img"
                src={screenshotSrc(import.meta.env.BASE_URL, s.id, theme)}
                alt=""
                width={SCREENSHOT_WIDTH}
                height={SCREENSHOT_HEIGHT}
                loading="lazy"
                decoding="async"
              />
              <span className="landing-gallery-text">
                <span className="strong">{s.label}</span>
                <span id={`screenshot-${s.id}-caption`} className="muted small">
                  {s.caption}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open === null ? null : (
        <ScreenshotViewer index={open} theme={theme} onChange={setOpen} onClose={close} />
      )}
    </>
  );
}
