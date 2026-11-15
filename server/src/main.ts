import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER_PORT } from "@drift/shared";
import { createServer } from "./relay";
import { getLanIp } from "./lanIp";

const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(here, "../../game/dist");
const srv = await createServer({ port: SERVER_PORT, staticDir });
console.log(`Oyun: http://${getLanIp()}:${srv.port}`);
