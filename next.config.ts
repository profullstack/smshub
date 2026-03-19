import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// Sentry integration — uncomment when @sentry/nextjs is installed
// import { withSentryConfig } from "@sentry/nextjs";
// const sentryConfig = {
//   org: process.env.SENTRY_ORG,
//   project: process.env.SENTRY_PROJECT,
//   widenClientFileUpload: true,
//   hideSourceMaps: true,
//   disableLogger: true,
//   silent: !process.env.CI,
// };
// export default withSentryConfig(nextConfig, sentryConfig);

export default nextConfig;
