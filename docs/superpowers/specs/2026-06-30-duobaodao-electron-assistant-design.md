# 多宝岛 Electron 助手设计

日期：2026-06-30（修订：自动抢购调度、生命周期状态、SQLite 存储）

## 目标

使用 Electron 构建桌面助手。应用打开京东多宝岛页面，保留用户登录状态，让用户手动浏览和搜索商品，把选中的商品加入本地抢单列表，并通过后台调度自动轮询抢购数据、在指定时机自动出价。

核心能力：

- 手动浏览多宝岛、加入抢单列表。
- 加入列表时拉取抢购详情与地址信息。
- 后台 60 秒轮询出价记录与抢购状态，更新侧栏展示。
- 用户按条目开启自动下单后，临近抢购时间进入高频轮询，并在距抢购时间 80–100ms 时自动调用出价接口。

签名与请求复用 Webview 内官方 `ParamsSign` 和 session cookie（`scripts/jd-sign`），不伪造设备指纹，不绕过登录。

## 范围

### 包含

**基础浏览与列表**

- 默认打开「我的页面」：`https://dbd.m.jd.com/ppdbd/pages/mine/index?scene=null`
- 识别京东登录页 `https://plogin.m.jd.com/login/login`，允许用户手动登录并保留 session
- 「首页」快捷入口：`https://dbd.m.jd.com/ppdbd/paimai`
- 识别商品详情页 URL，解析 `auctionId`（查询参数 `id`）与 `skuid`
- 加入抢单列表、编辑备注/期望价、删除、快速重新打开
- 本地 SQLite 数据库持久化（Electron `userData` 目录）：抢单列表、详情快照、出价记录

**API 集成（经 Webview + ParamsSign）**

| functionId | 用途 | 触发时机 |
|-----------|------|---------|
| `dbd.auction.detail.v2` | 抢购详情（含抢购开始时间） | 加入列表 |
| `dbd.auction.detail.saleInfo` | 销售/地址信息（`address`/`area`） | 加入列表 |
| `paipai.auction.bidrecords` | 出价记录 | 抢购中 60s 慢轮询；切换已过期时调用一次 |
| `paipai.auction.get_current_and_offerNum` | 抢购状态 | 仅抢购中：60s 慢轮询 + 快轮询 |
| `paipai.auction.offerPrice` | 自动出价/下单 | 精准触发（开关开启时） |

批量查询时 `auctionId` 可传多个（逗号分隔或数组，以实现为准）。

**调度行为**

- 加入列表：并行请求 `detail.v2` + `saleInfo`，写入本地数据库；若加入时已过期，标记「已过期」并调用一次出价记录
- 慢轮询（仅「抢购中」条目）：每 60 秒拉取出价记录 + 抢购状态，更新侧栏与数据库
- 快轮询（仅 `autoOrderEnabled=true`）：距抢购开始 ≤10 秒，以 10–100ms 随机间隔轮询抢购状态
- 精准出价（仅 `autoOrderEnabled=true`）：距抢购开始 80–100ms（随机）时调用 `offerPrice`，每条目仅触发一次

**自动下单开关**

- 每条列表项独立开关，**默认关闭**
- 关闭时：若条目为「抢购中」仍参与慢轮询；不进入快轮询、不自动出价
- 开启时：进入 10 秒窗口后启动快轮询与精准出价

### 不包含

- 绕过登录、绕过验证码
- 脱离 Webview 独立伪造 h5st 签名
- 自动点击页面内按钮（所有 API 调用走 `scripts/jd-sign` 网关）
- 后端服务

## 架构

项目使用 Electron、Vite 和 TypeScript。

### 窗口布局

- 顶部工具栏：导航和应用控制
- 网页内容区：京东多宝岛页面（Webview）
- 抢单列表侧栏：本地商品条目、状态展示与操作

### 进程职责

- **主进程**：BrowserWindow、session、桌面通知、SQLite 存储、IPC、`AuctionScheduler`（时间调度与状态机）
- **渲染进程**：工具栏、侧栏 UI、本地交互状态
- **Webview**：已登录多宝岛页面，提供 `ParamsSign` 与 cookie；通过注入脚本执行签名 API 调用

### 推荐方案：混合调度（方案 C）

主进程负责调度与时间精度；Webview 仅作为 API 网关（扩展 `scripts/jd-sign`）。

