import { buildServer } from "./app.js";

const host = process.env.SERVER_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.SERVER_PORT ?? "4000", 10);

const app = buildServer();

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
