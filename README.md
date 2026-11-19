# DSH Magpie Quota Panel

[English](README.en.md)

DSH Magpie Quota Panel 是一个 DeepSeek Harness（DSH）Web 插件，用于在会话输入框下方查看 Magpie 账号的剩余额度。点击状态行可展开各账号的额度窗口和重置时间。插件只读取额度，不修改账号、订阅或模型路由。

## 安装

**前置条件：**DSH Web、DSH 宿主进程可调用的 `pnpm`，以及正在运行且已登录相关账号的 Magpie。

```bash
 git clone https://github.com/PhotoByLucas/dsh-magpie-quota-panel.git
```

在 DSH 的插件管理页添加克隆后的本地目录，并在当前 profile 启用插件。打开任意会话，在输入框下方点击额度读数。当前会话的模型无需经过 Magpie。

## 如何解读额度

| 账号类型 | 展示内容 |
| --- | --- |
| Codex | 5 小时和 7 天窗口各自的**剩余比例**，以及可用的重置时间。 |
| WorkBuddy | 剩余积分和可用的模型限额。 |
| 其他订阅 | 按 Magpie 返回的窗口名称展示。 |

状态行最多预览两个未过期账号；`+N` 表示还有其他账号可在面板中查看。未知读数显示为 `—`。不同订阅的积分、百分比和 token 限额不合并计算。

## 配置与数据来源

DSH 宿主向 Magpie 网关请求 `GET /v1/magpie/quotas`。浏览器通过 DSH 的同源接口读取结果。额度以 Magpie 返回的数据为准；该接口未返回的订阅不会显示。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:3425` | Magpie 网关根地址，不包含 `/v1`。 |
| `timeoutMs` | `8000` | 查询超时，单位为毫秒。 |

当前版本不支持为额度请求配置认证密钥。请使用本机网关；不要为了使用本插件而关闭对外网关的鉴权。

## 常见问题

- **安装报 `spawn pnpm ENOENT`：**确认启动 DSH 的环境能找到 `pnpm`。终端可运行 `pnpm` 并不意味着后台宿主也可以。
- **状态行显示 `—` 或读取失败：**确认 Magpie 正在运行，且 DSH 宿主能访问配置的网关。若只有某个账号或窗口没有读数，请先在 Magpie 检查该订阅的额度状态。
- **插件已启用，但会话没有读数入口：**刷新 DSH 页面，确认当前会话使用的是已启用插件的 profile。

## 开发与测试

在仓库根目录运行：

```bash
node test-render-reading.mjs
node test-usable-share.mjs
```

报告问题时请附 DSH、Magpie 和插件版本，以及脱敏后的错误信息。请勿提交令牌、账号标识或原始额度接口响应。

## 来源与许可

本项目基于 [Canvai1337/dsh-magpie-quota](https://github.com/Canvai1337/dsh-magpie-quota) 的 `be281ec` 独立维护，保留原作者版权声明，按 [MIT 许可证](LICENSE) 分发。此项目不是 DeepSeek 或 Magpie 的官方插件。
