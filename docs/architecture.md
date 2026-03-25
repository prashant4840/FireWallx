# FirewallX Architecture

## Traffic Flow

1. Client sends request to centralized `gateway`.
2. Gateway evaluates request with a firewall pipeline:
   - Zero-trust checks (JWT role/context)
   - Policy rule matching (application/environment scoped)
   - Risk score (0-100) based on behavior and endpoint sensitivity
   - Adaptive anomaly detection (baseline deviation)
   - Self-healing quarantine (temporary IP blocking)
3. Decision action is applied: `ALLOW`, `BLOCK`, `RATE_LIMIT`.
4. Allowed traffic is proxied to target backend service (`app1`, `app2`, ...).
5. Gateway sends decision logs to `backend` control plane.
6. Backend stores logs/rules/alerts in PostgreSQL and streams events via WebSocket.
7. React dashboard displays live telemetry, rule management, and threat analytics.

## Security Controls

- Context-aware policy by endpoint and user role.
- Dynamic risk scoring and threshold-based decisioning.
- Adaptive anomaly detection and automatic quarantine.
- Smart alerting with deduplication to prevent alert fatigue.
- Multi-application and multi-environment isolation.
