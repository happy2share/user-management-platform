import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

const LOG_DIR = process.env.IAM_LOG_DIR || path.join(process.cwd(), "logs");
const MAX_BYTES = Number(process.env.IAM_LOG_MAX_BYTES || 1024 * 1024);
const MAX_FILES = Math.max(2, Number(process.env.IAM_LOG_MAX_FILES || 5));
const REDACTED = "[redacted]";
const SENSITIVE_KEY = /(password|secret|token|otp|authorization|cookie)/i;
const LEVELS = ["debug", "info", "warn", "error"];
const OTEL_LOGGER = logs.getLogger("iam-platform");
const OTEL_SEVERITY = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

function filePath(level, index = 0) {
  return path.join(LOG_DIR, `${level}.log${index ? `.${index}` : ""}`);
}

async function rotate(level) {
  for (let index = MAX_FILES - 1; index >= 1; index -= 1) {
    const source = filePath(level, index - 1);
    const target = filePath(level, index);
    try {
      await fs.rm(target, { force: true });
    } catch {}
    try {
      await fs.rename(source, target);
    } catch {}
  }
}

async function ensureRoom(level, entrySize) {
  await fs.mkdir(LOG_DIR, { recursive: true });
  try {
    const stat = await fs.stat(filePath(level));
    if (stat.size + entrySize > MAX_BYTES) {
      await rotate(level);
    }
  } catch {}
}

function normalize(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) return value.map(normalize);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : normalize(item),
      ]),
    );
  }

  return value;
}

function serialize(level, message, meta) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    host: os.hostname(),
  };
  if (meta !== undefined) payload.meta = normalize(meta);
  return `${JSON.stringify(payload)}\n`;
}

async function write(level, message, meta) {
  const line = serialize(level, message, meta);
  await ensureRoom(level, Buffer.byteLength(line));
  await fs.appendFile(filePath(level), line, "utf8");
  OTEL_LOGGER.emit({
    severityNumber: OTEL_SEVERITY[level],
    severityText: level.toUpperCase(),
    body: message,
    attributes: {
      host: os.hostname(),
      "log.meta": JSON.stringify(normalize(meta ?? {})),
    },
  });
}

export function logInfo(message, meta) {
  return write("info", message, meta);
}

export function logWarn(message, meta) {
  return write("warn", message, meta);
}

export function logError(message, meta) {
  return write("error", message, meta);
}

export function logDebug(message, meta) {
  return write("debug", message, meta);
}

export async function readLocalLogs(limit = 200) {
  const contents = await Promise.all(
    LEVELS.flatMap((level) =>
      Array.from({ length: MAX_FILES }, (_, index) =>
        fs.readFile(filePath(level, index), "utf8").catch(() => ""),
      ),
    ),
  );

  return contents
    .flatMap((content) => content.split("\n").filter(Boolean))
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, Math.max(0, limit));
}
