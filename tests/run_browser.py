"""Run synthetic browser fixtures in a separate, non-login Chrome profile."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import json

root = Path(__file__).resolve().parent.parent
chrome = Path(os.environ.get('PROGRAMFILES', r'C:\Program Files')) / 'Google/Chrome/Application/chrome.exe'
if not chrome.exists():
    raise SystemExit('Chrome was not found. Open tests/browser.html manually instead.')
fixture_data = root / 'tests/.sample-fixtures.js'
samples = [{'filename': p.name, 'html': p.read_text(encoding='utf-8')}
           for p in sorted((root / 'sample_pages').glob('*-loaded-*.html'))]
try:
    fixture_data.write_text('globalThis.realSamples = ' + json.dumps(samples) + ';', encoding='utf-8')
    with tempfile.TemporaryDirectory(prefix='ancestry-fixture-') as profile:
        result = subprocess.run([
            str(chrome), '--headless=new', '--disable-gpu', '--no-first-run',
            '--no-default-browser-check', f'--user-data-dir={profile}',
            '--allow-file-access-from-files', '--dump-dom', '--virtual-time-budget=60000',
            (root / 'tests/browser.html').as_uri(),
        ], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
        output = result.stdout
        start, end = output.find('<pre id="output">'), output.find('</pre>')
        print(output[start:end] if start >= 0 else result.stderr)
        code = 0 if 'data-test-result="pass"' in output else 1
finally:
    fixture_data.unlink(missing_ok=True)
sys.exit(code)
