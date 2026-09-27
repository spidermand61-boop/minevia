#!/usr/bin/env python3
"""Validate static dependencies and create a deterministic, root-level playable ZIP."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parent.parent
files = [ROOT / 'index.html']
for folder in ('css', 'js', 'assets'):
    files.extend(sorted(p for p in (ROOT / folder).rglob('*') if p.is_file()))
allowed = {p.relative_to(ROOT).as_posix() for p in files}
for p in files:
    relative = p.relative_to(ROOT).as_posix()
    assert re.fullmatch(r'[a-z0-9./-]+', relative), f'Invalid filename: {relative}'
    text = p.read_text()
    # Check all static local imports and document/style assets, including case sensitivity.
    refs = re.findall(r'(?:src|href)=["\']([^"\']+)["\']', text)
    refs += re.findall(r'from\s+["\']([^"\']+)["\']', text)
    refs += re.findall(r'url\(["\']?([^\)"\']+)', text)
    for ref in refs:
        if ref.startswith('#'):
            continue
        if ref.startswith('https://'):
            assert ref == 'https://www.youtube.com/game_api/v1', f'Unexpected remote asset: {ref}'
        else:
            assert ref.startswith('.'), f'Non-relative path: {relative}: {ref}'
            target = (p.parent / ref).resolve().relative_to(ROOT).as_posix()
            assert target in allowed, f'Missing/case-mismatched asset: {target}'
    if p.suffix == '.js':
        assert not re.search(r'\b(fetch\s*\(|XMLHttpRequest|WebSocket|console\.log)', text), relative
html = (ROOT / 'index.html').read_text()
assert html.index('https://www.youtube.com/game_api/v1') < html.index('./js/main.js')
archive = ROOT / 'playable.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in files:
        info = zipfile.ZipInfo(p.relative_to(ROOT).as_posix(), (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, p.read_bytes())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert 'index.html' in z.namelist()
report = {'files': len(files), 'uncompressedBytes': sum(p.stat().st_size for p in files),
          'zipBytes': archive.stat().st_size, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
          'entries': sorted(allowed)}
(ROOT / 'test-results').mkdir(exist_ok=True)
(ROOT / 'test-results' / 'release-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
