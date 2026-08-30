# Furniture Inventory — Shared, Multi-User (Firebase)

You manage inventory from anywhere; your staff view live stock from the shop WiFi (or
anywhere too, technically) — no login needed for them. Real-time: when you change stock,
staff see it update automatically, no refresh needed.

## How this differs from the offline PWA version

- **Data lives in Firestore** (a cloud database), not on one device — that's what makes
  it shared and accessible from anywhere.
- **You sign in** (email + password) to unlock Manage mode. Staff use Browse mode with no
  login at all.
- **Real-time sync** — Firestore pushes updates to every open device instantly. No pull-
  to-refresh, no polling.
- **Needs internet** to sync — this is the direct tradeoff for "accessible from anywhere."
  It still shows your last-synced data if connectivity drops (via Firestore's own offline
  cache), but new changes made elsewhere won't appear until you're back online.
- **Excel/CSV import-export was dropped** in this version — bulk-replacing shared live
  data from a file felt too risky to leave in the main UI (one wrong upload wipes
  everyone's view instantly). **Backup (JSON)** is still there as a safety-net download.
  Ask me if you want a careful, confirmation-gated restore feature added back.

---

## Part 1 — Create your Firebase project (~10 minutes, one time)

1. Go to **console.firebase.google.com**, sign in with any Google account
2. Click **Create a project** → name it anything (e.g. `brasscity-inventory`) → you can
   disable Google Analytics for this (not needed) → **Create project**

### Enable Firestore (the database)
3. In the left sidebar, click **Build → Firestore Database** → **Create database**
4. Choose **Start in production mode** → pick a location close to you (any nearby region)
   → **Enable**

### Set the security rules
5. Still in Firestore, click the **Rules** tab at the top
6. Delete everything there and paste in the contents of **`firestore.rules`** (included
   in this download) → click **Publish**

### Enable Authentication (your manager login)
7. Left sidebar → **Build → Authentication** → **Get started**
8. Click **Email/Password** in the provider list → toggle it **Enable** → **Save**
9. Go to the **Users** tab → **Add user** → enter your own email and choose a password →
   **Add user**. This is the account you'll sign in with as manager — there's no
   "sign up" screen in the app itself, you add accounts here directly.

### Get your config values
10. Click the **⚙️ gear icon** (top-left, next to "Project Overview") → **Project settings**
11. Scroll to **Your apps** → click the **`</>`** (web) icon → give it any nickname → **Register app**
12. You'll see a code block with `const firebaseConfig = { apiKey: "...", ... }` —
    copy those exact values

## Part 2 — Configure the app

1. Open **`firebase-config.js`** from this download in any text editor (Notepad is fine)
2. Replace each `PASTE_YOUR_...` placeholder with the matching value you just copied
3. Save the file

That's the only file you need to edit.

## Part 3 — Deploy to GitHub Pages

Same process as before:
1. Create a GitHub repository, upload every file in this folder (keeping the folder
   structure — `icons/` included) — **except `firestore.rules`**, which isn't part of
   the app itself, it's just for pasting into the Firebase console (you already did that
   in Part 1)
2. Repo **Settings → Pages** → Source: "Deploy from a branch" → `main` / `/(root)` → Save
3. Your live URL appears after about a minute:
   `https://<your-username>.github.io/<repo-name>/`

## Part 4 — Install on phones

**You (Manager):**
- Open the URL → tap **⚙️ Manage** → sign in with the email/password from Part 1, step 9
- Add to Home Screen the same way as before (Android: ⋮ menu; iPhone: Share → Add to Home Screen)

**Staff:**
- Open the same URL → they land in **🏬 Browse** mode automatically — no login, no setup
- They can search by text, photo, or scan QR tags, but won't see any edit controls
- Add to Home Screen too, if you want it to feel like an app for them as well

Everyone opening that same URL sees the same shared, live inventory.

## A note on the manager password

There's only one manager account created directly in the Firebase console (Part 1, step
9) — this app has no "create account" screen. If you want a second person to also have
edit access, add another user the same way (Firebase console → Authentication → Users →
Add user) — anyone with valid credentials there can sign in and edit.

## Updating the app later

If you change any files and re-upload to GitHub, bump `CACHE_VERSION` at the top of
`sw.js` (e.g. `v1` → `v2`) so phones with the app already installed pick up the change
next time they open it with a connection available.

## Cost

Firebase's free tier ("Spark plan") comfortably covers a single shop's usage — reads/
writes/storage limits are generous for an inventory this size. You'd need very heavy,
sustained multi-store usage before hitting any billing at all, and Firebase won't charge
you unless you explicitly upgrade to a paid plan.
