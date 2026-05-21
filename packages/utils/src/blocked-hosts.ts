// SSRF protection: Block private networks, localhost, link-local, and metadata IPs
export const BLOCKED_IP_RANGES = [
  /^127\./,                    // Loopback
  /^10\./,                     // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
  /^192\.168\./,               // Private Class C
  /^169\.254\./,               // Link-local
  /^0\./,                      // Current network
  /^100\.(6[4-9]|[7-9][0-9]|1[0-2][0-9])\./, // Carrier-grade NAT
  /^198\.18\./,                // Benchmark testing
  /^::1$/,                     // IPv6 loopback
  /^fc00:/,                    // IPv6 unique local
  /^fe80:/,                    // IPv6 link-local
];

export const BLOCKED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",           // AWS/GCP metadata
  "metadata.google.com",
];
