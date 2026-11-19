// Offline check for the composer dock reading: it must express the usable share
// of ALL account quota (weighted by each account's own limit), not the lowest
// single account and not the current session's account.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'client.js'), 'utf8');

let factory;
const sandboxWindow = {
  __ModuleLoader__: { load: ({ factory: f }) => { factory = f; } },
  addEventListener() {},
  removeEventListener() {},
};
const documentStub = {
  baseURI: 'http://127.0.0.1:9258/',
  head: null,
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
};

new Function('window', 'document', 'fetch', source)(
  sandboxWindow,
  documentStub,
  () => Promise.reject(new Error('network disabled in test')),
);

const mod = factory((id) => {
  if (id === 'react') {
    return {
      createElement: () => null,
      useState: () => [false, () => {}],
      useEffect() {},
      useLayoutEffect() {},
      useRef: () => ({ current: null }),
      useSyncExternalStore: () => ({ status: 'idle', data: null, error: null, fetchedAt: null }),
    };
  }
  if (id === 'react-dom') return {};
  throw new Error(`unexpected require: ${id}`);
});

const { usableSharePct, normalize } = mod._internals;

// --- same shape as GET {baseUrl}/v1/magpie/quotas, with placeholder labels ---
const live = {
  data: [
    {
      provider: 'account-1', name: 'AI account 1', plan: 'Free plan', user: '用户 A',
      windows: [
        { name: 'Credits', used: 100, remaining: 0, display: '500 / 500', amount: 500, limit: 500, unit: 'credits' },
        { name: 'Extra credits', used: 82.44, remaining: 17.56, display: '3325.81 / 4034', amount: 3325.81, limit: 4034, unit: 'credits' },
        { name: 'Total credits', used: 84.38, remaining: 15.62, display: '3825.81 / 4534', amount: 3825.81, limit: 4534, unit: 'credits' },
      ],
    },
    {
      provider: 'account-2', name: 'AI account 2', plan: 'Free plan', user: 'a***@example.com',
      windows: [{ name: 'Credits', used: 32.26, remaining: 67.74, display: '32.26 / 100', amount: 32.26, limit: 100, unit: 'credits' }],
    },
    {
      provider: 'account-3', name: 'AI account 3', plan: 'Credits', user: '用户 C',
      windows: [{ name: 'Credits', used: 20.82, remaining: 79.18, display: '541.25 / 2600', amount: 541.25, limit: 2600, unit: 'credits' }],
    },
    {
      provider: 'account-4', name: 'AI account 4', plan: 'Credits', user: '用户 D',
      windows: [{ name: 'Credits', used: 0.23, remaining: 99.77, display: '4.93 / 2100', amount: 4.93, limit: 2100, unit: 'credits' }],
    },
  ],
};

const data = normalize(live);
const got = usableSharePct(data);

// Expected: Σ(limit - amount) / Σ limit over all four accounts.
const totals = [
  [4534, 3825.81],
  [100, 32.26],
  [2600, 541.25],
  [2100, 4.93],
];
const limitSum = totals.reduce((a, [l]) => a + l, 0);
const remainSum = totals.reduce((a, [l, u]) => a + (l - u), 0);
const want = remainSum / limitSum * 100;

const rounded = Math.round(got);
const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

check('uses all four accounts', data.accounts.length === 4, `accounts=${data.accounts.length}`);
check('equals Σremaining / Σlimit', Math.abs(got - want) < 1e-9, `got=${got.toFixed(4)} want=${want.toFixed(4)}`);
check('not the lowest single account (15.62%)', rounded !== 16, `rounded=${rounded}%`);
check('not the best single account (99.77%)', rounded !== 100, `rounded=${rounded}%`);
check('limit-weighted, so the big pool dominates', rounded >= 40 && rounded <= 60, `rounded=${rounded}%`);
check('in range 0..100', got >= 0 && got <= 100, `${got.toFixed(2)}`);

// Expired accounts must not contribute.
const withExpired = normalize({
  data: [...live.data, {
    provider: 'dead', name: 'Dead', windows: [{ name: 'Total', amount: 999, limit: 1000, unit: 'credits' }],
    until: '2020-01-01T00:00:00Z',
  }],
});
check('expired account excluded', Math.abs(usableSharePct(withExpired) - got) < 1e-9,
  `withExpired=${usableSharePct(withExpired).toFixed(4)}`);

// No numeric limit anywhere -> unweighted mean of remaining percentages.
const pctOnly = normalize({ data: [{ provider: 'a', name: 'A', windows: [{ name: 'Total', remaining: 80 }] }, { provider: 'b', name: 'B', windows: [{ name: 'Total', remaining: 40 }] }] });
check('percentage fallback averages', Math.abs(usableSharePct(pctOnly) - 60) < 1e-9, `${usableSharePct(pctOnly)}`);

check('empty payload -> null', usableSharePct(normalize({ data: [] })) === null, 'null');

const failed = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
console.log(`\nreading = ${rounded}%  (${got.toFixed(2)}%)`);
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `${failed.length} CHECK(S) FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
