import { createMDX } from "fumadocs-mdx/next"
import type { NextConfig } from "next"
import path from "node:path"

const config: NextConfig = {
  reactStrictMode: true,
  output: "export",
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.join(__dirname, ".."),
  },
}

const withMDX = createMDX()

export default withMDX(config)
