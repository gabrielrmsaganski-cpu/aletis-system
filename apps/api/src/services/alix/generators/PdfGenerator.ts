// ============================================================
// ALETIS — Alix PDF Generator (Wave 9-GENERATE)
// Singleton puppeteer browser → HTML → PDF (A4)
// ============================================================

import puppeteer, { type Browser } from 'puppeteer';

let _browser: Browser | null = null;
let _launching: Promise<Browser> | null = null;

/**
 * Lazily launches puppeteer exactly once per process and reuses the
 * browser instance on subsequent calls. Callers must NOT close the
 * returned browser; use `closeBrowser()` on graceful shutdown.
 */
async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;
  if (_launching) return _launching;

  _launching = puppeteer
    .launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })
    .then((b) => {
      _browser = b;
      _launching = null;
      b.on('disconnected', () => {
        _browser = null;
      });
      return b;
    })
    .catch((err) => {
      _launching = null;
      throw err;
    });

  return _launching;
}

/** Renders HTML to a PDF (A4 portrait by default). */
export async function renderHtmlToPdfBuffer(
  html: string,
  opts: { landscape?: boolean } = {},
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: opts.landscape ?? false,
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

/** Closes the cached browser — call on graceful shutdown. */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    try {
      await _browser.close();
    } catch {
      /* noop */
    } finally {
      _browser = null;
    }
  }
}
