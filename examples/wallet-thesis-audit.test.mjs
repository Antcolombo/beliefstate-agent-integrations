import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { x402Client } from "@x402/core/client";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { run } from "./wallet-thesis-audit.mjs";

// Public fixture key: offline signatures only; never fund or use it for live requests.
const fixtureKey = `0x${"11".repeat(32)}`;
const payer = privateKeyToAccount(fixtureKey);
const asOf = "2026-10-27T12:00:00.000Z";
const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
];
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
const decode = (value) => JSON.parse(Buffer.from(value, "base64").toString());
const citation = {
  citation_id: "fixture-citation",
  source_url: "https://example.com/fixture-research",
  published_at: "2026-10-20T12:00:00.000Z",
  observed_at: "2026-10-21T12:00:00.000Z",
};

function setup(t, extra = {}) {
  const directory = mkdtempSync(join(tmpdir(), "beliefstate-wallet-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const options = {
    ticker: "NBIS",
    maxUsdc: "0.06",
    maxCases: 2,
    asOf,
    execute: true,
    state: join(directory, "state.json"),
    test: true,
    ...extra,
  };
  const requests = [];
  const signed = [];
  const controls = {
    quote: (quote) => quote,
    delivery: (delivery) => delivery,
    signedResponses: [],
    tickers: ["NBIS"],
  };
  const signQuote = async (quote) => {
    const client = new x402Client()
      .setSpendControls({ maxAmountPerPayment: "$0.02" })
      .register("eip155:8453", new ExactEvmScheme(payer));
    const result = encodePaymentSignatureHeader(
      await client.createPaymentPayload(quote),
    );
    signed.push(result);
    return result;
  };
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, undefined);
    if (url.endsWith("/v1/tickers"))
      return Response.json({ tickers: controls.tickers });
    if (!init.headers["PAYMENT-SIGNATURE"]) {
      const quote = controls.quote({
        x402Version: 2,
        resource: {
          url,
          description: "Offline fixture research",
          mimeType: "application/json",
        },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            amount: "20000",
            payTo: "0xd346b16f2C013d8219350d32E511023D16Db9AEE",
            maxTimeoutSeconds: 300,
            extra: {
              name: "USD Coin",
              version: "2",
              assetTransferMethod: "eip3009",
            },
          },
        ],
        extensions: {
          bazaar: { info: { input: { type: "http", method: "POST" } } },
          mppx: { info: { method: "POST", opaque: "fixture-request-binding" } },
        },
      });
      return Response.json(quote, {
        status: 402,
        headers: { "PAYMENT-REQUIRED": encode(quote) },
      });
    }
    // A real SDK authorization must already be durable before the signed request.
    const saved = JSON.parse(readFileSync(options.state));
    const operation = saved.operations.at(-1);
    assert.equal(operation.paymentSignature, init.headers["PAYMENT-SIGNATURE"]);
    assert.equal(operation.request.body, init.body);
    assert.equal(operation.request.url, url);
    const next = controls.signedResponses.shift();
    if (next instanceof Error) throw next;
    if (next) return next;
    const signature = decode(init.headers["PAYMENT-SIGNATURE"]);
    assert.equal(
      signature.payload.authorization.from.toLowerCase(),
      payer.address.toLowerCase(),
    );
    const transaction = `0x${"aa".repeat(32)}`;
    const args = JSON.parse(init.body);
    const data = {
      schema_version: "1",
      as_of: args.as_of,
      data_status: { coverage: "partial", limitations: ["Offline fixture"] },
      warnings: ["Coverage gap fixture"],
      citations: [citation],
      ...(url.endsWith("get_brief")
        ? {
            view: "overview",
            security: { ticker: "NBIS" },
            coverage: { omitted_record_count: 7 },
            views: ids.map((belief_id) => ({
              belief_id,
              source_citation_id: citation.citation_id,
              summary: { text: "Fixture thesis", truncated: false },
            })),
          }
        : {
            resource: "beliefs",
            data: {
              security: { ticker: "NBIS" },
              belief: {
                belief_id: args.belief_id,
                unknowns: ["Fixture unknown"],
              },
            },
          }),
    };
    const delivery = controls.delivery({
      data,
      settled: {
        success: true,
        network: "eip155:8453",
        payer: payer.address,
        transaction,
        amount: "20000",
      },
      receipt: {
        transaction,
        network: "eip155:8453",
        mode: "live",
        payer: payer.address,
        buyer_total_usdc: "0.02",
        product_amount_cents: 2,
        purchase_id: `fixture-${args.belief_id ?? "overview"}`,
      },
    });
    return Response.json(delivery.data, {
      headers: {
        "PAYMENT-RESPONSE": encode(delivery.settled),
        "BELIEFSTATE-PAYMENT-RECEIPT": encode(delivery.receipt),
      },
    });
  };
  return { options, requests, signed, controls, fetchImpl, signQuote };
}

