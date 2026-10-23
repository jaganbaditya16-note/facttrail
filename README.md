# FactTrail

**Evidence-first tracking for deadlines, eligibility, fees, and requirements.**

FactTrail is a local-first prototype for collecting public program pages, extracting candidate facts with local AI, and detecting page-content changes.

> **Prototype notice:** Starter records are fictional. Extracted facts require human review. Scheduled background monitoring and automatic alerts are not implemented.

## Features

- Fetch and save public webpage sources.
- Extract candidate deadlines, eligibility details, and fees using local Ollama.
- Show extracted evidence and review statuses.
- Store sources and page snapshots in local SQLite.
- Compare normalized page content using SHA-256 hashes.
- View previous and current text when a change is detected.
- Manually recheck an individual source or run a batch recheck.

## Technology

- Next.js, React, TypeScript, and Tailwind CSS
- Ollama with `llama3.2:1b`
- SQLite through Node.js `node:sqlite`
- SHA-256 content hashing

## Requirements

- Node.js 24 or a compatible version supporting the SQLite API used here
- npm
- Ollama
- Internet access for fetching public webpages

## Setup on Windows

1. Install Node.js and npm.
2. Install Ollama from https://ollama.com/
3. In PowerShell, run `ollama pull llama3.2:1b`.
4. Navigate to the app using `Set-Location "$HOME\Projects\facttrail\web"`.
5. Install dependencies with `npm install`.
6. Start the app with `npm.cmd run dev`.
7. Open http://localhost:3000.

Ollama must be running locally for AI extraction.

## Verification

Run these commands from the `web` directory:

- `npm.cmd run lint`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`

## Change detection

The first snapshot establishes a baseline. Later manual rechecks fetch the page again and compare its normalized content hash with the stored version. Changed snapshots appear in Change history.

A page-content change does not necessarily mean a deadline, fee, or eligibility requirement changed. Review the evidence before acting. A failed fetch is not proof that a page is unchanged.

## API routes

| Route | Purpose |
|---|---|
| `POST /api/fetch-source` | Fetch public webpage text |
| `POST /api/extract` | Extract candidate facts with Ollama |
| `GET /api/sources` | List saved sources |
| `POST /api/sources` | Save a source |
| `GET /api/snapshots?sourceId=...` | List snapshots for a source |
| `POST /api/snapshots` | Record a snapshot |
| `GET /api/change-history` | Read recorded content changes |
| `POST /api/recheck-sources` | Recheck saved sources in a batch |

## Local data

The database is stored at `web/data/facttrail.sqlite`. This directory is excluded from Git, so locally saved records are not uploaded with the source code. Back up the database separately if you need to preserve those records.

## Current limitations

- Rechecks are manual; scheduled checks are not implemented.
- Automatic notifications and alerts are not implemented.
- Change detection compares page text, not the meaning of individual facts.
- AI-extracted facts can be incomplete or incorrect.
- Some websites block automated fetching.
- The public-page fetching feature has not received a complete production security audit.
- Fictional sample records are demonstrations, not verified opportunities.

Always confirm important information on the official source before making an application or eligibility decision.

## Cost

FactTrail is designed to use local AI without a paid AI API. Fetching public webpages requires internet access. Optional hosting or external services may incur costs if added later.

## Contributing

Bug reports and improvements are welcome. Do not commit local databases, credentials, environment files, or generated build output.

## License

MIT. See `LICENSE`.