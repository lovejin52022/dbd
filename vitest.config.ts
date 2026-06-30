import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    // 主进程 DB 测试：不打包 electron 与原生模块
    server: {
      deps: {
        external: ['electron', 'better-sqlite3'],
      },
    },
  },
  ssr: {
    external: ['electron', 'better-sqlite3'],
  },
  // 用 esbuild 转译 shared / main / tests，避免 rollup 解析原生模块
  esbuild: {
    include: [/src\/(shared|main)\/.*\.(js|ts)$/, /tests\/.*\.test\.ts$/],
  },
});
