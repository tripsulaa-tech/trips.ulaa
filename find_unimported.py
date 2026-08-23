import os, re, json

SRC = "src"
exts = (".ts", ".tsx")

files = []
for root, dirs, fnames in os.walk(SRC):
    for f in fnames:
        if f.endswith(exts):
            files.append(os.path.join(root, f))

# Build map of module "keys" (without extension, and index resolution) -> file
def module_keys(path):
    rel = os.path.relpath(path, SRC)
    rel_noext = re.sub(r'\.(tsx|ts)$', '', rel)
    keys = set()
    keys.add(rel_noext)
    if rel_noext.endswith('/index'):
        keys.add(rel_noext[:-len('/index')])
    return keys

file_keys = {}
for f in files:
    for k in module_keys(f):
        file_keys.setdefault(k, []).append(f)

# gather all import specifiers from all files (and other non-src files like index.html config, vite config, admin.html)
extra_search_files = []
for root, dirs, fnames in os.walk("."):
    if any(seg in root for seg in ("node_modules", ".git")):
        continue
    for f in fnames:
        if f.endswith((".ts", ".tsx", ".js", ".mjs", ".cjs", ".html", ".md")):
            extra_search_files.append(os.path.join(root, f))

import_re = re.compile(r'''(?:from|import)\s+['"]([^'"]+)['"]|import\(['"]([^'"]+)['"]\)|require\(['"]([^'"]+)['"]\)''')

referenced = set()
for f in extra_search_files:
    try:
        content = open(f, encoding='utf-8', errors='ignore').read()
    except Exception:
        continue
    base_dir = os.path.dirname(f)
    for m in import_re.finditer(content):
        spec = m.group(1) or m.group(2) or m.group(3)
        if not spec:
            continue
        if spec.startswith('.'):
            resolved = os.path.normpath(os.path.join(base_dir, spec))
            resolved = resolved.replace(os.sep, '/')
            referenced.add(resolved)
        elif spec.startswith('@/'):
            resolved = 'src/' + spec[2:]
            referenced.add(resolved)

# Now check each src file's keys against referenced set
unreferenced = []
for f in files:
    keys = module_keys(f)
    full_keys = set()
    for k in keys:
        full_keys.add('src/' + k)
    if not (full_keys & referenced):
        unreferenced.append(f)

for f in sorted(unreferenced):
    print(f)
