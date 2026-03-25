# Setup and Execution (Hackathon Demo)

## Quick Start

```bash
cd config
docker compose up -d

cd ..
npm install
npm run demo:seed
npm run dev
```

## URLs

- Gateway: `http://localhost:8080`
- Control Plane API: `http://localhost:5001/api`
- Dashboard: `http://localhost:5173`

## Demo Flow

1. Open dashboard (it loads seeded rules, logs, alerts automatically).
2. Confirm the `Demo Mode Enabled` banner.
3. Click **Simulate DDoS Attack**.
4. Watch within seconds:
   - Risk trend rising
   - Blocked requests increasing
   - Heatmap lighting up
   - Timeline showing threat response

## Notes

- `npm run demo:seed` creates demo JWT tokens, realistic rules for `app1`/`app2`, sample logs, and alerts.
- Sensitive routes are protected by zero-trust JWT + RBAC logic in gateway.
