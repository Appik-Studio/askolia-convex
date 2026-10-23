import { defineComponent } from "convex/server";
import { v } from "convex/values";

export default defineComponent("askolia", {
  env: {
    ASKOLIA_URL: v.optional(v.string()),
    ASKOLIA_API_KEY: v.optional(v.string()),
  },
});
