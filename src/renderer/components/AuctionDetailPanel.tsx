import { useEffect, useState } from 'react';
import { describeSchedulerStatus } from '../../shared/scheduler-status';
import type { LifecycleStatus } from '../../shared/types';
import type {
  AuctionHistoryItem,
  AuctionListDbRow,
  BidRecordItem,
  DetailPanelTab,
} from '../electron.d.ts';
import {
  formatCountdown,
  formatDateTime,
  formatPolledAt,
  formatRecordTime,
} from '../utils/format';
import { getDisplayLifecycle, getDisplayName, LIFECYCLE_LABELS } from '../utils/auction-display';

const TAB_LABELS: Record<DetailPanelTab, string> = {
  detail: '详情',
  history: '抢购历史',
  bids: '出价记录',
};

interface Props {
  item: AuctionListDbRow | null;
  tab: DetailPanelTab;
  onTabChange: (tab: DetailPanelTab) => void;
  onChanged: () => void;
  onOpenUrl: (url: string) => void;
}

/** 右侧：详情 / 抢购历史 / 出价记录 */
export default function AuctionDetailPanel({
  item,
  tab,
  onTabChange,
  onChanged,
  onOpenUrl,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const [targetPrice, setTargetPrice] = useState('');
  const [offerAdvanceMin, setOfferAdvanceMin] = useState('150');
  const [offerAdvanceMax, setOfferAdvanceMax] = useState('250');
  const [history, setHistory] = useState<AuctionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [bids, setBids] = useState<BidRecordItem[]>([]);
  const [bidsFetchedAt, setBidsFetchedAt] = useState<string | null>(null);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [bidsError, setBidsError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setTargetPrice(item?.target_price != null ? String(item.target_price) : '');
  }, [item?.id, item?.target_price]);

  useEffect(() => {
    setOfferAdvanceMin(String(item?.offer_advance_min_ms ?? 150));
    setOfferAdvanceMax(String(item?.offer_advance_max_ms ?? 250));
  }, [item?.id, item?.offer_advance_min_ms, item?.offer_advance_max_ms]);

  useEffect(() => {
    if (!item) return;
    if (tab === 'history') {
      setHistoryLoading(true);
      setHistoryError(null);
      void window.electronAPI
        .getAuctionHistory(item.id)
        .then(setHistory)
        .catch((err: unknown) => {
          setHistoryError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setHistoryLoading(false));
    }
    if (tab === 'bids') {
      setBidsLoading(true);
      setBidsError(null);
      void window.electronAPI
        .getBidRecords(item.id, false)
        .then((res) => {
          setBids(res.records);
          setBidsFetchedAt(res.fetchedAt);
        })
        .catch((err: unknown) => {
          setBidsError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setBidsLoading(false));
    }
  }, [item?.id, tab]);

  const handleRefreshBids = () => {
    if (!item) return;
    setBidsLoading(true);
    setBidsError(null);
    void window.electronAPI
      .getBidRecords(item.id, true)
      .then((res) => {
        setBids(res.records);
        setBidsFetchedAt(res.fetchedAt);
        onChanged();
      })
      .catch((err: unknown) => {
        setBidsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setBidsLoading(false));
  };

  if (!item) {
    return (
      <aside className="detail-panel">
        <div className="detail-panel__empty">选择商品查看详情</div>
      </aside>
    );
  }

  const detail = item.detail_display;
  const startMs = detail?.startTime ?? item.auction_start_time;
  const endMs = item.auction_end_time ?? detail?.actualEndTime;
  const displayName = getDisplayName(item);
  const lifecycle = getDisplayLifecycle(item, now);
  const dbLifecycle = item.lifecycle_status as LifecycleStatus;
  const canAutoOrder = lifecycle === 'not_started' || lifecycle === 'in_progress';
  const schedulerLabel = describeSchedulerStatus(
    dbLifecycle,
    item.scheduler_phase,
    item.data_incomplete,
  );

  const countdownLabel =
    lifecycle === 'not_started'
      ? `距开始 ${formatCountdown(startMs, now)}`
      : lifecycle === 'in_progress'
        ? `距结束 ${formatCountdown(endMs, now)}`
        : '抢购已结束';

  /** 自动出价前置条件与触发说明 */
  const autoOrderChecks = [
    { ok: item.auto_order_enabled === 1, label: '已开启自动出价' },
    { ok: !!item.address, label: '已获取 address' },
    { ok: endMs != null, label: '有结束时间' },
    { ok: item.data_incomplete === 0, label: '数据完整' },
    { ok: item.order_result === 'pending', label: '尚未出价' },
  ];
  const advanceMin = Number(offerAdvanceMin) || 150;
  const advanceMax = Number(offerAdvanceMax) || 250;
  const autoOrderReady = autoOrderChecks.every((c) => c.ok);
  let autoOrderHint = '请先勾选自动出价（默认关闭）';
  if (item.auto_order_enabled === 1) {
    if (!item.address) {
      autoOrderHint = '缺少 address，无法出价；请打开网页确认登录并刷新详情';
    } else if (endMs == null) {
      autoOrderHint = '缺少结束时间，等待详情或轮询补全';
    } else if (lifecycle === 'expired') {
      autoOrderHint = '抢购已结束';
    } else if (endMs > now) {
      autoOrderHint = `将在结束前 ${Math.min(advanceMin, advanceMax)}–${Math.max(advanceMin, advanceMax)}ms 自动出价（距结束 ${formatCountdown(endMs, now)}）`;
    } else {
      autoOrderHint = '已过结束时间，无法出价';
    }
  }

  const handleAutoOrder = async (enabled: boolean) => {
    await window.electronAPI.setAutoOrder(item.id, enabled);
    onChanged();
  };

  const handleTargetPriceBlur = async () => {
    const trimmed = targetPrice.trim();
    const price = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && Number.isNaN(price)) return;
    await window.electronAPI.updateTargetPrice(item.id, price);
    onChanged();
  };

  const handleOfferAdvanceBlur = async () => {
    const min = Number(offerAdvanceMin);
    const max = Number(offerAdvanceMax);
    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < 0) return;
    await window.electronAPI.updateOfferAdvance(item.id, min, max);
    onChanged();
  };

  return (
    <aside className="detail-panel">
      <div className="detail-panel__tabs">
        {(Object.keys(TAB_LABELS) as DetailPanelTab[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`detail-panel__tab${tab === key ? ' detail-panel__tab--active' : ''}`}
            onClick={() => onTabChange(key)}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="detail-panel__body">
        {tab === 'detail' && (
          <div className="detail-panel__section">
            <h3 className="detail-panel__title">{displayName}</h3>
            <div className="detail-panel__badge-row">
              <span className={`list-row__badge list-row__badge--${lifecycle}`}>
                {LIFECYCLE_LABELS[lifecycle]}
              </span>
              <span className="detail-panel__muted">ID {item.id}</span>
            </div>

            <div className="detail-panel__grid">
              <div className="detail-panel__cell">
                <div className="detail-panel__label">当前价</div>
                <div className="detail-panel__price">
                  {item.current_price != null ? `¥${item.current_price}` : '--'}
                </div>
              </div>
              <div className="detail-panel__cell">
                <div className="detail-panel__label">出价人数</div>
                <div>{item.bid_count ?? 0}</div>
              </div>
              {detail?.startPrice != null && (
                <div className="detail-panel__cell">
                  <div className="detail-panel__label">起拍价</div>
                  <div>¥{detail.startPrice}</div>
                </div>
              )}
              <div className="detail-panel__cell">
                <div className="detail-panel__label">下单状态</div>
                <div
                  className={
                    item.order_result === 'failed' ? 'detail-panel__error-inline' : undefined
                  }
                >
                  {item.order_result === 'success'
                    ? '成功'
                    : item.order_result === 'failed'
                      ? (item.order_error ?? '失败')
                      : item.order_result === 'skipped'
                        ? '跳过'
                        : '待触发'}
                </div>
              </div>
            </div>

            <div className="detail-panel__block">
              <div>开始 {formatDateTime(startMs)}</div>
              <div>结束 {formatDateTime(endMs)}</div>
              {lifecycle !== 'expired' && (
                <div className="detail-panel__countdown">{countdownLabel}</div>
              )}
            </div>

            <div className="detail-panel__block detail-panel__block--muted">
              <div className="detail-panel__row">
                <span>调度</span>
                <span>{schedulerLabel}</span>
              </div>
              <div className="detail-panel__row">
                <span>最近轮询</span>
                <span>{formatPolledAt(item.last_polled_at)}</span>
              </div>
              <div className="detail-panel__row">
                <span>区域</span>
                <span>
                  {item.address ?? '未获取'}
                  {item.sale_display?.freightAreaText
                    ? ` · ${item.sale_display.freightAreaText}`
                    : ''}
                </span>
              </div>
              <div className="detail-panel__row">
                <span>出价记录拉取</span>
                <span>{item.poll_summary?.bidRecordsCount ?? 0} 次</span>
              </div>
            </div>

            {canAutoOrder && (
              <>
                <label className="detail-panel__check">
                  <input
                    type="checkbox"
                    checked={item.auto_order_enabled === 1}
                    onChange={(e) => void handleAutoOrder(e.target.checked)}
                  />
                  自动出价
                </label>
                <div className="detail-panel__block detail-panel__block--muted">
                  <div className="detail-panel__row">
                    <span>自动出价</span>
                    <span className={autoOrderReady ? 'detail-panel__ok' : 'detail-panel__warn'}>
                      {autoOrderReady ? '就绪' : '未就绪'}
                    </span>
                  </div>
                  <ul className="detail-panel__checklist">
                    {autoOrderChecks.map((c) => (
                      <li
                        key={c.label}
                        className={c.ok ? 'detail-panel__check-ok' : 'detail-panel__check-fail'}
                      >
                        {c.ok ? '✓' : '✗'} {c.label}
                      </li>
                    ))}
                  </ul>
                  <p className="detail-panel__hint">{autoOrderHint}</p>
                </div>
              </>
            )}

            <div className="detail-panel__field">
              <span>期望价</span>
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                onBlur={() => void handleTargetPriceBlur()}
                placeholder="元"
                disabled={!canAutoOrder}
              />
            </div>

            {canAutoOrder && (
              <div className="detail-panel__field detail-panel__field--row">
                <span>提前出价</span>
                <div className="detail-panel__advance">
                  <input
                    type="number"
                    min={0}
                    value={offerAdvanceMin}
                    onChange={(e) => setOfferAdvanceMin(e.target.value)}
                    onBlur={() => void handleOfferAdvanceBlur()}
                    aria-label="最小提前毫秒"
                  />
                  <span>–</span>
                  <input
                    type="number"
                    min={0}
                    value={offerAdvanceMax}
                    onChange={(e) => setOfferAdvanceMax(e.target.value)}
                    onBlur={() => void handleOfferAdvanceBlur()}
                    aria-label="最大提前毫秒"
                  />
                  <span className="detail-panel__muted">ms（距结束）</span>
                </div>
              </div>
            )}

            <div className="detail-panel__actions">
              <button type="button" className="btn btn--primary" onClick={() => onOpenUrl(item.url)}>
                打开网页
              </button>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="detail-panel__section">
            {historyLoading && <p className="detail-panel__hint">加载中…</p>}
            {!historyLoading && historyError && (
              <p className="detail-panel__error">{historyError}</p>
            )}
            {!historyLoading && !historyError && history.length === 0 && (
              <p className="detail-panel__hint">暂无抢购历史</p>
            )}
            {!historyLoading && !historyError && history.length > 0 && (
              <ul className="record-list">
                {history.map((row, i) => (
                  <li key={`${row.endTime}-${i}`} className="record-list__item">
                    {row.userImage && (
                      <img className="record-list__avatar" src={row.userImage} alt="" />
                    )}
                    <div className="record-list__main">
                      <div className="record-list__name">{row.userNickname}</div>
                      <div className="record-list__time">{formatRecordTime(row.endTime)}</div>
                    </div>
                    <div className="record-list__price">¥{row.offerPrice}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'bids' && (
          <div className="detail-panel__section">
            <div className="detail-panel__toolbar">
              <span className="detail-panel__muted">
                {bidsFetchedAt ? `更新于 ${formatPolledAt(bidsFetchedAt)}` : '暂无本地快照'}
              </span>
              <button
                type="button"
                className="btn btn--small"
                disabled={bidsLoading}
                onClick={handleRefreshBids}
              >
                刷新
              </button>
            </div>
            {bidsLoading && <p className="detail-panel__hint">加载中…</p>}
            {!bidsLoading && bidsError && <p className="detail-panel__error">{bidsError}</p>}
            {!bidsLoading && !bidsError && bids.length === 0 && (
              <p className="detail-panel__hint">暂无出价记录，点击刷新拉取</p>
            )}
            {!bidsLoading && !bidsError && bids.length > 0 && (
              <ul className="record-list">
                {bids.map((row, i) => (
                  <li key={`${row.bidTimeMs}-${i}`} className="record-list__item">
                    {row.userImage && (
                      <img className="record-list__avatar" src={row.userImage} alt="" />
                    )}
                    <div className="record-list__main">
                      <div className="record-list__name">{row.userNickname}</div>
                      <div className="record-list__time">
                        {row.bidTimeMs ? formatRecordTime(row.bidTimeMs) : '--'}
                      </div>
                    </div>
                    <div className="record-list__price">¥{row.offerPrice}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