```
主进程 AuctionScheduler
  ├── 60s 慢轮询（仅 lifecycleStatus=抢购中，可批量 id）
  ├── 倒计时 Watch（仅 autoOrderEnabled=true）
  └── 精准触发器（80–100ms，setTimeout + 时钟偏移校准）
         ↓ IPC
Webview callJdApi(functionId, body)
  └── ParamsSign.sign → fetch → JSON
```

每条列表项独立状态机，多商品并行互不阻塞。

## 导航

应用启动时加载：

`https://dbd.m.jd.com/ppdbd/pages/mine/index?scene=null`

导航到 `https://plogin.m.jd.com/login/login` 时，工具栏显示「需要登录」。登录成功后恢复正常浏览并保留 session。

### 商品详情页识别

详情页 URL 示例：

`https://dbd.m.jd.com/ppdbd/pages/detail-v2/index?id=404150571&cprice=10&showhead=no&paimai=1&skuid=100243016865&scene=null`

识别规则：

- 主机名：`dbd.m.jd.com`
- 路径：`/ppdbd/pages/detail-v2/index`（允许末尾带或不带 `/`）
- 查询参数 `id` 必须存在（`auctionId`）
- 查询参数 `skuid` 可选

实现位置：`src/shared/jd-url.js`，提供：

- `isProductDetailUrl(url: string): boolean`
- `parseProductDetailUrl(url: string): ProductDetailInfo | null`

工具栏操作：我的页面、首页、刷新、后退、清除 session、开关提醒、窗口置顶。

## 抢单列表

### 主键与去重

- 列表项 `id` **直接取商品页 URL 查询参数 `id`**（即平台 `auctionId`），不再生成本地 UUID
- 同一商品重复加入时 **upsert**：刷新详情快照，保留用户备注/期望价/自动下单开关（若用户未改）

### 基础字段（表 `auction_list`）

| 字段 | 说明 |
|------|------|
| `id` | 商品页 `id`（主键，字符串） |
| `skuid` | URL 查询参数 `skuid`，缺失为 `null` |
| `title` | 页面标题或详情接口解析标题 |
| `url` | 详情页 URL |
| `addedAt` | 首次加入时间（ISO） |
| `updatedAt` | 最近更新时间（ISO） |
| `note` | 用户备注 |
| `targetPrice` | 用户可选期望价 |

### 生命周期状态

字段 `lifecycleStatus`，取值：

| 状态 | 含义 | API 行为 |
|------|------|---------|
| `not_started` | 未开始 | 仅在加入时拉取一次详情；开始前不周期性刷新任何 API |
| `in_progress` | 抢购中 | 60s 慢轮询出价记录 + 抢购状态；可进入快轮询/精准出价 |
| `expired` | 已过期 | 停止轮询；切换到此状态时 **额外调用一次出价记录** 并落库 |

状态判定（实现时按 API 响应映射，优先级从高到低）：

1. 抢购状态接口 / 详情接口中的状态码表明已结束 → `expired`
2. 当前服务器时间 ≥ 详情中的抢购结束时间（若有） → `expired`
3. 当前服务器时间 ≥ 抢购开始时间且未结束 → `in_progress`
4. 否则 → `not_started`

加入列表时根据 detail.v2 响应立即计算初始 `lifecycleStatus`。若加入时已为 `expired`，保存条目后立即请求一次 `bidrecords` 并写入 `bid_records` 表。

状态迁移：

```
not_started → in_progress（到达开始时间或 API 状态变更）
in_progress → expired（结束时间到达或 API 状态变更）
expired（终态，不再轮询）
```

迁移到 `expired` 时：触发一次 `bidrecords` 请求，保存结果，取消该条目的所有定时器。

### 调度扩展字段（表 `auction_list`）

| 字段 | 说明 |
|------|------|
| `autoOrderEnabled` | 自动下单开关，默认 `false` |
| `lifecycleStatus` | `not_started` / `in_progress` / `expired` |
| `auctionStartTime` | 详情接口解析的抢购开始时间（ms） |
| `auctionEndTime` | 详情接口解析的抢购结束时间（ms，可选） |
| `address` | saleInfo 解析的区域 ID |
| `currentPrice` | 最近一次抢购状态中的当前价 |
| `bidCount` | 出价人数 |
| `auctionStatus` | 平台原始状态码 |
| `serverTimeOffset` | 本地与服务器时钟偏移（ms） |
| `orderResult` | `pending` / `success` / `failed` / `skipped` |
| `orderError` | 失败时的错误码或消息 |
| `lastPolledAt` | 最近慢/快轮询时间 |
| `schedulerPhase` | `idle` / `slow_poll` / `fast_poll` / `firing` / `done` |

