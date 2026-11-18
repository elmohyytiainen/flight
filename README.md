# Flight (Pinjawo)

A gamified gym tracker: a PWA on GitHub Pages with a Google Sheet and Apps Script backend.
Project context, changelog and ideas are kept in the Claude Project "Pinjawo".

## Layout
| Path | What |
| --- | --- |
| `web/` | The app, published as-is to GitHub Pages. `engine.js` and `core.js` are the **only** copies of the logic. |
| `apps-script/` | `Code.gs` (backend), `appsscript.json` (manifest). `Engine.gs` and `Core.gs` are **generated**. Never edit them. |
| `scripts/build.js` | Generates the `.gs` files. `--stamp` sets the app version and `--staging` points the app at staging. |
| `tests/` | `npm test`. CI blocks a deploy if anything fails. |
| `.github/workflows/deploy.yml` | Push to `staging` deploys the staging Sheet. Push to `main` deploys the live Sheet and Pages. |

## Everyday flow
1. Work on the `staging` branch. Push, and CI deploys the code to the **staging** Sheet.
2. Test with `STAGING_API_URL=<staging /exec> npm run serve:staging`, or with `?demo=1`. Don't commit the staging `config.js`.
3. Merge to `main` on a Sunday evening, never right before a Mon or Fri session.
4. If the Sheet schema changed, run **Flight → Upgrade** in the live Sheet once.
5. Add an entry to the changelog in the Pinjawo project.

## One-time setup
1. **Apps Script API:** turn it on at https://script.google.com/home/usersettings.
2. **clasp login (on your computer):** `npm i -g @google/clasp@2.5.0`, then `clasp login`. This creates `~/.clasprc.json`. Treat it like a password.
3. **Get the live manifest first.** Run `clasp clone <live scriptId> --rootDir apps-script`. Keep the `appsscript.json` it downloads, because it holds the real OAuth scopes (Drive, Gmail). Delete the cloned `Engine.gs` and `Core.gs` (`npm run build` makes them) and `.clasp.json` (it's gitignored).
   - The scriptId is in Apps Script → ⚙ Project Settings → Script ID.
   - The deploymentId is in Deploy → Manage deployments: the ID of the deployment whose URL ends in `/exec`.
4. **Staging:** make a copy of the live Sheet (File → Make a copy, then delete the rows in Sessions, Sets, Stamps and Reactions). Deploy it once by hand as a web app (Execute as Me, access Anyone) to get its scriptId, deploymentId and /exec URL.
5. **GitHub secrets** (repo → Settings → Environments):
   - Repository secret `CLASPRC_JSON`: the contents of `~/.clasprc.json`
   - Environment `production`: `SCRIPT_ID`, `DEPLOYMENT_ID` (live)
   - Environment `staging`: `SCRIPT_ID`, `DEPLOYMENT_ID` (staging)
6. **Pages:** repo → Settings → Pages → Source: **GitHub Actions**. This replaces "Deploy from a branch", and the URL stays the same.
