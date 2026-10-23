import { defineApp } from "convex/server";
import { v } from "convex/values";
import askolia from "@appik-studio/askolia-convex/convex.config.js";

const app = defineApp({ env: {
  ASKOLIA_URL: v.optional(v.string()),
  ASKOLIA_API_KEY: v.optional(v.string()),
} });
app.use(askolia, { env: {
  ASKOLIA_URL: app.env.ASKOLIA_URL,
  ASKOLIA_API_KEY: app.env.ASKOLIA_API_KEY,
} });
export default app;
