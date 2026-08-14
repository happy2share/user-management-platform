import { createServer } from "node:http";

const production = process.argv.includes("--production");
if (production) process.env.NODE_ENV = "production";

const { default: next } = await import("next");
const hostname = process.env.APP_HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev: !production, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

createServer((request, response) => {
  delete request.headers["x-iam-client-ip"];
  if (request.socket.remoteAddress) {
    request.headers["x-iam-client-ip"] = request.socket.remoteAddress;
  }
  handle(request, response);
}).listen(port, hostname, () => {
  console.log(`IAM application ready on http://${hostname}:${port}`);
});