test("plan is offline and an unsigned quote does not sign", async (t) => {
  const f = setup(t);
  const never = () => {
    throw Error("Must not run");
  };
  const plan = await run(
    { ...f.options, execute: false },
    { fetchImpl: never, signQuote: never },
  );
  assert.equal(plan.mode, "plan");
  assert.equal(plan.maximum_requests, 3);
  const quote = await run(
    { ...f.options, execute: false, quote: true },
    { fetchImpl: f.fetchImpl, signQuote: never },
  );
  assert.equal(quote.mode, "unsigned_quote");
  assert.equal(f.requests.length, 1);
});

test("real offline SDK signatures buy only returned cases within the cap and retain research limits", async (t) => {
  const f = setup(t);
  const result = await run(f.options, f);
  assert.equal(result.status, "complete");
  assert.equal(result.reserved_usdc, "0.06");
  assert.equal(f.signed.length, 3);
  assert.deepEqual(
    result.purchases
      .slice(1)
      .map((item) => JSON.parse(item.request.body).belief_id),
    ids,
  );
  assert.equal(result.purchases[0].research.coverage.omitted_record_count, 7);
  assert.equal(
    result.purchases[0].research.citations[0].published_at,
    citation.published_at,
  );
  assert.deepEqual(result.purchases[1].research.warnings, [
    "Coverage gap fixture",
  ]);
  assert.equal(JSON.stringify(result).includes(f.signed[0]), false);
  assert.equal(
    readFileSync(f.options.state, "utf8").includes(fixtureKey),
    false,
  );
  const count = f.requests.length;
  await run(f.options, f);
  assert.equal(
    f.requests.length,
    count,
    "Completed runs must be entirely local",
  );
});

test("default overview is one payment and needs no detail requests", async (t) => {
  const f = setup(t, { maxCases: 0, maxUsdc: "0.02" });
  const result = await run(f.options, f);
  assert.equal(result.status, "complete");
  assert.equal(result.purchases.length, 1);
});

for (const [name, mutate] of Object.entries({
  price: (q) => {
    q.accepts[0].amount = "500000";
  },
  chain: (q) => {
    q.accepts[0].network = "eip155:1";
  },
  token: (q) => {
    q.accepts[0].asset = `0x${"22".repeat(20)}`;
  },
  recipient: (q) => {
    q.accepts[0].payTo = payer.address;
  },
  resource: (q) => {
    q.resource.url = "https://example.com/wrong";
  },
  duration: (q) => {
    q.accepts[0].maxTimeoutSeconds = 301;
  },
  signing_domain: (q) => {
    q.accepts[0].extra.name = "Not USDC";
  },
}))
  test(`rejects changed ${name} before signing`, async (t) => {
    const f = setup(t);
    f.controls.quote = (q) => {
      mutate(q);
      return q;
    };
    await assert.rejects(run(f.options, f));
    assert.equal(f.signed.length, 0);
    assert.equal(
      f.requests.filter((r) => r.init.headers["PAYMENT-SIGNATURE"]).length,
      0,
    );
  });

test("a cap counts every reserved authorization across restarts", async (t) => {
  const f = setup(t, { maxUsdc: "0.04" });
  const first = await run(f.options, f);
  assert.equal(first.status, "spend_limit_reached");
  assert.equal(f.signed.length, 2);
  await run(f.options, f);
  assert.equal(f.signed.length, 2);
  await assert.rejects(
    run({ ...f.options, maxUsdc: "0.06" }, f),
    /same maxUsdc/,
  );
});

test("pending and transport errors retain the exact signed request; resume needs no signer", async (t) => {
  const f = setup(t, { maxCases: 0, maxUsdc: "0.02" });
  f.controls.signedResponses.push(
    Response.json(
      { error: { code: "payment_pending" } },
      { status: 503, headers: { "Retry-After": "0" } },
    ),
    Error("Lost HTTP response"),
  );
  const pending = await run(f.options, f);
  assert.equal(pending.status, "needs_attention");
  assert.equal(pending.purchases[0].http_status, 503);
  const original = JSON.parse(readFileSync(f.options.state)).operations[0];
  const noSigner = {
    fetchImpl: f.fetchImpl,
    signQuote: () => {
      throw Error("Never sign again");
    },
  };
  await assert.rejects(run(f.options, noSigner), /Lost HTTP response/);
  const done = await run(f.options, noSigner);
  assert.equal(done.status, "complete");
  assert.equal(f.signed.length, 1);
  const retries = f.requests.filter((r) => r.init.headers["PAYMENT-SIGNATURE"]);
  assert.equal(retries.length, 3);
  for (const retry of retries) {
    assert.equal(retry.url, original.request.url);
    assert.equal(retry.init.body, original.request.body);
    assert.equal(
      retry.init.headers["PAYMENT-SIGNATURE"],
      original.paymentSignature,
    );
  }
});

test("Retry-After prevents an early replay without another quote or signature", async (t) => {
  const f = setup(t, { maxCases: 0 });
  f.controls.signedResponses.push(
    Response.json(
      { error: { code: "payment_pending" } },
      { status: 503, headers: { "Retry-After": "60" } },
    ),
  );
  const first = await run(f.options, f);
  assert(first.purchases[0].retry_at);
  const count = f.requests.length;
  const again = await run(f.options, f);
  assert.equal(again.status, "needs_attention");
  assert.equal(f.requests.length, count);
  assert.equal(f.signed.length, 1);
});

