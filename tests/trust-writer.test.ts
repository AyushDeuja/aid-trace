import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFailure,
  retryDelaySeconds,
} from "../services/trust-writer/worker.mjs";
import { TrustWriterError } from "../services/trust-writer/magicblock-adapter";

test("trust writer applies bounded exponential backoff", () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => retryDelaySeconds(index + 1)),
    [60, 120, 240, 480, 900, 900, 900, 900]
  );
});

test("expired and revoked sessions are terminal", () => {
  for (const code of ["session_expired", "session_revoked"]) {
    assert.equal(
      classifyFailure(new TrustWriterError(code, code, true), 1).terminal,
      true
    );
  }
});

test("retryable failures become terminal at attempt eight", () => {
  assert.equal(
    classifyFailure(new TrustWriterError("router_mismatch", "retry"), 7)
      .terminal,
    false
  );
  assert.equal(
    classifyFailure(new TrustWriterError("router_mismatch", "retry"), 8)
      .terminal,
    true
  );
});
