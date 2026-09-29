/**
 * Client IP for rate limiting. Express sets `req.ip` (honouring `trust proxy`);
 * the Vite dev middleware passes a raw Node request, so fall back to the socket.
 */
export function clientIp(req) {
  const raw = (req && (req.ip || req.socket?.remoteAddress)) || "";
  const ip = String(raw).replace(/^::ffff:/, "").trim();
  return ip || "unknown";
}
