import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const origin = "https://beliefstate.ai";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const url = (path, query) => `${origin}${path}?${new URLSearchParams(query)}`;

export function initialRequests(ticker, since, checkpoint) {
  assert.match(
    ticker,
    /^[A-Z0-9][A-Z0-9.-]{0,14}$/,
    "Use the requested ticker.",
  );
  if (!checkpoint) {
    assert.match(
      since ?? "",
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,
      "Supply --since as a UTC ISO timestamp.",
    );
    assert(
      Number.isFinite(Date.parse(since)) && Date.parse(since) <= Date.now(),
      "Invalid or future --since timestamp.",
    );
    assert.equal(
      new Date(since).toISOString().slice(0, 19),
      since.slice(0, 19),
      "Use a valid calendar date in --since.",
    );
  }
  return [
    url("/v1/brief", { ticker, detail: "current", max_results: "3" }),
    url(
      "/v1/beliefs",
      checkpoint
        ? { view: "changes", checkpoint }
        : { view: "changes", ticker, changed_since: since, limit: "20" },
    ),
  ];
}

function privateFile(path) {
  const stat = lstatSync(path);
  assert(
    stat.isFile() && stat.nlink === 1 && (stat.mode & 0o077) === 0,
    "State must be a private regular file (chmod 600).",
  );
}

function save(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  renameSync(temp, path);
}