test("an expired authorization still replays its saved request without a new signature", async (t) => {
  const f = setup(t, { maxCases: 0 });
  f.controls.signedResponses.push(
    Response.json({ error: { code: "payment_pending" } }, { status: 503 }),
  );
  await run(f.options, f);
  const saved = JSON.parse(readFileSync(f.options.state));
  const validBefore = Number(
    decode(saved.operations[0].paymentSignature).payload.authorization
      .validBefore,
  );
  t.mock.method(Date, "now", () => (validBefore + 10) * 1000);
  const done = await run(f.options, {
    fetchImpl: f.fetchImpl,
    signQuote: () => {
      throw Error("Do not re-sign an expired purchase");
    },
  });
  assert.equal(done.status, "complete");
  assert.equal(f.signed.length, 1);
});

for (const status of [402, 410, 429, 500])
  test(`HTTP ${status} stops before a new purchase`, async (t) => {
    const f = setup(t);
    f.controls.signedResponses.push(
      Response.json({ error: { code: "fixture_error" } }, { status }),
    );
    const result = await run(f.options, f);
    assert.equal(result.status, "needs_attention");
    assert.equal(f.signed.length, 1);
    assert.equal(result.purchases[0].research, null);
  });

for (const [name, mutate] of Object.entries({
  transaction: (d) => {
    d.receipt.transaction = `0x${"bb".repeat(32)}`;
  },
  amount: (d) => {
    d.receipt.buyer_total_usdc = "1.50";
  },
  payer: (d) => {
    d.settled.payer = `0x${"bb".repeat(20)}`;
  },
  ticker: (d) => {
    d.data.security.ticker = "OTHER";
  },
  cutoff: (d) => {
    d.data.as_of = "2026-10-26T12:00:00.000Z";
  },
  citations: (d) => {
    d.data.citations = [];
  },
}))
  test(`mismatched ${name} retains authorization and prevents subsequent payments`, async (t) => {
    const f = setup(t);
    f.controls.delivery = (d) => {
      mutate(d);
      return d;
    };
    await assert.rejects(run(f.options, f));
    assert.equal(f.signed.length, 1);
    assert.equal(
      JSON.parse(readFileSync(f.options.state)).status,
      "needs_attention",
    );
    const saved = JSON.parse(readFileSync(f.options.state)).operations[0];
    assert(saved.responseText.includes('"schema_version"'));
    assert(saved.responseHeaders.receipt);
    assert.equal(saved.paymentSignature, f.signed[0]);
  });

test("a malformed paid response can only replay the original authorization", async (t) => {
  const f = setup(t, { maxCases: 0 });
  f.controls.signedResponses.push(new Response("not JSON"));
  await assert.rejects(run(f.options, f));
  const result = await run(f.options, {
    fetchImpl: f.fetchImpl,
    signQuote: () => {
      throw Error("Unexpected signing");
    },
  });
  assert.equal(result.status, "complete");
  assert.equal(f.signed.length, 1);
});

test("coverage miss, invalid dates and inputs stop without signing", async (t) => {
  const f = setup(t);
  f.controls.tickers = [];
  await assert.rejects(run(f.options, f), /no released coverage/);
  assert.equal(f.signed.length, 0);
  for (const extra of [
    { asOf: "2026-02-30T00:00:00Z" },
    { asOf: "2099-01-01T00:00:00Z" },
    { maxUsdc: "0.001" },
    { maxCases: 4 },
    { ticker: "NBIS/OTHER" },
  ])
    await assert.rejects(run({ ...f.options, ...extra }, f));
});

test("a concurrent lock, insecure file or symlink cannot reuse payment state", async (t) => {
  const f = setup(t, { maxCases: 0 });
  writeFileSync(`${f.options.state}.lock`, "", { mode: 0o600 });
  await assert.rejects(run(f.options, f), /EEXIST/);
  assert.equal(f.requests.length, 0);
  rmSync(`${f.options.state}.lock`);
  await run(f.options, f);
  chmodSync(f.options.state, 0o644);
  await assert.rejects(run(f.options, f), /private regular file/);
  chmodSync(f.options.state, 0o600);
  const linked = join(dirname(f.options.state), "linked.json");
  symlinkSync(f.options.state, linked);
  await assert.rejects(
    run({ ...f.options, state: linked }, f),
    /private regular file/,
  );
});

test("changed saved request and completed response cannot trigger new signing", async (t) => {
  const f = setup(t, { maxCases: 0 });
  await run(f.options, f);
  const saved = JSON.parse(readFileSync(f.options.state));
  saved.operations[0].request.url = "https://example.com/steal";
  writeFileSync(f.options.state, JSON.stringify(saved), { mode: 0o600 });
  const count = f.requests.length;
  await assert.rejects(run(f.options, f), /Saved request changed/);
  assert.equal(f.requests.length, count);
  assert.equal(f.signed.length, 1);
});
