# 多宝岛 Electron 助手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 Electron 桌面助手：内嵌多宝岛 Webview、SQLite 抢单列表、生命周期调度（未开始/抢购中/已过期）、Webview 签名 API 网关、可选精准自动出价。

**Architecture:** 主进程持有 SQLite 与 `AuctionScheduler`；Webview 仅负责 `ParamsSign` + fetch（`scripts/jd-sign`）；渲染进程展示工具栏与侧栏。纯逻辑（生命周期、出价金额、URL 解析）放 `src/shared/` 并单元测试。

**Tech Stack:** Electron 33+、electron-vite、TypeScript、React、better-sqlite3、Vitest、现有 `scripts/jd-sign`

**Spec:** `docs/superpowers/specs/2026-06-30-duobaodao-electron-assistant-design.md`

---

## 文件结构（新建/修改一览）

```text
package.json                          # 根项目依赖与脚本
electron.vite.config.ts               # electron-vite 配置
tsconfig.json / tsconfig.node.json
src/
  main/
    index.ts                          # Electron 入口、窗口、调度器启动
    ipc/handlers.ts                   # IPC 注册
    db/
      connection.ts                   # better-sqlite3 单例
      migrate.ts                      # 建表迁移
      auction-list.repo.ts            # auction_list CRUD
      auction-detail.repo.ts          # auction_detail 快照
      bid-records.repo.ts             # bid_records 快照
    scheduler/
      auction-scheduler.ts            # 慢/快轮询、开始时间监视、精准出价
      item-runner.ts                  # 单条目状态机
    services/
      jd-api.service.ts               # 封装 callJdApi IPC 侧调用
      auction-ingest.service.ts       # 加入列表、upsert、生命周期初始化
      detail-parser.ts                # detail.v2 / saleInfo 字段映射
  preload/
    index.ts                          # contextBridge API
  renderer/
    index.html
    main.tsx
    App.tsx
    components/Toolbar.tsx
    components/Sidebar.tsx
    components/AuctionListItem.tsx
  shared/
    jd-url.js                         # 已有，补充 id 别名导出
    types.ts                          # AuctionListItem、LifecycleStatus 等
    lifecycle.ts                      # 生命周期判定纯函数
    order-price.ts                    # 出价金额计算
    constants.ts                      # API functionId、默认 URL
scripts/jd-sign/
  webview/jd-api-client.js              # 通用 ParamsSign 客户端
  webview/index.js                      # callJdApiViaWebview
  index.js
tests/
  jd-url.test.ts
  lifecycle.test.ts
  order-price.test.ts
  detail-parser.test.ts
  auction-list.repo.test.ts
```

---

### Task 1: 项目脚手架（Electron + Vite + TypeScript）

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`

- [ ] **Step 1: 初始化 package.json**

```json
{
  "name": "duobaodao-assistant",
  "version": "0.1.0",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "electron": "^33.2.0",
    "electron-vite": "^2.3.0",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: electron-vite 最小配置**

`electron.vite.config.ts`:

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') } } },
  },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
  },
});
```

- [ ] **Step 3: 主进程窗口（三分区布局占位）**

`src/main/index.ts`:

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';

const DEFAULT_MINE_URL =
  'https://dbd.m.jd.com/ppdbd/pages/mine/index?scene=null';

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  createWindow();
  ipcMain.handle('app:get-default-url', () => DEFAULT_MINE_URL);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 4: preload 与渲染占位**

`src/preload/index.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getDefaultUrl: () => ipcRenderer.invoke('app:get-default-url') as Promise<string>,
});
```

`src/renderer/App.tsx`:

```tsx
import { useEffect, useState } from 'react';

