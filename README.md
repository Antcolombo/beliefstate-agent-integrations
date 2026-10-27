# BeliefState agent integrations

Connect your agent to cited investor theses, investment risks, catalysts and research changes.

- **Gemini CLI:** a remote MCP configuration using your BeliefState account.
- **Research skill:** retrieval guidance for stock and investment-theme questions.
- **HTTP examples:** a Postman collection for free discovery and unsigned x402 quotes.

## Quick start

With Gemini CLI installed:

```sh
gemini extensions install https://github.com/Antcolombo/beliefstate-agent-integrations
```

Inside Gemini CLI, run `/mcp auth beliefstate` and complete the BeliefState OAuth
flow. Ask which investors have a current thesis on NBIS, what supports it, and
what risks or catalysts could change it. Research reads use your BeliefState
allowance or prepaid balance. See [account setup and pricing](https://beliefstate.ai/agent-quickstart.md).

## Integration files

| File | Purpose |
| --- | --- |
| [gemini-extension.json](gemini-extension.json) | Connect Gemini CLI to the account OAuth MCP endpoint. |
| [Research skill](skills/beliefstate-research/SKILL.md) | Retrieve and explain attributed investor views with their dates, evidence and limits. |
| [Postman collection](postman/beliefstate.postman_collection.json) | Import free discovery and unpaid quote requests into Postman. |

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

| Access | Endpoint | Authentication |
| --- | --- | --- |
| Account MCP | `https://beliefstate.ai/mcp` | OAuth through your MCP client. |
| Wallet MCP | `https://beliefstate.ai/v1/research/mcp` | A compatible x402 wallet client and authorized payment for research reads. |
| HTTP API | `https://beliefstate.ai` | Account API access or the catalog's x402 routes. |

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
The research skill uses [MIT-0](https://spdx.org/licenses/MIT-0.html), as declared
in its frontmatter. Hosted research access and data remain subject to
[BeliefState's service terms](https://beliefstate.ai/terms).
