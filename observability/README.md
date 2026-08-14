# Local observability

`docker-compose.yml` owns the local Grafana LGTM stack and reuses the persistent
`keycloak_observability_data` volume. Create the volume once on a fresh machine:

```powershell
docker volume create keycloak_observability_data
```

Start observability from this directory:

```powershell
cd observability
docker compose up -d
```

Grafana is available at <http://127.0.0.1:3001>. The OpenTelemetry Collector
accepts OTLP/gRPC on port `4317` and OTLP/HTTP on port `4318`.
Application JSONL logs are also exported over OTLP and appear in Grafana's
Loki data source with their active trace and span IDs.

Run the connection check from `client` after the app is running:

```powershell
npm.cmd run test:observability
```

The following integration points must remain in `client` because Next.js owns
telemetry creation and export:

- `instrumentation.ts` registers `iam-platform` with OpenTelemetry.
- `proxy.ts` adds request and trace correlation to `/api/*` responses.
- `.env.example` documents the OTLP exporter settings used by Next.js.
- `package.json` contains the OpenTelemetry dependencies and smoke-test command.
