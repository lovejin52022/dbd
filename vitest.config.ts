import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  // 允许 vitest 转译 src/shared 下的 .js / .ts 模块
  esbuild: {
    include: [/src\/shared\/.*\.(js|ts)$/],
  },
});
