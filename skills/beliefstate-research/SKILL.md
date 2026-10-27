---
name: beliefstate-research
description: Retrieve dated, cited investor research from BeliefState when asked about stock theses, investment themes, risks, catalysts, conflicting views or research changes.
license: MIT
metadata: { "homepage": "https://beliefstate.ai" }
---

# BeliefState research

Use released BeliefState records to explain who published a view, when, why, and
what could support or invalidate it. Research reads use the customer's account
allowance or prepaid credit, or an explicitly authorized x402 payment.

## Connect

Use an already connected BeliefState tool when available. Account MCP:
`https://beliefstate.ai/mcp`, authenticated through the client's OAuth flow.
Setup: https://beliefstate.ai/agent-quickstart.md.

Without a connection, read the free tool and price catalog at
`https://beliefstate.ai/v1/research` and the current OpenAPI contract at
`https://beliefstate.ai/openapi.json`. Free company discovery is available from
`https://beliefstate.ai/v1/tickers?q=NBIS`. Do not imply that these free discovery
responses contain purchased research.

Wallet clients can use `https://beliefstate.ai/v1/research/mcp` or the HTTP
operations in the catalog. A 402 quote is an offer, not a payment or research
delivery. Use the client's supported signing flow only within the user's
authorized amount; preserve the quoted network, token, recipient and request.
Follow the maintained quickstart for same-authorization retries. Never request a
wallet private key, password or seed phrase.

## Retrieve

- Resolve a company or ticker with search_companies or get_tickers. Use
  search_entities for released non-company research subjects.
- Use get_brief for a company overview. Use detail=current for a compact stored
  snapshot; use get_belief for a requested complete case or deeper support.
- Use search_beliefs for a thesis, theme or trade setup. Compare returned case
  IDs with compare_beliefs. Matching keywords alone do not establish agreement.
- Use get_belief_risks or get_belief_catalysts with exactly one company, entity,
  case or explicit released-corpus scope. Preserve unknown status and severity.
- Use get_belief_changes for research history. Preserve author revisions,
  engine assessments and their separate clocks. Supply as_of when the user
  requests a historical cutoff.
- Use get_author_track_record with a returned person ID and explicit scope.
  Preserve losses, pending cases, eligibility and coverage limits.

Follow the actual connected schemas. If a tool requests conversation context,
send only a short public research goal and the actual model ID, or unknown.
Exclude private portfolio and account details. Reuse the returned conversation
ID unchanged, reuse adequate records, and follow signed cursors with the same
selectors.

## Explain

Lead with the attributed stance, asset, source date and horizon, then the stated
reasoning, catalysts, conditions and matching evidence URLs. Keep investor
claims separate from engine analysis and independently verified company facts.
Preserve publication, observation, revision and outcome dates, partial source
coverage, freshness and unknowns. Several records are not independent votes.

Publication-based hypothetical outcomes are distinct from brokerage returns or
verified executions. Do not infer investor skill, original authorship,
consensus, holdings or future returns from partial records. An empty result
does not establish that no earlier view exists. If coverage or access is absent,
state the specific limitation and the returned recovery guidance.
