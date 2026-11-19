# DSH Magpie Quota Panel

[简体中文](README.md)

View Magpie subscription quotas below the DeepSeek Harness (DSH) conversation composer. **The panel is not limited to particular providers or plans.** If Magpie's quota endpoint returns an account and its quota windows, the panel can display them without per-plan setup in DSH. The plugin is read-only: it does not change accounts, subscriptions, or model routing.

## Installation

**Requirements:** DSH Web, `pnpm` available to the DSH host process, and a running Magpie gateway. Configure the accounts you want to monitor in Magpie first.

```bash
git clone https://github.com/PhotoByLucas/dsh-magpie-quota-panel.git
```

Add the cloned directory in the DSH plugin manager and enable it for the active profile. Open a conversation and click the quota reading below the composer. The current model does not have to use Magpie.

## Coverage and readings

Open the panel from the status row to see per-account quota windows, their original labels, and reset times when provided. For example, Codex can show separate 5-hour and 7-day windows, and WorkBuddy can show total credits and one model limit. **These are examples, not a compatibility list.** Plans without a dedicated layout use the quota windows returned by Magpie.

The status row previews up to two non-expired accounts; `+N` indicates more accounts. Codex and WorkBuddy have compact summaries. Other accounts appear by name in the status row, with quota values in the expanded panel. Percentages indicate the remaining share. Unknown readings appear as `—`. Credits, percentages, and token limits are not combined across subscriptions.

## Configuration and data source

The DSH host reads `GET /v1/magpie/quotas` from Magpie. The browser reads the result from a same-origin DSH endpoint. **Model availability in Magpie does not guarantee quota availability.** If Magpie omits an account or quota window, the plugin does not display or estimate it.

| Option | Default | Description |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:3425` | Magpie gateway root URL, without `/v1`. |
| `timeoutMs` | `8000` | Request timeout in milliseconds. |

This version does not support credentials for quota requests. Use a local gateway; do not disable authentication on an externally exposed gateway for this plugin.

## Troubleshooting

- **`spawn pnpm ENOENT`:** Ensure `pnpm` is on the DSH host's `PATH`, not just your terminal's.
- **Missing account or `—` reading:** Check whether the account is configured and its quota is available in Magpie. If all readings fail, check that the gateway is reachable from the DSH host.
- **No status-row entry:** Refresh DSH and confirm the plugin is enabled for the active profile.

## Development and testing

Run from the repository root:

```bash
node test-render-reading.mjs
node test-usable-share.mjs
```

When reporting an issue, include the DSH, Magpie, and plugin versions and a redacted error message. Do not share tokens, account identifiers, or raw quota responses.

## Attribution and license

Independently maintained from [Canvai1337/dsh-magpie-quota](https://github.com/Canvai1337/dsh-magpie-quota) at `be281ec`. The original copyright notice is retained under the [MIT License](LICENSE). This is not an official DeepSeek or Magpie plugin.
