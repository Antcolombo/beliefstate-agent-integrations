# BeliefState

[![M8ven Score](https://m8ven.ai/badge/mcp/antcolombo-beliefstate-agent-integrations-14yb24?v=22eba6ff15b9deea5fc43a06130a3c8d)](https://m8ven.ai/mcp/antcolombo-beliefstate-agent-integrations-14yb24?s=readme)

Bring cited investor theses, risks, catalysts and research changes into your AI through a hosted MCP server.

- **Research with evidence:** read attributed investment cases with source links, dates and explicit coverage gaps.
- **Compare views:** inspect differing theses, risks, conditions and publication-based outcomes.
- **Follow changes:** retrieve dated case revisions, engine assessments and research journals with their separate clocks.

## Connection, authentication and pricing

Both research endpoints use **Streamable HTTP**. No local server or BeliefState SDK is required.

| Connection  | Remote endpoint                          | Authentication and billing                                                                                                                     |
| ----------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Account MCP | `https://beliefstate.ai/mcp`             | OAuth for admitted clients, or `Authorization: Bearer` with your BeliefState API key. Research uses your account allowance or prepaid credits. |
| Wallet MCP  | `https://beliefstate.ai/v1/research/mcp` | An x402-capable client pays in USDC on Base (`eip155:8453`). No BeliefState account, API key or subscription is required.                      |

Account pay-as-you-go access is **$20 for 1,000 standard research requests** ($0.02 per successful request with nonexpiring prepaid credit). One AI question can make several requests. Subscription allowances and existing grants have their own terms; check [current account pricing](https://beliefstate.ai/pricing). Connecting a client or creating a key does not add research credit.

<!-- BEGIN CATALOG PRICING -->
Wallet pricing is separate: **18 data tools cost 0.02 USDC each**, `get_comparison` costs **0.50 USDC**, and `get_search_results` costs **1.50 USDC** per call. Inspect the [live catalog and exact quotes](https://beliefstate.ai/v1/research) before authorizing payment. Account research uses the separate account prices above.

`get_companies`, `get_news`, `get_tickers` are free on both endpoints. Account-only `get_research_sample` and `get_account_status` are also free. Account tracking uses `get_tickers(tracked_only=true)`. `get_news` returns SEC filing metadata; it is not a general news-headline feed. Browser OAuth availability depends on the client's admission; check [Connect AI](https://beliefstate.ai/connect?ai=other) before paying.
<!-- END CATALOG PRICING -->

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

These steps follow the current [VS Code setup guide](https://code.visualstudio.com/docs/agent-customization/mcp-servers) and [MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration). The older VS Code `servers`/`${input:...}` format is different: interactive inputs are not forwarded to Copilot harness sessions. Never put a literal key in shared configuration, source control or chat. On November 8, 2026, a standard MCP client authenticated with a Bearer key, verified all 25 live schemas and completed the free `get_account_status` call. The native editor lifecycle has not been separately tested.

## MCP tools

<!-- BEGIN TOOL CATALOG -->
The account endpoint exposes **25 tools**. Wallet MCP exposes **23 tools**: 20 paid research tools and 3 free discovery tools. A2A advertises 23 research and discovery capabilities. Call `tools/list` on the connected MCP endpoint for its current names, descriptions and schemas. The [wallet HTTP catalog](https://beliefstate.ai/v1/research) shows the current purchase contracts and prices.

The account transport can advertise research context, model and conversation fields for analytics. Clients that send `DNT: 1` or `Sec-GPC: 1` receive the base schemas in this catalog. Keep personal details and credentials out of context.

| Tool | What it does | Access |
| --- | --- | --- |
| `get_account_status` | Check how many standard research requests the connected account has left, including signup or purchased requests and subscription allowance. | Free; account only |
| `get_brief` | Retrieves a cited research brief for a company, ETF or research subject, including investor theses, risks, catalysts, changes and available market context. | 0.02 USDC (wallet); account billing |
| `get_case` | Retrieves one complete investment case by returned belief_id: investor, reasoning, evidence, risks, catalysts, conditions, revisions, outcomes, provenance and coverage gaps. | 0.02 USDC (wallet); account billing |
| `get_cases` | Retrieves dated investment cases for one company or research subject, with optional investor, direction and time filters. | 0.02 USDC (wallet); account billing |
| `get_catalysts` | Retrieves evidence-linked catalysts for one company, research subject, investment case or the explicitly selected released corpus. | 0.02 USDC (wallet); account billing |
| `get_changes` | Retrieves the ordered research change journal for a company, subject, case or explicitly selected released corpus. | 0.02 USDC (wallet); account billing |
| `get_companies` | Retrieves matching SEC-registered US companies by ticker or company name. | Free |
| `get_company_facts` | Retrieves retained financial facts, company references, segment metrics, operating KPIs and management guidance for one ticker. | 0.02 USDC (wallet); account billing |
| `get_comparison` | Retrieves a cited engine comparison of two distinct investment cases using their returned belief_id and compare_to_belief_id. | 0.50 USDC (wallet); account billing |
| `get_context_assessment` | Retrieves a dated engine context assessment by its returned assessment identifier, including permitted supporting evidence and coverage limitations. | 0.02 USDC (wallet); account billing |
| `get_economic_calendar` | Retrieves retained US economic events in one ticker research scope. | 0.02 USDC (wallet); account billing |
| `get_insider_trades` | Retrieves source-reported insider transactions for one ticker. | 0.02 USDC (wallet); account billing |
| `get_institutional_holdings` | Retrieves reported institutional holdings for one ticker across supported retained 13F history. | 0.02 USDC (wallet); account billing |
| `get_investor_outcomes` | Retrieves an investor's stored publication-based outcomes for one company, research subject, investment case or the explicitly selected released corpus. | 0.02 USDC (wallet); account billing |
| `get_macro_context` | Retrieves retained government macroeconomic observations in one ticker research scope. | 0.02 USDC (wallet); account billing |
| `get_market_returns` | Retrieves supported split-adjusted close-price returns for one ticker versus SPY. | 0.02 USDC (wallet); account billing |
| `get_news` | Retrieves recent SEC filing metadata for one verified ticker: forms, filing and acceptance dates, official SEC links and the last observation time. | Free |
| `get_options_activity` | Retrieves retained options bars, flow aggregates and open interest for one ticker. | 0.02 USDC (wallet); account billing |
| `get_research_sample` | Start here after connecting: show one free dated investor research case with its citations, qualifications, risks, catalysts and explicit unknowns, then offer the returned research plans link. | Free; account only |
| `get_risks` | Retrieves evidence-linked risks for one company, research subject, investment case or the explicitly selected released corpus. | 0.02 USDC (wallet); account billing |
| `get_search_results` | Retrieves ranked published investment cases matching thesis, investment theme or trade setup, with an optional company or subject filter. | 1.50 USDC (wallet); account billing |
| `get_short_activity` | Retrieves retained short-interest and short-volume history for one ticker. | 0.02 USDC (wallet); account billing |
| `get_subjects` | Retrieves matching released research subjects by name or kind, including companies, industries and investment themes. | 0.02 USDC (wallet); account billing |
| `get_tickers` | Retrieves companies with direct research coverage and available record counts. | Free |
| `get_visual` | Retrieves saved research charts and tables for one investment case or context assessment. | 0.02 USDC (wallet); account billing |

`get_visual` lists visuals or opens one returned identifier. `get_case` includes optional relationship paths and hypothetical scenarios. `get_brief` accepts an explicit market-refresh selector. Segment, KPI and guidance coverage is bounded to admitted disclosures; absent history stays explicit.
<!-- END TOOL CATALOG -->

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
state and rerun the same command**. Recovery preserves the saved exact method, URL, body and payment authorization.
It never creates a second payment authorization. A saved private recovery proof
can be reused while valid; an HTTP401 challenge requires the original paying
wallet to sign a fresh response-recovery message. Keep the same private state.
Expired payment authorization closes the successful replay window. Honor the saved
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

New states use canonical tool names; saved version1 requests retain their exact
legacy paths, arguments and purchase identities.

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
an uncertain dispatch. At the standard prepaid rate, two successful reads use
$0.04 of credit. Plan allowances and grants have their own terms. This script
uses account REST. See the [MCP connection guide](https://docs.beliefstate.ai/guides/mcp-server)
for wallet access and prices.

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

| Resource                                                                           | Purpose                                                                                                   |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [MCP setup and usage documentation](https://docs.beliefstate.ai/guides/mcp-server) | Account OAuth/API-key and wallet connection guidance.                                                     |
| [Published Claude connector](https://claude.ai/directory/beliefstate)              | Connect through Claude's supported directory path.                                                        |
| [ClawHub connection package](skills/beliefstate-research/SKILL.md)                 | Connection instructions for the hosted MCP tools.                                                        |
| [Postman collection](postman/beliefstate.postman_collection.json)                  | Free discovery and typed tool contracts.                                                                  |
| [gemini-extension.json](gemini-extension.json)                                     | Optional Gemini CLI configuration example; native authentication and research delivery remain unverified. |
| [OpenAPI contract](https://beliefstate.ai/openapi.json)                            | Current REST schemas.                                                                                     |

Gemini is an optional configuration example, not the verified quick-start path. Check [current client availability](https://beliefstate.ai/connect?ai=other) before authenticating or paying. The ClawHub package supplies connection instructions; hosted access must be configured separately. The Postman collection contains no credentials or payment signer.

Explore free coverage and schemas without an account or wallet:

```sh
curl --fail-with-body https://beliefstate.ai/v1/research
curl --fail-with-body 'https://beliefstate.ai/v1/tickers?q=NBIS'
curl --fail-with-body https://beliefstate.ai/v1/research/get_case
```

## Maintain the catalog

Export the release catalog from the main product's `beliefstate:openai-package-build` command, then run `npm run sync:catalog -- /path/to/release.catalog.json`. This updates the current tool table, prices, Postman requests, registry metadata and schema hashes from one validated inventory. Publish these artifacts after the deployed inventory matches that release.

Run `npm test` and `npm run demo` before publishing changes. Keep provider namespaces, existing listing identities and saved wallet purchase state unchanged.

## Support

Report integration issues in this repository. For account, service or private security reports, contact [support@beliefstate.ai](mailto:support@beliefstate.ai). See the [MCP setup guide](https://docs.beliefstate.ai/guides/mcp-server) for usage and [beliefstate.ai](https://beliefstate.ai) for service information.

## License

[MIT](LICENSE) covers the Gemini configuration, context and Postman collection.
[MIT](LICENSE) also covers the workflow code. Research samples retain the service
data terms and their stated provenance and limitations.
The ClawHub connection instructions use [MIT-0](https://spdx.org/licenses/MIT-0.html), as declared
in its frontmatter. Hosted research access and data remain subject to
[BeliefState's service terms](https://beliefstate.ai/terms).
