import express from "express";
import helmet from "helmet";


const app = express();

app.use(helmet());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "app2" }));

// Main demo endpoints the gateway proxies to.
app.get("/public", (_req, res) => res.json({ ok: true, app: "app2", path: "/public" }));
app.get("/admin", (_req, res) => res.json({ ok: true, app: "app2", path: "/admin" }));
app.get("/auth/login", (_req, res) => res.json({ ok: true, app: "app2", path: "/auth/login" }));
app.get("/payments", (_req, res) => res.json({ ok: true, app: "app2", path: "/payments" }));

// Catch-all: keep the proxy behavior predictable for any other paths.
app.all("*", (req, res) => {
  res.status(200).json({ ok: true, app: "app2", method: req.method, path: req.path });
});

const port = Number(process.env.PORT ?? 7002);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`app2 listening on :${port}`);
});

