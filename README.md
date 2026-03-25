# FirewallX

Hackathon / class project: fake “enterprise firewall” stack — gateway, Node API + Postgres, React dashboard with live charts and websocket stuff.

---

## You need

- **Node** (18+ is fine) — check with `node -v` and `npm -v`
- **Docker Desktop** installed and actually *running* (whale icon, not sleeping)

If your terminal says `command not found: docker`, you have to install Docker first or this won’t start the database.

---

## Run it (from the FirewallX folder — the one with `package.json`)

**1. Database + Redis**

```bash
cd config
docker compose up -d
cd ..
```

**2. Dependencies**

```bash
npm install
```

**3. DB tables + demo data**

```bash
npm run demo:seed
```

**4. Everything dev mode**

```bash
npm run dev
```


**Lazy one-liner** (same folder as `package.json`):

```bash
cd config && docker compose up -d && cd .. && npm install && npm run demo:seed && npm run dev
```

---

## URLs

- Dashboard: http://localhost:5173  
- API: http://localhost:5001/api  
- Quick health check: http://localhost:5001/api/health  
- Gateway: http://localhost:8080  

---

## Quick demo

Open the dashboard → hit simulate attack → watch numbers / heatmap / timeline move. Reset demo if you added that button. Sound toggle is optional (browser might mute until you click something).

---

## When it breaks

- **No docker** → install Docker Desktop, open it, try again  
- **Seed fails** → Postgres probably not up; redo `docker compose up -d` in `config/`  
- **Port in use** → something else is on 5432 / 5001 / 5173 — kill that or change ports (annoying, avoid if you can)

---

## Folders

- `backend/` — API, Prisma, websocket hub  
- `frontend/` — Vite + React UI  
- `gateway/` — proxy layer  
- `config/` — docker-compose + env examples  

More detail in `docs/setup.md` if you need it.
# FireWallx
