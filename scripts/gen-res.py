#!/usr/bin/env python3
"""Generate Windows resources with version info from VERSION file."""
import json
import os
import subprocess
import sys

# PIL may not be installed; fall back to shutil if resizing isn't needed
try:
    from PIL import Image
    HAS_PIL = True
except Exception:
    HAS_PIL = False

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    with open(os.path.join(ROOT, 'VERSION')) as f:
        version = f.read().strip().replace('\n', '').replace('\r', '')

    # Pad to 4-part version for Windows
    parts = version.split('.')
    while len(parts) < 4:
        parts.append('0')
    win_ver = '.'.join(parts[:4])

    backend = os.path.join(ROOT, 'backend')
    icon_png = os.path.join(ROOT, 'images', 'logo.png')
    icon_dst = os.path.join(backend, 'icon.png')

    if HAS_PIL:
        with Image.open(icon_png) as img:
            # go-winres requires icon dimensions to fit in 256x256
            img = img.resize((256, 256), Image.Resampling.LANCZOS)
            img.save(icon_dst)
    else:
        import shutil
        shutil.copy2(icon_png, icon_dst)

    # Create winres JSON
    winres = {
        "RT_GROUP_ICON": {"APP": {"0000": ["icon.png"]}},
        "RT_VERSION": {
            "#1": {
                "0000": {
                    "fixed": {
                        "file_version": win_ver,
                        "product_version": win_ver
                    },
                    "info": {
                        "0409": {
                            "Comments": "FreeRouting Desktop",
                            "CompanyName": "",
                            "FileDescription": "FreeRouting Desktop",
                            "FileVersion": win_ver,
                            "InternalName": "FreeRouting Desktop",
                            "LegalCopyright": "",
                            "OriginalFilename": "FreeRouting Desktop.exe",
                            "ProductName": "FreeRouting Desktop",
                            "ProductVersion": win_ver
                        }
                    }
                }
            }
        }
    }

    winres_path = os.path.join(backend, 'winres.json')
    with open(winres_path, 'w') as f:
        json.dump(winres, f, indent=2)

    # Clean old syso files
    for f in os.listdir(backend):
        if f.endswith('.syso'):
            os.remove(os.path.join(backend, f))

    # Run go-winres
    subprocess.run(['go-winres', 'make', '--in', 'winres.json'], cwd=backend, check=True)
    print(f"Resources generated for version {version}")


if __name__ == '__main__':
    main()
