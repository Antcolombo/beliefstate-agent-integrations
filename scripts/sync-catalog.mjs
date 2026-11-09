import assert from "node:assert/strict";
import { canonicalJsonHash as hash } from "../shared/canonical-json.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const [file, extra] = process.argv.slice(2);
assert(file && !extra, "Pass the release's exported catalog JSON file.");
const catalog = JSON.parse(readFileSync(file, "utf8"));
assert.equal(catalog.version, "beliefstate-distribution-catalog-v1");
const tools = catalog.account_tools;
const names = tools.map((tool) => tool.name);
assert.equal(new Set(names).size, names.length);
assert(names.every((name) => /^get_[a-z_]+$/.test(name)));
assert(catalog.wallet_tools.every((name) => names.includes(name)));
assert(!catalog.wallet_tools.includes("get_account_status"));
assert(!catalog.wallet_tools.includes("get_research_sample"));
for (const tool of tools)
  assert.equal(
    hash(tool),
    catalog.schema_hashes[tool.name],
    `Changed schema: ${tool.name}`,
  );
const paid = new Map(
  catalog.paid_operations.map((operation) => [operation.name, operation]),
);
const amount = (name) =>
  `${(paid.get(name).price_cents / 100).toFixed(2)} USDC`;
const cheap = catalog.paid_operations.filter(
  (operation) => operation.price_cents === 2,
).length;
const free = catalog.wallet_tools.filter((name) => !paid.has(name));
const pricing = `Wallet pricing is separate: **${cheap} data tools cost 0.02 USDC each**, \`get_comparison\` costs **${amount("get_comparison")}**, and \`get_search_results\` costs **${amount("get_search_results")}** per call. Inspect the [live catalog and exact quotes](https://beliefstate.ai/v1/research) before authorizing payment. Account research uses the separate account prices above.

${free.map((name) => `\`${name}\``).join(", ")} are free on both endpoints. Account-only \`get_research_sample\` and \`get_account_status\` are also free. Account tracking uses \`get_tickers(tracked_only=true)\`. \`get_news\` returns SEC filing metadata; it is not a general news-headline feed. Browser OAuth availability depends on the client's admission; check [Connect AI](https://beliefstate.ai/connect?ai=other) before paying.`;
const rows = tools.map((tool) => {
  const description = tool.description.split(/\.\s/)[0] + ".";
  const access = paid.has(tool.name)
    ? `${amount(tool.name)} (wallet); account billing`
    : catalog.wallet_tools.includes(tool.name)
      ? "Free"
      : "Free; account only";
  return `| \`${tool.name}\` | ${description.replaceAll("|", "\\|")} | ${access} |`;
});
const table = `The account endpoint exposes **${tools.length} tools**. Wallet MCP exposes **${catalog.wallet_tools.length} tools**: ${paid.size} paid research tools and ${free.length} free discovery tools. Call \`tools/list\` on the connected MCP endpoint for its current names, descriptions and schemas. The [wallet HTTP catalog](https://beliefstate.ai/v1/research) shows the current purchase contracts and prices.

The prepared A2A package defines ${catalog.a2a_tools.length} capabilities. Public A2A discovery requires separate OAuth and release admission; the hosted card currently returns 404.

The account transport can advertise research context, model and conversation fields for analytics. Clients that send \`DNT: 1\` or \`Sec-GPC: 1\` receive the base schemas in this catalog. Keep personal details and credentials out of context.

| Tool | What it does | Access |
| --- | --- | --- |
${rows.join("\n")}

\`get_visual\` lists visuals or opens one returned identifier. \`get_case\` includes optional relationship paths and hypothetical scenarios. \`get_brief\` accepts an explicit market-refresh selector. Segment, KPI and guidance coverage is bounded to admitted disclosures; absent history stays explicit.`;
let readme = readFileSync("README.md", "utf8");
for (const [marker, body] of [
  ["CATALOG PRICING", pricing],
  ["TOOL CATALOG", table],
]) {
  const start = `<!-- BEGIN ${marker} -->`,
    end = `<!-- END ${marker} -->`;
  assert(
    readme.includes(start) && readme.includes(end),
    `Missing ${marker} markers`,
  );
  readme = readme.replace(
    new RegExp(`${start}[\\s\\S]*?${end}`),
    `${start}\n${body}\n${end}`,
  );
}
writeFileSync("README.md", readme);
const server = JSON.parse(readFileSync("server.json", "utf8"));
assert.equal(server.name, "ai.beliefstate/investor-research");
server.description = `${tools.length} account tools; ${catalog.wallet_tools.length} wallet tools (${paid.size} paid). Cited research, company facts, KPIs and guidance.`;
assert(server.description.length <= 100);
writeFileSync("server.json", JSON.stringify(server, null, 2) + "\n");
const testHeader = [{ key: "X-BeliefState-Usage", value: "test" }];
const request = (name, method, path, description, body) => ({
  name,
  request: {
    method,
    header: [
      ...testHeader,
      ...(body ? [{ key: "Content-Type", value: "application/json" }] : []),
    ],
    url: `{{baseUrl}}${path}`,
    description,
    ...(body
      ? {
          body: {
            mode: "raw",
            raw: JSON.stringify(body, null, 2),
            options: { raw: { language: "json" } },
          },
        }
      : {}),
  },
});
const collection = {
  info: {
    _postman_id: "b65fe31f-76a6-4b94-9eb3-b97a158a5d9b",
    name: "BeliefState: investor research API",
    description:
      "Free discovery and typed tool contracts. No credentials or payment signer. Research purchases require separately authorized account or wallet access.",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "baseUrl", value: "https://beliefstate.ai", type: "string" },
    { key: "ticker", value: "NVDA", type: "string" },
  ],
  item: [
    request(
      "Research catalog",
      "GET",
      "/v1/research",
      "Free operation schemas and prices.",
    ),
    request("OpenAPI", "GET", "/openapi.json", "Current REST contract."),
    request(
      "Account MCP authentication",
      "GET",
      "/.well-known/oauth-protected-resource/mcp",
      "Public OAuth discovery metadata for account MCP.",
    ),
    request(
      "Find company coverage",
      "GET",
      "/v1/tickers?q={{ticker}}",
      "Free company/ticker discovery.",
    ),
    request(
      "SEC filing news",
      "POST",
      "/v1/research/news",
      "Free official SEC filing metadata; no account, payment or model call.",
      { ticker: "{{ticker}}", limit: 5 },
    ),
    ...catalog.paid_operations.map((operation) =>
      request(
        `${operation.name} contract`,
        "GET",
        operation.path,
        `Free typed input/output contract. Research POST price: ${amount(operation.name)}. This GET does not purchase research.`,
      ),
    ),
  ],
};
writeFileSync(
  "postman/beliefstate.postman_collection.json",
  JSON.stringify(collection, null, 2) + "\n",
);
writeFileSync(
  "catalog.json",
  JSON.stringify(
    {
      version: catalog.version,
      source_commit: catalog.source_commit,
      api_contract_version: catalog.api_contract_version,
      mcp_server_version: catalog.mcp_server_version,
      account_tools: names,
      wallet_tools: catalog.wallet_tools,
      a2a_tools: catalog.a2a_tools,
      schema_hashes: catalog.schema_hashes,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    account: tools.length,
    wallet: catalog.wallet_tools.length,
    a2a: catalog.a2a_tools.length,
    paid: paid.size,
    free,
  }),
);
