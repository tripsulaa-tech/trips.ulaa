# ULAA video hero

Merge this ZIP into the project root, overwrite matching files, then rebuild
and deploy. No new dependency or database migration is required.

## Admin controls

Open Admin > Home Page > Hero Banner. You can edit the introduction, two-line
headline, orange italic word, supporting text, both button labels, Gallery
visibility, bottom caption, video enabled,
autoplay, and looping. Use the page's Save button to publish those settings.
Explore opens /trips. View Gallery opens /completed-trips.
Use Restore original hero text and buttons to apply the Girls-only / travel
experiences. reference copy without changing your video settings.

The old carousel, slide ordering, photo list, and
rotation timer have been removed from this editor. Existing custom text is
migrated from the first active slide. Defaults match the supplied Girls-only travel experiences. reference. Previously uploaded carousel images are not deleted.

## Replace videos in assets

Keep Media source set to Bundled website assets. Replace these files with
the same filenames, then run npm run build and deploy the build:

- turquoise-bay-desktop.mp4 — landscape video (16:9), MP4 with H.264 codec
- turquoise-bay-mobile.mp4 — portrait video (9:16), MP4 with H.264 codec
- turquoise-bay-desktop.jpg — landscape still from the new video
- turquoise-bay-mobile.jpg — portrait still from the new video

Replace the JPG stills too: they appear while loading, if video fails, when
video is turned off, and for reduced-motion or data-saving visitors. Use short
silent clips; aim below 5 MB desktop and 2 MB mobile. The supplied videos have
a blended loop; replacement clips should also have a smooth start/end.
Renaming files also requires updating src/constants/home-hero-media.ts.

## Showing up to 4 videos

In Admin > Home Page > Hero Banner, set Number of videos to 1, 2, 3 or 4. The
videos play one after another with a fade, and Loop video repeats the whole
set. Visitors see small dots next to the pause button to jump between videos.
If a video fails to load it is skipped. Existing sites keep showing one video
until you change the setting; no database migration is needed.

Bundled assets: video 1 uses the turquoise-bay-* files. For videos 2, 3 and 4 add
these files to src/assets/home-hero/ (no code change), then rebuild and deploy:

- hero-2-desktop.mp4, hero-2-mobile.mp4, hero-2-desktop.jpg, hero-2-mobile.jpg
- hero-3-desktop.mp4, hero-3-mobile.mp4, hero-3-desktop.jpg, hero-3-mobile.jpg
- hero-4-desktop.mp4, hero-4-mobile.mp4, hero-4-desktop.jpg, hero-4-mobile.jpg

A video without its desktop MP4 is skipped. Mobile files are optional and fall
back to the desktop ones. Hosted URLs: choose Hosted video and image URLs and
fill the Video 2 / 3 / 4 fields.

## Change hosted media in Admin

Select Hosted video and image URLs. Paste public HTTPS file URLs (not YouTube
or Vimeo pages) or site-relative paths such as /media/hero.mp4. A desktop still
is required. Blank mobile URLs use the desktop media. Test both previews and
save. This option does not upload files; host them first. Switching back to
Bundled website assets restores the packaged video and stills.

Admin settings use the existing home_hero site_content record and realtime
subscription. Saved custom media URLs are references and are not deleted
when edited or discarded. Playback remains muted. Visitors retain a pause/play
control and their motion preferences are respected.

Validation: production build and migration/draft-cleanup checks passed.
Live Admin save/reload and browser/device playback need checking after deploy;
the local source package does not include a connected production session.