### 本地数据库（SQLite）

数据库文件：`userData/duobaodao.db`，使用 `better-sqlite3`（或等价同步 SQLite 驱动）。

**表 `auction_list`**：抢单列表条目（上文字段）。

**表 `auction_detail`**：详情快照，按 `auctionId`（= 列表 `id`）关联。

| 字段 | 说明 |
|------|------|
| `auctionId` | 外键，对应列表 `id` |
| `fetchedAt` | 拉取时间 |
| `detailJson` | `detail.v2` 完整响应 JSON |
| `saleInfoJson` | `saleInfo` 完整响应 JSON |

加入列表或手动刷新时插入新快照（保留历史，侧栏默认展示最新一条）。

**表 `bid_records`**：出价记录快照。

| 字段 | 说明 |
|------|------|
| `id` | 自增主键 |
| `auctionId` | 外键 |
| `fetchedAt` | 拉取时间 |
| `recordsJson` | `bidrecords` 完整响应 JSON |

每次慢轮询、过期迁移触发的出价记录请求均插入一条，侧栏/详情页展示最新快照。

### 加入列表流程

1. 解析 URL → `id`（商品页 id）、`skuid`
2. 若 `id` 已存在 → upsert 模式，否则 insert
3. 并行请求 `dbd.auction.detail.v2` + `dbd.auction.detail.saleInfo`
4. 写入 `auction_detail` 快照；更新 `auctionStartTime`、`auctionEndTime`、`address`、标题
5. 计算 `lifecycleStatus`：
   - `expired` → 请求一次 `bidrecords`，写入 `bid_records`，注册为终态
   - `not_started` → 注册「开始时间」监视，开始前不再请求任何 API（含 detail 刷新）
   - `in_progress` → 注册慢轮询队列
6. 若 detail/saleInfo 失败：仍保存列表条目，标记「数据不完整」，不参与调度

### 侧栏操作

- 打开条目、编辑备注、编辑期望价、删除（级联删除关联 detail/bid_records 或软删除，实现时二选一，默认硬删除关联数据）
- **自动下单开关**（默认关，仅 `in_progress` 且未过期时可开启）
- 展示：`lifecycleStatus`（未开始 / 抢购中 / 已过期）、当前价、出价人数、倒计时、最近轮询时间、下单结果

## 调度器

### 状态机

调度阶段（`schedulerPhase`）与生命周期（`lifecycleStatus`）协同：

```
[lifecycleStatus=not_started] → 监视开始时间，无 API 轮询
  → [in_progress] → slow_poll（60s：bidrecords + status）
  → [autoOrderEnabled] → fast_poll（≤10s）→ firing（80–100ms）→ done/failed
  → [expired] → 一次 bidrecords → 停止所有调度
```

- 仅 `lifecycleStatus=in_progress` 的条目进入慢轮询与快轮询
- `not_started`：到达 `auctionStartTime` 后转为 `in_progress` 并加入慢轮询（开始前零轮询）
- `in_progress → expired`：调用一次 `bidrecords`，写入 DB，取消定时器
- `autoOrderEnabled` 仅对 `in_progress` 生效；过期或未开始时不允许开启（或自动关闭）

### 慢轮询（仅抢购中）

- 间隔：默认 60 秒（可配置）
- 范围：`lifecycleStatus = in_progress` 的条目（支持批量 `id`）
- 请求：`bidrecords` + `get_current_and_offerNum`
- 副作用：
  - 各响应写入 `bid_records` / 更新 `auction_list` 展示字段
  - 校准 `serverTimeOffset`
  - 根据响应检测是否应迁移为 `expired`

时钟偏移计算：

```
offset = serverTime - Date.now()
serverTimeOffset = 滑动平均(最近 N 次 offset)
```

### 快轮询（仅 in_progress 且 autoOrderEnabled=true）

- 触发：距 `auctionStartTime` ≤ 10 秒（基于校准后服务器时间）
- 间隔：10–100ms 随机（`Math.random() * 90 + 10`）
- 请求：仅 `get_current_and_offerNum`
- 目的：最后一刻获取最新 `currentPrice`，持续校准时钟偏移

### 精准出价

**触发时机**

```
fireAt = auctionStartTime - random(80, 100)  // ms，基于校准后服务器时间
localDelay = fireAt - (Date.now() + serverTimeOffset)
setTimeout(() => executeOrder(), localDelay)
```

