# Google Drive & Apps Script Sync Setup (Free, $0/month)

FamilyGazette uses a single personal **Google Apps Script Web App** running under the Family Admin's Google account.

- **No Google Cloud Console project** needed
- **No OAuth Consent Screen / Domain Verification** needed
- **No billing or credit card** required
- **Relatives never log into Google** — they connect via a 1-click Magic Invite Link and authenticate with their optional personal 4–6 digit PIN.

---

## Folder Structure Created in the Admin's Google Drive

When initialized, `apps-script/Code.gs` automatically organizes everything inside `FamilyGazette/` on the Admin's Google Drive:

```text
FamilyGazette/
├── family-db.json                       # Shared journal database (LWW synced)
├── Photos/
│   └── 2026/
│       └── 2026-11/
│           └── 2026-11-18_Erwan_a1b2c3d4.webp  # Human-browsable originals (Year/Month/Date_Author_ID)
├── Gazettes/
│   ├── 2026-11_N01_Gazette-Novembre.pdf      # Saved A4 printable PDF editions
│   └── 2026-11_N01_Gazette-Novembre.html     # Self-contained offline HTML editions
└── .app-cache/
    └── thumbs/
        └── thumb_med-....webp                # Compact thumbnails kept separate from Photos/
```

This lets the Family Admin easily browse original photos by year and month or grab compiled Gazette PDF/HTML files directly from Google Drive.

---

## Step 1 — Create the Google Apps Script Project

1. Sign into the Google account that owns the family Google Drive and open [script.google.com](https://script.google.com).
2. Click **New project** and rename it (for example, `FamilyGazette Relay`).
3. Delete the placeholder code in `Code.gs`, copy the entire contents of [`apps-script/Code.gs`](./Code.gs) from this repository, and paste it into the editor.
4. Click the **Save** icon (`⌘+S` / `Ctrl+S`).

---

## Step 2 — Initialize Drive Folders, Signing Secret & Invite Code

1. In the top toolbar of the Apps Script editor, select the function **`initializeFamilyGazette`** from the function dropdown.
2. Click **Run**.
3. Google will ask you to authorize your own personal script:
   - Click **Review permissions** and choose your Google account.
   - Because this is an unpublished personal script, Google displays *"Google hasn't verified this app"*. Click **Advanced → Go to FamilyGazette Relay (unsafe) → Allow**.
   - Scopes requested: Google Drive (to create/read `FamilyGazette/`), `MailApp` (to send Gazette digests & T-3 reminders from your Gmail), and script triggers (only if you enable automated reminders in Step 5).
4. Open the **Execution log** (or **Project Settings → Script Properties**) to view your generated high-entropy **`FAMILY_INVITE_CODE`** (e.g. `FAM-8C4E19A72F0B`).
   - You can customize **`FAMILY_INVITE_CODE`** anytime in Apps Script **Project Settings → Script Properties** (for instance to a secret family passphrase). Client syncs never overwrite `FAMILY_INVITE_CODE`, and it is never stored in `family-db.json` or sent back to browsers.
   - Recommended: Set a **4–6 digit PIN** on at least your Admin profile (and any member profiles you want locked) inside the app.

---

## Step 3 — Deploy as a Web App

1. Click **Deploy → New deployment** (top right).
2. Click the gear icon beside **Select type** and choose **Web app**.
3. Configure **exactly**:
   - **Description**: `FamilyGazette v1`
   - **Execute as**: `Me (<your Gmail address>)`
   - **Who has access**: `Anyone`
4. Click **Deploy** (and authorize if prompted).
5. Copy the **Web app URL** ending in `/exec` (`https://script.google.com/macros/s/.../exec`).

> **Why "Anyone" + "Me"?**  
> Apps Script executes on your Drive without requiring family members to sign into Google, while every API call still enforces your `FAMILY_INVITE_CODE` (verified before returning family metadata or profiles), per-member salted SHA-256 PINs, HMAC-signed `sessionToken`s (isolating Private Messages & memories), and 32-character secret Gazette keys.

---

## Step 4 — Connect FamilyGazette & Invite Relatives

1. Open your FamilyGazette app (locally or on GitHub Pages).
2. Open **Family & Sync → Drive Sync Setup** (or click the cloud pill in the top header, or **Connect / Join Cloud Family** on the welcome screen).
3. Paste your **`/exec` Web App URL** and your **`FAMILY_INVITE_CODE`**, then click **Test & Connect**.  
   *(Keep both private — never commit your `/exec` URL or invite code into a public GitHub repository or GitHub Actions `VITE_*` variable.)*
4. Open **Family & Sync → Invite Family** to copy the **1-click Magic Invite Link** (`?join=1&api=...&code=...`) and pre-written WhatsApp/SMS/email message to share directly with relatives.

---

## Step 5 — Optional: Automated T-3 Reminder Emails & Hosted URL

1. In Google Apps Script, open **Project Settings → Script Properties** and add:
   - **Property**: `APP_PUBLIC_URL`
   - **Value**: Your deployed FamilyGazette URL (for example `https://<username>.github.io/FamilleWebGazette/`) so automated reminder emails include a direct link back to the family wall.
2. Back in the Apps Script **Editor**, select **`installDailyReminderTrigger`** from the function dropdown and click **Run** once.
3. This creates a daily 09:00 trigger calling `checkScheduledReminders()`, which checks your cadence and automatically emails contributors via `MailApp` `reminderDaysBefore` days ahead of publication (deduplicated per monthly/weekly cycle).

---

## Updating `Code.gs` Later Without Breaking Invite Links

Whenever you paste an updated version of `apps-script/Code.gs`:

1. Click **Deploy → Manage deployments**.
2. Click the **Edit** (pencil) icon next to your active Web App deployment.
3. Under **Version**, select **New version**, then click **Deploy**.

This keeps the exact same `/exec` URL so every Magic Invite Link and Gazette secret link continues to work.

---

## Free Tier Limits (<30 Members)

- **Drive Storage**: Counts against the Admin's standard Google Drive quota (15 GB free tier). Compressed photos typically use ~150–400 KB each, holding thousands of memories in <1 GB.
- **Email Quota**: Free `@gmail.com` accounts allow ~100 Gmail/MailApp recipients per rolling 24 hours — well above a <30 member family circle sending T-3 reminders and monthly Gazettes.
- **Per-execution PDF archiving**: PDFs under ~20 MB and self-contained HTML editions archive directly into `FamilyGazette/Gazettes/`. `MailApp` attaches PDFs up to 8 MB in Gazette emails (`MAX_PDF_ATTACHMENT_BYTES`).
