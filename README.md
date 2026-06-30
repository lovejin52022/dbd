# 多宝岛 Electron 助手

Electron 桌面助手：内嵌京东多宝岛 Webview，管理本地抢单列表，按生命周期自动轮询抢购状态，并支持逐条开启精准自动出价。

## 开发

```bash
npm install
npm run dev
npm test
npm run build
```

## 使用前准备

1. 启动应用后，在 Webview 中打开 [多宝岛](https://dbd.m.jd.com) 并完成京东账号登录（登录页 `plogin.m.jd.com`）。
2. API 请求依赖 Webview 内的 `ParamsSign` 与登录 cookie，未登录时调度器无法调用接口。

## 功能说明

- **抢单列表**：浏览多宝岛商品页，将选中商品加入本地 SQLite 列表。
- **生命周期**：未开始 / 抢购中 / 已过期；仅「抢购中」条目参与 60 秒慢轮询。
- **自动下单**：每条列表项独立开关，**默认关闭**；开启后临近开抢进入快轮询，并在开抢前 80–100ms 自动出价。
- **数据存储**：SQLite 数据库位于 Electron `userData/duobaodao.db`（抢单列表、详情快照、出价记录三表）。

## 文档

- [设计规格](docs/superpowers/specs/2026-06-30-duobaodao-electron-assistant-design.md)
- [实现计划](docs/superpowers/plans/2026-06-30-duobaodao-electron-assistant.md)
