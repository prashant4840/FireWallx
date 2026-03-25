import { useState } from "react";
import { api } from "../services/api";

interface AttackSimulatorProps {
  onSimulate?: () => Promise<void>;
}

export const AttackSimulator = ({ onSimulate }: AttackSimulatorProps) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Idle");

  const simulate = async () => {
    if (onSimulate) {
      setLoading(true);
      setStatus("Launching DDoS simulation...");
      try {
        await onSimulate();
        setStatus("Simulation command sent successfully");
      } catch {
        setStatus("Simulation failed");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setStatus("Launching DDoS simulation...");
    try {
      const response = await api.post("/simulate/attack", {
        mode: "DDoS",
        durationSec: 20,
        rps: 100,
        application: "default-app",
        environment: "prod"
      });
      setStatus(`Running: ${response.data.mode}, ${response.data.rps} rps`);
    } catch {
      setStatus("Simulation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel simulator">
      <h3>Attack Simulation Mode</h3>
      <p>Trigger controlled high-frequency traffic to validate adaptive defenses.</p>
      <button disabled={loading} onClick={simulate}>
        {loading ? "Starting..." : "Simulate DDoS Attack"}
      </button>
      <div className="status">{status}</div>
    </div>
  );
};
