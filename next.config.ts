import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Consenti accesso da un altro dispositivo sulla rete locale
  allowedDevOrigins: ["localhost", "192.168.0.150"],
} as any;

export default nextConfig;
