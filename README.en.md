# DSH Magpie Quota Panel

[中文](README.md)

See your remaining Magpie subscription quotas below the DeepSeek Harness composer. Open the panel for per-account windows and reset times. Different quota units are never combined.

1. Clone this repository and add its local directory in the DSH plugin manager. The DSH host needs `pnpm` on its PATH.
2. Run Magpie and sign in to the subscriptions you want to monitor. The default gateway is `http://127.0.0.1:3425`.
3. Open a DSH conversation and click the quota reading under the composer. Your current model does not have to use Magpie.

Codex shows 5-hour and 7-day windows separately. WorkBuddy shows remaining credits and an available model limit. Other providers keep the window labels returned by Magpie. The composer previews at most two active accounts; `+N` indicates more. Unknown readings appear as `—`.

The plugin reads `/v1/magpie/quotas`. It cannot show accounts missing from that endpoint, and this version does not support authenticated quota requests. Keep authentication enabled on any externally exposed gateway. The plugin configuration accepts `baseUrl` (default `http://127.0.0.1:3425`) and `timeoutMs` (default `8000`).

Independently maintained from [Canvai1337/dsh-magpie-quota](https://github.com/Canvai1337/dsh-magpie-quota) at `be281ec`. Original copyright is retained under the [MIT license](LICENSE).
