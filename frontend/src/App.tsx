import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AttackHeatmap } from "./components/AttackHeatmap";
import { AttackSimulator } from "./components/AttackSimulator";
import { DemoHelperOverlay } from "./components/DemoHelperOverlay";
import { HeaderBar } from "./components/HeaderBar";
import { KpiCard } from "./components/KpiCard";
import { Skeleton } from "./components/Skeleton";
import { SocChartTooltip } from "./components/SocChartTooltip";
import { ThreatTimeline } from "./components/ThreatTimeline";
import { api } from "./services/api";
import type { AlertEntry, HeatPoint, LogEntry, Rule, TimelineEvent } from "./types";
import alertSoundFile from "./assets/alert.mp3";

interface Overview {
  allowed: number;
  blocked: number;
  rateLimited: number;
  totalAlerts: number;
}

export const App = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"info" | "critical">("info");
  const [enableAlertSound, setEnableAlertSound] = useState(true);
  const [overview, setOverview] = useState<Overview>({ allowed: 0, blocked: 0, rateLimited: 0, totalAlerts: 0 });
  const [newRule, setNewRule] = useState<{ name: string; priority: number; action: "ALLOW" | "BLOCK" | "RATE_LIMIT" }>({
    name: "",
    priority: 100,
    action: "BLOCK"
  });

  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const enableAlertSoundRef = useRef(enableAlertSound);
  const handledAlertIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);
  const lastCoreRefreshAtRef = useRef<number>(0);
  const coreRefreshCooldownMs = 450;
  const simPollIntervalRef = useRef<number | null>(null);
  const simAnalyticsIntervalRef = useRef<number | null>(null);
  const simEndTimeoutRef = useRef<number | null>(null);
  const simCompletionResolveRef = useRef<null | (() => void)>(null);
  const analyticsInFlightRef = useRef(false);

  useEffect(() => {
    enableAlertSoundRef.current = enableAlertSound;
  }, [enableAlertSound]);

  const showToast = (message: string, tone: "info" | "critical" = "info") => {
    setToastMessage(message);
    setToastTone(tone);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2600);
  };

  const refreshCore = async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    else setRefreshing(true);

    try {
      const [logsRes, rulesRes, overviewRes, alertsRes] = await Promise.all([
        api.get<LogEntry[]>("/logs?limit=100"),
        api.get<Rule[]>("/rules?application=default-app&environment=prod"),
        api.get<Overview>("/analytics/overview"),
        api.get<AlertEntry[]>("/alerts")
      ]);
      setLogs(logsRes.data);
      setRules(rulesRes.data);
      setOverview(overviewRes.data);
      setAlerts(alertsRes.data);
    } catch {
      showToast("Could not load telemetry. Is the API running?", "critical");
      // Keep last known values on failure to avoid blank UI.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshAnalytics = async () => {
    if (analyticsInFlightRef.current) return;
    analyticsInFlightRef.current = true;

    // These are optional UI sections; never let them block each other.
    // Heatmap can call external geo lookup services, so keep it time-bounded.
    const heatTimeoutMs = 2500;
    const timelineTimeoutMs = 2500;

    try {
      const heatRes = await api.get<HeatPoint[]>("/analytics/heatmap", { timeout: heatTimeoutMs });
      setHeatPoints(heatRes.data);
    } catch {
      setHeatPoints([]);
    }

    try {
      const timelineRes = await api.get<TimelineEvent[]>("/analytics/timeline", { timeout: timelineTimeoutMs });
      setTimeline(timelineRes.data);
    } catch {
      setTimeline([]);
    }
    finally {
      analyticsInFlightRef.current = false;
    }
  };

  const refreshAll = async (showSkeleton = false) => {
    await refreshCore(showSkeleton);
    await refreshAnalytics();
  };

  const refreshCoreThrottled = async (force = false, showSkeleton = false) => {
    const now = Date.now();
    if (!force && now - lastCoreRefreshAtRef.current < coreRefreshCooldownMs) return;
    lastCoreRefreshAtRef.current = now;
    return refreshCore(showSkeleton);
  };

  const endSimulationUI = () => {
    if (simPollIntervalRef.current) {
      window.clearInterval(simPollIntervalRef.current);
      simPollIntervalRef.current = null;
    }
    if (simAnalyticsIntervalRef.current) {
      window.clearInterval(simAnalyticsIntervalRef.current);
      simAnalyticsIntervalRef.current = null;
    }
    if (simEndTimeoutRef.current) {
      window.clearTimeout(simEndTimeoutRef.current);
      simEndTimeoutRef.current = null;
    }
    setSimulating(false);
    if (simCompletionResolveRef.current) {
      simCompletionResolveRef.current();
      simCompletionResolveRef.current = null;
    }
  };

  useEffect(() => {
    if (!localStorage.getItem("firewallx_demo_token")) {
      api.get<{ adminToken: string; userToken: string }>("/demo/tokens")
        .then((res) => localStorage.setItem("firewallx_demo_token", res.data.adminToken))
        .catch(() => undefined);
    }
    alertAudioRef.current = new Audio(alertSoundFile);
    alertAudioRef.current.preload = "auto";
    refreshAll(true).catch(() => undefined);

    const wsUrl = (import.meta.env.VITE_WS_URL ?? "ws://localhost:5001/ws").toString();
    const ws = new WebSocket(wsUrl);

    ws.onerror = () => {
      showToast("WebSocket failed. Falling back to polling.", "info");
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (
        [
          "alert.created",
          "simulation.started",
          "simulation.completed",
          "demo.reset"
        ].includes(data.event)
      ) {
        refreshCoreThrottled(false).catch(() => undefined);
      }

      if (data.event === "alert.created" && data.payload) {
        const payload = data.payload as AlertEntry;
        const level = String(payload.level ?? "").toUpperCase();
        const isHighSeverity = level === "HIGH" || level === "CRITICAL";
        const notHandled = payload.id && !handledAlertIdsRef.current.has(payload.id);

        if (isHighSeverity && notHandled) {
          handledAlertIdsRef.current.add(payload.id);
          if (enableAlertSoundRef.current && alertAudioRef.current) {
            alertAudioRef.current.currentTime = 0;
            alertAudioRef.current.play().catch(() => undefined);
          }
          showToast(level === "CRITICAL" ? "Critical threat detected - IP blocked automatically" : "High-severity threat detected", level === "CRITICAL" ? "critical" : "info");
        }
      }

      if (data.event === "simulation.completed" || data.event === "demo.reset") {
        endSimulationUI();
        refreshAnalytics().catch(() => undefined);
        refreshCoreThrottled(true).catch(() => undefined);
      }
    };

    return () => {
      ws.close();
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const chartData = useMemo(() => {
    return [
      { name: "ALLOW", value: overview.allowed },
      { name: "BLOCK", value: overview.blocked },
      { name: "RATE_LIMIT", value: overview.rateLimited }
    ];
  }, [overview]);

  const riskLine = useMemo(
    () => logs.slice(0, 25).reverse().map((log, idx) => ({ i: idx + 1, risk: log.riskScore })),
    [logs]
  );

  const trafficOverTime = useMemo(
    () =>
      logs
        .slice(0, 30)
        .reverse()
        .map((log, idx) => ({ i: idx + 1, responseMs: log.riskScore > 80 ? 120 : 30 + log.riskScore })),
    [logs]
  );

  const createRule = async () => {
    await api.post("/rules", {
      name: newRule.name,
      application: "default-app",
      environment: "prod",
      priority: Number(newRule.priority),
      enabled: true,
      action: newRule.action,
      pathPattern: "/admin"
    });
    setNewRule({ name: "", priority: 100, action: "BLOCK" });
    await refreshAll();
  };

  const resetDemo = async () => {
    setResetting(true);
    try {
      await api.post("/demo/reset");
      endSimulationUI();
      await refreshAll(true);
      showToast("Demo Reset Successfully", "info");
    } finally {
      setResetting(false);
    }
  };

  const simulateAttack = async () => {
    try {
      const response = await api.post("/simulate/attack", {
        mode: "DDoS",
        durationSec: 20,
        rps: 100,
        application: "default-app",
        environment: "prod"
      });

      const durationSec = Number(response.data.durationSec ?? 20);
      const durationMs = Math.max(5000, durationSec * 1000);

      setSimulating(true);
      showToast(`Simulation running: ${response.data.mode} at ${response.data.rps} rps`, "info");
      refreshCoreThrottled(true).catch(() => undefined);
      refreshAnalytics().catch(() => undefined);

      if (simPollIntervalRef.current) {
        window.clearInterval(simPollIntervalRef.current);
        simPollIntervalRef.current = null;
      }
      if (simAnalyticsIntervalRef.current) {
        window.clearInterval(simAnalyticsIntervalRef.current);
        simAnalyticsIntervalRef.current = null;
      }

      simPollIntervalRef.current = window.setInterval(() => {
        refreshCoreThrottled(false).catch(() => undefined);
      }, 1000);

      // Update heatmap/timeline periodically while the simulation is running.
      simAnalyticsIntervalRef.current = window.setInterval(() => {
        refreshAnalytics().catch(() => undefined);
      }, 4000);

      return await new Promise<void>((resolve) => {
        simCompletionResolveRef.current = resolve;
        if (simEndTimeoutRef.current) window.clearTimeout(simEndTimeoutRef.current);
        simEndTimeoutRef.current = window.setTimeout(() => {
          endSimulationUI();
          refreshAnalytics().catch(() => undefined);
          resolve();
        }, durationMs + 700);
      });
    } catch {
      showToast("Simulation failed. Check API status / logs.", "critical");
      endSimulationUI();
    }
  };

  return (
    <div className="app">
      <HeaderBar
        refreshing={refreshing}
        enableAlertSound={enableAlertSound}
        onToggleSound={setEnableAlertSound}
        onSimulateAttack={simulateAttack}
        onResetDemo={resetDemo}
        simulating={simulating}
        resetting={resetting}
      />

      <main className="soc-content">
        <div className="demo-banner">Demo Mode Enabled - Use Simulate Attack to trigger live defense workflows</div>
        <DemoHelperOverlay />
        {toastMessage ? <div className={`toast ${toastTone === "critical" ? "toast-critical" : "toast-info"}`}>{toastMessage}</div> : null}

        <section className="kpi-grid section-enter" style={{ ["--enter-delay" as string]: "0ms" }}>
          <KpiCard title="Allowed" value={overview.allowed} icon="✓" tone="success" loading={loading} />
          <KpiCard title="Blocked" value={overview.blocked} icon="⛔" tone="danger" loading={loading} />
          <KpiCard title="Rate Limited" value={overview.rateLimited} icon="⏱" tone="warning" loading={loading} />
          <KpiCard title="Active Alerts" value={overview.totalAlerts} icon="⚠" tone="info" loading={loading} />
        </section>

        <section className="charts analytics-grid section-enter" style={{ ["--enter-delay" as string]: "70ms" }}>
          <div className="panel fade-in">
            <h3>Threat Distribution</h3>
            {loading ? (
              <Skeleton height={260} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fw-gradient-bar-threat" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.95} />
                      <stop offset="45%" stopColor="#7c3aed" stopOpacity={1} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26344d" vertical={false} />
                  <XAxis dataKey="name" stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#374151" }} />
                  <YAxis stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#374151" }} width={36} />
                  <Tooltip
                    content={<SocChartTooltip />}
                    cursor={{ fill: "rgba(59, 130, 246, 0.08)" }}
                    wrapperStyle={{ outline: "none", transition: "opacity 0.18s ease" }}
                  />
                  <Bar
                    dataKey="value"
                    fill="url(#fw-gradient-bar-threat)"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive
                    animationDuration={700}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="panel fade-in">
            <h3>Risk Score Trend</h3>
            {loading ? (
              <Skeleton height={260} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={riskLine} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fw-gradient-line-risk" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="45%" stopColor="#ef4444" />
                      <stop offset="100%" stopColor="#b91c1c" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26344d" vertical={false} />
                  <XAxis dataKey="i" stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#374151" }} />
                  <YAxis stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#374151" }} width={36} />
                  <Tooltip
                    content={<SocChartTooltip />}
                    cursor={{ stroke: "rgba(239, 68, 68, 0.35)", strokeWidth: 1, strokeDasharray: "4 4" }}
                    wrapperStyle={{ outline: "none", transition: "opacity 0.18s ease" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="risk"
                    stroke="url(#fw-gradient-line-risk)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: "#ef4444", stroke: "#fecaca", strokeWidth: 2 }}
                    isAnimationActive
                    animationDuration={800}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="panel fade-in">
            <h3>Traffic Over Time</h3>
            {loading ? (
              <Skeleton height={260} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trafficOverTime} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fw-gradient-area-traffic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                      <stop offset="55%" stopColor="#16a34a" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26344d" vertical={false} />
                  <XAxis dataKey="i" stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#374151" }} />
                  <YAxis stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#374151" }} width={36} />
                  <Tooltip
                    content={<SocChartTooltip />}
                    cursor={{ stroke: "rgba(34, 197, 94, 0.4)", strokeWidth: 1, strokeDasharray: "4 4" }}
                    wrapperStyle={{ outline: "none", transition: "opacity 0.18s ease" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="responseMs"
                    stroke="#4ade80"
                    strokeWidth={2}
                    fill="url(#fw-gradient-area-traffic)"
                    isAnimationActive
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="grid-two section-enter" style={{ ["--enter-delay" as string]: "130ms" }}>
          <AttackHeatmap points={heatPoints} loading={loading} />
          <ThreatTimeline events={timeline} loading={loading} />
        </section>

        <section className="grid-two section-enter" style={{ ["--enter-delay" as string]: "180ms" }}>
          <AttackSimulator onSimulate={simulateAttack} />
          <div className="panel">
            <h3>Rule Management</h3>
            <div className="rule-form">
              <input placeholder="Rule name" value={newRule.name} onChange={(e) => setNewRule((s) => ({ ...s, name: e.target.value }))} />
              <input type="number" placeholder="Priority" value={newRule.priority} onChange={(e) => setNewRule((s) => ({ ...s, priority: Number(e.target.value) }))} />
              <select value={newRule.action} onChange={(e) => setNewRule((s) => ({ ...s, action: e.target.value as "ALLOW" | "BLOCK" | "RATE_LIMIT" }))}>
                <option value="ALLOW">ALLOW</option>
                <option value="BLOCK">BLOCK</option>
                <option value="RATE_LIMIT">RATE_LIMIT</option>
              </select>
              <button onClick={createRule}>Create Rule</button>
            </div>
            <table>
              <thead><tr><th>Name</th><th>Priority</th><th>Action</th></tr></thead>
              <tbody>{rules.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.priority}</td><td>{r.action}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="grid-two logs-row section-enter" style={{ ["--enter-delay" as string]: "240ms" }}>
          <div className="panel fade-in">
            <h3>Traffic Logs Explorer</h3>
            <table className="logs-table">
              <thead><tr><th>IP</th><th>Endpoint</th><th>Action</th><th>Risk</th></tr></thead>
              <tbody>
                {loading
                  ? Array.from({ length: 7 }).map((_, idx) => (
                      <tr key={idx}>
                        <td><Skeleton height={10} width="80%" /></td>
                        <td><Skeleton height={10} width="70%" /></td>
                        <td><Skeleton height={10} width="60%" /></td>
                        <td><Skeleton height={10} width="45%" /></td>
                      </tr>
                    ))
                  : logs.map((log) => (
                      <tr key={log.id} className={`action-${log.action.toLowerCase()}`}>
                        <td>{log.ip}</td><td>{log.endpoint}</td><td>{log.action}</td><td>{log.riskScore}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          <div className="panel fade-in">
            <h3>Alert Feed</h3>
            <table>
              <thead><tr><th>Level</th><th>Message</th><th>App</th></tr></thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={idx}>
                        <td><Skeleton height={10} width="60%" /></td>
                        <td><Skeleton height={10} width="80%" /></td>
                        <td><Skeleton height={10} width="65%" /></td>
                      </tr>
                    ))
                  : alerts.slice(0, 8).map((a) => <tr key={a.id}><td>{a.level}</td><td>{a.message}</td><td>{a.application}</td></tr>)}
              </tbody>
            </table>
            <div className="system-status">
              <p>{loading ? "Loading live telemetry..." : refreshing ? "Refreshing telemetry..." : "Live telemetry active. Preloaded demo data is visible."}</p>
              <p>{logs.length === 0 ? "Waiting for logs..." : `Loaded ${logs.length} logs`}</p>
              <p>{rules.length === 0 ? "Waiting for rules..." : `Loaded ${rules.length} rules`}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
