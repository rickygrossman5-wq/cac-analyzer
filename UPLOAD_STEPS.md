# How to put this on GitHub and get a shareable link

You have two ways. Pick one.

---

## Option A — Upload in the browser (no command line)

1. Go to https://github.com/new and create a repository (e.g. `cac-analyzer`).
   Leave it empty — do NOT add a README or .gitignore.
2. On the new repo page, click **"uploading an existing file"** (or **Add file → Upload files**).
3. Unzip `cac-mom-site.zip` on your computer, then drag **everything inside the folder**
   (index.html, deepdive.html, the .js files, styles.css, the `vendor` folder, etc.)
   into the upload area. Important: drag the *contents*, not the outer folder.
4. Click **Commit changes**.
5. Go to **Settings → Pages**. Under **Build and deployment**:
   - If you see a **Source** dropdown set to "GitHub Actions" — leave it; the included
     workflow deploys automatically. Wait ~1 minute.
   - Otherwise set **Source = Deploy from a branch**, **Branch = main**, **Folder = / (root)**,
     and click **Save**.
6. After ~1 minute your link appears at the top of the Pages settings:
   `https://<your-username>.github.io/<repo-name>/`
   Share that. The deep-dive page is at `.../deepdive.html`.

---

## Option B — Command line (Git)

From inside the unzipped folder:

```bash
git init
git add .
git commit -m "CAC analyzer"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

Then do step 5–6 from Option A (Settings → Pages).

---

## Notes for sharing with coworkers

- The link is **public** — anyone with it can open the page. The CSV data itself never
  leaves the browser (all analysis runs client-side), but the page is reachable by anyone.
  If you need it private, use a host with access control instead of public GitHub Pages.
- Coworkers bring their own CSVs; nothing is stored or pre-loaded.
- No build step, no server, no dependencies to install — it's plain static files.
