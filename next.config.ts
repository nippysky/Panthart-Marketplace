import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
     dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com", 
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "ipfs.io", 
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "cloudflare-ipfs.com", 
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "gateway.pinata.cloud", 
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "api.dicebear.com", 
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "lime-traditional-stork-669.mypinata.cloud", 
        pathname: "**",
      },
    ],
  },
};

export default nextConfig;
