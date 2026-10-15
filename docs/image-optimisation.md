# Image egress & thumbnails

Serve site images from the website instead of Supabase:

    node scripts/mirror-site-images.mjs --dry-run
    node scripts/mirror-site-images.mjs
    git add public/site-images src/generated/siteImageManifest.json   # then commit + deploy

A file not listed in `src/generated/siteImageManifest.json` keeps loading from Supabase.
Re-run the mirror script after the admin changes logos / hero / founder / About photos.

Thumbnails for grids (one time for existing images):

    npm install --no-save sharp
    $env:SUPABASE_URL = "https://<project-ref>.supabase.co"
    $env:SUPABASE_SERVICE_ROLE_KEY = Read-Host "Service role key"
    node scripts/make-thumbs.mjs --dry-run
    node scripts/make-thumbs.mjs --from-dir ..\ulaa-storage-transfer   # local bucket copy, no download egress
    node scripts/make-thumbs.mjs                                        # otherwise downloads originals once

If a thumbnail is missing the page quietly loads the original. Originals are never changed.
