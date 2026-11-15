# RL Survey Lab — Research Command Center

A free, local-first research dashboard for planning and writing a credible reinforcement learning survey.

## Start on Windows (recommended)

1. Extract all files from `RL_Survey_Lab_Website.zip` into a folder.
2. Double-click **Launch_RL_Survey_Lab_Windows.bat**. It opens the website at `http://localhost:8000` using Python's built-in local web server.
3. Leave the small server terminal open while using the site. Close it when finished. You can return to the same local address later to keep working.

Python is required for the one-click Windows launcher. Alternatively, use a terminal in this folder:

```bash
python -m http.server 8000
```

Then visit **http://localhost:8000** in a browser. On macOS/Linux, `python3 -m http.server 8000` may be needed.

You can also double-click `index.html`, but `file://` browser security rules vary; the local server is more reliable for browser storage, file uploads and the live feed. The separate `RL_Survey_Lab_Standalone.html` release is a convenient single-file alternative.

## Included

- **Overview**: rotating quote each app opening, daily affirmation, research stages, streak, learning progress, and newest RL papers.
- **Learning**: David Silver's RL lectures, Berkeley CS285, Hugging Face Deep RL, and optional Stanford CS234; track lectures individually.
- **Research roadmap**: 7 scaffolded stages with learning outcomes, checkboxes, exit criteria and your next action.
- **Paper library**: to-read/reading/read/included/excluded; notes on problems, evidence, assumptions, limitations, cross-paper connections, and local PDF attachments.
- **Documents**: your actual 13-page RL survey research playbook with preview/download, plus local uploads.
- **Research radar**: filtered recent research publications fetched from OpenAlex on demand, with links to arXiv, Hugging Face papers and OpenReview. This is research metadata, not a news/editorial service. Results depend on network availability and API rate limits.
- **Focus & streaks**: stopwatch, manual sessions, 15-minute active-day streak, recent session history and seven-day chart.
- **Research journal**: reflective notes, weekly synthesis prompts and November/December time budgets.
- **Backup & settings**: full JSON export/import (including files), goal settings, and a progress snapshot for ChatGPT.

## The plan seeded from your conversation

- **November 14–30, 2026**: ~20 focused hours per week. Prioritize foundations, major research directions, 8–12 seed surveys and 3 candidate topics.
- **December 2026**: ~33 focused hours per week. Compare candidates, inspect current literature and existing surveys, discuss with PI, and formulate a defensible provisional scope.
- **January 2027 onward**: focused evidence analysis, synthesis and manuscript drafting.

These are targets rather than completed milestones. The dashboard starts at **Stage 1**, **zero logged hours**, **zero completed courses**, and **no papers marked read**.

## Important limits

**This is a static, browser-based application, not a deployed cloud service.** Course tracking, study logs and notes are stored with `localStorage`; user-uploaded files live in browser `IndexedDB`. Clearing browser data can delete them. Save regular **full backups** and import them to move your workspace between devices. Use the same browser and site URL consistently if you want to continue with existing data.

**There is no automatic ChatGPT sync**: the site cannot read this conversation, and ChatGPT cannot see or edit files stored locally in your browser. Use **Backup & settings → Copy progress snapshot for ChatGPT** when you want ChatGPT to update the plan; updated website files or a suitable import will need to be applied separately.

Public hosting is optional: upload the static files to GitHub Pages or another static host. Do **not** commit your private uploaded research PDFs or private notes to a public repository. The included original playbook PDF would be publicly accessible on a public hosted site.

The site uses no paid API, no sign-in, and no user analytics. The OpenAlex public API may impose rate limits or change its access policy. External course and paper links require internet access.

## License

The application code in this deliverable is provided for your personal research use. The original user-owned PDF is bundled unchanged, and third-party courses remain linked to their respective sites rather than copied.
## Upcoming advisor collaboration (feature branch only)

The `feature/pi-advisor-dashboard` branch prototypes two authenticated pages:
- `pi.html`: submit requests for PI review, receive approval/denial/revision feedback and recommendations, choose and publish visible progress.
- `advisor.html`: advisor reviews progress, approves/denies/requests changes, and sends written notes/suggested readings.

The new workflow is **disabled until Supabase is configured, invitations are issued, the RLS migration is deployed and security tests pass**. No data from local research storage is automatically synchronized. There are no new cloud accounts or messages on the live GitHub Pages deployment yet.

See `docs/PI_ADVISOR_DASHBOARD_PLAN.md` for installation and test requirements.
