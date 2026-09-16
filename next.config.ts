import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@thesysai/genui-sdk",
    "@crayonai/react-core",
    "@crayonai/react-ui",
    "@crayonai/stream",
    "@openuidev/react-ui",
    "@openuidev/react-lang",
  ],
};

export default nextConfig;
