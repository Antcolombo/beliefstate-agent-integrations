# BeliefState

[![M8ven Score](https://m8ven.ai/badge/mcp/antcolombo-beliefstate-agent-integrations-14yb24?v=22eba6ff15b9deea5fc43a06130a3c8d)](https://m8ven.ai/mcp/antcolombo-beliefstate-agent-integrations-14yb24?s=readme)

Bring cited investor theses, risks, catalysts and research changes into your AI through a hosted MCP server.

- **Research with evidence:** read attributed investment cases with source links, dates and explicit coverage gaps.
- **Compare views:** inspect differing theses, risks, conditions and publication-based outcomes.
- **Follow changes:** retrieve dated case revisions, engine assessments and research journals with their separate clocks.

## Connection, authentication and pricing

Both research endpoints use **Streamable HTTP**. No local server or BeliefState SDK is required.

| Connection | Remote endpoint | Authentication and billing |
| --- | --- | --- |
| Account MCP | `https://beliefstate.ai/mcp` | OAuth for admitted clients, or `Authorization: Bearer` with your BeliefState API key. Research uses your account allowance or prepaid credits. |
| Wallet MCP | `https://beliefstate.ai/v1/research/mcp` | An x402-capable client pays in USDC on Base (`eip155:8453`). No BeliefState account, API key or subscription is required. |

Account pay-as-you-go access is **$20 for 500 nonexpiring credits** ($0.04 per successful research request). One AI question can make several requests. Subscription allowances and existing grants have their own terms; check [current account pricing](https://beliefstate.ai/pricing). Connecting a client or creating a key does not add research credit.

Wallet pricing is separate: **fourteen data tools cost 0.02 USDC each**, `compare_beliefs` costs **0.50 USDC**, and `search_beliefs` costs **1.50 USDC** per call. Inspect the [live catalog and exact quotes](https://beliefstate.ai/v1/research) before authorizing payment. The wallet endpoint requires payment support; an ordinary OAuth-only client cannot pay its quotes.

`get_tickers` and `search_companies` are free on both endpoints. Account-only `get_tracked_tickers` is also free. Browser OAuth availability depends on the client's admission; check [Connect AI](https://beliefstate.ai/connect?ai=other) before paying. The API-key setup below avoids assuming OAuth admission for a new client.

[VS Code / GitHub Copilot](#vs-code--github-copilot) · [Tools](#mcp-tools) · [Wallet starter](#run-a-wallet-funded-thesis-audit) · [Research workflow](#run-a-company-research-update) · [Other integrations](#other-integrations) · [Support](#support) · [License](#license)

## VS Code / GitHub Copilot

Use a current VS Code installation with AI features enabled and a Copilot agent session. This uses the current portable Copilot configuration format and a BeliefState API key; no local MCP runtime is needed.

1. Sign in to [BeliefState account setup](https://beliefstate.ai/account/setup) and obtain a developer API key for the account you want to use.
2. Make the key available as `BELIEFSTATE_API_KEY` in the environment of the host running the agent, using your private secret manager. For a remote workspace or container, provide it there. Start VS Code from that environment; setting it in an unrelated terminal after VS Code starts is insufficient.
3. Merge this configuration into your personal `~/.copilot/mcp-config.json` (or `mcp-config.json` inside `COPILOT_HOME` when set). Keep any existing server entries.

```json
{
  "mcpServers": {
    "beliefstate": {
      "type": "http",
      "url": "https://beliefstate.ai/mcp",
      "headers": {
        "Authorization": "Bearer ${BELIEFSTATE_API_KEY}"
      }
    }
  }
}
```

4. Start a new Copilot agent session. Open **Chat: Open Customizations > MCP Servers** to check `beliefstate`, and review any server-trust prompt. Enable its tools through **Chat: Open Customizations > Tools** if needed.
5. Ask **“Which companies does BeliefState cover?”** Expand the tool result and confirm BeliefState's free `get_tickers` returned coverage. Then ask a normal research question, such as **“What's the investment case for Nebius?”**, when you want to use research credits.

The free coverage call verifies discovery and authentication. A cited research answer additionally verifies research access and available allowance. A saved configuration or a plausible answer alone does not prove that a tool ran.

These steps follow the current [VS Code setup guide](https://code.visualstudio.com/docs/agent-customization/mcp-servers) and [MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration). The older VS Code `servers`/`${input:...}` format is different: interactive inputs are not forwarded to Copilot harness sessions. Never put a literal key in shared configuration, source control or chat. On October 29, 2026, a standard MCP client authenticated to the account endpoint with a Bearer key, listed all 19 tools and completed the free `get_tickers` call. The VS Code steps follow its current configuration reference; the native editor lifecycle has not been separately tested.

## MCP tools

The account endpoint exposes the following 19 tools. The wallet endpoint exposes the same tools except `get_tracked_tickers`: 16 paid research tools and two free discovery tools. [Live server cards](https://beliefstate.ai/.well-known/mcp/server-cards.json) provide current tool names and descriptions.

| Tool | What it does |
| --- | --- |
| `get_brief` | Read a company or ETF overview, or a bounded current thesis view with citations and gaps. |
| `get_beliefs` | List dated investment cases filtered by company, subject, investor, direction or time. |
| `get_belief` | Read one complete investment case and its permitted supporting evidence. |
| `search_beliefs` | Find investment ideas by thesis, topic or trade setup with cited matching passages. |
| `compare_beliefs` | Compare two cited cases for support, contradiction or dependency. |
| `get_belief_risks` | Read structured, evidence-linked risks and their assessed or unknown status. |
| `get_belief_catalysts` | Read evidence-linked catalysts and qualified condition statuses. |
| `get_author_track_record` | Read stored publication-based outcomes, including losses, pending cases and coverage gaps. |
| `search_entities` | Find released companies, industries, themes and other research subjects. |
| `get_belief_changes` | Read an ordered journal of revisions, distribution changes and calculated outcomes, preserving each event's domain and dates. |
| `get_context_assessment` | Read a dated engine assessment and its evidence, separate from an investor's stated view. |
| `list_research_visuals` | List cited charts and tables for a case or assessment. |
| `get_research_visual` | Read a chart or table, including exact rows or data points. |
| `get_belief_relationships` | Inspect cited relationship paths within an investment case. |
| `evaluate_belief_scenario` | Apply hypothetical conditions to a case's recorded model without changing its evidence. |
| `refresh_market_data` | Explicitly refresh missing or stale market context, then return a brief; this is a paid research operation. |
| `get_tickers` | List direct company research coverage and counts. Free. |
| `search_companies` | Search the SEC company directory and check research availability. Free. |
| `get_tracked_tickers` | Read the connected account's tracked companies. Free; account endpoint only. |

Use source dates, citations and coverage warnings from the returned records. Publication-based outcomes are not verified brokerage executions; missing coverage remains unknown.

## Run a wallet-funded thesis audit

Use Node.js 22 or later on macOS or Linux. This example buys cited company research
over HTTP using x402. It returns the research, source dates, coverage gaps and
matching payment receipts for your own assessment. It does not execute trades or
call a model. The default is one overview at **0.02 USDC**; optional case opens
cost another 0.02 each. An overview already includes selected cases, so open more
detail only when you need it.

1. Clone this repository, enter it, and install the pinned dependencies:

   ```sh
   git clone https://github.com/Antcolombo/beliefstate-agent-integrations.git
   cd beliefstate-agent-integrations
   npm ci --ignore-scripts
   npm test
   ```

2. Plan your requested company and spending cap without making network calls:

   ```sh
   node examples/wallet-thesis-audit.mjs --ticker NBIS --max-usdc 0.02
   ```

3. Check the live unsigned quote. This command cannot sign or pay:

   ```sh
   node examples/wallet-thesis-audit.mjs --ticker NBIS --max-usdc 0.02 --quote
   ```

4. Provide `PAYMENT_WALLET_PRIVATE_KEY` from your secret manager for a dedicated
   programmatic buyer wallet with native USDC on Base. Never export a recovery
   phrase or put keys in chat, source control, command arguments or shared logs.
   The buyer wallet is separate from BeliefState's receiving wallet.

5. Execute the approved purchase with a private state file:

   ```sh
   node examples/wallet-thesis-audit.mjs --ticker NBIS --max-usdc 0.02 \
     --execute --state .private/nbis-wallet-audit.json
   ```

Execution checks free released coverage first and validates the quote's exact
resource, receiving wallet, native USDC token, Base chain and price before signing.
The full authorization is flushed to private state before dispatch. The state
directory must be mode 700; its files must be mode 600. Keep the state private,
including in backups. Research output and receipts also belong in your private
workspace; payment signatures and keys are never printed.

To request detail for up to two case IDs returned by the overview, plan a separate
workflow with `--max-cases 2 --max-usdc 0.06` and a new state filename, then execute
those same arguments. Choose this before starting; an existing state's ticker,
cutoff, case limit and cap cannot change. The script reserves every signed
purchase against the total cap, including unresolved attempts. It never uses
illustrative discovery IDs or automatically buys model search/comparison.
The cap covers service payments only; wallet funding, bridges and network fees
are separate. Current quotes remain authoritative; changed terms stop execution.

Use `--as-of 2026-10-27T12:00:00.000Z` for a requested historical UTC cutoff.
Otherwise execution fixes its start time as the cutoff and retains it for every
case and retry. Dates, source qualifications, omissions and unknowns remain in
the returned research. No result is a claim of complete coverage or performance.

If a request is pending, interrupted or fails receipt validation, **keep the same
state and rerun the same command**. Recovery uses the saved exact method, URL,
body and signature, without signing again; a replay-only run needs no private key.
An expired authorization is still retained for recovery. Honor the saved
`retry_after`/`retry_at`; the script prevents an early replay. Any unresolved
purchase stops subsequent purchases, including on HTTP 402, 410 or 429. HTTP 410
alone does not prove a refund; inspect the private response and resolve the
purchase with support before authorizing another one. Do not delete or replace
uncertain payment state. A completed run returns its saved output without network
calls. Exit status 1 means the run stopped or reached its cap; inspect its status.

An exclusive `.lock` prevents concurrent use of one state. After a hard process
termination, confirm that no process still owns that exact state before removing
only its `.lock`; preserve the payment state. Add `--test` for owner QA and retain
it on every retry so those requests remain excluded from customer analytics.

Dependencies are pinned to `@x402/core@2.28.0`, `@x402/evm@2.28.0` and
`viem@2.57.10`. Offline tests use real SDK signatures with a public fixture key
and a fake HTTP server function; they do not submit live payments. This starter
does not add wallet signing to an MCP host; use an x402-capable host for wallet MCP.

## Run a company research update

Requires Node.js 22 or later. No dependency installation is needed.

Get the examples and enter their directory:

```sh
git clone https://github.com/Antcolombo/beliefstate-agent-integrations.git
cd beliefstate-agent-integrations
```

Inspect a dated public research example without credentials or network calls:

```sh
npm run demo
```

The dated sample summarizes a verified October 27, 2026 NBIS run: one current
case with a source link, seven journal events, and an intentional stop at the
two-read ceiling. The pending continuation remains separate from a completed
polling checkpoint. Coverage, omitted cases, unassessed fields and event domains
remain explicit. The sample omits account identity, credentials and opaque tokens;
it is a compact result summary, not a complete API response or current advice.

Plan the live workflow without making any requests:

```sh
node examples/research-changes.mjs --ticker NBIS --since 2026-10-20T00:00:00Z
```

Use the company and cutoff from your research question. The live workflow checks
free released coverage, reads a compact current snapshot with up to three cases,
then requests the ordered journal of research changes observed since that cutoff.
The output retains attributed evidence, source links, event domains, clocks,
quality gaps, history coverage, omissions and warnings. A journal event may be
an engine assessment, distribution change or calculated outcome; inspect its
domain before describing it as an author's revision.

For live account access, load your existing `BELIEFSTATE_API_KEY` from your secret
store. Creating a key or connecting OAuth does not add research credit. Check
[current account pricing](https://beliefstate.ai/pricing) and available allowance
before executing:

```sh
mkdir -m 700 .private
node examples/research-changes.mjs --ticker NBIS --since 2026-10-20T00:00:00Z \
  --execute --max-reads 2 --state .private/nbis-first.json > .private/nbis-first-output.json
```

Create `.private` with `mkdir -m 700 .private` before redirecting output into it.
The script also creates private state directories when no output redirection is
used. Keep returned research, state and checkpoints private. The key is neither
saved nor printed. Use `--test` for owner diagnostics; ordinary customer usage
should omit it.

`--max-reads` caps total account research dispatches in that state file, including
an uncertain dispatch. At the October 27 account pay-as-you-go rate, two reads
use $0.08 of credit; plan allowances and legacy policies can differ. This is a
read-count ceiling, not a currency authorization. Wallet x402 data reads have
their separate 0.02-USDC price. This script uses account REST and signs no wallet
payments; the [existing x402 quickstart](https://beliefstate.ai/agent-quickstart.md#pay-per-call-with-x402)
owns that path.

If the journal has another page, the script saves the continuation and stops at
the read ceiling. Resume the identical command with the same state file and a
larger explicit ceiling, up to 20. Completed results are reused locally. The
bounded current snapshot is not automatically paginated; its continuation and
omission fields remain in the result.

After a completed journal window, start a later poll with a new state file:

```sh
node examples/research-changes.mjs --ticker NBIS --previous-state .private/nbis-first.json \
  --execute --max-reads 2 --state .private/nbis-next.json
```

The old checkpoint stays unchanged until the new window is fully drained.
`resync_required`, `projection_catching_up` and `history_uninitialized` need
attention; they are not “no changes.” The example never creates a new request to
recover an uncertain dispatch: account request IDs prevent another debit but
completed response bodies are not retained for replay. Retain the state and ask
support to reconcile its request ID before another attempt. A `.lock` file after
a crash requires confirming the old process has stopped before removing it.

Run the offline safety checks with `npm test`.

## Other integrations

| Resource | Purpose |
| --- | --- |
| [MCP setup and usage documentation](https://docs.beliefstate.ai/guides/mcp-server) | Account OAuth/API-key and wallet connection guidance. |
| [Published Claude connector](https://claude.ai/directory/beliefstate) | Connect through Claude's supported directory path. |
| [Research skill](skills/beliefstate-research/SKILL.md) | Retrieval guidance for stock and investment-theme questions. |
| [Postman collection](postman/beliefstate.postman_collection.json) | Free discovery and unsigned x402 quote requests. |
| [gemini-extension.json](gemini-extension.json) | Optional Gemini CLI configuration example; native authentication and research delivery remain unverified. |
| [OpenAPI contract](https://beliefstate.ai/openapi.json) | Current REST schemas. |

Gemini is an optional configuration example, not the verified quick-start path. Check [current client availability](https://beliefstate.ai/connect?ai=other) before authenticating or paying. The research skill supplies instructions; hosted access must be configured separately. The Postman collection contains no credentials or payment signer.

Explore free coverage and schemas without an account or wallet:

```sh
curl --fail-with-body https://beliefstate.ai/v1/research
curl --fail-with-body 'https://beliefstate.ai/v1/tickers?q=NBIS'
curl --fail-with-body https://beliefstate.ai/v1/research/get_belief
```

## Support

Report integration issues in this repository. For account, service or private security reports, contact [support@beliefstate.ai](mailto:support@beliefstate.ai). See the [MCP setup guide](https://docs.beliefstate.ai/guides/mcp-server) for usage and [beliefstate.ai](https://beliefstate.ai) for service information.

## License

[MIT](LICENSE) covers the Gemini configuration, context and Postman collection.
[MIT](LICENSE) also covers the workflow code. Research samples retain the service
data terms and their stated provenance and limitations.
The research skill uses [MIT-0](https://spdx.org/licenses/MIT-0.html), as declared
in its frontmatter. Hosted research access and data remain subject to
[BeliefState's service terms](https://beliefstate.ai/terms).

