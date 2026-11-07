import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Database tests share one test database and reset its schema: run files one at a time.
    fileParallelism: false,
  },
});
