/**
 * Browser half of the Magpie quota bundle.
 *
 * One compact reading in `conversation.composer.dock` (same row as the shipped
 * context meter): a battery glyph plus the share of all-account quota that is
 * still usable (Σ remaining / Σ limit over every non-expired account, weighted
 * by each account's own limit — not the lowest single account, and not the
 * current session's account). Clicking it opens a native-styled call-out panel
 * (menu surface, elevation, radius, type scale, dismiss + Escape behavior
 * copied from the shipped ContextMeter) that lists, per account, exactly two
 * things: the total-quota percentage and one model usage-limit percentage
 * (with 已用/上限 amounts).
 *
 * Architecture: a single module-level store owns the data. Every mounted
 * composer subscribes to it through `useSyncExternalStore`; fetches are
 * deduplicated across instances and one 60s poller runs while at least one
 * subscriber exists. That keeps N composers to one request per tick instead of
 * N, and every reading shows the same fresh snapshot.
 *
 * The Host route `/__local/magpie-quota` reads the local magpie gateway
 * server-side, so the browser request stays same-origin (the gateway sends no
 * CORS headers).
 */
window.__ModuleLoader__.load({
  id: '@local/magpie-quota',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const createPortal = (() => {
      try {
        const dom = require('react-dom');
        return dom && typeof dom.createPortal === 'function' ? dom.createPortal : null;
      } catch {
        return null;
      }
    })();

    const NS = 'magpieQuota';
    /** Same-origin Host route registered by the Host half. */
    const QUOTA_ROUTE = '/__local/magpie-quota';
    /** Stable id linking the trigger to its panel via aria-controls. */
    const PANEL_ID = 'dsh-magpie-quota-panel';
    /** Background refresh cadence while the page is visible. */
    const POLL_MS = 60000;

    /** Bound once in apply; reads the active locale at call time. */
    let boundT = key => key;

    const DICT = {
      zh: {
        title: 'magpie 额度',
        totalQuota: '总额度',
        triggerAria: 'magpie 额度：全部账号中可用 {pct}',
        triggerAriaUnknown: 'magpie 额度',
        staleSuffix: '（数据可能已过期）',
        updated: '更新于 {time}',
        refresh: '刷新',
        close: '关闭',
        loading: '正在读取额度…',
        error: '无法读取 magpie 额度',
        retry: '重试',
        empty: '没有可显示的账号额度',
        expired: '已过期',
        errTimeout: '读取额度超时',
        errUnreachable: '无法连接 magpie 网关',
        errGateway: 'magpie 网关返回错误（HTTP {status}）',
        errBadJson: 'magpie 网关返回了无法解析的数据',
        errBadFormat: '额度数据格式无效',
        errNetwork: '读取额度失败',
        failedChip: '额度读取失败',
      },
      en: {
        title: 'Magpie quota',
        totalQuota: 'Total quota',
        triggerAria: 'Magpie quota: {pct} of all accounts usable',
        triggerAriaUnknown: 'Magpie quota',
        staleSuffix: ' (data may be stale)',
        updated: 'Updated {time}',
        refresh: 'Refresh',
        close: 'Close',
        loading: 'Reading quota…',
        error: 'Could not read the magpie quota',
        retry: 'Retry',
        empty: 'No account quota to show',
        expired: 'Expired',
        errTimeout: 'Quota read timed out',
        errUnreachable: 'Cannot reach the magpie gateway',
        errGateway: 'Magpie gateway error (HTTP {status})',
        errBadJson: 'The magpie gateway returned unreadable data',
        errBadFormat: 'The quota data format is invalid',
        errNetwork: 'Could not read the quota',
        failedChip: 'Quota unavailable',
      },
    };

    // ---------------------------------------------------------------- helpers

    /** Fill `{name}` placeholders after translation. */
    const fill = (template, params) => String(template).replace(/\{(\w+)\}/g, (whole, name) =>
      params && params[name] !== undefined ? String(params[name]) : whole);

    const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
    const str = value => (typeof value === 'string' ? value : '');
    const isObject = value => value !== null && typeof value === 'object';
    const clampPct = value => {
      const n = num(value);
      return n === undefined ? undefined : Math.max(0, Math.min(100, n));
    };

    /** Proximity band of a (rounded) remaining percentage. */
    function levelOf(remaining) {
      if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return 'neutral';
      if (remaining >= 50) return 'green';
      if (remaining >= 20) return 'yellow';
      return 'red';
    }

    const LEVEL_COLOR = {
      green: 'var(--dsw-alias-state-success-primary, #2f9e44)',
      yellow: 'var(--dsw-alias-state-warn-primary, #d29922)',
      red: 'var(--dsw-alias-state-error-primary, #d64545)',
      neutral: 'var(--dsw-alias-label-tertiary, #8b8b8b)',
    };

    /** Short locale clock time for the last successful read. */
    function formatTime(iso) {
      const date = new Date(str(iso));
      if (!str(iso) || Number.isNaN(date.getTime())) return '';
      try {
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    }

    const isExpired = until => {
      const date = new Date(str(until));
      return str(until) !== '' && !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
    };

    // -------------------------------------------------------- data selection

    /** Normalize one window into a small plain object. */
    const toWindow = w => ({
      name: str(w.name),
      usedPct: clampPct(num(w.used)),
      remainingPct: clampPct(num(w.remaining)),
      amount: num(w.amount),
      limit: num(w.limit),
      unit: str(w.unit),
      display: str(w.display),
      resetsAt: str(w.resetsAt),
      unknown: /^(unknown|未知|—)$/i.test(str(w.display).trim()),
    });

    /** The account's overall quota window: prefer "Total", else a credit bucket. */
    function pickTotal(windows) {
      return windows.find(w => /total/i.test(w.name))
        ?? windows.find(w => w.unit === 'credits')
        ?? windows[0]
        ?? null;
    }

    /** The single model usage-limit window, or null when the account has none. */
    function pickModel(windows, total) {
      const rest = windows.filter(w => w !== total);
      const byName = rest.find(w => /token|模型|model/i.test(w.name));
      if (byName !== undefined) return byName;
      return rest.find(w => w.unit !== 'credits'
        && ((typeof w.limit === 'number' && w.limit > 0) || typeof w.remainingPct === 'number'))
        ?? null;
    }

    const minRemaining = windows => windows.reduce((best, w) =>
      typeof w.remainingPct === 'number' && (best === undefined || w.remainingPct < best)
        ? w.remainingPct
        : best, undefined);

    /** Percentage used for a window's bar, with amount/limit and remaining fallbacks. */
    function usedPercentOf(window) {
      let used = window.usedPct;
      if ((used === undefined || used > 100.5)
        && typeof window.amount === 'number' && typeof window.limit === 'number' && window.limit > 0) {
        used = window.amount / window.limit * 100;
      }
      if (used === undefined && typeof window.remainingPct === 'number') used = 100 - window.remainingPct;
      return used === undefined ? 0 : Math.max(0, Math.min(100, used));
    }

    /**
     * Percentage remaining for a window's bar, so the bar and the adjacent
     * number always read in the same direction (a nearly empty bar next to a
     * small percentage). Mirrors `usedPercentOf` with the opposite fallback.
     */
    function remainingPercentOf(window) {
      if (typeof window.remainingPct === 'number') {
        return Math.max(0, Math.min(100, window.remainingPct));
      }
      return 100 - usedPercentOf(window);
    }

    /** The gateway's amount/limit string, with a numeric fallback. */
    function figuresOf(window) {
      if (window.display !== '') return window.display;
      if (typeof window.amount === 'number' && typeof window.limit === 'number') return `${window.amount} / ${window.limit}`;
      return typeof window.limit === 'number' ? `— / ${window.limit}` : '';
    }

    /** Normalize one provider entry into an account with its two display windows. */
    function toAccount(provider) {
      const windows = (Array.isArray(provider.windows) ? provider.windows : [])
        .filter(isObject)
        .map(toWindow);
      const total = pickTotal(windows);
      const model = pickModel(windows, total);
      const until = str(provider.until) || null;
      const remaining = total && typeof total.remainingPct === 'number'
        ? total.remainingPct
        : minRemaining(windows);
      return {
        id: str(provider.provider) || str(provider.name) || 'account',
        name: str(provider.name) || str(provider.provider) || '',
        sub: [str(provider.plan), str(provider.alias) || str(provider.user)].filter(Boolean).join(' · '),
        expired: isExpired(until),
        remaining,
        total,
        model,
        windows,
      };
    }

    /** Normalize the gateway payload into the shape the panel renders. */
    function normalize(raw) {
      const list = raw && Array.isArray(raw.data) ? raw.data : [];
      return { accounts: list.filter(isObject).map(toAccount) };
    }

    /**
     * Remaining amount of a window, derived from amount/limit or from the
     * remaining percentage. Undefined when the window carries no usable figure.
     */
    function remainingAmountOf(window) {
      if (window === null || typeof window !== 'object') return undefined;
      const limit = num(window.limit);
      if (limit === undefined || limit <= 0) return undefined;
      const amount = num(window.amount);
      if (amount !== undefined) return Math.max(0, Math.min(limit, limit - amount));
      const pct = clampPct(window.remainingPct);
      if (pct !== undefined) return limit * pct / 100;
      return undefined;
    }

    /**
     * Usable share of the whole account pool, as a percentage, or null.
     *
     * Weighted across every non-expired account — never the lowest single
     * account, and never just the current session's account: each account's
     * own total-quota limit is the weight, and its remaining amount is the
     * contribution, so Σ remaining / Σ limit answers "how much of all the
     * quota I have is still spendable". Accounts without a numeric limit fall
     * back to an unweighted mean of their remaining percentages, used only
     * when no account reports a limit at all.
     */
    function usableSharePct(data) {
      if (!data || data.accounts.length === 0) return null;
      let limitSum = 0;
      let remainSum = 0;
      let pctSum = 0;
      let pctCount = 0;
      for (const account of data.accounts) {
        if (account.expired) continue;
        const window = account.total;
        const remaining = remainingAmountOf(window);
        const limit = window === null ? undefined : num(window.limit);
        if (remaining !== undefined && limit !== undefined && limit > 0) {
          limitSum += limit;
          remainSum += remaining;
          continue;
        }
        if (typeof account.remaining === 'number') {
          pctSum += account.remaining;
          pctCount += 1;
        }
      }
      if (limitSum > 0) return Math.max(0, Math.min(100, remainSum / limitSum * 100));
      if (pctCount > 0) return Math.max(0, Math.min(100, pctSum / pctCount));
      return null;
    }

    /** Localized error sentence for a state.error descriptor. */
    function describeError(t, error) {
      if (!error) return t('error');
      switch (error.code) {
        case 'timeout': return t('errTimeout');
        case 'unreachable': return t('errUnreachable');
        case 'network': return t('errNetwork');
        case 'gateway-error': return fill(t('errGateway'), { status: error.status ?? '?' });
        case 'bad-json': return t('errBadJson');
        case 'bad-format': return t('errBadFormat');
        default: return error.message ? `${t('error')} — ${error.message}` : t('error');
      }
    }

    // ----------------------------------------------------------- quota store

    /** Build a failed-fetch error carrying a stable code/status. */
    function requestFailure(payload, status) {
      const error = new Error(payload && typeof payload.message === 'string' ? payload.message : `HTTP ${status}`);
      error.code = payload && typeof payload.code === 'string' ? payload.code : 'network';
      error.status = status;
      return error;
    }

    const toErrorInfo = error => ({
      code: error && typeof error.code === 'string' ? error.code : 'network',
      status: error ? error.status : undefined,
      message: error instanceof Error ? error.message : String(error),
    });

    /**
     * One shared quota store: deduped fetches, a single poller while anyone is
     * subscribed, and the last good payload retained across a failed refresh.
     */
    function createQuotaStore() {
      let state = { status: 'idle', data: null, error: null, fetchedAt: null };
      const listeners = new Set();
      let inFlight = null;
      let timer = null;
      let observing = false;

      const set = next => { state = next; for (const listener of listeners) listener(); };
      const getState = () => state;

      async function run() {
        set({ status: 'loading', data: state.data, error: null, fetchedAt: state.fetchedAt });
        try {
          const response = await fetch(new URL(QUOTA_ROUTE, document.baseURI).toString(), {
            headers: { accept: 'application/json' },
          });
          let payload = null;
          try { payload = await response.json(); } catch { /* non-JSON */ }
          if (!response.ok) throw requestFailure(payload, response.status);
          if (!payload || !Array.isArray(payload.data)) throw Object.assign(new Error('bad-format'), { code: 'bad-format' });
          set({
            status: 'ready',
            data: normalize(payload),
            error: null,
            fetchedAt: str(payload.fetchedAt) || new Date().toISOString(),
          });
        } catch (error) {
          set({ status: 'error', data: state.data, error: toErrorInfo(error), fetchedAt: state.fetchedAt });
        }
      }

      /** Force a refresh, collapsing concurrent callers onto one request. */
      const refresh = () => {
        if (inFlight === null) inFlight = run().finally(() => { inFlight = null; });
        return inFlight;
      };

      const onVisible = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh();
      };

      function startPoller() {
        if (timer !== null) return;
        timer = setInterval(() => {
          if (typeof document === 'undefined' || document.visibilityState === 'visible') refresh();
        }, POLL_MS);
        if (!observing) {
          if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
          if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
          observing = true;
        }
      }

      function stopPoller() {
        if (timer !== null) { clearInterval(timer); timer = null; }
        if (observing) {
          if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
          if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
          observing = false;
        }
      }

      function subscribe(listener) {
        listeners.add(listener);
        if (listeners.size === 1) {
          startPoller();
          const stale = !state.fetchedAt || (Date.now() - Date.parse(state.fetchedAt)) > POLL_MS;
          if (state.data === null || stale) refresh();
        }
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0) stopPoller();
        };
      }

      return { subscribe, getState, refresh };
    }

    const store = createQuotaStore();

    // ------------------------------------------------------------------ view

    const STYLE = [
      '.dsh-mq-root{display:inline-flex;flex:none;}',
      // Wrapper keeps the trigger button from being a direct child of the root
      // span; the neighboring context-compaction-meter hides direct-child
      // trigger spans, so this keeps the quota chip visible in every layout.
      '.dsh-mq-btnwrap{display:inline-flex;align-items:center;flex:none;}',
      // Trigger matches the shipped ContextMeter chip exactly.
      '.dsh-mq-trigger{position:relative;display:inline-flex;align-items:center;gap:6px;flex:none;padding:1px 8px;border:none;border-radius:var(--dsw-radius-sm,4px);background:transparent;color:var(--dsw-alias-label-tertiary,#8b8b8b);font-family:inherit;font-size:var(--dsh-content-font-size-secondary,13px);font-variant-numeric:tabular-nums;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;cursor:pointer;}',
      '.dsh-mq-trigger[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-secondary,#666);}',
      '@media (hover:hover){.dsh-mq-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-secondary,#666);}}',
      '.dsh-mq-trigger:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f7bd8));outline-offset:1px;}',
      // Stale reading (last refresh failed while old data is shown) gets a dot.
      '.dsh-mq-trigger[data-stale="1"]::after{content:"";position:absolute;top:2px;right:2px;width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-warn-primary,#d29922);}',
      '.dsh-mq-batt{display:block;overflow:visible;}',
      '.dsh-mq-pct{font-variant-numeric:tabular-nums;}',
      // Panel: the shipped ContextMeter popover surface (menu, elevation-prominent).
      '.dsh-mq-panel{position:fixed;z-index:1100;box-sizing:border-box;padding:12px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,Canvas);backdrop-filter:var(--dsw-menu-backdrop-filter,blur(12px));--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent,0 8px 28px rgba(0,0,0,.24));font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary,#666);cursor:default;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow-x:hidden;overflow-y:auto;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);outline:none;}',
      '.dsh-mq-head{display:flex;align-items:center;gap:6px;margin-bottom:8px;}',
      '.dsh-mq-title{font-weight:500;color:var(--dsw-alias-label-primary,CanvasText);}',
      '.dsh-mq-updated{color:var(--dsw-alias-label-tertiary,#8b8b8b);font-variant-numeric:tabular-nums;font-size:11px;}',
      '.dsh-mq-actions{display:inline-flex;align-items:center;gap:2px;margin-left:auto;flex:none;}',
      '.dsh-mq-iconbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:none;border-radius:var(--dsw-radius-sm,4px);background:transparent;color:var(--dsw-alias-label-tertiary,#8b8b8b);font-size:14px;line-height:1;cursor:pointer;}',
      '@media (hover:hover){.dsh-mq-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-secondary,#666);}}',
      '.dsh-mq-iconbtn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f7bd8));outline-offset:1px;}',
      '@keyframes dsh-mq-spin{to{transform:rotate(360deg);}}.dsh-mq-spin{display:inline-block;animation:dsh-mq-spin .9s linear infinite;transform-origin:center;}',
      '@media (prefers-reduced-motion:reduce){.dsh-mq-spin{animation:none;}}',
      '.dsh-mq-acct{padding:8px 0;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));}',
      '.dsh-mq-acct:first-child{border-top:0;padding-top:0;}',
      '.dsh-mq-acct-expired .dsh-mq-item{opacity:.55;}',
      '.dsh-mq-accthead{display:flex;align-items:baseline;gap:6px;margin-bottom:6px;}',
      '.dsh-mq-acctname{font-weight:500;color:var(--dsw-alias-label-primary,CanvasText);white-space:nowrap;}',
      '.dsh-mq-acctsub{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#8b8b8b);font-size:11px;}',
      '.dsh-mq-acctbadge{margin-left:auto;flex:none;color:var(--dsw-alias-label-tertiary,#8b8b8b);font-size:11px;}',
      '.dsh-mq-item{padding:5px 0 3px;}',
      '.dsh-mq-item + .dsh-mq-item{border-top:1px dashed var(--dsw-alias-border-l1,rgba(127,127,127,.18));margin-top:2px;padding-top:6px;}',
      '.dsh-mq-itemhead{display:flex;align-items:baseline;gap:8px;}',
      '.dsh-mq-itemname{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#666);}',
      '.dsh-mq-itemfig{flex:none;color:var(--dsw-alias-label-tertiary,#8b8b8b);font-variant-numeric:tabular-nums;font-size:11px;}',
      '.dsh-mq-itemval{flex:none;margin-left:8px;font-weight:500;font-variant-numeric:tabular-nums;}',
      '.dsh-mq-bar{display:flex;height:4px;margin:5px 0 0;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));overflow:hidden;}',
      '.dsh-mq-fill{flex:none;height:100%;border-radius:1px;background:var(--mq-tint,var(--dsw-alias-label-tertiary,#8b8b8b));}',
      '.dsh-mq-status{padding:8px 0;color:var(--dsw-alias-label-tertiary,#8b8b8b);}',
      '.dsh-mq-error{display:flex;align-items:flex-start;gap:8px;padding:6px 7px;margin-bottom:6px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(214,69,69,.12));color:var(--dsw-alias-state-error-primary,#d64545);font-size:11px;line-height:16px;}',
      '.dsh-mq-errtext{flex:1;min-width:0;overflow-wrap:anywhere;}',
      '.dsh-mq-retry{flex:none;padding:0;border:none;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer;}',
      '.dsh-mq-retry:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f7bd8));outline-offset:2px;border-radius:var(--dsw-radius-sm,4px);}',
      // A failed read has no reading; say so instead of showing a bare dash.
      '.dsh-mq-trigger[data-failed="1"]{color:var(--dsw-alias-state-error-primary,#d64545);}',
    ].join('\n');

    /** Battery glyph: outline cells; fill width = remaining share, colored by level. */
    function BatteryGlyph({ pct, color }) {
      const share = typeof pct === 'number' ? Math.max(0, Math.min(100, pct)) : 0;
      return h('svg', { viewBox: '0 0 18 14', width: 16, height: 12, 'aria-hidden': 'true', className: 'dsh-mq-batt' },
        h('rect', { x: 1, y: 2.5, width: 13, height: 9, rx: 2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
        h('rect', { x: 14.6, y: 5.2, width: 2, height: 3.6, rx: 1, fill: 'currentColor' }),
        share > 0 ? h('rect', { x: 2.6, y: 4.1, width: 10.8 * share / 100, height: 5.8, rx: 1, fill: color }) : null,
      );
    }

    function reading(w) {
      if (w.unknown) return undefined;
      if (Number.isFinite(w.remainingPct)) return w.remainingPct;
      if (Number.isFinite(w.usedPct)) return 100 - w.usedPct;
      if (Number.isFinite(w.amount) && w.limit > 0) return 100 * remainingAmountOf(w) / w.limit;
    }

    function pctText(value) {
      return value === undefined ? '—' : value < 100 && value >= 99.95 ? '<100%' : `${Number(value.toFixed(1))}%`;
    }

    function summary(data) {
      const accounts = (data?.accounts ?? []).filter(a => !a.expired);
      const parts = accounts.slice(0, 2).map(a => {
        if (a.id === 'codex') {
          const value = name => pctText(reading(a.windows.find(w => w.name === name) ?? {}));
          return `Codex 5h ${value('5 hours')} · 7d ${value('7 days')}`;
        }
        if (/^workbuddy(?:-ai)?$/.test(a.id)) return `${a.id === 'workbuddy' ? 'WB' : 'WB AI'} ${pctText(reading(a.total ?? {}))}`;
        return a.name;
      });
      if (accounts.length > 2) parts.push(`+${accounts.length - 2}`);
      return parts.join(' | ');
    }

    /** One simplified line: label, 已用/上限 amount, remaining percentage, usage bar. */
    function QuotaItem({ label, window, tint, key: _key }) {
      const remaining = reading(window);
      const balance = window.unit === 'credits' ? remainingAmountOf(window) : undefined;
      const figures = window.unknown ? '' : balance === undefined ? figuresOf(window) : `${Number(balance.toFixed(2))} / ${window.limit}`;
      const reset = window.resetsAt ? new Date(window.resetsAt) : null;
      return h('div', { className: 'dsh-mq-item' },
        h('div', { className: 'dsh-mq-itemhead' },
          h('span', { className: 'dsh-mq-itemname', title: label }, label),
          figures !== '' ? h('span', { className: 'dsh-mq-itemfig' }, figures) : null,
          h('span', { className: 'dsh-mq-itemval', style: { color: tint } }, pctText(remaining)),
        ),
        remaining === undefined ? null : h('div', { className: 'dsh-mq-bar' },
          h('div', { className: 'dsh-mq-fill', style: { width: `${remaining}%`, background: tint } }),
        ),
        reset && !Number.isNaN(reset.getTime()) ? h('small', { title: window.resetsAt }, `↻ ${reset.toLocaleString()}`) : null,
      );
    }

    /** One account: name + plan/user, then total-quota and (optional) model limit. */
    function AccountBlock({ account, t }) {
      const windows = /^workbuddy(?:-ai)?$/.test(account.id)
        ? [account.total, account.model].filter(Boolean) : account.windows;
      const items = account.expired ? [] : windows.map((window, i) => h(QuotaItem, {
        key: i, label: window.name, window, tint: LEVEL_COLOR[levelOf(reading(window))],
      }));
      return h('div', { className: account.expired ? 'dsh-mq-acct dsh-mq-acct-expired' : 'dsh-mq-acct' },
        h('div', { className: 'dsh-mq-accthead' },
          h('span', { className: 'dsh-mq-acctname' }, account.name),
          account.sub !== '' ? h('span', { className: 'dsh-mq-acctsub', title: account.sub }, account.sub) : null,
          account.expired ? h('span', { className: 'dsh-mq-acctbadge' }, t('expired')) : null,
        ),
        items,
      );
    }

    function QuotaMeter() {
      const t = boundT;
      const state = React.useSyncExternalStore(store.subscribe, store.getState);
      const [open, setOpen] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const rootRef = React.useRef(null);
      const btnRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const frameRef = React.useRef(0);

      const data = state.data;
      const chip = summary(data);
      const stale = state.error !== null && data !== null;
      // No reading yet and no failure: stay out of the dock, like the shipped
      // context meter, instead of reserving space for a placeholder.
      const failed = state.error !== null && data === null;
      const baseAria = failed
        ? describeError(t, state.error)
        : chip || t('triggerAriaUnknown');

      function reposition() {
        const el = btnRef.current;
        if (el === null || typeof window === 'undefined') return;
        const rect = el.getBoundingClientRect();
        const width = Math.max(240, Math.min(360, window.innerWidth - 16));
        const margin = 8;
        const gap = 8;
        const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin));
        const spaceAbove = rect.top - gap - margin;
        const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
        if (spaceAbove >= 220 || spaceAbove >= spaceBelow) {
          setPos({ mode: 'up', left, width, bottom: Math.max(margin, window.innerHeight - rect.top + gap), maxHeight: Math.max(80, spaceAbove) });
        } else {
          setPos({ mode: 'down', left, width, top: rect.bottom + gap, maxHeight: Math.max(80, spaceBelow) });
        }
      }

      /** Coalesce scroll/resize into one layout read per animation frame. */
      function scheduleReposition() {
        if (frameRef.current !== 0) return;
        frameRef.current = requestAnimationFrame(() => { frameRef.current = 0; reposition(); });
      }

      // Anchor + focus + scroll tracking while open. The composer grows while
      // the user types or adds attachments without any scroll or window resize,
      // so the trigger is also observed directly.
      React.useLayoutEffect(() => {
        if (!open) return undefined;
        reposition();
        panelRef.current?.focus?.();
        window.addEventListener('resize', scheduleReposition);
        window.addEventListener('scroll', scheduleReposition, { capture: true, passive: true });
        let observer = null;
        if (typeof ResizeObserver === 'function' && btnRef.current !== null) {
          observer = new ResizeObserver(scheduleReposition);
          observer.observe(btnRef.current);
        }
        return () => {
          window.removeEventListener('resize', scheduleReposition);
          window.removeEventListener('scroll', scheduleReposition, { capture: true, passive: true });
          observer?.disconnect();
          if (frameRef.current !== 0) { cancelAnimationFrame(frameRef.current); frameRef.current = 0; }
        };
      }, [open]);

      // Refresh on open; dismiss on outside pointer / Escape. Focus returns to
      // the trigger so keyboard users are not dropped on the document body.
      React.useEffect(() => {
        if (!open) return undefined;
        store.refresh();
        const onPointerDown = event => {
          if (panelRef.current?.contains(event.target)) return;
          if (rootRef.current?.contains(event.target)) return;
          setOpen(false);
        };
        const onKeyDown = event => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown);
          btnRef.current?.focus?.();
        };
      }, [open]);

      const body = [];
      if (state.error !== null) {
        // The message is the live region; the Retry button sits beside it so
        // the alert does not wrap an interactive control.
        body.push(h('div', { key: 'error', className: 'dsh-mq-error' },
          h('span', { className: 'dsh-mq-errtext', role: 'alert' }, describeError(t, state.error)),
          h('button', { type: 'button', className: 'dsh-mq-retry', onClick: () => store.refresh() }, t('retry')),
        ));
      }
      if (data === null) {
        if (state.error === null) body.push(h('div', { key: 'loading', className: 'dsh-mq-status' }, t('loading')));
      } else if (data.accounts.length === 0) {
        body.push(h('div', { key: 'empty', className: 'dsh-mq-status' }, t('empty')));
      } else {
        data.accounts.forEach((account, index) => {
          body.push(h(AccountBlock, { key: `${index}:${account.id}`, account, t }));
        });
      }

      const updated = data && data.fetchedAt ? formatTime(data.fetchedAt) : '';
      const panelStyle = pos === null ? undefined : (pos.mode === 'down'
        ? { left: `${pos.left}px`, top: `${pos.top}px`, width: `${pos.width}px`, maxHeight: `${pos.maxHeight}px`, bottom: 'auto' }
        : { left: `${pos.left}px`, bottom: `${pos.bottom}px`, width: `${pos.width}px`, maxHeight: `${pos.maxHeight}px` });

      const panel = h('div', {
        ref: panelRef, id: PANEL_ID, className: 'dsh-mq-panel', role: 'dialog', tabIndex: -1, 'aria-label': t('title'), style: panelStyle,
      },
        h('div', { className: 'dsh-mq-head' },
          h('span', { className: 'dsh-mq-title' }, t('title')),
          updated !== '' ? h('span', { className: 'dsh-mq-updated' }, fill(t('updated'), { time: updated })) : null,
          h('span', { className: 'dsh-mq-actions' },
            h('button', { type: 'button', className: 'dsh-mq-iconbtn', title: t('refresh'), 'aria-label': t('refresh'), onClick: () => store.refresh() },
              h('span', { className: state.status === 'loading' ? 'dsh-mq-spin' : undefined, 'aria-hidden': 'true' }, '⟳')),
            h('button', { type: 'button', className: 'dsh-mq-iconbtn', title: t('close'), 'aria-label': t('close'), onClick: () => setOpen(false) }, '×'),
          ),
        ),
        body,
      );

      return h('span', { ref: rootRef, className: 'dsh-mq-root' },
        h('span', { className: 'dsh-mq-btnwrap' },
          h('button', {
            ref: btnRef, type: 'button', className: 'dsh-mq-trigger',
            title: stale ? baseAria + t('staleSuffix') : baseAria,
            'aria-label': stale ? baseAria + t('staleSuffix') : baseAria,
            'aria-haspopup': 'dialog', 'aria-expanded': open,
            'aria-controls': open ? PANEL_ID : undefined,
            'data-stale': stale ? '1' : undefined,
            // A failed read has no reading to show; mark it so the chip can
            // signal the problem instead of showing a meaningless "—".
            'data-failed': failed ? '1' : undefined,
            onClick: () => setOpen(value => !value),
          },
            h('span', { className: 'dsh-mq-pct' }, failed ? t('failedChip') : chip || '—'),
          ),
        ),
        open ? (createPortal ? createPortal(panel, document.body) : panel) : null,
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // A reload can re-enter apply before the previous dictionary disposer
        // runs; keep the second mount harmless instead of failing the plugin.
        ctx.effect(() => {
          try { return ctx.locale.register(NS, DICT); }
          catch { return () => {}; }
        });
        // Inject the stylesheet once per document rather than once per mounted
        // composer, so split/multi-composer layouts do not stack <style> tags.
        if (typeof document !== 'undefined' && document.head) {
          ctx.effect(() => {
            const el = document.createElement('style');
            el.setAttribute('data-dsh-magpie-quota', '1');
            el.textContent = STYLE;
            document.head.appendChild(el);
            return () => { el.parentNode?.removeChild(el); };
          });
        }
        boundT = ctx.locale.bind(NS);
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'magpie-quota',
          order: 4,
          locale: NS,
        }, QuotaMeter));
      },
      /** Pure helpers exposed for offline logic tests; the Loader ignores extra exports. */
      _internals: {
        fill,
        normalize,
        summary,
        reading,
        usableSharePct,
        remainingAmountOf,
        levelOf,
        describeError,
        pickTotal,
        pickModel,
        usedPercentOf,
        figuresOf,
      },
    };
  },
});