每条目仅触发一次 `offerPrice`。

**金额计算**

```
if (targetPrice 未填写):
    price = currentPrice + 1
else if (currentPrice <= targetPrice):
    price = targetPrice
else:
    price = currentPrice + 1   // 超期望价仍跟价 +1
```

**请求 body（offerPrice）**

```json
{
  "auctionId": 404138114,
  "price": 3,
  "ts": 1782822526593,
  "entryid": "",
  "address": "22-1930-49324-49399",
  "mpSource": 1,
  "sourceTag": 2
}
```

`ts` 取触发时刻的 `Date.now()`。

**结果处理**

| 结果 | 行为 |
|------|------|
| 成功 | `orderResult=success`，桌面通知，侧栏标记 |
| 失败 | `orderResult=failed`，记录 `orderError`，通知用户 |
| 开关关闭 | 不触发，`orderResult=skipped` |
| 已过期/已抢完 | 停止调度，`schedulerPhase=done` |

## API 网关（scripts/jd-sign）

在现有 `fetch-current-bid-info.js` 模式上抽象通用方法：

```javascript
// 主进程
callJdApi(webContents, { functionId, body })

// Webview 内：读取 cookie → ParamsSign.sign → fetch → return JSON
```

前置条件：

1. Webview 已打开 `https://dbd.m.jd.com` 且已登录
2. 页面已加载 `ParamsSign`

目录结构（扩展后）：

```text
scripts/jd-sign/
├── index.js
├── webview/
│   ├── jd-api-client.js      # 通用 API 客户端（推荐合并现有脚本）
│   └── index.js              # Electron 封装
└── README.md
```

## 提醒行为

保留桌面通知能力，用于：

- 下单成功 / 失败
- 可选：关键词提醒（抢单、立即抢等），由用户开关控制

不再依赖页面可见文本作为唯一抢购信号；调度以 API 数据为准。

## 错误处理

- Webview 未登录 / `ParamsSign` 不可用 → 暂停调度，提示重新登录
- 签名失败 → 重试 1 次，仍失败则标记 `failed`
- 加入列表时 detail/saleInfo 失败 → 保存条目，标记「数据不完整」，不参与自动下单
- 快轮询阶段网络超时 → 仍按最后已知 `currentPrice` 执行出价
- 多商品同时触发 → 各自独立 `setTimeout`，并行发出，不排队
- 存储读写失败 → SQLite 错误日志，尽量保留已有数据，展示错误

## 测试

### 基础功能

- 应用启动加载默认「我的页面」
- 登录 URL 检测改变工具栏状态
- 详情页 URL 识别与 `id`/`skuid` 解析
- 列表 `id` 等于商品页 `id`；重复加入 upsert
- 加入列表持久化到 SQLite，重启后仍存在
- 编辑、删除、期望价更新；删除级联清理 detail/bid_records

### 生命周期与轮询

- `not_started` 条目仅在加入时拉详情，开始前不调用任何 API（含 bidrecords/status/detail 刷新）
- 到达开始时间后转为 `in_progress` 并开始慢轮询
- 仅 `in_progress` 条目参与 60s 慢轮询
- 迁移到 `expired` 时触发一次 bidrecords 并落库，之后不再轮询
- 加入时已过期条目：标记 `expired` + 一次 bidrecords

### 数据库

- `auction_list`、`auction_detail`、`bid_records` 三表写入正确
- 每次 detail 拉取新增 `auction_detail` 快照
- 每次 bidrecords 拉取新增 `bid_records` 快照

### 调度与 API

- 加入列表时并行请求 detail.v2 + saleInfo，正确解析 `auctionStartTime` 与 `address`
- 慢轮询 60 秒更新侧栏（currentPrice、bidCount、lastPolledAt）
- `serverTimeOffset` 随状态响应更新
- `autoOrderEnabled=false` 时不进入快轮询、不调用 offerPrice
- `autoOrderEnabled=true` 且在 10 秒窗口内进入快轮询
- 距抢购开始 80–100ms 触发 offerPrice，金额逻辑符合期望价规则
- 下单成功/失败后 `orderResult` 与通知正确
- 批量 id 慢轮询合并请求
- Webview 未登录时调度暂停并提示

### 金额逻辑用例

| targetPrice | currentPrice | 期望 price |
|-------------|--------------|------------|
| 未填 | 10 | 11 |
| 100 | 80 | 100 |
| 100 | 105 | 106 |
