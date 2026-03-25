import { Server } from "ws";

const channels = new Set<any>();

export const createLiveHub = (wss: Server) => {
  wss.on("connection", (socket) => {
    channels.add(socket);
    socket.on("close", () => channels.delete(socket));
  });

  const publish = (event: string, payload: unknown) => {
    const data = JSON.stringify({ event, payload, ts: Date.now() });
    for (const socket of channels) {
      if (socket.readyState === 1) {
        socket.send(data);
      }
    }
  };

  return { publish };
};
