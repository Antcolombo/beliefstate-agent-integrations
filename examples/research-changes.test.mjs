import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { initialRequests, run } from "./research-changes.mjs";

const since = "2026-10-20T00:00:00Z";
const key = "fixture-only-not-a-customer-key";
const journal = (
  cursor = null,
  checkpoint = "checkpoint-fixture",
  changes = [],
) => ({
  schema_version: "1",
  methodology_version: "belief-changes-v1",
  scope: { ticker: "NBIS" },
  data_status: { coverage: "partial" },
  warnings: ["Fixture: incomplete history"],
  data: {
    mode: "changes",
    status: "available",
    changes,
    continuation_cursor: cursor,
    polling_checkpoint: checkpoint,
    history_coverage: {
      available_belief_count: 0,
      omitted_belief_count: 0,
      unassessed_status_count: 0,
      unassessed_severity_count: 0,
      completeness: "bounded",
    },
  },
  citations: [],
});
function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), "beliefstate-workflow-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const options = {
    ticker: "NBIS",
    since,
    execute: true,
    state: join(directory, "state.json"),
    maxReads: 2,
    test: true,
  };
  const requests = [];
  const responses = [
    { tickers: ["NBIS"] },
    {
      schema_version: "1",
      resource: "brief",
      view: "current",
      scope: { ticker: "NBIS" },
      beliefs: [],
      coverage: {
        available_belief_count: 0,
        omitted_belief_count: 0,
        unassessed_status_count: 0,
        unassessed_severity_count: 0,
        completeness: "bounded",
      },
      quality_gaps: [],
      next_cursor: "bounded-brief",
      warnings: ["Fixture: omitted cases"],
    },
    journal(),
  ];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    assert(response, "No unexpected extra API call");
    return Response.json(response);
  };
  return { options, requests, responses, fetchImpl };
}

test("default plan and dated demo make no network calls and need no key", async () => {
  const never = () => {
    throw Error("Network must not run");
  };
  const plan = await run(
    { ticker: "NBIS", since, maxReads: 2 },
    { fetchImpl: never },
  );
  assert.equal(plan.mode, "plan");
  assert.equal(plan.initial_requests.length, 2);
  const demo = await run({ demo: true }, { fetchImpl: never });
  assert.equal(demo.mode, "observed_workflow_summary");
  assert.equal(demo.journal.polling_checkpoint_ready, false);
});

test("completes two reads, retains source limitations, and reuses completed local output", async (t) => {
  const { options, requests, fetchImpl } = setup(t);
  const output = await run(options, { apiKey: key, fetchImpl });
  assert.equal(output.status, "complete");
  assert.equal(output.next_poll_ready, true);
  assert.equal(output.current.next_cursor, "bounded-brief");
  assert.deepEqual(output.journal_pages[0].warnings, [
    "Fixture: incomplete history",
  ]);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].init.headers.Authorization, undefined);
  for (const { init } of requests.slice(1))
    assert.match(init.headers["X-Request-ID"], /^[0-9a-f-]{36}$/);
  assert.equal(readFileSync(options.state, "utf8").includes(key), false);
  await run(options, { apiKey: key, fetchImpl });
  assert.equal(requests.length, 3);
});

test("an empty continued page stops at the read ceiling without advancing the checkpoint", async (t) => {
  const { options, responses, requests, fetchImpl } = setup(t);
  responses[2] = journal("next-page", null, []);
  const partial = await run(options, { apiKey: key, fetchImpl });
  assert.equal(partial.status, "read_limit_reached");
  assert.equal(partial.next_poll_ready, false);
  assert.equal(JSON.parse(readFileSync(options.state)).checkpoint, null);
  responses.push(journal());
  const done = await run(
    { ...options, maxReads: 3 },
    { apiKey: key, fetchImpl },
  );
  assert.equal(done.status, "complete");
  assert.equal(
    new URL(requests.at(-1).url).search,
    "?view=changes&cursor=next-page",
  );
});

test("a lost response never causes automatic replay or a new billed request", async (t) => {
  const { options, responses, requests, fetchImpl } = setup(t);
  responses[1] = Error("Fixture transport interrupted");
  await assert.rejects(run(options, { apiKey: key, fetchImpl }), /interrupted/);
  const saved = JSON.parse(readFileSync(options.state));
  assert.equal(saved.operations.length, 1);
  assert(saved.operations[0].requestId);
  await assert.rejects(
    run(options, { apiKey: key, fetchImpl }),
    /uncertain outcome/,
  );
  assert.equal(requests.length, 2);
});

test("non-available history is not reported as no changes or a completed checkpoint", async (t) => {
  const { options, responses, requests, fetchImpl } = setup(t);
  responses[2] = {
    ...journal(),
    data: { ...journal().data, status: "resync_required" },
  };
  const output = await run(options, { apiKey: key, fetchImpl });
  assert.equal(output.status, "resync_required");
  assert.equal(output.next_poll_ready, false);
  await assert.rejects(
    run(options, { apiKey: key, fetchImpl }),
    /needs attention/,
  );
  assert.equal(requests.length, 3);
});