export default function App() {
  const [defaultUrl, setDefaultUrl] = useState('');
  useEffect(() => {
    window.electronAPI.getDefaultUrl().then(setDefaultUrl);
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header>多宝岛助手</header>
      <div style={{ flex: 1, display: 'flex' }}>
        <webview src={defaultUrl} style={{ flex: 1 }} />
        <aside style={{ width: 320 }}>抢单列表</aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 安装依赖并验证启动**

Run: `npm install && npm run dev`
Expected: Electron 窗口打开，内嵌 webview 加载多宝岛「我的页面」

- [ ] **Step 6: Commit**

```bash
git add package.json electron.vite.config.ts tsconfig.json tsconfig.node.json src/
git commit -m "feat: scaffold Electron + Vite + React app shell"
```

---

### Task 2: 共享类型与 URL 解析测试

**Files:**
- Create: `src/shared/types.ts`, `src/shared/constants.ts`, `vitest.config.ts`
- Modify: `src/shared/jd-url.js`（增加 `id` 字段别名）
- Create: `tests/jd-url.test.ts`

- [ ] **Step 1: 定义核心类型**

`src/shared/types.ts`:

```typescript
export type LifecycleStatus = 'not_started' | 'in_progress' | 'expired';
export type SchedulerPhase = 'idle' | 'slow_poll' | 'fast_poll' | 'firing' | 'done';
export type OrderResult = 'pending' | 'success' | 'failed' | 'skipped';

export interface AuctionListRow {
  id: string;
  skuid: string | null;
  title: string;
  url: string;
  addedAt: string;
  updatedAt: string;
  note: string | null;
  targetPrice: number | null;
  autoOrderEnabled: number;
  lifecycleStatus: LifecycleStatus;
  auctionStartTime: number | null;
  auctionEndTime: number | null;
  address: string | null;
  currentPrice: number | null;
  bidCount: number | null;
  auctionStatus: number | null;
  serverTimeOffset: number;
  orderResult: OrderResult;
  orderError: string | null;
  lastPolledAt: string | null;
  schedulerPhase: SchedulerPhase;
  dataIncomplete: number;
}
```

- [ ] **Step 2: jd-url 测试**

`tests/jd-url.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { isProductDetailUrl, parseProductDetailUrl } from '../src/shared/jd-url';

describe('jd-url', () => {
  const sample =
    'https://dbd.m.jd.com/ppdbd/pages/detail-v2/index?id=404150571&skuid=100243016865';

  it('识别详情页', () => {
    expect(isProductDetailUrl(sample)).toBe(true);
  });

  it('解析 auctionId 作为列表 id', () => {
    const info = parseProductDetailUrl(sample);
    expect(info?.auctionId).toBe('404150571');
    expect(info?.skuid).toBe('100243016865');
  });

  it('非详情页返回 null', () => {
    expect(parseProductDetailUrl('https://dbd.m.jd.com/ppdbd/paimai')).toBeNull();
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: PASS（3 tests）

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts vitest.config.ts tests/jd-url.test.ts
git commit -m "feat: add shared types and jd-url unit tests"
```

---

### Task 3: 生命周期与出价金额纯函数

**Files:**
- Create: `src/shared/lifecycle.ts`, `src/shared/order-price.ts`
- Create: `tests/lifecycle.test.ts`, `tests/order-price.test.ts`

- [ ] **Step 1: 生命周期判定**

`src/shared/lifecycle.ts`:

```typescript
import type { LifecycleStatus } from './types';

export interface LifecycleInput {
  nowMs: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
  platformStatusExpired?: boolean;
}

/** 按 spec 优先级判定生命周期 */
export function resolveLifecycleStatus(input: LifecycleInput): LifecycleStatus {
  if (input.platformStatusExpired) return 'expired';
  if (input.endTimeMs != null && input.nowMs >= input.endTimeMs) return 'expired';
  if (input.startTimeMs != null && input.nowMs >= input.startTimeMs) return 'in_progress';
  return 'not_started';
}

export function canPollBidAndStatus(status: LifecycleStatus): boolean {
  return status === 'in_progress';
}

export function canEnableAutoOrder(status: LifecycleStatus): boolean {
  return status === 'in_progress';
}
```

- [ ] **Step 2: 出价金额计算**

`src/shared/order-price.ts`:

```typescript
/** 计算 offerPrice 的 price 字段 */
export function calcOfferPrice(
  currentPrice: number,
  targetPrice: number | null | undefined,
): number {
  if (targetPrice == null || Number.isNaN(targetPrice)) {
    return currentPrice + 1;
  }
  if (currentPrice <= targetPrice) {
    return targetPrice;
  }
  return currentPrice + 1;
}
```

- [ ] **Step 3: 测试（含 spec 金额用例）**

`tests/order-price.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { calcOfferPrice } from '../src/shared/order-price';

describe('calcOfferPrice', () => {
  it('未填期望价 → current+1', () => {
    expect(calcOfferPrice(10, null)).toBe(11);
  });
  it('current <= target → target', () => {
    expect(calcOfferPrice(80, 100)).toBe(100);
  });
  it('current > target → current+1', () => {
    expect(calcOfferPrice(105, 100)).toBe(106);
  });
});
```

`tests/lifecycle.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { resolveLifecycleStatus, canPollBidAndStatus } from '../src/shared/lifecycle';

describe('lifecycle', () => {
  it('未开始', () => {
    expect(resolveLifecycleStatus({ nowMs: 1000, startTimeMs: 5000, endTimeMs: 10000 }))
      .toBe('not_started');
  });
  it('抢购中', () => {
    expect(resolveLifecycleStatus({ nowMs: 6000, startTimeMs: 5000, endTimeMs: 10000 }))
      .toBe('in_progress');
  });
  it('已过期', () => {
    expect(resolveLifecycleStatus({ nowMs: 11000, startTimeMs: 5000, endTimeMs: 10000 }))
      .toBe('expired');
  });
  it('仅抢购中可轮询', () => {
    expect(canPollBidAndStatus('in_progress')).toBe(true);
    expect(canPollBidAndStatus('not_started')).toBe(false);
  });
});
```

- [ ] **Step 4: Run `npm test` → PASS**

- [ ] **Step 5: Commit**

```bash
git add src/shared/lifecycle.ts src/shared/order-price.ts tests/
git commit -m "feat: add lifecycle and offer price pure functions"
```

---

### Task 4: SQLite 数据库与 Repository

**Files:**
- Create: `src/main/db/connection.ts`, `src/main/db/migrate.ts`
- Create: `src/main/db/auction-list.repo.ts`, `src/main/db/auction-detail.repo.ts`, `src/main/db/bid-records.repo.ts`
- Create: `tests/auction-list.repo.test.ts`

- [ ] **Step 1: 连接与迁移**

`src/main/db/migrate.ts`:

```typescript
import type Database from 'better-sqlite3';

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auction_list (
      id TEXT PRIMARY KEY,
      skuid TEXT,
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      added_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      note TEXT,
      target_price REAL,
      auto_order_enabled INTEGER NOT NULL DEFAULT 0,
      lifecycle_status TEXT NOT NULL DEFAULT 'not_started',
      auction_start_time INTEGER,
      auction_end_time INTEGER,
      address TEXT,
      current_price REAL,
      bid_count INTEGER,
      auction_status INTEGER,
      server_time_offset INTEGER NOT NULL DEFAULT 0,
      order_result TEXT NOT NULL DEFAULT 'pending',
      order_error TEXT,
      last_polled_at TEXT,
      scheduler_phase TEXT NOT NULL DEFAULT 'idle',
      data_incomplete INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS auction_detail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      sale_info_json TEXT NOT NULL,
      FOREIGN KEY (auction_id) REFERENCES auction_list(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bid_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      records_json TEXT NOT NULL,
      FOREIGN KEY (auction_id) REFERENCES auction_list(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_auction_detail_auction_id ON auction_detail(auction_id);
    CREATE INDEX IF NOT EXISTS idx_bid_records_auction_id ON bid_records(auction_id);
  `);
}
```

`src/main/db/connection.ts`:

```typescript
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { migrate } from './migrate';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const path = join(app.getPath('userData'), 'duobaodao.db');
    db = new Database(path);
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

/** 测试专用：内存库 */
export function createTestDb(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  migrate(testDb);
  return testDb;
}
```

- [ ] **Step 2: auction_list repo（upsert + 按生命周期查询）**

`src/main/db/auction-list.repo.ts`:

```typescript
import type Database from 'better-sqlite3';
import type { AuctionListRow, LifecycleStatus } from '../../shared/types';

export function upsertAuctionList(db: Database.Database, row: Partial<AuctionListRow> & { id: string; url: string }): void {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM auction_list WHERE id = ?').get(row.id);
  if (existing) {
    db.prepare(`
      UPDATE auction_list SET
        skuid = COALESCE(@skuid, skuid),
        title = COALESCE(@title, title),
        url = @url,
        updated_at = @updatedAt,
        note = COALESCE(@note, note),
        target_price = COALESCE(@targetPrice, target_price),
        lifecycle_status = COALESCE(@lifecycleStatus, lifecycle_status),
        auction_start_time = COALESCE(@auctionStartTime, auction_start_time),
        auction_end_time = COALESCE(@auctionEndTime, auction_end_time),
        address = COALESCE(@address, address),
        data_incomplete = COALESCE(@dataIncomplete, data_incomplete)
      WHERE id = @id
    `).run({ ...row, updatedAt: now });
  } else {
    db.prepare(`
      INSERT INTO auction_list (
        id, skuid, title, url, added_at, updated_at, lifecycle_status, scheduler_phase
      ) VALUES (
        @id, @skuid, @title, @url, @addedAt, @updatedAt, @lifecycleStatus, 'idle'
      )
    `).run({
      id: row.id,
      skuid: row.skuid ?? null,
      title: row.title ?? '',
      url: row.url,
      addedAt: now,
      updatedAt: now,
      lifecycleStatus: row.lifecycleStatus ?? 'not_started',
    });
  }
}

export function listByLifecycle(db: Database.Database, status: LifecycleStatus): AuctionListRow[] {
  return db.prepare(`
    SELECT * FROM auction_list WHERE lifecycle_status = ?
  `).all(status) as AuctionListRow[];
}

export function deleteAuction(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM auction_list WHERE id = ?').run(id);
}
```

- [ ] **Step 3: detail / bid_records repo**

`src/main/db/auction-detail.repo.ts`:

```typescript
import type Database from 'better-sqlite3';

export function insertDetailSnapshot(
  db: Database.Database,
  auctionId: string,
  detailJson: unknown,
  saleInfoJson: unknown,
): void {
  db.prepare(`
    INSERT INTO auction_detail (auction_id, fetched_at, detail_json, sale_info_json)
    VALUES (?, ?, ?, ?)
  `).run(auctionId, new Date().toISOString(), JSON.stringify(detailJson), JSON.stringify(saleInfoJson));
}
```

`src/main/db/bid-records.repo.ts`:

```typescript
import type Database from 'better-sqlite3';

export function insertBidRecordsSnapshot(
  db: Database.Database,
  auctionId: string,
  recordsJson: unknown,
): void {
  db.prepare(`
    INSERT INTO bid_records (auction_id, fetched_at, records_json)
    VALUES (?, ?, ?)
  `).run(auctionId, new Date().toISOString(), JSON.stringify(recordsJson));
}
```

- [ ] **Step 4: repo 测试**

`tests/auction-list.repo.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../src/main/db/connection';
import { upsertAuctionList, deleteAuction } from '../src/main/db/auction-list.repo';

describe('auction_list repo', () => {
  it('upsert 使用商品页 id 作为主键', () => {
    const db = createTestDb();
    upsertAuctionList(db, { id: '404150571', url: 'https://example.com', title: '测试' });
    upsertAuctionList(db, { id: '404150571', url: 'https://example.com/v2', title: '更新' });
    const row = db.prepare('SELECT title, url FROM auction_list WHERE id = ?').get('404150571') as { title: string; url: string };
    expect(row.title).toBe('更新');
    deleteAuction(db, '404150571');
    expect(db.prepare('SELECT id FROM auction_list').all()).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run `npm test` → PASS**

- [ ] **Step 6: Commit**

```bash
git add src/main/db/ tests/auction-list.repo.test.ts
git commit -m "feat: add SQLite schema and auction repositories"
```

---

### Task 5: 通用 JD API 客户端（scripts/jd-sign）

**Files:**
- Create: `scripts/jd-sign/webview/jd-api-client.js`
- Modify: `scripts/jd-sign/webview/index.js`, `scripts/jd-sign/index.js`

- [ ] **Step 1: Webview 通用客户端**

`scripts/jd-sign/webview/jd-api-client.js`（基于现有 fetch-current-bid-info.js 抽象）:

```javascript
(function installJdApiClient(global) {
  const CONTROL_BRUSH_APP_ID = '86b9f';
  const APP_ID = 'paipai_h5';

  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function parseUuid() {
    const jda = getCookie('__jda');
    if (!jda) return '';
    const parts = jda.split('.');
    return parts.length > 1 ? (parts[1] || parts[2] || '') : '';
  }
  function parseToken() {
    return getCookie('3AB9D23F7A4B3CSS') || getCookie('3AB9D23F7A4B3C9B') || '';
  }
  function encodeBody(bodyObj) {
    return encodeURIComponent(JSON.stringify(bodyObj))
      .replace(/%3A/g, ':')
      .replace(/%2C/g, ',');
  }

  /**
   * 通用京东 API 调用
   * @param {string} functionId
   * @param {Object} bodyObj
   */
  async function callJdApi(functionId, bodyObj) {
    if (!global.ParamsSign) throw new Error('ParamsSign 未加载');
    const token = parseToken();
    const uuid = parseUuid();
    if (!token) throw new Error('缺少 x-api-eid-token');
    if (!uuid) throw new Error('缺少 uuid');

    const bodyForSign = encodeBody(bodyObj);
    const t = Date.now();
    const signer = new global.ParamsSign({
      appId: CONTROL_BRUSH_APP_ID,
      debug: false,
      preRequest: false,
    });
    const signResult = await signer.sign({
      functionId,
      t: String(t),
      appid: APP_ID,
      body: bodyForSign,
    });
    const query = new URLSearchParams({
      functionId,
      t: String(t),
      appid: APP_ID,
      'x-api-eid-token': token,
      uuid,
    });
    const resp = await fetch('https://api.m.jd.com/api?' + query.toString(), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-referer-page': location.href,
        'x-rp-client': 'h5_1.0.0',
      },
      body: 'body=' + bodyForSign + '&h5st=' + encodeURIComponent(signResult.h5st),
    });
    return resp.json();
  }

  global.__duobaodaoCallJdApi = callJdApi;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Electron 封装**

`scripts/jd-sign/webview/index.js` 追加:

```javascript
const JD_API_CLIENT_PATH = path.join(__dirname, 'jd-api-client.js');

function getJdApiClientScript() {
  return fs.readFileSync(JD_API_CLIENT_PATH, 'utf8');
}

async function callJdApiViaWebview(webContents, functionId, body) {
  const script = getJdApiClientScript();
  await webContents.executeJavaScript(script, true);
  const payload = JSON.stringify({ functionId, body });
  return webContents.executeJavaScript(
    `(async () => window.__duobaodaoCallJdApi(${JSON.stringify(functionId)}, ${JSON.stringify(body)}))()`,
    true,
  );
}

module.exports = {
  getWebviewInjectScript,
  fetchBidInfoViaWebview,
  getJdApiClientScript,
  callJdApiViaWebview,
  WEBVIEW_SCRIPT_PATH,
};
```

- [ ] **Step 3: 定义 API body 工厂**

`src/shared/constants.ts`:

```typescript
export const JD_FUNCTIONS = {
  DETAIL_V2: 'dbd.auction.detail.v2',
  SALE_INFO: 'dbd.auction.detail.saleInfo',
  BID_RECORDS: 'paipai.auction.bidrecords',
  CURRENT_AND_OFFER: 'paipai.auction.get_current_and_offerNum',
  OFFER_PRICE: 'paipai.auction.offerPrice',
} as const;

const DBD_API_VERSION = '20250109';

export function buildDetailV2Body(auctionId: string, area = '') {
  return {
    auctionId,
    entryid: '',
    area,
    auctionProductType: 1,
    p: 2,
    dbdApiVersion: DBD_API_VERSION,
    mpSource: 1,
    sourceTag: 2,
  };
}

export function buildSaleInfoBody(auctionId: string) {
  return { auctionId, mpSource: 1, sourceTag: 2 };
}

export function buildBidRecordsBody(auctionId: string | string[], area: string) {
  const id = Array.isArray(auctionId) ? auctionId.join(',') : auctionId;
  return { ...buildDetailV2Body(id, area), auctionId: id };
}

export function buildStatusBody(auctionId: string | string[]) {
  const id = Array.isArray(auctionId) ? auctionId.join(',') : auctionId;
  return { auctionId: id, mpSource: 1, sourceTag: 2 };
}

export function buildOfferPriceBody(params: {
  auctionId: string;
  price: number;
  ts: number;
  address: string;
}) {
  return {
    auctionId: Number(params.auctionId),
    price: params.price,
    ts: params.ts,
    entryid: '',
    address: params.address,
    mpSource: 1,
    sourceTag: 2,
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/jd-sign/ src/shared/constants.ts
git commit -m "feat: add generic JD API client via Webview ParamsSign"
```

---

### Task 6: 详情响应解析器

**Files:**
- Create: `src/main/services/detail-parser.ts`, `tests/detail-parser.test.ts`

- [ ] **Step 1: 解析器（带 fixture，实现时按真实响应微调路径）**

`src/main/services/detail-parser.ts`:

```typescript
export interface ParsedDetail {
  title: string;
  auctionStartTime: number | null;
  auctionEndTime: number | null;
  platformStatusExpired: boolean;
}

export interface ParsedSaleInfo {
  address: string | null;
}

/** 从 detail.v2 响应提取时间与标题；路径按真实 API 微调 */
export function parseDetailResponse(json: unknown): ParsedDetail {
  const root = json as Record<string, unknown>;
  const data = (root.result as Record<string, unknown>)?.data
    ?? (root.data as Record<string, unknown>)
    ?? root;
  const d = data as Record<string, unknown>;
  const start = d.startTime ?? d.auctionStartTime ?? d.beginTime;
  const end = d.endTime ?? d.auctionEndTime ?? d.finishTime;
  const status = d.status ?? d.auctionStatus;
  return {
    title: String(d.title ?? d.productName ?? ''),
    auctionStartTime: start != null ? Number(start) : null,
    auctionEndTime: end != null ? Number(end) : null,
    platformStatusExpired: status === 4 || status === 'ended' || d.expired === true,
  };
}

export function parseSaleInfoResponse(json: unknown): ParsedSaleInfo {
  const root = json as Record<string, unknown>;
  const data = (root.result as Record<string, unknown>)?.data ?? root;
  const d = data as Record<string, unknown>;
  const address = d.address ?? d.area ?? d.areaId;
  return { address: address != null ? String(address) : null };
}

/** 从 get_current_and_offerNum 提取当前价与服务器时间 */
export function parseStatusResponse(json: unknown, auctionId: string): {
  currentPrice: number | null;
  bidCount: number | null;
  auctionStatus: number | null;
  serverTimeMs: number | null;
  platformStatusExpired: boolean;
} {
  const root = json as Record<string, unknown>;
  const data = (root.result as Record<string, unknown>)?.data ?? root;
  const item = (data as Record<string, unknown>)[auctionId] ?? data;
  const d = item as Record<string, unknown>;
  return {
    currentPrice: d.currentPrice != null ? Number(d.currentPrice) : null,
    bidCount: d.num != null ? Number(d.num) : null,
    auctionStatus: d.status != null ? Number(d.status) : null,
    serverTimeMs: d.serverTime != null ? Number(d.serverTime) : null,
    platformStatusExpired: d.status === 4,
  };
}
```

- [ ] **Step 2: fixture 测试**

`tests/detail-parser.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { parseDetailResponse, parseSaleInfoResponse } from '../src/main/services/detail-parser';

describe('detail-parser', () => {
  it('解析开始/结束时间', () => {
    const parsed = parseDetailResponse({
      result: { data: { title: '商品A', startTime: 1000, endTime: 2000, status: 1 } },
    });
    expect(parsed.title).toBe('商品A');
    expect(parsed.auctionStartTime).toBe(1000);
    expect(parsed.auctionEndTime).toBe(2000);
    expect(parsed.platformStatusExpired).toBe(false);
  });

  it('解析 address', () => {
    const parsed = parseSaleInfoResponse({
      result: { data: { address: '22-1930-49324-49399' } },
    });
    expect(parsed.address).toBe('22-1930-49324-49399');
  });
});
```

- [ ] **Step 3: Run `npm test` → PASS**

- [ ] **Step 4: Commit**

```bash
git add src/main/services/detail-parser.ts tests/detail-parser.test.ts
git commit -m "feat: add detail and saleInfo response parsers"
```

---

### Task 7: 加入抢单列表服务（ingest）

**Files:**
- Create: `src/main/services/jd-api.service.ts`, `src/main/services/auction-ingest.service.ts`
- Modify: `src/main/ipc/handlers.ts`, `src/preload/index.ts`

- [ ] **Step 1: JD API 服务（获取 Webview webContents）**

`src/main/services/jd-api.service.ts`:

```typescript
import type { WebContents } from 'electron';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { callJdApiViaWebview } = require('../../../scripts/jd-sign');

export class JdApiService {
  constructor(private getWebContents: () => WebContents | null) {}

  async call(functionId: string, body: Record<string, unknown>): Promise<unknown> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('Webview 未就绪');
    return callJdApiViaWebview(wc, functionId, body);
  }
}
```

- [ ] **Step 2: ingest 流程**

`src/main/services/auction-ingest.service.ts`:

```typescript
import type Database from 'better-sqlite3';
import { JD_FUNCTIONS, buildDetailV2Body, buildSaleInfoBody, buildBidRecordsBody } from '../../shared/constants';
import { resolveLifecycleStatus } from '../../shared/lifecycle';
import { upsertAuctionList } from '../db/auction-list.repo';
import { insertDetailSnapshot } from '../db/auction-detail.repo';
import { insertBidRecordsSnapshot } from '../db/bid-records.repo';
import { parseDetailResponse, parseSaleInfoResponse } from './detail-parser';
import type { JdApiService } from './jd-api.service';

export async function ingestAuctionFromUrl(
  db: Database.Database,
  jdApi: JdApiService,
  params: { id: string; skuid: string | null; url: string; title: string },
): Promise<void> {
  upsertAuctionList(db, { id: params.id, skuid: params.skuid, url: params.url, title: params.title });

  try {
    const [detailJson, saleInfoJson] = await Promise.all([
      jdApi.call(JD_FUNCTIONS.DETAIL_V2, buildDetailV2Body(params.id)),
      jdApi.call(JD_FUNCTIONS.SALE_INFO, buildSaleInfoBody(params.id)),
    ]);
    insertDetailSnapshot(db, params.id, detailJson, saleInfoJson);

    const detail = parseDetailResponse(detailJson);
    const saleInfo = parseSaleInfoResponse(saleInfoJson);
    const lifecycleStatus = resolveLifecycleStatus({
      nowMs: Date.now(),
      startTimeMs: detail.auctionStartTime,
      endTimeMs: detail.auctionEndTime,
      platformStatusExpired: detail.platformStatusExpired,
    });

    upsertAuctionList(db, {
      id: params.id,
      url: params.url,
      title: detail.title || params.title,
      lifecycleStatus,
      auctionStartTime: detail.auctionStartTime,
      auctionEndTime: detail.auctionEndTime,
      address: saleInfo.address,
      dataIncomplete: 0,
    });

    if (lifecycleStatus === 'expired' && saleInfo.address) {
      const bidJson = await jdApi.call(
        JD_FUNCTIONS.BID_RECORDS,
        buildBidRecordsBody(params.id, saleInfo.address),
      );
      insertBidRecordsSnapshot(db, params.id, bidJson);
    }
  } catch (err) {
    upsertAuctionList(db, {
      id: params.id,
      url: params.url,
      dataIncomplete: 1,
    });
    throw err;
  }
}
```

- [ ] **Step 3: IPC**

`src/main/ipc/handlers.ts`:

```typescript
import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { ingestAuctionFromUrl } from '../services/auction-ingest.service';
import { deleteAuction } from '../db/auction-list.repo';
import type { JdApiService } from '../services/jd-api.service';

export function registerIpcHandlers(deps: {
  db: Database.Database;
  jdApi: JdApiService;
}): void {
  ipcMain.handle('auction:add', async (_e, payload: {
    id: string; skuid: string | null; url: string; title: string;
  }) => {
    await ingestAuctionFromUrl(deps.db, deps.jdApi, payload);
    return deps.db.prepare('SELECT * FROM auction_list WHERE id = ?').get(payload.id);
  });

  ipcMain.handle('auction:list', () => {
    return deps.db.prepare('SELECT * FROM auction_list ORDER BY updated_at DESC').all();
  });

  ipcMain.handle('auction:delete', (_e, id: string) => {
    deleteAuction(deps.db, id);
  });
}
```

- [ ] **Step 4: preload 暴露 API**

```typescript
addAuction: (payload) => ipcRenderer.invoke('auction:add', payload),
listAuctions: () => ipcRenderer.invoke('auction:list'),
deleteAuction: (id) => ipcRenderer.invoke('auction:delete', id),
```

- [ ] **Step 5: Commit**

```bash
git add src/main/services/ src/main/ipc/ src/preload/index.ts
git commit -m "feat: add auction ingest service and IPC handlers"
```

---

### Task 8: AuctionScheduler（调度核心）

**Files:**
- Create: `src/main/scheduler/auction-scheduler.ts`, `src/main/scheduler/item-runner.ts`, `src/main/scheduler/clock-sync.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: 时钟偏移**

`src/main/scheduler/clock-sync.ts`:

```typescript
const WINDOW = 5;

export class ClockSync {
  private samples: number[] = [];

  addSample(serverTimeMs: number): void {
    const offset = serverTimeMs - Date.now();
    this.samples.push(offset);
    if (this.samples.length > WINDOW) this.samples.shift();
  }

  getOffset(): number {
    if (this.samples.length === 0) return 0;
    return Math.round(this.samples.reduce((a, b) => a + b, 0) / this.samples.length);
  }

  serverNow(): number {
    return Date.now() + this.getOffset();
  }
}
```

- [ ] **Step 2: 单条目 runner**

`src/main/scheduler/item-runner.ts` 负责：
- `not_started`：`setTimeout` 监视 `auctionStartTime`，到点转 `in_progress` 并回调 `onBecomeInProgress`
- `in_progress` + `autoOrderEnabled`：注册 10s 内快轮询 + 80–100ms `offerPrice` 定时器
- 转 `expired`：取消所有 timer，回调 `onExpire`（拉一次 bidrecords）

关键精准出价逻辑:

```typescript
export function scheduleOfferPrice(params: {
  auctionStartTime: number;
  clock: ClockSync;
  onFire: () => void;
}): NodeJS.Timeout {
  const advanceMs = 80 + Math.floor(Math.random() * 21);
  const fireAt = params.auctionStartTime - advanceMs;
  const delay = Math.max(0, fireAt - params.clock.serverNow());
  return setTimeout(params.onFire, delay);
}

export function randomFastPollDelay(): number {
  return 10 + Math.floor(Math.random() * 91);
}
```

- [ ] **Step 3: 调度器主类**

`src/main/scheduler/auction-scheduler.ts`:

```typescript
import type Database from 'better-sqlite3';
import { listByLifecycle } from '../db/auction-list.repo';
import { insertBidRecordsSnapshot } from '../db/bid-records.repo';
import { JD_FUNCTIONS, buildBidRecordsBody, buildStatusBody, buildOfferPriceBody } from '../../shared/constants';
import { calcOfferPrice } from '../../shared/order-price';
import { resolveLifecycleStatus } from '../../shared/lifecycle';
import { parseStatusResponse } from '../services/detail-parser';
import type { JdApiService } from '../services/jd-api.service';
import { ClockSync } from './clock-sync';
import { ItemRunner } from './item-runner';

export class AuctionScheduler {
  private slowTimer: NodeJS.Timeout | null = null;
  private runners = new Map<string, ItemRunner>();
  private clock = new ClockSync();

  constructor(
    private db: Database.Database,
    private jdApi: JdApiService,
    private notify: (title: string, body: string) => void,
  ) {}

  start(): void {
    this.bootstrapRunners();
    this.slowTimer = setInterval(() => this.runSlowPoll(), 60_000);
  }

  stop(): void {
    if (this.slowTimer) clearInterval(this.slowTimer);
    for (const r of this.runners.values()) r.dispose();
    this.runners.clear();
  }

  refreshItem(id: string): void {
    this.runners.get(id)?.dispose();
    this.runners.delete(id);
    this.bootstrapRunners();
  }

  private bootstrapRunners(): void {
    const rows = this.db.prepare('SELECT * FROM auction_list WHERE lifecycle_status != ?').all('expired');
    for (const row of rows) {
      if (!this.runners.has(row.id)) {
        this.runners.set(row.id, new ItemRunner(row, this.clock, {
          onBecomeInProgress: () => this.runSlowPollFor([row.id]),
          onExpire: (id) => this.fetchBidRecordsOnce(id),
          onOfferPrice: (id) => this.executeOfferPrice(id),
          onFastPoll: (id) => this.pollStatus(id),
        }));
      }
    }
  }

  private async runSlowPoll(): Promise<void> {
    const ids = listByLifecycle(this.db, 'in_progress').map((r) => r.id);
    if (ids.length === 0) return;
    await this.runSlowPollFor(ids);
  }

  private async runSlowPollFor(ids: string[]): Promise<void> {
    const statusJson = await this.jdApi.call(JD_FUNCTIONS.CURRENT_AND_OFFER, buildStatusBody(ids));
    for (const id of ids) {
      const parsed = parseStatusResponse(statusJson, id);
      if (parsed.serverTimeMs) this.clock.addSample(parsed.serverTimeMs);
      const row = this.db.prepare('SELECT * FROM auction_list WHERE id = ?').get(id);
      if (!row?.address) continue;
      const bidJson = await this.jdApi.call(
        JD_FUNCTIONS.BID_RECORDS,
        buildBidRecordsBody(id, row.address),
      );
      insertBidRecordsSnapshot(this.db, id, bidJson);
      this.updateListFromStatus(id, parsed);
      this.maybeExpire(id, parsed);
    }
  }

  private async fetchBidRecordsOnce(auctionId: string): Promise<void> {
    const row = this.db.prepare('SELECT address FROM auction_list WHERE id = ?').get(auctionId) as { address: string } | undefined;
    if (!row?.address) return;
    const bidJson = await this.jdApi.call(
      JD_FUNCTIONS.BID_RECORDS,
      buildBidRecordsBody(auctionId, row.address),
    );
    insertBidRecordsSnapshot(this.db, auctionId, bidJson);
    this.db.prepare(`UPDATE auction_list SET lifecycle_status = 'expired', scheduler_phase = 'done' WHERE id = ?`).run(auctionId);
  }

  private async executeOfferPrice(auctionId: string): Promise<void> {
    const row = this.db.prepare('SELECT * FROM auction_list WHERE id = ?').get(auctionId) as {
      id: string; address: string; target_price: number | null; current_price: number | null; auto_order_enabled: number;
    };
    if (!row?.auto_order_enabled || !row.address) return;
    const price = calcOfferPrice(row.current_price ?? 0, row.target_price);
    try {
      const body = buildOfferPriceBody({
        auctionId: row.id,
        price,
        ts: Date.now(),
        address: row.address,
      });
      await this.jdApi.call(JD_FUNCTIONS.OFFER_PRICE, body);
      this.db.prepare(`UPDATE auction_list SET order_result = 'success' WHERE id = ?`).run(auctionId);
      this.notify('出价成功', `商品 ${auctionId} 已提交出价 ${price} 元`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.db.prepare(`UPDATE auction_list SET order_result = 'failed', order_error = ? WHERE id = ?`).run(msg, auctionId);
      this.notify('出价失败', msg);
    }
  }

  private async pollStatus(auctionId: string): Promise<void> {
    const statusJson = await this.jdApi.call(JD_FUNCTIONS.CURRENT_AND_OFFER, buildStatusBody(auctionId));
    const parsed = parseStatusResponse(statusJson, auctionId);
    if (parsed.serverTimeMs) this.clock.addSample(parsed.serverTimeMs);
    this.updateListFromStatus(auctionId, parsed);
  }

  private updateListFromStatus(auctionId: string, parsed: ReturnType<typeof parseStatusResponse>): void {
    this.db.prepare(`
      UPDATE auction_list SET
        current_price = ?, bid_count = ?, auction_status = ?,
        last_polled_at = ?, scheduler_phase = 'slow_poll'
      WHERE id = ?
    `).run(parsed.currentPrice, parsed.bidCount, parsed.auctionStatus, new Date().toISOString(), auctionId);
  }

  private maybeExpire(auctionId: string, parsed: ReturnType<typeof parseStatusResponse>): void {
    const row = this.db.prepare('SELECT auction_end_time FROM auction_list WHERE id = ?').get(auctionId) as { auction_end_time: number | null };
    const next = resolveLifecycleStatus({
      nowMs: this.clock.serverNow(),
      startTimeMs: null,
      endTimeMs: row?.auction_end_time ?? null,
      platformStatusExpired: parsed.platformStatusExpired,
    });
    if (next === 'expired') {
      this.runners.get(auctionId)?.dispose();
      this.runners.delete(auctionId);
      void this.fetchBidRecordsOnce(auctionId);
    }
  }
}
```

- [ ] **Step 4: 在 main/index.ts 启动调度器**

应用 `whenReady` 中：`getDb()` → 创建 `JdApiService`（从 renderer 获取 webview webContents，可通过 `did-attach-webview` 事件保存引用）→ `new AuctionScheduler(...).start()`

- [ ] **Step 5: Commit**

```bash
git add src/main/scheduler/ src/main/index.ts
git commit -m "feat: add auction scheduler with lifecycle and precision offer"
```

---

### Task 9: 渲染进程侧栏 UI

**Files:**
- Create: `src/renderer/components/Toolbar.tsx`, `Sidebar.tsx`, `AuctionListItem.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: 侧栏列表组件**

`AuctionListItem.tsx` 展示：
- 标题、`lifecycleStatus` 中文标签（未开始/抢购中/已过期）
- `currentPrice`、`bidCount`、倒计时（`auctionStartTime - now`）
- 期望价输入、`autoOrderEnabled` 开关（仅 `in_progress` 可开）
- 删除、打开详情 URL 按钮

- [ ] **Step 2: 「加入抢单列表」按钮**

Toolbar 监听 webview `did-navigate` / `did-navigate-in-page`，调用 `parseProductDetailUrl`（通过 preload 暴露或在 renderer 复制轻量 URL 判断），详情页时启用按钮；点击时读取 webview `getTitle()` 并 `electronAPI.addAuction({ id: auctionId, ... })`

- [ ] **Step 3: IPC 扩展**

```typescript
setAutoOrder: (id: string, enabled: boolean) => ipcRenderer.invoke('auction:set-auto-order', id, enabled),
updateTargetPrice: (id: string, price: number | null) => ipcRenderer.invoke('auction:update-target-price', id, price),
```

主进程 handler 更新 DB 后调用 `scheduler.refreshItem(id)`

- [ ] **Step 4: 轮询 UI 刷新**

主进程 `webContents.send('auction:list-updated')` 在 slow poll / ingest 完成后触发；renderer 重新 `listAuctions()`

- [ ] **Step 5: 手动验证**

Run: `npm run dev`
- 打开详情页 → 加入列表 → 侧栏出现条目
- 开关/autoOrder 状态展示正确

- [ ] **Step 6: Commit**

```bash
git add src/renderer/ src/main/ipc/
git commit -m "feat: add sidebar UI with lifecycle status and auto-order toggle"
```

---

### Task 10: 工具栏导航与登录检测

**Files:**
- Modify: `src/renderer/components/Toolbar.tsx`, `src/shared/constants.ts`

- [ ] **Step 1: 导航 URL 常量**

```typescript
export const URLS = {
  MINE: 'https://dbd.m.jd.com/ppdbd/pages/mine/index?scene=null',
  HOME: 'https://dbd.m.jd.com/ppdbd/paimai',
  LOGIN_PREFIX: 'https://plogin.m.jd.com/login/login',
};
```

- [ ] **Step 2: Toolbar 按钮**

我的页面、首页、刷新、后退、清除 session（`session.clearStorageData` IPC）、提醒开关、窗口置顶

- [ ] **Step 3: 登录检测**

webview URL 以 `LOGIN_PREFIX` 开头时，工具栏显示「需要登录」徽章

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/Toolbar.tsx src/shared/constants.ts
git commit -m "feat: add toolbar navigation and login detection"
```

---

### Task 11: 桌面通知与错误恢复

**Files:**
- Modify: `src/main/index.ts`, `src/main/scheduler/auction-scheduler.ts`

- [ ] **Step 1: Notification 封装**

```typescript
import { Notification } from 'electron';

function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}
```

- [ ] **Step 2: JD API 失败重试 1 次**

`jd-api.service.ts` 的 `call` 方法 catch 后重试一次，仍失败抛出

- [ ] **Step 3: ParamsSign 不可用**

捕获错误 → `scheduler.stop()` + IPC `scheduler:paused` → 侧栏顶部提示「请打开多宝岛页面并完成登录」

- [ ] **Step 4: Commit**

```bash
git add src/main/
git commit -m "feat: add notifications and API error recovery"
```

---

### Task 12: 集成测试与 README

**Files:**
- Modify: `README.md`
- Create: `tests/integration/scheduler-logic.test.ts`（纯逻辑，不启 Electron）

- [ ] **Step 1: 调度逻辑集成测试（无 Electron）**

测试 `not_started` 不触发 poll、`in_progress` 进入 slow poll、expire 触发一次 bidrecords（mock jdApi）

- [ ] **Step 2: 更新 README**

说明：开发命令、登录前置、自动下单开关、数据库位置、API 依赖 Webview

- [ ] **Step 3: 全量测试**

Run: `npm test && npm run build`
Expected: 全部 PASS，构建成功

- [ ] **Step 4: Commit**

```bash
git add README.md tests/
git commit -m "docs: add README and scheduler integration tests"
```

---

## Spec 覆盖自检

| Spec 要求 | 对应 Task |
|-----------|-----------|
| 列表 id = 商品页 id，upsert | Task 4, 7 |
| SQLite 三表 | Task 4 |
| 加入列表 detail.v2 + saleInfo | Task 7 |
| 生命周期 not_started / in_progress / expired | Task 3, 8 |
| not_started 零轮询 | Task 8 ItemRunner |
| 仅 in_progress 慢轮询 bidrecords+status | Task 8 |
| expired 一次 bidrecords | Task 8 fetchBidRecordsOnce |
| 快轮询 + 80–100ms offerPrice | Task 8 ItemRunner |
| 期望价金额逻辑 | Task 3, 8 |
| 逐条 autoOrder 默认关 | Task 9 |
| scripts/jd-sign 通用网关 | Task 5 |
| 时钟偏移校准 | Task 8 clock-sync |
| 侧栏 UI | Task 9, 10 |
| 桌面通知 | Task 11 |
| 错误处理 | Task 7, 11 |

## 实现顺序建议

1. Task 1–4（脚手架 + 纯逻辑 + DB）— 可独立测试  
2. Task 5–7（API + ingest）— 需真实登录 Webview 手动验证  
3. Task 8（调度器）— 核心难点  
4. Task 9–12（UI + 收尾）

## 风险与注意事项

1. **API 响应字段**：`detail-parser.ts` 需在首次联调时用真实响应微调 JSON 路径；保留 fixture 测试锁定已知结构。  
2. **Webview webContents 引用**：必须在 `did-attach-webview` 后保存，确保 `JdApiService` 始终指向多宝岛 webview。  
3. **better-sqlite3 原生模块**：electron-vite 需将 better-sqlite3 设为 external并在 rebuild 时匹配 Electron ABI（`electron-rebuild` 或 `@electron/rebuild`）。  
4. **时间字段单位**：确认 API 返回秒还是毫秒；解析器统一转为 ms 存入 DB。
