import pathlib, shutil, datetime, sys

FILE = pathlib.Path(r"src\admin\AdminLogin.tsx")
if not FILE.exists():
    sys.exit(f"File not found: {FILE.resolve()}")

raw = FILE.read_bytes()
OLD = '<img src="/ULAA-logo.png" alt="ULAA" className="h-16 mx-auto mb-4" />'.encode("utf-8")
NEW = '<img src="/ULAA-logo.png" alt="ULAA" className="h-28 mx-auto mb-4" />'.encode("utf-8")

cnt = raw.count(OLD)
if cnt != 1:
    sys.exit(f"Anchor not found exactly once (found {cnt}) - file may have changed.")

backup = FILE.with_suffix(FILE.suffix + f".bak.{datetime.datetime.now():%Y%m%d%H%M%S}")
shutil.copy2(FILE, backup)

raw = raw.replace(OLD, NEW, 1)
FILE.write_bytes(raw)

print(f"Backup created: {backup}")
print("AdminLogin.tsx patched: logo size increased from h-16 to h-28.")
