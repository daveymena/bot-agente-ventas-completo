{
  "test": {
    "globals": true,
    "environment": "jsdom",
    "setupFiles": ["./vitest.setup.js"],
    "coverage": {
      "provider": "v8",
      "reporter": ["text", "json", "html"]
    }
  }
}
