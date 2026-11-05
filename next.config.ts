import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Consenti accesso da un altro dispositivo sulla rete locale
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.2.2",
    "192.168.0.150",
    "192.168.1.*",
    "192.168.2.*",
    "192.168.30.*",
  ],
  // Forza Turbopack a usare la cartella corrente del progetto per risolvere tailwindcss e node_modules
  turbopack: {
    root: path.resolve(__dirname),
  },
} as any;

export default nextConfig;
