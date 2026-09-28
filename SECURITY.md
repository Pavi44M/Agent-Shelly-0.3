# Security

Shelly is a portfolio project that runs on **synthetic data**. It's built as if it could handle a real store's data, and this page explains how.

## Reporting a problem
Please open a private report under **Security → Report a vulnerability** on GitHub rather than a public issue. I aim to reply within 7 days.

## Design principles
| Area | What Shelly does |
|---|---|
| **Data minimisation** | The website and any LLM only receive *computed facts* (KPIs, actions, exceptions). Raw transactions never leave the Python pipeline. |
| **Human in the loop** | Money-moving, compliance, price, range and credit judgements are *proposals* in the decision log. Nothing is actioned until a person confirms it. |
| **Audit trail** | The decision log is append-only JSONL. Every run writes a validation report with SHA-256 hashes of its inputs and config. |
| **No secrets in the repo** | Credentials only come from environment variables (`SHELLY_SMTP_*`, `SHELLY_ERP_URL`, `ANTHROPIC_API_KEY`). `.env`, `state/`, `reports/` and `data/real/` are git-ignored. |

## Web app (docs/)
- **Content Security Policy:** scripts only from this site (no inline or third-party JS). Network calls only to `localhost` (Ollama/OpenJarvis) and `api.anthropic.com`. `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `no-referrer`.
- **Output encoding:** every value is HTML-escaped before rendering, including LLM and agent replies. Markdown is applied only after escaping.
- **API keys:** kept in `sessionStorage` by default, so they're forgotten when the tab closes. They go to `localStorage` only if you tick "Remember", are format-checked, and are never logged or sent anywhere except the Claude API.
- **Input limits:** questions are cleaned of control characters and capped at 500 characters. LLM calls are rate-limited (1 per 1.5 s, 40 per hour). Replies are capped at 2,500 characters.
- **Prompt-injection guard:** the system prompt tells the model to ignore instructions inside the question. Replies from other agents are labelled "not verified by Shelly".
- **Relevance router:** out-of-scope questions are *not* answered by guessing. Shelly explains which kind of agent to connect, and a question is only sent to a connected agent when you tap **Send**. Local agents must be on `localhost`.
- **Clear my data:** Settings → "Clear all Shelly data from this browser" removes every stored preference, decision and key.

## Python pipeline
- **SQL:** table names must be plain identifiers (letters, digits, underscore), which blocks injection. Raw `SELECT` is disabled unless a connector sets `allow_raw_sql: true`, and even then only a single statement is allowed.
- **Files:** connector reads and writes are confined to the configured folder (no `../` traversal).
- **HTTP:** HTTPS only (or localhost), 30 s timeout, 10 MB response cap. Google Sheets must be `https://docs.google.com/` published-CSV links.
- **Decision imports** from the web app are treated as untrusted: 1 MB cap, schema check, ID format `D-xxxxxxxx`, only IDs already in the log, notes truncated to 500 characters.
- **Tests:** `tests/test_security_router.py` covers each of the above.

## Scheduled TD Report
It runs in Claude with pre-approved, narrowly scoped actions: web research, the user's own Shelly Drive folder, reading replies to past TD Reports, and emailing only the owner. It never deletes files, and it treats instructions found in web pages or emails as data.

## Known limits
- GitHub Pages can't set HTTP security headers, so the CSP is delivered by `<meta>`. That means `frame-ancestors` (clickjacking) can't be enforced there.
- Browser speech recognition is provided by the browser vendor. On some browsers (e.g. Chrome), audio is processed by the vendor's cloud service.
