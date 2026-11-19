# DSH Magpie Quota Panel

[简体中文](README.md)

View Magpie account quotas, balances, and reset times from a DeepSeek Harness (DSH) Web conversation. A status row below the composer opens the per-account panel. The panel works whether or not the current conversation uses a model routed through Magpie.

## Data coverage

The panel reads Magpie's `GET /v1/magpie/quotas` endpoint. It does not maintain a provider or plan allowlist. When a new account and its quota windows appear in the response, they are available in the panel without additional DSH plugin configuration. Available windows, units, and reset times depend on Magpie and the upstream provider. **Model access does not imply quota access.**

| Data type | How it appears |
| --- | --- |
| Rolling or periodic quota | One row per window, with a reset time when supplied. |
| Credit balance | Remaining percentage and, when enough data is available, remaining credits and the limit. |
| Model limit | A separate named window, not part of the account balance. |
| Unknown reading | `—`, rather than an assumed full or exhausted allowance. |

The status row previews up to two non-expired accounts. `+N` indicates additional accounts. The default preview shows the account name; open the panel for its quota values. Some providers have compact summaries: Codex shows its separate 5-hour and 7-day windows, and WorkBuddy shows its credit balance with up to one model limit in the expanded panel. The panel never combines different quota windows and units into a single percentage.

## Installation and use

**Requirements:** a running DSH Web instance, `pnpm` on the DSH host process's `PATH`, and a Magpie gateway reachable from that host. Configure the accounts you want to monitor in Magpie first.

1. Clone the repository to a directory you intend to keep:
   ```bash
   git clone https://github.com/PhotoByLucas/dsh-magpie-quota-panel.git
   ```
2. Add the cloned directory in the DSH plugin manager and enable it for the active profile. Keep the directory in place while DSH references it.
3. Open a conversation and click the quota entry below the composer. If the original quota plugin is also installed, disable it to avoid duplicate entries.

## Configuration

These options belong to the `magpie-quota` plugin entry's `config`. No overrides are needed for a local Magpie gateway on its default port.

| Option | Default | Description |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:3425` | HTTP(S) gateway root URL reachable from the **DSH host**. Omit `/v1` and `/v1/magpie/quotas`. |
| `timeoutMs` | `8000` | Per-request timeout in milliseconds. Accepts integers from `500` to `60000`. |

## Data flow and deployment

The browser reads a same-origin DSH endpoint; the DSH host requests quota data from Magpie. While mounted, the panel refreshes approximately every 60 seconds. Opening the panel or returning to the page also triggers a refresh. If a refresh fails, previously loaded values are marked as stale.

This version does not attach credentials to Magpie quota requests. Use a loopback gateway where possible. If your quota endpoint requires authentication, keep that protection in place rather than disabling it for the panel. Quota responses may include account identifiers; do not attach raw responses to public issues.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Installation fails with `spawn pnpm ENOENT` | Check the `PATH` of the process that launches DSH, not just your interactive shell. |
| No quota entry in the conversation | Confirm the plugin is enabled in the active profile, then refresh the page. |
| All readings are unavailable | Check that Magpie is running and that the quota endpoint is reachable from the DSH host and does not require authentication. |
| One account or window is missing | Check its quota in Magpie first. The panel does not estimate windows absent from Magpie's response. |

## Development and feedback

Run the local regression checks from the repository root:

```bash
node test-render-reading.mjs
node test-usable-share.mjs
```

When reporting a problem, include the DSH, Magpie, and plugin versions, steps to reproduce, and redacted expected and actual readings. Do not include access tokens, account identifiers, or unredacted logs.

## Attribution and license

Independently maintained from [Canvai1337/dsh-magpie-quota](https://github.com/Canvai1337/dsh-magpie-quota/tree/be281ec). The original copyright notice is retained under the [MIT License](LICENSE). This is not an official DeepSeek or Magpie plugin.
