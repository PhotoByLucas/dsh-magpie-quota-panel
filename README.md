# DSH Magpie Quota Panel

[English](README.en.md)

在 DeepSeek Harness（DSH）的会话输入框下方查看 Magpie 提供的订阅额度。**面板不限定服务商或订阅计划**：只要 Magpie 的额度接口返回了账号及其额度窗口，就能在面板中查看，无需为每个计划单独安装或配置插件。插件只读，不修改账号、订阅或模型路由。

## 安装

**前置条件：**DSH Web、DSH 宿主进程可调用的 `pnpm`，以及正在运行的 Magpie。要查看哪些账号的额度，请先在 Magpie 中配置这些账号。

```bash
git clone https://github.com/PhotoByLucas/dsh-magpie-quota-panel.git
```

在 DSH 的插件管理页添加克隆后的本地目录，并在当前 profile 启用插件。打开任意会话，点击输入框下方的额度读数。当前会话的模型无需经过 Magpie。

## 支持范围与读数

点击状态行打开面板。面板按账号展示 Magpie 返回的额度窗口，保留窗口名称和可用的重置时间。例如，Codex 可以显示 5 小时和 7 天窗口，WorkBuddy 可以显示总积分和一个模型限额；**这两个是展示示例，不是支持清单**。没有专用布局的计划也可以显示，面板按 Magpie 返回的窗口逐项列出。

状态行最多预览两个未过期账号，`+N` 表示还有其他账号。Codex 和 WorkBuddy 有专用的简短读数；其他账号在状态行显示名称，详细读数在面板中查看。百分比表示剩余比例，未知读数显示为 `—`。不同订阅的积分、百分比和 token 限额不合并计算。

## 配置与数据来源

DSH 宿主向 Magpie 网关请求 `GET /v1/magpie/quotas`，浏览器通过 DSH 的同源接口读取结果。**能在 Magpie 中调用某个模型，不代表 Magpie 能查询该账号的额度。** 若接口没有返回某个账号或额度窗口，插件不会显示或估算该项数据。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:3425` | Magpie 网关根地址，不包含 `/v1`。 |
| `timeoutMs` | `8000` | 查询超时，单位为毫秒。 |

当前版本不支持为额度请求配置认证密钥。请使用本机网关；不要为了使用本插件而关闭对外网关的鉴权。

## 常见问题

- **安装报 `spawn pnpm ENOENT`：**确认启动 DSH 的环境能找到 `pnpm`。终端可运行 `pnpm` 并不意味着后台宿主也可以。
- **某个订阅不显示或读数为 `—`：**先在 Magpie 检查该账号是否已配置、额度是否可查。若所有读数都失败，再检查 DSH 宿主能否访问网关。
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