test("repeated cursors and mismatched scope fail closed across restarts", async (t) => {
  const { options, responses, requests, fetchImpl } = setup(t);
  responses[2] = journal("repeat", null);
  responses.push(journal("repeat", null));
  await assert.rejects(
    run({ ...options, maxReads: 4 }, { apiKey: key, fetchImpl }),
    /cursor repeated/,
  );
  await assert.rejects(
    run(options, { apiKey: key, fetchImpl }),
    /needs attention/,
  );
  assert.equal(requests.length, 4);
});

test("a different key and concurrent use cannot consume the existing state", async (t) => {
  const { options, requests, fetchImpl } = setup(t);
  await run(options, { apiKey: key, fetchImpl });
  await assert.rejects(
    run(options, { apiKey: "another-fixture-key", fetchImpl }),
    /another key/,
  );
  writeFileSync(`${options.state}.lock`, "", { mode: 0o600 });
  await assert.rejects(run(options, { apiKey: key, fetchImpl }), /EEXIST/);
  assert.equal(requests.length, 3);
});

test("the next poll uses only its completed checkpoint and retains the old state", async (t) => {
  const { options, responses, requests, fetchImpl } = setup(t);
  await run(options, { apiKey: key, fetchImpl });
  const before = readFileSync(options.state, "utf8");
  responses.push(
    { tickers: ["NBIS"] },
    {
      schema_version: "1",
      resource: "brief",
      view: "current",
      scope: { ticker: "NBIS" },
      beliefs: [],
      coverage: {
        available_belief_count: 0,
        omitted_belief_count: 0,
        unassessed_status_count: 0,
        unassessed_severity_count: 0,
        completeness: "bounded",
      },
      quality_gaps: [],
      warnings: [],
    },
    journal(null, "next-checkpoint"),
  );
  const output = await run(
    {
      ...options,
      since: undefined,
      previousState: options.state,
      state: `${options.state}.next`,
    },
    { apiKey: key, fetchImpl },
  );
  assert.equal(output.status, "complete");
  assert.equal(
    new URL(requests.at(-1).url).search,
    "?view=changes&checkpoint=checkpoint-fixture",
  );
  assert.equal(readFileSync(options.state, "utf8"), before);
});

test("bad selectors and missing coverage stop before metered reads", async (t) => {
  assert.throws(() => initialRequests("BAD TICKER", since), /requested ticker/);
  assert.throws(() => initialRequests("NBIS", "yesterday"), /ISO timestamp/);
  assert.throws(
    () => initialRequests("NBIS", "2099-01-01T00:00:00Z"),
    /future/,
  );
  const { options, responses, requests, fetchImpl } = setup(t);
  responses[0] = { tickers: [] };
  await assert.rejects(
    run(options, { apiKey: key, fetchImpl }),
    /absent from released coverage/,
  );
  assert.equal(requests.length, 1);
});

test("a malformed current response or wrong-company journal stops further dispatch", async (t) => {
  const { options, responses, requests, fetchImpl } = setup(t);
  responses[1] = { error: "Fixture unexpected 200" };
  await assert.rejects(
    run(options, { apiKey: key, fetchImpl }),
    /response schema/,
  );
  await assert.rejects(
    run(options, { apiKey: key, fetchImpl }),
    /needs attention/,
  );
  assert.equal(requests.length, 2);
});

test("malformed current coverage stops before a second paid read", async (t) => {
  const { options, responses, requests, fetchImpl } = setup(t);
  responses[1].coverage = {};
  await assert.rejects(
    run(options, { apiKey: key, fetchImpl }),
    /Invalid coverage/,
  );
  assert.equal(requests.length, 2);
});

test("wrong-company journal cannot become a completed polling state", async (t) => {
  const { options, responses, fetchImpl } = setup(t);
  responses[2].scope.ticker = "MSFT";
  await assert.rejects(
    run(options, { apiKey: key, fetchImpl }),
    /scope does not match/,
  );
  const saved = JSON.parse(readFileSync(options.state));
  assert.equal(saved.status, "needs_attention");
  assert.equal(saved.checkpoint, null);
});

test("malformed checkpoint cannot initiate the next paid window", async (t) => {
  const { options, requests, fetchImpl } = setup(t);
  await run(options, { apiKey: key, fetchImpl });
  const saved = JSON.parse(readFileSync(options.state));
  saved.checkpoint = {};
  writeFileSync(options.state, JSON.stringify(saved), { mode: 0o600 });
  await assert.rejects(
    run(
      {
        ...options,
        since: undefined,
        previousState: options.state,
        state: options.state + ".next",
      },
      { apiKey: key, fetchImpl },
    ),
    /completed checkpoint/,
  );
  assert.equal(requests.length, 3);
});
