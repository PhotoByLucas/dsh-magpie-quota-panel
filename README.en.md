# DSH Magpie Quota Panel

[简体中文](README.md)

A DeepSeek Harness (DSH) Web plugin that displays remaining Magpie account quotas below the conversation composer. Click the status row to inspect individual quota windows and reset times. The plugin is read-only: it does not change accounts, subscriptions, or model routing.

## Installation

**Requirements:** DSH Web, `pnpm` available to the DSH host process, and a running Magpie gateway with the relevant accounts signed in.

```bash
git clone https://github.com/PhotoByLucas/dsh-magpie-quota-panel.git
```

Add the cloned directory in the DSH plugin manager and enable it for the active profile. Open a conversation and click the quota reading below the composer. The current model does not have to use Magpie.

## Reading the panel

| Account type | Display |
| --- | --- |
| Codex | Separate **remaining percentages** for the 5-hour and 7-day windows, with reset times when available. |
| WorkBuddy | Remaining credits and an available model limit. |
| Other subscriptions | Quota windows with the labels returned by Magpie. |

The status row previews up to two non-expired accounts; `+N` indicates more accounts in the panel. Unknown readings appear as `—`. Credits, percentages, and token limits are not combined across subscriptions.

## Configuration and data source

The DSH host reads `GET /v1/magpie/quotas` from the Magpie gateway. The browser reads the result from a same-origin DSH endpoint. Values reflect Magpie's response; accounts absent from that response cannot be displayed.

| Option | Default | Description |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:3425` | Magpie gateway root URL, without `/v1`. |
| `timeoutMs` | `8000` | Request timeout in milliseconds. |

This version does not support credentials for quota requests. Use a local gateway; do not disable authentication on an externally exposed gateway for this plugin.

## Troubleshooting

- **`spawn pnpm ENOENT`:** Ensure `pnpm` is on the DSH host's `PATH`, not just your terminal's.
- **Missing readings or request errors:** Check that Magpie is running and reachable from the DSH host. If only one account or window is missing, check its quota status in Magpie first.
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
