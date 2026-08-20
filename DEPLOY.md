# Getting Deblur onto Google Play

You don't need Android Studio for this. The app is a standard web app (a
"Progressive Web App" / PWA); Google's own **PWABuilder** tool converts a
hosted PWA into an Android App Bundle you can upload directly to Play
Console. Rough total time: 1–2 hours, most of it waiting on Play Console
review.

## Step 1 — Host the app somewhere with HTTPS

PWABuilder needs a live URL, not local files. Easiest free options:

- **GitHub Pages** (if you already have a GitHub account):
  1. Create a new repo, push the contents of the `visiontrain/` folder to it.
  2. In repo Settings → Pages, set source to the `main` branch, root folder.
  3. Your app will be live at `https://<username>.github.io/<repo>/`.
- **Netlify** or **Vercel**: drag-and-drop the `visiontrain/` folder in their
  web dashboard (no CLI needed) — both give you a free `https://` URL in
  under a minute.

Whichever you pick, open the URL on your phone afterward and click around —
confirm the training screen and vision-check screen actually run before
moving on.

## Step 2 — Generate the Android package

1. Go to **https://www.pwabuilder.com**
2. Paste in your hosted URL and click "Start".
3. PWABuilder will score your manifest/service worker — this app already
   ships both (`manifest.webmanifest`, `sw.js`), so it should score well
   with no changes needed.
4. Click **"Package for Stores" → Android**.
5. Leave the defaults (Trusted Web Activity / TWA is what you want — it
   wraps the PWA in a lightweight Android shell without needing native
   code). Note the **Package ID** it generates (e.g.
   `com.yourname.deblur`) — you'll need it for Play Console.
6. Download the generated package. It includes a signed `.aab` file
   (Android App Bundle) plus a `signing.key` — **save the signing key
   somewhere safe.** You need the exact same key for every future update;
   losing it means you can't update the app anymore under the same
   listing.

## Step 3 — Play Console

1. Create a Google Play **Developer account** at
   `https://play.google.com/console` — this has a one-time $25 registration
   fee from Google (not from me/Anthropic; this is Google's standard
   developer fee, unrelated to whether your app itself is free).
2. Create a new app, choose "Free".
3. Fill in the store listing: short description, full description, at
   least 2 screenshots (take these from your phone while using the app —
   the training and vision-check screens work well as screenshots),
   a feature graphic (1024×500px — a simple export of the Gabor-icon
   artwork at that aspect ratio works fine), and the app icon
   (`icons/icon-512.png` is already the right size).
4. Under **App content**, you'll need to fill out:
   - Privacy policy URL — since this app stores everything locally and
     sends no data anywhere, a one-paragraph policy stating exactly that
     is enough. You can host it as a second page on the same GitHub
     Pages/Netlify site.
   - Data safety form — answer "no data collected" throughout, since
     nothing leaves the device.
   - Content rating questionnaire.
   - Target audience — given the presbyopia/vision-training subject
     matter, mark it for adults, not children.
5. Under **Production → Create release**, upload the `.aab` file from
   Step 2.
6. Submit for review. First-time app reviews commonly take a few days.

## What to double check before submitting

- **Photosensitivity language**: the app already shows a warning before
  training sessions (brief flashing stimuli). Consider repeating this in
  the Play Store description itself, since Play's content policy asks for
  this to be disclosed up front for apps with flashing visual content.
- **No medical claims in the store listing.** Play (and app stores
  generally) scrutinize health-adjacent apps that claim to treat or cure a
  condition. Keep listing language to what the app actually does — a
  perceptual-learning training exercise based on a published protocol —
  rather than claims like "cures presbyopia" or "guaranteed to eliminate
  reading glasses." The in-app About screen already models this framing.
- **Test the calibration flow on the actual device** you'll screenshot
  with — the credit-card calibration step is the one part of the app that
  depends on real-world measurement and is worth a sanity check.

## Updating the app later

Any time you change the code: re-host the updated files, re-run it through
PWABuilder using the **same signing key** from Step 2, and upload the new
`.aab` as a new release in Play Console. The web app itself can also just
be updated directly on your host (GitHub Pages/Netlify) — the installed
Android wrapper will pick up changes automatically next time it's opened
online, since it's loading your live site under the hood. You only need to
go through PWABuilder again if you change the manifest (app name, icons,
etc.) rather than the app's internal behavior.
