import type { Page } from '@playwright/test';

/** Show a compact, noninteractive narration caption at the top of the recorded browser view. */
export async function narrate(page: Page, text: string): Promise<void> {
  await page.evaluate((caption) => {
    let banner = document.getElementById('qa-narration');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'qa-narration';
      banner.setAttribute('aria-hidden', 'true');
      Object.assign(banner.style, {
        position: 'fixed', top: '4px', left: '50%', transform: 'translateX(-50%)',
        maxWidth: 'min(65vw, 680px)', padding: '3px 8px', borderRadius: '4px',
        background: 'rgba(15,23,42,.88)', color: '#fff', font: '12px/1.3 sans-serif',
        pointerEvents: 'none', zIndex: '2147483647', whiteSpace: 'normal',
        textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.25)',
      });
      document.body.appendChild(banner);
    }
    banner.textContent = caption;
  }, text);
}

/** Remove the recording caption before capturing unobstructed UI evidence. */
export async function clearNarration(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('qa-narration')?.remove());
}
