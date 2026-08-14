import { registerOTel } from "@vercel/otel";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    registerOTel("iam-platform");
    return;
  }

  const [{ OTLPLogExporter }, { BatchLogRecordProcessor }] = await Promise.all([
    import("@opentelemetry/exporter-logs-otlp-http"),
    import("@opentelemetry/sdk-logs"),
  ]);
  registerOTel({
    serviceName: "iam-platform",
    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() }),
    ],
  });
}
