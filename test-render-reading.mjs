import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'client.js'), 'utf8');

const LIVE = { data: [
  { provider: 'codex', windows: [{ name: '5 hours', remaining: 42 }, { name: '7 days', remaining: 47 }, { name: 'Image generation', remaining: 100, display: 'Unknown' }] },
  { provider: 'workbuddy', windows: [{ name: 'Total credits', unit: 'credits', amount: 3.86, limit: 800, remaining: 99.5175 }] },
  { provider: 'new', name: 'New provider', windows: [{ name: 'Daily', remaining: 25 }] },
] };

let factory;
new Function('window', 'document', 'fetch', source)(
  {
    __ModuleLoader__: { load: ({ factory: f }) => { factory = f; } },
    addEventListener() {}, removeEventListener() {},
  },
  {
    baseURI: 'http://127.0.0.1:9258/', head: null, visibilityState: 'visible',
    addEventListener() {}, removeEventListener() {},
  },
  // Same-origin Host route answer, as the browser would receive it.
  async () => ({ ok: true, status: 200, json: async () => LIVE }),
);

const el = (type, props, ...children) => ({
  type,
  props: props ?? {},
  children: children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false),
});
const React = {
  createElement: el,
  useState: init => [typeof init === 'function' ? init() : init, () => {}],
  useEffect() {},
  useLayoutEffect() {},
  useRef: () => ({ current: null }),
  // Keep the real store alive by subscribing, then read its live snapshot.
  useSyncExternalStore: (subscribe, getState) => { subscribe(() => {}); return getState(); },
};

const mod = factory(id => {
  if (id === 'react') return React;
  if (id === 'react-dom') return {};
  throw new Error(`unexpected require: ${id}`);
});

let Meter;
let dict = {};
mod.apply({
  effect: fn => fn(),
  // Mirror the real locale service: keep the registered dictionary and let the
  // bound translator resolve keys against the zh entry, so the aria label is
  // checked as users actually see it.
  locale: {
    register: (_ns, entries) => { dict = entries; return () => {}; },
    bind: () => key => (dict.zh && dict.zh[key] !== undefined ? dict.zh[key] : key),
  },
  slots: { inject: (_slot, register) => register(), register: (_slot, component) => { Meter = component; } },
});

// First render mounts the subscriber and starts the deduped fetch.
Meter();
await new Promise(resolve => setTimeout(resolve, 100));
const tree = Meter();

const wrap = tree.children.find(c => c && c.props && c.props.className === 'dsh-mq-btnwrap');
const button = wrap.children.find(c => c && c.type === 'button');
const textEl = button.children.find(c => c?.props?.className === 'dsh-mq-pct');
const expected = 'Codex 5h 42% · 7d 47% | WB 99.5% | +1';
if (textEl.children.join('') !== expected || button.props['aria-label'] !== expected) throw new Error('Incorrect subscription summary');
const { normalize, reading } = mod._internals;
const accounts = normalize(LIVE).accounts;
if (reading(accounts[0].windows[2]) !== undefined || reading(accounts[2].windows[0]) !== 25) throw new Error('Incorrect unknown or new provider reading');
console.log('PASS: per-subscription summary, unknown reading, additional provider');
process.exit(0);
