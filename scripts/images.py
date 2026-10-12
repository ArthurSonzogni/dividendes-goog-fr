#!/usr/bin/env python3
"""Renders the extension page with made-up data (scripts/demo-data.js):

- docs/screenshot.png: the whole page, for the README;
- docs/store/<lang>/screenshot-<n>.png: 1280 × 800 screenshots for the Chrome
  Web Store;
- docs/store/promo-small.png and promo-large.png: the 440 × 280 and
  1400 × 560 promotional images.

Store images are 24-bit PNG without alpha, as the Chrome Web Store requires.

Requires Google Chrome and Pillow. The ECB API must be reachable: the page
fetches the exchange rates.
"""

import functools
import html
import http.server
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CHROME = os.environ.get('CHROME', 'google-chrome')

# Store screenshots: (file name, data-i18n key of the section at the top).
STORE = [('screenshot-1', 'dividendsTitle'), ('screenshot-2', 'messageTitle')]


def demo_site(tmp):
    """The extension's files, and demo.html: app.html with the made-up data."""
    for name in ['app.css', 'app.js', 'icon.png', 'lib', 'vendor']:
        os.symlink(ROOT / 'extension' / name, tmp / name)
    shutil.copy(ROOT / 'scripts' / 'demo-data.js', tmp / 'demo-data.js')
    shutil.copy(ROOT / 'scripts' / 'promo.html', tmp / 'promo.html')
    shutil.copy(ROOT / 'scripts' / 'promo-large.html', tmp / 'promo-large.html')
    html = (ROOT / 'extension' / 'app.html').read_text()
    html = html.replace('<script src="vendor/pdf-lib.min.js">',
                        '<script src="demo-data.js"></script>\n<script src="vendor/pdf-lib.min.js">')
    (tmp / 'demo.html').write_text(html)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory):
    handler = functools.partial(QuietHandler, directory=directory)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def chrome(url, width, height, *args, scale=1):
    with tempfile.TemporaryDirectory() as profile:
        return subprocess.run([
            CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--lang=en-US',
            f'--user-data-dir={profile}', f'--force-device-scale-factor={scale}',
            f'--window-size={width},{height}', '--virtual-time-budget=15000', *args, url,
        ], check=True, capture_output=True, text=True,
            env={**os.environ, 'LANGUAGE': 'en_US', 'LANG': 'en_US.UTF-8'}).stdout


def shoot(url, out, width, height, scale=1):
    chrome(url, width, height, f'--screenshot={out}', scale=scale)


def section_offsets(url):
    """The top of each section of the page, written by demo-data.js."""
    dom = chrome(url, 1280, 800, '--dump-dom')
    return json.loads(html.unescape(re.search(r'data-offsets="([^"]*)"', dom).group(1)))


def trim_bottom(image):
    """Crops the empty background below the content, keeping a margin."""
    background = image.getpixel((5, image.height - 5))
    for y in range(image.height - 1, 0, -4):
        colors = image.crop((0, y, image.width, y + 1)).getcolors(image.width)
        if len(colors) > 1 or colors[0][1] != background:
            return image.crop((0, 0, image.width, min(image.height, y + 48)))
    return image


def save_png(image, path, colors=None):
    """24-bit PNG, or with a palette of `colors` (the page has flat colors:
    256 divide the size by 3)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    image = image.convert('RGB')
    if colors:
        image = image.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    image.save(path, optimize=True)
    print(path.relative_to(ROOT), image.size)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        demo_site(tmp)
        server = serve(tmp)
        base = f'http://127.0.0.1:{server.server_port}'
        raw = tmp / 'raw.png'

        # README: the whole page, rendered at 2× then scaled down.
        shoot(f'{base}/demo.html?lang=en', raw, 1360, 2800, scale=2)
        image = trim_bottom(Image.open(raw).convert('RGB'))
        save_png(image.resize((image.width // 2, image.height // 2), Image.LANCZOS),
                 ROOT / 'docs' / 'screenshot.png', colors=256)

        # Store: 1280 × 800 regions of the whole page, each from a section's top.
        for lang in ['fr', 'en']:
            url = f'{base}/demo.html?lang={lang}'
            offsets = section_offsets(url)
            shoot(url, raw, 1280, 3200)
            page = Image.open(raw).convert('RGB')
            for name, section in STORE:
                top = max(0, offsets[section] - 12)
                save_png(page.crop((0, top, 1280, top + 800)), ROOT / 'docs' / 'store' / lang / f'{name}.png')

        shoot(f'{base}/promo.html', raw, 440, 280)
        save_png(Image.open(raw), ROOT / 'docs' / 'store' / 'promo-small.png')
        shutil.copy(ROOT / 'docs' / 'store' / 'fr' / 'screenshot-1.png', tmp / 'shot.png')
        shoot(f'{base}/promo-large.html', raw, 1400, 560)
        save_png(Image.open(raw), ROOT / 'docs' / 'store' / 'promo-large.png')
        server.shutdown()


if __name__ == '__main__':
    main()
