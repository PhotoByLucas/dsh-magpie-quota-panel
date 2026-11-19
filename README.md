# DSH Magpie Quota Panel

在 DeepSeek Harness 输入框下方查看 Magpie 订阅的剩余额度。点击状态行可查看各账号的额度窗口与重置时间；不同单位不混算。

## 使用

1. 克隆本仓库，在 DSH 的插件管理页添加该本地目录并启用。DSH 的安装环境需要可用的 pnpm。
2. 启动 Magpie，并在 Magpie 登录要查看的订阅。默认网关为 `http://127.0.0.1:3425`。
3. 打开 DSH 会话，点击输入框下方的额度读数。该功能不要求当前模型走 Magpie。

## 读数说明

- Codex：分别显示 5 小时和 7 天窗口的剩余比例；弹层显示各窗口重置时间（如有）。
- WorkBuddy：显示剩余积分及可用的模型限额，不把积分和 Codex 窗口混算。
- 其他订阅：弹层按 Magpie 返回的窗口名展示。状态行最多预览两个未过期账号，其余用 `+N` 表示。未知读数显示 `—`。

这些数据来自 Magpie 的 `/v1/magpie/quotas`，不是 DSH 自行计量。没有出现在该接口中的订阅不会显示。当前版本不支持为额度接口配置认证密钥；不要因此关闭对外网关的鉴权。

## 配置

| 字段 | 默认值 | 用途 |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:3425` | Magpie 网关根地址 |
| `timeoutMs` | `8000` | 读取超时（毫秒） |

## 来源与许可

基于 [Canvai1337/dsh-magpie-quota](https://github.com/Canvai1337/dsh-magpie-quota) 的 `be281ec` 独立维护。原作者版权保留，见 [MIT 许可证](LICENSE)。
