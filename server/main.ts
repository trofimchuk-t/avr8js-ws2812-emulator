import { buildApp } from "./app.ts";
import { Compiler } from "./compiler.ts";
import { loadConfig, TOOLCHAIN_ID } from "./config.ts";

const config = loadConfig();
const compiler = new Compiler(config);
await compiler.verifyToolchain();

const app = buildApp(config, compiler);
const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
app.log.info(`Toolchain: ${TOOLCHAIN_ID}`);
