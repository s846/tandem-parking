# Tandem — shared parking board

A small mobile-friendly website for two roommates who share tandem parking.

**What it does**
- Displays a top-down view: garage → front spot → rear spot → street.
- Tap either spot and choose a person's car or **Leave empty**.
- If you move a car to the other spot, its original position clears automatically.
- Shows **who is blocking whom**, when both cars are present.
- **Swap positions**, **Clear driveway**, and **Edit people & cars**.
- With Firebase configured, edits are saved online and appear on both phones live; no account sign-in is required for your roommates.

## Try it first

Open `index.html` in a browser. Before Firebase is configured, the website runs in **preview/demo mode**. It saves only in that browser and **does not synchronize between people or devices**.

## Make it work on both phones (Firebase setup)

These are one-time setup steps for the person deploying it. Firebase and GitHub Pages offer no-cost tiers for small personal projects, subject to their published limits and terms.

1. Open the [Firebase console](https://console.firebase.google.com/) and create a project. You can turn off Google Analytics for this project.
2. In the project overview, add a **Web app** (`</>`). Register it (e.g., `tandem-parking`). Copy its `firebaseConfig` values.
3. In **Build → Realtime Database**, click **Create database**. Select a location. You can start in **Locked mode** since you're about to publish custom rules. Copy the database URL shown there (it starts with `https://` and ends with `firebaseio.com` or `firebasedatabase.app`).
4. Open **Build → Authentication → Sign-in method**. Enable **Anonymous** authentication and save. This lets both people use the site without creating accounts.
5. In **Realtime Database → Rules**, replace the current rules with the contents of `database.rules.json`. Click **Publish**. Never leave the database in public/test mode. These rules require Firebase authentication and valid, long random room IDs.
6. **Firebase setup is already entered in `config.js` for project `tandemparking-cb6e2`,** including the Realtime Database URL `https://tandemparking-cb6e2-default-rtdb.firebaseio.com`. Do not replace it unless you switch projects. The browser-facing Firebase API key is an application identifier, not a secret password. **Your security comes from your Firebase rules and the private random driveway link.** Do not put service-account secrets in a web page.

7. **Publish the website on GitHub Pages**:
   - Create a GitHub repository (e.g. `tandem-parking`).
   - Upload the files from this folder to the *root* of that repository: `index.html`, `styles.css`, `app.js`, `config.js`, and `README.md`. You can also upload `database.rules.json`; it is not automatically deployed to Firebase, so step 5 is still required.
   - Go to **Settings → Pages**, choose **Deploy from a branch**, branch **main** and folder **/(root)**, then Save.
   - Open the GitHub Pages URL after it has been published (typically `https://YOURUSERNAME.github.io/tandem-parking/`).
   - If Firebase reports `auth/unauthorized-domain`, open **Firebase Authentication → Settings → Authorized domains**, add `YOURUSERNAME.github.io`, and save.

8. Open the published website. Check that the badge says **Live sync on**, not **Demo mode** or **Sync offline**. Tap the gear icon to set both people's names and car descriptions. Click **Copy shared link** and send it to your roommate. **Both people must open the exact same URL, including the `#room=...` section.** Bookmark it or add it to your home screen.
9. To confirm syncing, load the shared link on both phones (or two browser windows), change a spot on one, and verify the other updates immediately.

## Important privacy / access notes

- **Anyone who receives the unguessable shared link can view and change that room's parking information.** This is *link-only access*, not identity-verified access or a password-protected site. Treat the full room URL as private.
- Anonymous authentication blocks unauthenticated database access, but a person who obtains the room ID and has access to the site may use that room. For stricter access controls, use real user accounts and member-specific security rules instead.
- Keep personal information to first names and car descriptions. The site doesn't track vehicle locations by GPS; positions are entered manually.
- The room code is generated randomly in the browser. Opening the home URL without its `#room` fragment creates **a different driveway**. If you lose the shared link, share the original URL from someone who still has it.
- If you later update `config.js`, deploy the edited file to your website host. Firebase configurations do not automatically transfer to other projects.
- This project uses Firebase Realtime Database, Firebase Authentication (anonymous), and hosted Firebase JavaScript SDK imports. Live mode needs an internet connection.

## Project files

| File | Purpose |
| --- | --- |
| `index.html` | Webpage and dialogs |
| `styles.css` | Desktop/mobile styling |
| `app.js` | Parking state, interactions, and live synchronization |
| `config.js` | Pre-filled Firebase project configuration (including database URL) |
| `database.rules.json` | Database security rules for Firebase console |
| `README.md` | Setup and usage guide |

Built as a plain static website: no npm, no backend server to maintain, and no build step.
