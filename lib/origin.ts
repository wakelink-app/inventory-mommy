import os from "os";

function lanIPv4(): string | null {
  const nets = os.networkInterfaces();
  for (const addrs of Object.values(nets)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (
        addr.address.startsWith("192.168.") ||
        addr.address.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(addr.address)
      ) {
        return addr.address;
      }
    }
  }
  for (const addrs of Object.values(nets)) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return null;
}

export function capturePublicOrigin(request: Request): string {
  const headerHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const hostname = headerHost.split(":")[0];
  const port = headerHost.includes(":") ? headerHost.slice(headerHost.lastIndexOf(":") + 1) : "";

  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return `${proto}://${headerHost}`;
  }

  const ip = lanIPv4();
  if (ip) {
    const usePort = port && port !== "80" && port !== "443" ? port : "3000";
    return `http://${ip}:${usePort}`;
  }

  return `${proto}://${headerHost}`;
}
