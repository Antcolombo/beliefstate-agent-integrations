import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const origin = "https://beliefstate.ai";
const network = "eip155:8453";
const asset = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const recipient = "0xd346b16f2c013d8219350d32e511023d16db9aee";
const price = 20000n;
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const decode = (value) => {
  assert(
    typeof value === "string" && value.length > 0,
    "Missing payment header.",
  );
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
};

function atomicAmount(value) {
  assert(
    /^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(value ?? ""),
    "Supply --max-usdc as a positive USDC amount, for example 0.02.",
  );
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  assert(amount >= price, "The cap must cover at least one 0.02-USDC read.");
  return amount;
}

function cutoff(value) {
  assert(
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(
      value,
    ),
    "Use a UTC ISO --as-of timestamp.",
  );
  const date = new Date(value);
  assert(
    Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 19) === value.slice(0, 19) &&
      date.getTime() <= Date.now(),
    "Use a valid past --as-of timestamp.",
  );
  return date.toISOString();
}

function privateFile(path) {
  const stat = lstatSync(path);
  assert(
    stat.isFile() && stat.nlink === 1 && (stat.mode & 0o077) === 0,
    "State must be a private regular file (chmod 600), without links.",
  );
}

function save(path, state) {
  const temp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(state, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
  const directory = openSync(dirname(path), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}

function requestFor(state, index) {
  if (index === 0)
    return {
      method: "POST",
      url: `${origin}/v1/research/get_brief`,
      body: JSON.stringify({
        ticker: state.ticker,
        detail: "overview",
        max_results: 3,
        as_of: state.asOf,
      }),
    };
  const views = state.operations[0].response.views;
  const ids = views.map((view) => view.belief_id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "Repeated case ID; inspect the saved overview before continuing.",
  );
  if (index > Math.min(state.maxCases, ids.length)) return null;
  return {
    method: "POST",
    url: `${origin}/v1/research/get_belief`,
    body: JSON.stringify({ belief_id: ids[index - 1], as_of: state.asOf }),
  };
}

function validateOffer(quote, request) {
  assert.equal(quote.x402Version, 2, "Expected x402 v2.");
  assert.equal(quote.resource?.url, request.url, "Quote resource changed.");
  assert.equal(quote.accepts?.length, 1, "Expected one exact offer.");
  const offer = quote.accepts[0];
  assert.equal(offer.scheme, "exact");
  assert.equal(offer.network, network);
  assert.equal(offer.asset?.toLowerCase(), asset);
  assert.equal(offer.payTo?.toLowerCase(), recipient);
  assert.equal(offer.amount, String(price));
  assert.equal(offer.extra?.name, "USD Coin");
  assert.equal(offer.extra?.version, "2");
  assert(
    Number.isInteger(offer.maxTimeoutSeconds) &&
      offer.maxTimeoutSeconds > 0 &&
      offer.maxTimeoutSeconds <= 300,
    "Unexpected authorization duration.",
  );
}

function validateSignature(operation) {
  const payload = decode(operation.paymentSignature);
  validateOffer(
    {
      x402Version: payload.x402Version,
      resource: payload.resource,
      accepts: [payload.accepted],
    },
    operation.request,
  );
  assert.deepEqual(
    payload.resource,
    operation.quote.resource,
    "Signed resource changed.",
  );
  assert.deepEqual(
    payload.extensions,
    operation.quote.extensions,
    "Signed extensions changed.",
  );
  assert.deepEqual(
    payload.accepted,
    operation.quote.accepts[0],
    "Signed terms changed.",
  );
  const authorization = payload.payload?.authorization;
  assert(
    /^0x[0-9a-fA-F]{40}$/.test(authorization?.from ?? ""),
    "Missing payer.",
  );
  assert.equal(authorization.to?.toLowerCase(), recipient);
  assert.equal(authorization.value, String(price));
  assert(
    /^0x[0-9a-fA-F]{64}$/.test(authorization.nonce ?? ""),
    "Missing authorization nonce.",
  );
  assert(
    typeof payload.payload.signature === "string" &&
      /^0x[0-9a-fA-F]+$/.test(payload.payload.signature),
    "Missing wallet signature.",
  );
  return authorization.from.toLowerCase();
}

async function sign(quote) {
  const key = process.env.PAYMENT_WALLET_PRIVATE_KEY;
  assert(
    /^0x[0-9a-fA-F]{64}$/.test(key ?? ""),
    "Set PAYMENT_WALLET_PRIVATE_KEY through your secret store; never paste a key or recovery phrase into chat.",
  );
  const [
    { x402Client },
    { encodePaymentSignatureHeader },
    { ExactEvmScheme },
    { privateKeyToAccount },
  ] = await Promise.all([
    import("@x402/core/client"),
    import("@x402/core/http"),
    import("@x402/evm/exact/client"),
    import("viem/accounts"),
  ]);
  const client = new x402Client()
    .setSpendControls({ maxAmountPerPayment: "$0.02" })
    .register(network, new ExactEvmScheme(privateKeyToAccount(key)));
  return encodePaymentSignatureHeader(await client.createPaymentPayload(quote));
}

function headers(test) {
  return {
    "Content-Type": "application/json",
    ...(test ? { "X-BeliefState-Usage": "test" } : {}),
  };
}

async function quoteFor(request, fetchImpl, test) {
  const response = await fetchImpl(request.url, {
    ...request,
    headers: headers(test),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(
    response.status,
    402,
    `Expected an unsigned quote; got HTTP ${response.status}. No payment signed.`,
  );
  const quote = await response.json();
  assert.deepEqual(
    decode(response.headers.get("PAYMENT-REQUIRED")),
    quote,
    "Quote header/body mismatch.",
  );
  validateOffer(quote, request);
  return quote;
}

function validateDelivery(operation, state, index) {
  const payer = validateSignature(operation);
  const { paymentResponse: settled, receipt, response: data } = operation;
  assert.equal(
    settled.success,
    true,
    "Payment response does not confirm settlement.",
  );
  assert.equal(settled.network, network);
  assert(
    /^0x[0-9a-fA-F]{64}$/.test(settled.transaction ?? ""),
    "Missing settlement transaction.",
  );
  assert.equal(settled.payer?.toLowerCase(), payer);
  if (settled.amount !== undefined) assert.equal(settled.amount, String(price));
  assert.equal(
    receipt.transaction?.toLowerCase(),
    settled.transaction.toLowerCase(),
  );
  assert.equal(receipt.network, network);
  assert.equal(receipt.mode, "live");
  assert.equal(receipt.payer?.toLowerCase(), payer);
  assert.equal(receipt.buyer_total_usdc, "0.02");
  assert.equal(receipt.product_amount_cents, 2);
  assert(
    typeof receipt.purchase_id === "string" && receipt.purchase_id.length > 0,
    "Missing purchase ID.",
  );
  assert.equal(data.schema_version, "1");
  assert.equal(
    new Date(data.as_of).toISOString(),
    state.asOf,
    "Research cutoff changed.",
  );
  assert(
    data.data_status &&
      Array.isArray(data.warnings) &&
      Array.isArray(data.citations),
    "Missing research coverage, warnings or citations.",
  );
  if (index === 0) {
    assert.equal(data.view, "overview");
    assert.equal(data.security?.ticker, state.ticker);
    assert(
      data.coverage && Array.isArray(data.views) && data.views.length <= 3,
      "Missing bounded overview.",
    );
    for (const view of data.views) {
      assert(
        typeof view.belief_id === "string" && view.belief_id.length > 0,
        "Missing case ID.",
      );
      assert(
        data.citations.some(
          (citation) =>
            citation.citation_id === view.source_citation_id &&
            /^https?:\/\//.test(citation.source_url ?? ""),
        ),
        "Missing source citation.",
      );
    }
  } else {
    const args = JSON.parse(operation.request.body);
    assert.equal(data.resource, "beliefs");
    assert.equal(data.data?.security?.ticker, state.ticker);
    assert.equal(
      data.data?.belief?.belief_id,
      args.belief_id,
      "Purchased case does not match the request.",
    );
    assert(data.citations.length > 0, "Missing case citations.");
  }
}

function output(state, statePath) {
  return {
    status: state.status,
    ticker: state.ticker,
    as_of: state.asOf,
    state: statePath,
    service_cap_usdc: state.maxUsdc,
    reserved_usdc: (state.operations.length * 0.02).toFixed(2),
    next_action:
      state.status === "needs_attention"
        ? "Honor retry_at and rerun with this same state for exact-request recovery. HTTP 410 is not refund proof; resolve it before another purchase."
        : "Retain this state and its receipts; do not reuse it for another research window.",
    purchases: state.operations.map((operation) => ({
      request: operation.request,
      status: operation.status,
      http_status: operation.httpStatus,
      retry_after: operation.retryAfter,
      retry_at: operation.retryAt,
      payment_response:
        operation.status === "complete" ? operation.paymentResponse : null,
      receipt: operation.status === "complete" ? operation.receipt : null,
      research: operation.status === "complete" ? operation.response : null,
    })),
    limitations: [
      "This is cited research for your own thesis assessment; it does not judge a thesis true or execute trades.",
      "Keep source dates, data_status, omissions and warnings. Missing coverage remains unknown.",
      "The cap covers service USDC only, excluding wallet funding, bridge and network costs.",
      "No model comparison, search, refresh or background polling is performed.",
    ],
  };
}

export async function run(
  options,
  { fetchImpl = fetch, signQuote = sign } = {},
) {
  const ticker = (options.ticker ?? "").toUpperCase();
  assert(
    /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker),
    "Supply the requested company --ticker.",
  );
  const maximum = atomicAmount(options.maxUsdc);
  const maxCases = options.maxCases ?? 0;
  assert(
    Number.isInteger(maxCases) && maxCases >= 0 && maxCases <= 3,
    "--max-cases must be 0–3; zero buys only the overview.",
  );
  const requestedAsOf = options.asOf ? cutoff(options.asOf) : null;
  assert(!(options.quote && options.execute), "Choose --quote or --execute.");
  const initial = {
    version: 1,
    ticker,
    maxCases,
    maxUsdc: options.maxUsdc,
    requestedAsOf,
    asOf: requestedAsOf ?? new Date().toISOString(),
    test: Boolean(options.test),
    operations: [],
    status: "ready",
  };
  if (!options.execute) {
    const request = requestFor(initial, 0);
    return {
      mode: options.quote ? "unsigned_quote" : "plan",
      ticker,
      service_cap_usdc: options.maxUsdc,
      maximum_requests: Math.min(maxCases + 1, Number(maximum / price)),
      initial_request: request,
      ...(options.quote
        ? { quote: await quoteFor(request, fetchImpl, options.test) }
        : {}),
      instructions:
        "--quote makes one unsigned request. --execute --state .private/audit.json can spend the approved cap. Reuse the same arguments and state on every retry.",
    };
  }
  assert(options.state, "Choose a private --state file.");
  const statePath = resolve(options.state);
  mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
  const directory = lstatSync(dirname(statePath));
  assert(
    directory.isDirectory() && (directory.mode & 0o077) === 0,
    "Use a private state directory (chmod 700), without a symlink.",
  );
  const lock = `${statePath}.lock`;
  writeFileSync(lock, "", { flag: "wx", mode: 0o600 });
  try {
    if (existsSync(statePath)) privateFile(statePath);
    const state = existsSync(statePath) ? read(statePath) : initial;
    for (const field of [
      "version",
      "ticker",
      "maxCases",
      "maxUsdc",
      "requestedAsOf",
      "test",
    ])
      assert.equal(
        state[field],
        initial[field],
        `Keep the same ${field} when resuming.`,
      );
    cutoff(state.asOf);
    assert(
      Array.isArray(state.operations) &&
        state.operations.length <= maxCases + 1 &&
        BigInt(state.operations.length) * price <= maximum,
      "Saved operations exceed the approved scope/cap.",
    );
    for (const [index, operation] of state.operations.entries()) {
      if (index > 0)
        assert.equal(
          state.operations[index - 1].status,
          "complete",
          "Unresolved earlier purchase.",
        );
      assert.deepEqual(
        operation.request,
        requestFor(state, index),
        "Saved request changed.",
      );
      validateOffer(operation.quote, operation.request);
      validateSignature(operation);
      if (operation.status === "complete")
        validateDelivery(operation, state, index);
    }
    if (state.status === "complete") {
      assert(
        state.operations.length > 0 &&
          state.operations.every(
            (operation) => operation.status === "complete",
          ) &&
          requestFor(state, state.operations.length) === null,
        "Incomplete saved workflow.",
      );
      return output(state, statePath);
    }
    if (!state.operations.length) {
      const response = await fetchImpl(`${origin}/v1/tickers`, {
        headers: headers(options.test),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      assert(response.ok, "Free coverage unavailable; stop before signing.");
      const coverage = await response.json();
      assert(
        Array.isArray(coverage.tickers) && coverage.tickers.includes(ticker),
        "Requested ticker has no released coverage; stop without substituting a company.",
      );
    }
    for (let index = 0; ; index++) {
      let operation = state.operations[index];
      if (operation?.status === "complete") continue;
      if (!operation) {
        const request = requestFor(state, index);
        if (!request) {
          state.status = "complete";
          save(statePath, state);
          break;
        }
        if (BigInt(state.operations.length + 1) * price > maximum) {
          state.status = "spend_limit_reached";
          save(statePath, state);
          break;
        }
        const quote = await quoteFor(request, fetchImpl, options.test);
        operation = {
          request,
          quote,
          paymentSignature: await signQuote(quote),
          status: "signed",
        };
        validateSignature(operation);
        state.operations.push(operation);
        state.status = "awaiting_response";
        // Flush the complete signed request to disk before any payment dispatch.
        save(statePath, state);
      }
      if (operation.retryAt && Date.parse(operation.retryAt) > Date.now())
        break;
      const response = await fetchImpl(operation.request.url, {
        ...operation.request,
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          ...headers(state.test),
          "PAYMENT-SIGNATURE": operation.paymentSignature,
        },
      });
      operation.httpStatus = response.status;
      operation.retryAfter = response.headers.get("Retry-After");
      const retryTime = /^\d+$/.test(operation.retryAfter ?? "")
        ? Date.now() + Number(operation.retryAfter) * 1000
        : Date.parse(operation.retryAfter);
      operation.retryAt =
        Number.isFinite(retryTime) &&
        retryTime > Date.now() &&
        retryTime <= 8640000000000000
          ? new Date(retryTime).toISOString()
          : null;
      operation.responseHeaders = {
        paymentResponse: response.headers.get("PAYMENT-RESPONSE"),
        receipt: response.headers.get("BELIEFSTATE-PAYMENT-RECEIPT"),
      };
      operation.status = "unresolved";
      state.status = "needs_attention";
      // Preserve diagnostics and the authorization even if receipt/body parsing fails.
      save(statePath, state);
      operation.responseText = await response.text();
      save(statePath, state);
      operation.response = JSON.parse(operation.responseText);
      if (response.status !== 200) {
        save(statePath, state);
        break;
      }
      operation.paymentResponse = decode(
        operation.responseHeaders.paymentResponse,
      );
      operation.receipt = decode(operation.responseHeaders.receipt);
      save(statePath, state);
      validateDelivery(operation, state, index);
      operation.status = "complete";
      state.status = "running";
      save(statePath, state);
    }
    return output(state, statePath);
  } finally {
    unlinkSync(lock);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { values } = parseArgs({
      options: {
        ticker: { type: "string" },
        "as-of": { type: "string" },
        "max-usdc": { type: "string" },
        "max-cases": { type: "string", default: "0" },
        state: { type: "string" },
        execute: { type: "boolean" },
        quote: { type: "boolean" },
        test: { type: "boolean" },
      },
    });
    const result = await run({
      ...values,
      asOf: values["as-of"],
      maxUsdc: values["max-usdc"],
      maxCases: Number(values["max-cases"]),
    });
    console.log(JSON.stringify(result, null, 2));
    if (["needs_attention", "spend_limit_reached"].includes(result.status))
      process.exitCode = 1;
  } catch {
    console.error(
      "Stopped. Check arguments, file permissions and the saved purchase state. Keep the same state for exact-request recovery; never replace an uncertain payment. Keys and signatures are not printed.",
    );
    process.exitCode = 1;
  }
}
