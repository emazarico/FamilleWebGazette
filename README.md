# FamilyGazette

A warm, bilingual (**French default** + **English** switcher), mobile-first private family journal & monthly printable **Gazette** web app — inspired by Famileo, designed for households of `<30` members to run **for $0/month** on static hosting (GitHub Pages) + the Family Admin's Google Drive via Google Apps Script.

---

## Key Features

- **Family Wall & Photo Collage Studio**:
  - 1 to 4 photo slots per memory with layout switcher, interactive drag/drop & photo tray (up to 12 photos; excess photos return neatly to the tray when reducing slots), slot swap, pan/zoom cropping, and client-side **iPhone HEIC** conversion (`heic-to`).
  - Tag both registered family members and remembered non-member guests (**"Avec"**), with 1-click upgrade of guests into full members later.
  - Per-profile **FR / EN** UI language preference, optional dark mode, and customizable emoji avatars + color themes.
- **Private Family Messages & Activity Drawer**:
  - 1-to-1 and small-group private conversations strictly filtered by participant — **isolated server-side** during Drive sync and completely excluded from Gazettes.
- **Gallery & Lightbox**:
  - High-resolution filterable photo archive with metadata inspection and jump-to-memory navigation.
- **Monthly Gazette Studio, PDF & Email Digest**:
  - Chronological A4 PDF generator (`jspdf`) respecting collage layouts and photo focal crops.
  - Gmail/MailApp-ready HTML email digest staying under the 80 KB clipping threshold (`cid:` inline thumbnails + full-res secret links).
  - Self-contained standalone HTML export and printable Web Reader (`?view=gazette&issue=...&k=...`).
  - **T-3 Contributor Reminders**: Preview, `mailto:`, or dispatch directly via Google Apps Script (`MailApp`) ahead of the scheduled publication day.
- **Organized Google Drive Backend & Archive Reactivation**:
  - **Human-browsable Drive folders**:
    - Originals stored in `FamilyGazette/Photos/<YYYY>/<YYYY-MM>/<YYYY-MM-DD>_<Author>_<shortId>.<ext>`
    - App thumbnails kept out of `Photos/` inside `FamilyGazette/.app-cache/thumbs/`
    - Compiled Gazette PDF & HTML editions archived inside `FamilyGazette/Gazettes/<YYYY-MM>_N<02d>_<Title>.pdf & .html`
  - **Permanent Archive & 1-Click Secret Link Reactivation**: Expiring a share link never deletes a Gazette issue. Past editions stay in Archive with clear expiration status; Admins can click **Reactivate (+30d)** (or pick +7d / +30d / +90d / Permanent) to reopen the **exact same secret link** sent in earlier emails, or rotate the key for a brand new URL.

---

## How Family Members Log In & Persist Sessions (`localStorage`)

Relatives **never** need a Google account or the Admin's Gmail password:

1. **Magic Invite Link or Invite Code**:
   - After connecting Drive Sync, the Admin opens **Family & Sync → Invite Family** and shares the **1-click Magic Invite Link** (`?join=1&api=<script-url>&code=<invite-code>`) via WhatsApp, SMS, or email.
   - Clicking the link (or entering the `/exec` URL + `FAMILY_INVITE_CODE` manually under **Connect / Join Cloud Family**) saves the connection privately inside that browser's `localStorage` and immediately strips the URL parameters from the address bar.
2. **Profile Gate & Optional 4–6 Digit PIN**:
   - Each person taps their profile card (or creates a new member profile choosing their name, emoji/theme, preferred UI language `FR`/`EN`, and optional email for Gazette/reminder delivery).
   - Members can protect their profile with an optional **4–6 digit PIN** (stored as salted SHA-256 `familygazette-v1:<profileId>:<pin>`). In connected cloud mode, logging in issues an HMAC-SHA256 signed `sessionToken` valid for 30 days.
   - If someone forgets their PIN, any **Family Admin** can reset or remove it directly inside the keypad dialog.
3. **"Remember me on this device" (`localStorage` vs `sessionStorage`)**:
   - Keeping **Remember me on this device** checked persists both the selected profile ID and cloud `sessionToken` in **`localStorage`**, so reopening the website or mobile Home Screen shortcut signs them straight back in.
   - Unchecking it on a shared computer stores the session in **`sessionStorage`** instead, clearing authentication automatically when the tab closes.

---

## Local Development

```bash
npm install
npm run dev      # Start Vite dev server
npm test         # Run Vitest unit & sync test suite
npm run build    # Type-check (tsc -b) and build production bundle to dist/
npm run pdf:cli  # Generate a local sample Gazette PDF check script
```

---

## Google Drive Sync Setup (Free, 5 Minutes)

Follow the illustrated step-by-step instructions in [`apps-script/SETUP.md`](./apps-script/SETUP.md) to deploy `apps-script/Code.gs` on [script.google.com](https://script.google.com).

---

## Deploying to GitHub Pages

This repository includes [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml):

1. Push the contents of this folder to a GitHub repository with default branch `main`.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Every push to `main` runs `npm ci`, `npm test`, builds with `VITE_BASE_PATH='./'`, and deploys `dist/` to GitHub Pages.

> **Security Note:** Never store your Apps Script `/exec` URL (`VITE_APPS_SCRIPT_URL`) or your `FAMILY_INVITE_CODE` in GitHub Actions variables or source code — anything passed through `VITE_*` is compiled into public static JavaScript. Instead, manage `FAMILY_INVITE_CODE` exclusively in Apps Script **Script Properties** and share access privately with relatives via **Invite Family → Magic Invite Link**.
