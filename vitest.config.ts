import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  // 允许 vitest 直接导入 src/shared 下的 .js 模块
  esbuild: {
    include: [/src\/shared\/.*\.js$/],
  },
});
