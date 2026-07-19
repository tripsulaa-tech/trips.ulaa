import pathlib, shutil, datetime, sys

patches = [
    (r"src\admin\AdminLogin.tsx",
     '<img src="/ULAA.svg" alt="ULAA" className="h-16 mx-auto mb-4" />',
     '<img src="/ULAA-logo.png" alt="ULAA" className="h-16 mx-auto mb-4" />'),
    (r"src\components\layout\Navbar.tsx",
     'src="/ULAA-logo-navbar.png"',
     'src="/ULAA-logo.png"'),
    (r"src\components\layout\Footer.tsx",
     '<img src="/ULAA-logo-footer.png" alt="ULAA Logo" className="h-16 w-auto" />',
     '<img src="/ULAA-logo.png" alt="ULAA Logo" className="h-16 w-auto" />'),
]

for path_str, old, new in patches:
    FILE = pathlib.Path(path_str)
    if not FILE.exists():
        sys.exit(f"File not found: {FILE.resolve()}")

    raw = FILE.read_bytes()
    oldb = old.encode("utf-8")
    newb = new.encode("utf-8")
    cnt = raw.count(oldb)
    if cnt != 1:
        sys.exit(f"{path_str}: anchor not found exactly once (found {cnt}) - file may have changed.")

    backup = FILE.with_suffix(FILE.suffix + f".bak.{datetime.datetime.now():%Y%m%d%H%M%S}")
    shutil.copy2(FILE, backup)

    raw = raw.replace(oldb, newb, 1)
    FILE.write_bytes(raw)
    print(f"{path_str}: patched (backup: {backup.name})")

print("All three logo references now point to /ULAA-logo.png")
