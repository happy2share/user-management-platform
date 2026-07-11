import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "iam-logs-"));
process.env.IAM_LOG_DIR = directory;

const { logInfo, readLocalLogs } = await import("../app/lib/file-logger.mjs");
await logInfo("smoke test", { actor: "tester" });
const entries = await readLocalLogs(1);

assert.equal(entries[0].message, "smoke test");
assert.equal(entries[0].meta.actor, "tester");
await fs.rm(directory, { recursive: true, force: true });
