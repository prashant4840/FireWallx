import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "node:http";
import pino from "pino";
import { WebSocketServer } from "ws";
import { createRoutes } from "./api/routes.js";
import { createLiveHub } from "./ws/liveHub.js";

const logger = pino({ name: "firewallx-control-plane" });
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path }, "incoming request");
  next();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const hub = createLiveHub(wss);

app.use("/api", createRoutes(hub.publish));

const port = Number(process.env.PORT ?? 5001);
server.listen(port, () => {
  logger.info(`Control plane running at http://localhost:${port}`);
});
