#!/usr/bin/env python3
"""Generate Windows resources with version info from VERSION file."""
import json
import os
import shutil
import subprocess
import sys

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

    shutil.copy2(icon_png, icon_dst)

    # Create winres JSON
    winres = {
        "RT_GROUP_ICON": {"APP": {"0000": "icon.png"}},
        "RT_VERSION": {
            "0000": {
                "fixed": {
                    "file_version": win_ver,
                    "product_version": win_ver
                },
                "info": {
                    "0000": {
                        "0000": {
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
    subprocess.run(['go-winres', 'make'], cwd=backend, check=True)
    print(f"Resources generated for version {version}")

if __name__ == '__main__':
    main()
