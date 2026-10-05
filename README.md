# n8n-nodes-blocksurvey

n8n community nodes for [BlockSurvey](https://blocksurvey.io).

- **BlockSurvey Trigger**: starts a workflow when a survey gets a new response. The output is one item,
  keyed by question title (`response_id`, `survey_id`, `survey_title`, `submitted_at`, `"<Question>": answer`, ...,
  plus `answers_by_question_id`).
- **BlockSurvey** → Contact → Create or Update: adds a contact to a contact list, or updates it if the
  email is already in the list.

## Installation

Self-hosted n8n: **Settings → Community Nodes → Install** and enter `n8n-nodes-blocksurvey`.

n8n Cloud only installs **verified** community nodes, so the package needs n8n's verification before it shows
up there.

## Credentials

Create a **BlockSurvey OAuth2 API** credential and click **Connect my account**. You sign in on BlockSurvey and
approve access. It is OAuth2 with PKCE and needs no client secret. Each workflow picks its own workspace.

| Environment | Sign-in page | API |
|---|---|---|
| Production (default) | `https://blocksurvey.io` | `https://webservice.blocksurvey.io` |
| Development | `http://localhost:4200` | dev backend on Render |
| Local | `http://localhost:4200` | `http://localhost:8080` |

## Testing locally

Runs n8n, the BlockSurvey backend and the BlockSurvey frontend on your machine. n8n needs about 2 GB of disk,
plus several GB of npm cache on the first run.

### 1. Backend (terminal 1)

```bash
cd blocksurvey-api-function
npm start            # listens on :8080
```

`config/dev/.env` must contain the dev `N8N_CLIENT_ID` and `N8N_ALLOW_LOCALHOST_HOOKS=true` (lets a local n8n
register `http://localhost` webhooks; dev only).

### 2. Frontend (terminal 2)

In `blocksurvey-v1/src/environments/environment.ts`, temporarily set:

```ts
CONNECTED_APPS_SVC_URL: "http://localhost:8080",
```

Then `npm start` and log in on `http://localhost:4200`. Revert the line before committing.

### 3. n8n with this package (terminal 3)

```bash
cd n8n-nodes-blocksurvey
npm install && npm run build

N8N_CUSTOM_EXTENSIONS=/path/to/n8n-nodes-blocksurvey \
N8N_SECURE_COOKIE=false \
WEBHOOK_URL=http://localhost:5678/ \
npx n8n@latest start
```

Open `http://localhost:5678` and create the local owner account. After a code change, run `npm run build` and
restart n8n.

### 4. Connect

**Credentials → Create credential → BlockSurvey OAuth2 API** → Environment **Local** → **Connect my account** →
**Allow** on the consent page. Expect "Connection successful".

### 5. Trigger

1. New workflow → **BlockSurvey Trigger** → pick the credential, a workspace and a survey.
2. Save and switch the workflow to **Active**.
3. In BlockSurvey, the survey's **Integrate** page shows the workflow under the n8n card.

### 6. Send a response

Real submissions are delivered from BlockSurvey's cloud functions, which can't reach `localhost`. Pick one:

**Sample payload (n8n side only).** Copy the trigger's Production URL:

```bash
curl -X POST "<Production URL>" -H 'content-type: application/json' \
  -d '{"event_id":"test-1","survey_response":{"answers":{"q1":"Gmail"},"definition":{"id":"<surveyId>","title":"Test","fields":[{"id":"q1","title":"Which email?"}]}}}'
```

**Real submissions (tunnel).**

```bash
cloudflared tunnel --url http://localhost:5678   # prints https://<random>.trycloudflare.com
```

Restart n8n with both URLs. `N8N_EDITOR_BASE_URL` keeps sign-in on localhost: without it n8n uses `WEBHOOK_URL`
as its own address, the OAuth callback lands on the tunnel host where you are not logged in, and Connect fails
with "Unauthorized".

```bash
N8N_CUSTOM_EXTENSIONS=/path/to/n8n-nodes-blocksurvey \
N8N_SECURE_COOKIE=false \
N8N_EDITOR_BASE_URL=http://localhost:5678/ \
WEBHOOK_URL=https://<random>.trycloudflare.com/ \
npx n8n@latest start
```

Switch the workflow off and on so BlockSurvey stores the tunnel webhook URL, then submit a real response on
`localhost:4200`. The tunnel URL changes every time `cloudflared` restarts; repeat the restart and toggle.

### 7. Action

Add **BlockSurvey → Contact → Create or Update** → workspace → contact list (its fields appear) → email →
**Execute step**. Expect `status: created`, `exists` or `updated`.

### 8. Clean up

Deactivate the workflow; BlockSurvey removes the webhook. Stop the tunnel and n8n with Ctrl+C.

### Troubleshooting

| Symptom | Cause |
|---|---|
| BlockSurvey missing from node/credential search | n8n started without `N8N_CUSTOM_EXTENSIONS`, or the package isn't built |
| "Unauthorized" after Allow | Callback reached a host where you aren't logged into n8n (set `N8N_EDITOR_BASE_URL`), or Connect was started outside the n8n UI |
| Empty dropdowns | Backend on :8080 not running, or the credential isn't set to Local |
| "hookUrl is not an allowed n8n URL" on activate | `N8N_ALLOW_LOCALHOST_HOOKS=true` missing in the backend's dev env |
| Submission doesn't start the workflow | Webhook URL is `localhost`; use the tunnel or the sample payload |

## Production backend

Only `N8N_CLIENT_ID` is needed; it must match `PROD_CLIENT_ID` in
`credentials/BlockSurveyOAuth2Api.credentials.ts`. Leave these unset in production:

- `N8N_REDIRECT_URI`: every n8n instance has its own URL. The backend accepts any `https` host on
  `/rest/oauth2-credential/callback` (plus loopback `http://localhost`, for n8n on a user's own machine;
  PKCE is required).
- `N8N_ALLOW_LOCALHOST_HOOKS`: dev only.

## Publishing

Releases are published to npm by GitHub Actions (`.github/workflows/publish.yml`) with an npm provenance
statement, which n8n requires for verified community nodes. Don't run `npm publish` locally.

One-time setup: on npmjs.com, open the package → **Settings → Trusted Publishers** → add **GitHub Actions** with
this repository and workflow `publish.yml`.

To release:

```bash
npm run lint
npm run release   # bumps the version, tags and pushes; the tag push triggers the publish workflow
```

Then submit the new version in the [n8n Creator Portal](https://creators.n8n.io/nodes).
