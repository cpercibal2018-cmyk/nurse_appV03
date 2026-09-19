#!/usr/bin/env python3
"""Rebuild v2.8.7 from the untouched v2.8.6 source and prove it is byte-identical.

    python3 replay_v287.py            # verify only (temp dir, nothing written here)
    python3 replay_v287.py --write    # also overwrite the checked-in v2.8.7 with the rebuild

Runs patch_v287.py -> patch2 -> patch3 -> patch4 -> patch5 in a scratch directory (via the
AIGH_ROOT override every script honours), then compares SHA-256 against the
delivered document and re-runs verify_integration.py on the rebuild.
"""
import hashlib
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / 'uploads' / 'AIGH_Nursing_Workforce_Management_System_v2_8_6.md'
DELIVERED = HERE / 'AIGH_Nursing_Workforce_Management_System_v2_8_7.md'
CHAIN = ['patch_v287.py', 'patch2_v287.py', 'patch3_v287.py', 'patch4_v287.py', 'patch5_v287.py']


def sha256(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> int:
    write = '--write' in sys.argv
    with tempfile.TemporaryDirectory(prefix='aigh-replay-') as tmp:
        root = pathlib.Path(tmp)
        (root / 'uploads').mkdir()
        shutil.copy(SRC, root / 'uploads' / SRC.name)
        env = dict(os.environ, AIGH_ROOT=str(root))
        for script in CHAIN:
            r = subprocess.run([sys.executable, str(HERE / script)], env=env,
                               capture_output=True, text=True)
            last = (r.stdout.strip().splitlines() or ['(no output)'])[-1]
            print(f"{script:<18} {last}")
            if r.returncode != 0:
                print(r.stdout, r.stderr, sep='\n')
                return 1
        rebuilt = root / DELIVERED.name
        r = subprocess.run([sys.executable, str(HERE / 'verify_integration.py')], env=env,
                           capture_output=True, text=True)
        print(f"{'verify_integration':<18} {r.stdout.strip().splitlines()[-1]}")
        if r.returncode != 0:
            return 1

        h_new, h_old = sha256(rebuilt), sha256(DELIVERED) if DELIVERED.exists() else None
        print(f"\nrebuilt   sha256 {h_new}  ({rebuilt.stat().st_size} bytes)")
        print(f"delivered sha256 {h_old}  ({DELIVERED.stat().st_size if h_old else 0} bytes)")
        if h_new == h_old:
            print("\nIDENTICAL — replay is reproducible.")
            return 0
        if write:
            shutil.copy(rebuilt, DELIVERED)
            print(f"\nDIFFERED — delivered document overwritten with the rebuild ({DELIVERED.name}).")
            return 0
        print("\nDIFFERS — patch chain and delivered document are out of sync.")
        print("Run `diff` against the rebuild, fold the change into a patch script, or use --write.")
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
