# BeliefState agent integrations

Connect your agent to cited investor theses, investment risks, catalysts and research changes.

- **Gemini CLI:** a remote MCP configuration using your BeliefState account.
- **Research skill:** retrieval guidance for stock and investment-theme questions.
- **HTTP examples:** a Postman collection for free discovery and unsigned x402 quotes.
- **Research update workflow:** a dependency-free Node.js example for a current company snapshot and ordered research changes.

## Quick start

With Gemini CLI installed:

```sh
gemini extensions install https://github.com/Antcolombo/beliefstate-agent-integrations
```

This installs a configuration example. Before authenticating, check your client's
current admission at [connection setup](https://beliefstate.ai/connect?ai=other).
Native Gemini OAuth and research delivery have not been verified for this package.
Installing the extension or seeing authorization metadata does not establish
access. If Gemini is admitted, run `/mcp auth beliefstate`, complete browser consent,
check free coverage, then request research using your account allowance or credit.
Use the [published Claude connector](https://claude.ai/directory/beliefstate) for
that supported path, or the developer workflow below with your existing API key.
See [account setup and pricing](https://beliefstate.ai/agent-quickstart.md).

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

## Integration files

| File                                                              | Purpose                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [gemini-extension.json](gemini-extension.json)                    | Connect Gemini CLI to the account OAuth MCP endpoint.                                 |
| [Research skill](skills/beliefstate-research/SKILL.md)            | Retrieve and explain attributed investor views with their dates, evidence and limits. |
| [Postman collection](postman/beliefstate.postman_collection.json) | Import free discovery and unpaid quote requests into Postman.                         |

The skill can also be copied into a compatible client's skill directory. It
provides instructions; access to the hosted research service is configured
separately. Follow the client's own installation and authentication controls.

## Explore the API

These requests are free and require no account or wallet:

```sh
curl --fail-with-body https://beliefstate.ai/v1/research
curl --fail-with-body 'https://beliefstate.ai/v1/tickers?q=NBIS'
curl --fail-with-body https://beliefstate.ai/v1/research/get_belief
```

The [catalog](https://beliefstate.ai/v1/research) lists all 16 paid research tools
and exact prices: fourteen data tools at 0.02 USDC, comparison at 0.50 USDC and
model-assisted search at 1.50 USDC per call on Base. The Postman quote requests
return payment requirements and do not sign or submit payments.

## Connection options

| Access      | Endpoint                                 | Authentication                                                             |
| ----------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| Account MCP | `https://beliefstate.ai/mcp`             | OAuth through your MCP client.                                             |
| Wallet MCP  | `https://beliefstate.ai/v1/research/mcp` | A compatible x402 wallet client and authorized payment for research reads. |
| HTTP API    | `https://beliefstate.ai`                 | Account API access or the catalog's x402 routes.                           |

Use the [OpenAPI contract](https://beliefstate.ai/openapi.json) and
[MCP documentation](https://beliefstate.ai/docs/mcp-server.md) for current schemas.
Keep credentials in your client's private secret storage. Shared collection
variables contain no account credentials or payment authorizations.

## Requirements and support

Gemini CLI requires its supported runtime and local browser access for OAuth.
Other clients need remote Streamable HTTP MCP or HTTP API support. Wallet access
requires a client that supports BeliefState's x402 flow; this package does not
add a payment signer. Client-specific sign-in and lifecycle checks remain
separate from configuration validation.

Report integration issues in this repository. For account or service issues,
contact [support@beliefstate.ai](mailto:support@beliefstate.ai). Report security
issues privately to that address. Service information: [beliefstate.ai](https://beliefstate.ai).

## License

[MIT](LICENSE) covers the Gemini configuration, context and Postman collection.
[MIT](LICENSE) also covers the workflow code. Research samples retain the service
data terms and their stated provenance and limitations.
The research skill uses [MIT-0](https://spdx.org/licenses/MIT-0.html), as declared
in its frontmatter. Hosted research access and data remain subject to
[BeliefState's service terms](https://beliefstate.ai/terms).