async function jsonRequest(fetchImpl, target, headers) {
  const response = await fetchImpl(target, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status}; retain the state and reconcile this request before another attempt.`,
    );
  return response.json();
}

function result(state, statePath) {
  return {
    ticker: state.ticker,
    state: statePath,
    status: state.status,
    account_reads_reserved: state.operations.length,
    current: state.operations[0]?.response ?? null,
    journal_pages: state.operations
      .slice(1)
      .map((operation) => operation.response),
    next_poll_ready: state.status === "complete" && Boolean(state.checkpoint),
    limitations: [
      "The current brief is bounded to three cases; preserve its omission, continuation and quality fields.",
      "The journal contains distinct author, engine, distribution and outcome domains; it is not exclusively thesis revisions.",
      "Empty changes do not prove complete history. Inspect status, history_coverage, data_status and warnings.",
      "Account billing applies. The x402 price is not the account price. No wallet signing is implemented here.",
    ],
  };
}

function validateResponse(response, ticker, index) {
  assert.equal(response.schema_version, "1", "Unexpected response schema.");
  assert.equal(
    response.scope?.ticker,
    ticker,
    "Response scope does not match the requested company.",
  );
  assert(Array.isArray(response.warnings), "Missing response warnings.");
  if (index === 0) {
    assert.equal(response.resource, "brief", "Expected a current brief.");
    assert.equal(response.view, "current", "Expected a current brief.");
    assert(
      Array.isArray(response.beliefs) && response.beliefs.length <= 3,
      "Unexpected current beliefs.",
    );
    assert(
      response.coverage && Array.isArray(response.quality_gaps),
      "Missing current coverage or quality gaps.",
    );
    for (const field of [
      "available_belief_count",
      "omitted_belief_count",
      "unassessed_status_count",
      "unassessed_severity_count",
    ])
      assert(
        Number.isInteger(response.coverage[field]) &&
          response.coverage[field] >= 0,
        `Invalid coverage ${field}.`,
      );
    assert(
      ["complete_within_scope", "bounded", "no_fit"].includes(
        response.coverage.completeness,
      ),
      "Invalid coverage completeness.",
    );
    for (const belief of response.beliefs) {
      assert(
        typeof belief.belief_id === "string" && belief.thesis,
        "Missing attributed case.",
      );
      for (const field of [
        "evidence",
        "qualifications",
        "unknowns",
        "risks",
        "catalysts",
      ])
        assert(Array.isArray(belief[field]), `Missing case ${field}.`);
    }
  } else {
    assert(
      Array.isArray(response.data?.changes) &&
        Array.isArray(response.citations),
      "Unexpected change-journal response.",
    );
    assert(
      [
        "available",
        "resync_required",
        "projection_catching_up",
        "history_uninitialized",
      ].includes(response.data.status),
      "Unknown journal status.",
    );
    assert.equal(
      response.methodology_version,
      "belief-changes-v1",
      "Unexpected journal methodology.",
    );
    assert(
      ["changes", "resync"].includes(response.data.mode) &&
        response.data.history_coverage &&
        typeof response.data.history_coverage === "object",
      "Missing journal mode or history coverage.",
    );
    for (const token of ["continuation_cursor", "polling_checkpoint"])
      assert(
        response.data[token] === null ||
          (typeof response.data[token] === "string" &&
            response.data[token].length > 0 &&
            response.data[token].length <= 2048),
        "Invalid journal token.",
      );
  }
}

export async function run(
  options,
  { fetchImpl = fetch, apiKey = process.env.BELIEFSTATE_API_KEY } = {},
) {
  if (options.demo)
    return read(
      fileURLToPath(
        new URL("./fixtures/research-update-20261027.json", import.meta.url),
      ),
    );
  const ticker = (options.ticker ?? "").toUpperCase();
  assert(
    Number.isInteger(options.maxReads) &&
      options.maxReads >= 2 &&
      options.maxReads <= 20,
    "--max-reads must be 2–20. It caps the total account reads in this state file.",
  );
  assert(
    !(options.since && options.previousState),
    "Choose --since or --previous-state.",
  );
  const previous = options.previousState
    ? (() => {
        privateFile(options.previousState);
        const value = read(options.previousState);
        assert(
          value.status === "complete" &&
            value.ticker === ticker &&
            typeof value.checkpoint === "string" &&
            value.checkpoint.length > 0 &&
            value.checkpoint.length <= 2048,
          "Previous state must contain a completed checkpoint for the same ticker.",
        );
        return value;
      })()
    : null;
  const targets = initialRequests(ticker, options.since, previous?.checkpoint);
  if (!options.execute)
    return {
      mode: "plan",
      ticker,
      account_read_ceiling: options.maxReads,
      initial_requests: targets.map((target) => ({
        method: "GET",
        url: target,
      })),
      instructions:
        "No network calls made. For live account reads, securely set BELIEFSTATE_API_KEY and add --execute --state .private/research.json. Check account pricing and available allowance first.",
    };
  assert(
    apiKey?.trim(),
    "Set BELIEFSTATE_API_KEY through your secret store; do not paste it into chat or commit it.",
  );
  assert(options.state, "Choose a private --state file.");
  const statePath = resolve(options.state);
  assert(
    !options.previousState || statePath !== resolve(options.previousState),
    "Use a new state file for the next poll; retain the previous checkpoint.",
  );
  const directory = dirname(statePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  assert(
    (lstatSync(directory).mode & 0o077) === 0,
    "Use a private state directory (chmod 700).",
  );
  const lock = `${statePath}.lock`;
  writeFileSync(lock, "", { flag: "wx", mode: 0o600 });
  try {
    if (existsSync(statePath)) privateFile(statePath);
    const fingerprint = digest(apiKey);
    if (previous)
      assert(
        previous.principal === fingerprint,
        "Use the same account key as the previous polling state.",
      );
    const state = existsSync(statePath)
      ? read(statePath)
      : {
          version: 1,
          ticker,
          initialRequests: targets,
          principal: fingerprint,
          created_at: new Date().toISOString(),
          operations: [],
          status: "ready",
          checkpoint: null,
        };
    assert.equal(state.version, 1, "Unsupported state version.");
    assert.equal(
      state.principal,
      fingerprint,
      "This state belongs to another key.",
    );
    assert.deepEqual(
      state.initialRequests,
      targets,
      "Keep the same ticker/window when resuming.",
    );
    assert(
      !state.operations.some((operation) => !operation.response),
      "A previous request has an uncertain outcome. Do not create a replacement request. Reconcile its saved X-Request-ID first; completed account responses are not replayed.",
    );
    if (state.status === "complete") return result(state, statePath);
    assert(
      ["ready", "running", "read_limit_reached"].includes(state.status),
      "This journal needs attention; inspect the saved status and warnings before starting another window.",
    );
    for (const [index, operation] of state.operations.entries())
      validateResponse(operation.response, ticker, index);
    if (!state.operations.length) {
      const coverage = await jsonRequest(
        fetchImpl,
        `${origin}/v1/tickers`,
        options.test ? { "X-BeliefState-Usage": "test" } : {},
      );
      assert(
        Array.isArray(coverage.tickers) && coverage.tickers.includes(ticker),
        "Requested ticker is absent from released coverage; stop without substituting another company.",
      );
    }
    let next = targets[0];
    if (state.operations.length === 1) next = targets[1];
    if (state.operations.length > 1) {
      const cursor = state.operations.at(-1).response.data.continuation_cursor;
      next = cursor ? url("/v1/beliefs", { view: "changes", cursor }) : null;
    }
    while (next) {
      if (state.operations.length >= options.maxReads) {
        state.status = "read_limit_reached";
        save(statePath, state);
        break;
      }
      assert(
        !state.operations.some((operation) => operation.url === next),
        "Request URL repeated; stop rather than spending again.",
      );
      const operation = { url: next, requestId: randomUUID() };
      state.operations.push(operation);
      state.status = "in_flight";
      save(statePath, state);
      // Persist before dispatch. Account idempotency prevents duplicate debit, not lost-body replay.
      operation.response = await jsonRequest(fetchImpl, next, {
        Authorization: `Bearer ${apiKey}`,
        "X-Request-ID": operation.requestId,
        ...(options.test ? { "X-BeliefState-Usage": "test" } : {}),
      });
      try {
        validateResponse(
          operation.response,
          ticker,
          state.operations.length - 1,
        );
        state.status = "running";
        save(statePath, state);
        if (state.operations.length === 1) {
          next = targets[1];
          continue;
        }
        const page = operation.response;
        assert.equal(
          page.scope?.ticker,
          ticker,
          "Journal scope does not match the requested company.",
        );
        assert(
          Array.isArray(page.data?.changes),
          "Unexpected change-journal response.",
        );
        if (page.data.status !== "available") {
          state.status = page.data.status ?? "unexpected_journal_status";
          save(statePath, state);
          break;
        }
        const { continuation_cursor: cursor, polling_checkpoint: checkpoint } =
          page.data;
        assert(
          !(cursor && checkpoint),
          "Ambiguous journal continuation/checkpoint.",
        );
        if (cursor) {
          assert(
            !state.operations.some(
              (item) =>
                item.url === url("/v1/beliefs", { view: "changes", cursor }),
            ),
            "Journal cursor repeated; stop rather than spending again.",
          );
          next = url("/v1/beliefs", { view: "changes", cursor });
        } else {
          assert(
            checkpoint,
            "Journal ended without a completed polling checkpoint.",
          );
          state.checkpoint = checkpoint;
          state.status = "complete";
          save(statePath, state);
          next = null;
        }
      } catch (error) {
        state.status = "needs_attention";
        save(statePath, state);
        throw error;
      }
    }
    return result(state, statePath);
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
        since: { type: "string" },
        state: { type: "string" },
        "previous-state": { type: "string" },
        "max-reads": { type: "string", default: "2" },
        execute: { type: "boolean" },
        demo: { type: "boolean" },
        test: { type: "boolean" },
      },
    });
    const output = await run({
      ...values,
      maxReads: Number(values["max-reads"]),
      previousState: values["previous-state"],
    });
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
