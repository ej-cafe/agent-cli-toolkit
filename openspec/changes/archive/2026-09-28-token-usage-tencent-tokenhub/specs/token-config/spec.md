## MODIFIED Requirements

### Requirement: 查询套餐余量

系统必须提供 `agent-cli token usage`，按 **token profile** 查询云平台套餐余量或账户余额，并分别展示。

命令必须接受可选标志 `--name <profile>`，以及可选标志 `--output <table|text|raw>`。省略 `--output` 时必须视为 `table`。**不得**接受 `--platform`；若传入 `--platform`（无论取值），必须拒绝、不发起查询，向 stderr 说明 usage 已取消该标志，并以非 0 退出码结束。`--output` 的取值若不是 `table`、`text` 或 `raw`，必须拒绝、不发起查询，并以非 0 退出码结束。不得接受额外位置参数；若传入多余参数，必须向 stderr 输出错误并以非 0 退出码结束。

目标 profile 选择：

- 若提供 `--name`：目标为该名称的一套 profile。若名称不存在，必须拒绝、不发起查询，并以非 0 退出码结束。
- 若未提供 `--name`：目标为已保存的全部 profile，按名称排序逐套查询。若尚无任何 profile，必须向 stdout 提示暂无 profile，并以退出码 0 结束（不发起查询）。

对每个目标 profile，系统必须按其 `platform` 查询。成功结果按 profile 分段写入 stdout：每段以一行开头，必须能区分该 profile 的名称与 `platform`；段内是该套的余量或余额。相邻两个成功段之间必须恰好有一个空行。仅一段时不得在段后多加空行。各套独立成败（尽力而为）：某套失败时向 stderr 输出带该 profile 名称的错误，并继续后续目标；相邻两个 stderr 错误输出之间必须恰好有一个空行，仅一段时不得在段后多出空行；若至少一个目标查询成功，必须以退出码 0 结束；若有目标但全部失败，必须以非 0 退出码结束。

`--output table`（含省略该标志）时，段内必须是命令行表格：一行表头、其后为数据行，列按空格对齐，不得使用 Markdown 表格。缺字段的单元格必须为 `-`。列按平台固定：

- `aliyun`：`窗口`、`已用`、`重置时间`（有用量窗口时每窗口一行；已用为百分比文本）。
- `deepseek`：`币种`、`总额`、`赠送`、`充值`（`balance_infos` 中每个币种一行）。同一段必须另外写出是否可用于 API 调用（`is_available` 或等价信息，若响应中存在）。
- `kimi`：`项目`、`金额`。数据行至少覆盖响应中存在的 `available_balance`（可用余额）、`voucher_balance`（代金券）、`cash_balance`（现金）。
- `tencent`：`套餐`、`类型`、`状态`、`总额度`、`已用`、`当期额度`、`到期时间`（`DescribeTokenPlanList` 返回的每个套餐一行）。`类型` 必须写明单位与套餐类型：企业版专业套餐为 `专业套餐（积分）`，企业版轻享套餐为 `轻享套餐（token）`，无法判断单位时 `专业套餐` 之列缺省单元格用 `-`。

`--output text` 时，段内必须是可读文本行（标签与取值），信息不少于上表对应字段，但不得排成表格。

`--output raw` 时，段内必须是该次查询成功得到的原始响应对象的 JSON 文本（缩进可读）：`aliyun` 为 `bl` 返回的根对象；`deepseek` 为 `GET …/user/balance` 响应根对象；`kimi` 为 `GET …/users/me/balance` 响应根对象（含 `code` / `data` 等，不得只输出已拆出的 `data`）；`tencent` 为 `DescribeTokenPlanList` 响应根对象（含 `TokenPlanSet` / `TotalCount`，不得只输出已拆出的 `TokenPlanSet`）。不得再套一层自定义 envelope。

`table`、`text`、`raw` 都不得打印完整 API Key、控制台 access token、cookie 或腾讯云 SecretKey（响应体本身若不含这些字段则无需改写）。

按平台的查询语义：

- `deepseek`：必须使用该 profile 的 `token` 作为 Bearer，对 `baseUrl`（去掉末尾 `/`）发起 `GET`，路径为该 `baseUrl` 加上 `/user/balance`，请求头带 `Authorization: Bearer <token>` 与 `Accept: application/json`。成功摘要至少包含是否可用于 API 调用以及各币种余额字段（若响应中存在）。不得打印完整 API Key。不得调用 `bl`。
- `kimi`：必须使用该 profile 的 `token` 作为 Bearer，对 `baseUrl`（去掉末尾 `/`）发起 `GET`，路径为该 `baseUrl` 加上 `/users/me/balance`。若 HTTP 失败，或响应根对象中 `code` 存在且不等于 `0`，或 `status` 为 `false`，或缺少含余额字段的 `data`，计为该套失败。成功摘要至少包含 `available_balance`、`voucher_balance`、`cash_balance`（若存在）。不得打印完整 API Key。不得调用 `bl`。
- `aliyun`：必须通过本机 PATH 上的 `bl` 执行 `bl usage token-plan --output json`（或等价 JSON 调用）。必须要求已完成控制台鉴权（`bl auth login --console`）；不得用该 profile 的百炼 API Key 冒充该查询凭据。成功时向 stdout 输出挂在该 profile 名下的余量摘要（含用量窗口与重置时间，若存在）。同一轮命令中若多个目标为 `aliyun`，`bl` 至多调用一次，各 aliyun profile 分别展示同一份摘要。`bl` 不可执行、无控制台登录态、或其它非 0 / JSON 无法解析时，计为该套（及复用同一失败的其余 aliyun 目标）失败，并向 stderr 说明（缺 `bl` 时说明需安装 bailian-cli；无登录态时转述需 `bl auth login --console`）。
- `tencent`：必须通过腾讯云 TokenHub 官方 OpenAPI（`DescribeTokenPlanList`）查询该账户下的 TokenPlan 套餐列表及其主额度包。凭据必须只来自环境变量：`TENCENTCLOUD_SECRET_ID` 与 `TENCENTCLOUD_SECRET_KEY` 必须存在且非空，region 取 `TENCENTCLOUD_REGION`（缺失或为空时默认 `ap-guangzhou`）。不得使用该 profile 的 `token` 作为查询凭据，不得读取任何配置文件中的腾讯云密钥。发起请求前，必须校验该 profile 声明的 `productType`：仅 `enterprise`（企业版专业套餐）或 `enterprise-auto`（企业版轻享套餐）允许查询；`productType` 缺失（默认 `personal` 个人版）或为 `personal` 等其它取值时必须将该套计为失败、不发起任何请求，向 stderr 提示「个人版暂不支持查询」。若 `TENCENTCLOUD_SECRET_ID` 或 `TENCENTCLOUD_SECRET_KEY` 缺失或为空，必须将该套计为失败、不发起请求，向 stderr 说明需设置缺失的环境变量（并提示可前往 `https://console.cloud.tencent.com/tokenhub`）。若请求失败（网络错误、非 0 响应码、SDK 鉴权失败等），必须将该套计为失败，向 stderr 输出带该 profile 名称的错误。同一轮命令中若多个目标为 `tencent`，SDK 查询至多执行一次（同一份环境变量凭据），各 tencent profile 分别展示同一份结果。成功且 `TokenPlanSet` 非空时，每套至少展示各套餐的类型（含单位）、状态、总额度、已用、当期额度、到期时间（若存在）。成功但 `TokenPlanSet` 为空时，段内输出「未找到 TokenPlan 套餐」，仍计为该套成功。不得调用 `bl`。不得打印 SecretKey。
- `glm`：必须将该套计为失败，向 stderr 输出 `智谱 GLM 暂不支持 API 形式余额查询，请前往控制台查询。网址：https://bigmodel.cn/coding-plan/personal/usage`，不发起外部请求。

该命令不得修改 `token-profile.json` 或任何 agent 工具配置。

#### Scenario: 默认查询阿里云成功

- **WHEN** 已保存恰好一套 `aliyun` profile `work`，本机 PATH 有可用的 `bl` 且已完成 `bl auth login --console`，用户执行 `agent-cli token usage`（未给 `--name`，也未给 `--output`）
- **THEN** 系统对该 profile 查询阿里云百炼 Token Plan 余量，向 stdout 输出以 `work` 与 `aliyun` 开头的一段表格（表头含 `窗口`、`已用`、`重置时间`），并以退出码 0 结束

#### Scenario: 显式指定 aliyun

- **WHEN** 已保存 `aliyun` profile `work` 与其它平台 profile，本机 `bl` 可用且已控制台登录，用户执行 `agent-cli token usage --name work`
- **THEN** 系统只查询 `work`，向 stdout 输出其阿里云余量表格，并以退出码 0 结束

#### Scenario: 阿里云拒绝 --name

- **WHEN** 用户执行 `agent-cli token usage --platform aliyun`（或任意带 `--platform` 的 usage 调用）
- **THEN** 系统不发起查询，向 stderr 说明已取消 `--platform`，并以非 0 退出码结束

#### Scenario: 腾讯云唯一 profile 时查询成功

- **WHEN** 已保存恰好一套 `tencent` profile `tx`（`productType` 为 `enterprise`），环境变量 `TENCENTCLOUD_SECRET_ID` 与 `TENCENTCLOUD_SECRET_KEY` 已设置，用户执行 `agent-cli token usage`（或 `--name tx`），且 `DescribeTokenPlanList` 返回含一个以上套餐的 `TokenPlanSet`
- **THEN** 系统向 stdout 输出以 `tx` 与 `tencent` 开头的一段，其中含表头为 `套餐`、`类型`、`状态`、`总额度`、`已用`、`当期额度`、`到期时间` 的表格且每个套餐一行，不以 SecretKey 或该 profile 的 token 输出，并以退出码 0 结束

#### Scenario: 腾讯云多个 profile 共享一次查询

- **WHEN** 已保存两套 `tencent` profile `tx` 与 `tx2`（`productType` 均为 `enterprise`），环境变量凭据齐全，用户执行 `agent-cli token usage`（未给 `--name`），且 `DescribeTokenPlanList` 返回非空 `TokenPlanSet`
- **THEN** 系统按名称排序向 stdout 输出 `tx` 与 `tx2` 两段表格（两段之间恰好一个空行），SDK 查询只执行一次，并以退出码 0 结束

#### Scenario: 拒绝腾讯云

- **WHEN** 已保存一套 `tencent` profile `tx`，环境变量 `TENCENTCLOUD_SECRET_ID` 或 `TENCENTCLOUD_SECRET_KEY` 未设置或为空，用户执行 `agent-cli token usage --name tx`（本场景为腾讯云无法查询时的拒绝路径：openspec 的 MODIFIED 块须按名保留既有场景，腾讯云的成功及请求失败语义见本需求其它腾讯云场景）
- **THEN** 系统不发起任何外部请求，向 stderr 输出带 `tx`、写明需设置缺失的 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`（并可提示前往 `https://console.cloud.tencent.com/tokenhub`）的错误，并以非 0 退出码结束

#### Scenario: 腾讯云个人版暂不支持查询

- **WHEN** 已保存一套 `tencent` profile `tx`，其 `productType` 缺失或为 `enterprise` / `enterprise-auto` 之外的取值（如 `personal`），用户执行 `agent-cli token usage --name tx`
- **THEN** 系统不发起任何外部请求，向 stderr 输出带 `tx`、含「个人版暂不支持查询」的错误，并以非 0 退出码结束

#### Scenario: 腾讯云请求失败

- **WHEN** 已保存一套 `tencent` profile `tx`（`productType` 为 `enterprise`），环境变量凭据齐全，用户执行 `agent-cli token usage --name tx`，且 `DescribeTokenPlanList` 请求失败（网络错误、SDK 鉴权失败或其它非成功返回）
- **THEN** 系统向 stderr 输出带 `tx` 的错误，不把 SecretKey 打印到输出，并以非 0 退出码结束

#### Scenario: 腾讯云无套餐

- **WHEN** 已保存一套 `tencent` profile `tx`（`productType` 为 `enterprise`），环境变量凭据齐全，用户执行 `agent-cli token usage --name tx`，且 `DescribeTokenPlanList` 返回空 `TokenPlanSet`
- **THEN** 系统向 stdout 输出以 `tx` 与 `tencent` 开头、含「未找到 TokenPlan 套餐」的段，并以退出码 0 结束

#### Scenario: 腾讯云原始输出

- **WHEN** 已保存一套 `tencent` profile `tx`（`productType` 为 `enterprise`），环境变量凭据齐全，用户执行 `agent-cli token usage --name tx --output raw`，且 `DescribeTokenPlanList` 返回含 `TokenPlanSet` 与 `TotalCount` 的成功响应
- **THEN** 系统向 stdout 输出以 `tx` 与 `tencent` 开头的一段，段内为该响应根对象的 JSON（含 `TokenPlanSet`），并以退出码 0 结束

#### Scenario: token add 为腾讯云写入默认 productType

- **WHEN** 用户执行 `agent-cli token add --name tx --platform tencent --token SECRET --base-url https://example.test/v1`（未给 `--product-type`），且模型列表请求成功
- **THEN** 保存的 `tx` profile 的 `productType` 为 `personal`（个人版，`token usage` 对该 profile 提示「个人版暂不支持查询」）；若带 `--product-type enterprise` 或 `--product-type enterprise-auto` 则保存为该值；传其它取值时报错且不保存

#### Scenario: 拒绝 GLM

- **WHEN** 已保存 `glm` profile `zg`，用户执行 `agent-cli token usage --name zg`
- **THEN** 系统不发起外部查询，向 stderr 输出含「智谱 GLM 暂不支持 API 形式余额查询」与控制台网址 `https://bigmodel.cn/coding-plan/personal/usage` 的说明，并以非 0 退出码结束

#### Scenario: DeepSeek 唯一 profile 时查询余额成功

- **WHEN** 已保存恰好一套 `deepseek` profile `ds`（`baseUrl` 为 `https://api.deepseek.com`，`token` 为 `SECRET`），用户执行 `agent-cli token usage`（或 `--name ds`），且 `GET https://api.deepseek.com/user/balance` 返回含 `is_available` 与非空 `balance_infos` 的成功响应
- **THEN** 系统向 stdout 输出以 `ds` 与 `deepseek` 开头的一段，其中含可用状态，以及表头为 `币种`、`总额`、`赠送`、`充值` 的表格；不以完整 token 输出，并以退出码 0 结束

#### Scenario: DeepSeek 用 --name 指定 profile

- **WHEN** 已保存 `deepseek` profile `ds` 与 `ds2`，用户执行 `agent-cli token usage --name ds`，且对 `ds` 的 `{baseUrl}/user/balance` 返回成功余额响应
- **THEN** 系统只使用 `ds` 的凭据查询并输出摘要，不以 `ds2` 发起请求，并以退出码 0 结束

#### Scenario: 拒绝 DeepSeek

- **WHEN** 已保存两套 `deepseek` profile `ds` 与 `ds2`，用户执行 `agent-cli token usage`（未给 `--name`），且两者余额请求均失败
- **THEN** 系统向 stderr 分别输出两套失败原因，并以非 0 退出码结束

#### Scenario: DeepSeek --name 非 deepseek 平台时拒绝

- **WHEN** 已存在 `aliyun` profile `work`，用户执行 `agent-cli token usage --name missing`
- **THEN** 系统不发起查询，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: DeepSeek 余额请求失败

- **WHEN** 已保存一套 `deepseek` profile `ds`，用户执行 `agent-cli token usage --name ds`，且对该 profile 的 `{baseUrl}/user/balance` 请求失败
- **THEN** 系统向 stderr 输出带 `ds` 的错误，并以非 0 退出码结束

#### Scenario: Kimi 唯一 profile 时查询余额成功

- **WHEN** 已保存恰好一套 `kimi` profile `km`（`baseUrl` 为 `https://api.moonshot.cn/v1`，`token` 为 `SECRET`），用户执行 `agent-cli token usage`，且 `GET https://api.moonshot.cn/v1/users/me/balance` 返回 `code` 为 `0` 且 `data` 含余额字段的成功响应
- **THEN** 系统向 stdout 输出以 `km` 与 `kimi` 开头的一段表格（表头含 `项目`、`金额`，且含可用余额、代金券、现金），不以完整 token 输出，并以退出码 0 结束

#### Scenario: Kimi 用 --name 指定 profile

- **WHEN** 已保存 `kimi` profile `km` 与 `km2`，用户执行 `agent-cli token usage --name km`，且对 `km` 的 `{baseUrl}/users/me/balance` 返回成功余额响应
- **THEN** 系统只使用 `km` 查询并输出摘要，并以退出码 0 结束

#### Scenario: 拒绝 Kimi

- **WHEN** 已保存两套 `kimi` profile，用户执行 `agent-cli token usage`（未给 `--name`），且两者余额请求均失败
- **THEN** 系统向 stderr 分别输出失败原因，并以非 0 退出码结束

#### Scenario: Kimi --name 非 kimi 平台时拒绝

- **WHEN** 已存在 `kimi` profile `km` 与 `deepseek` profile `ds`，用户执行 `agent-cli token usage`（未给 `--name`），且两者余额请求均成功
- **THEN** 系统按名称排序向 stdout 输出两段表格，两段之间恰好一个空行，并以退出码 0 结束

#### Scenario: Kimi 余额请求失败

- **WHEN** 已保存一套 `kimi` profile `km`，用户执行 `agent-cli token usage --name km`，且余额请求失败或返回非成功 `code`
- **THEN** 系统向 stderr 输出带 `km` 的错误，并以非 0 退出码结束

#### Scenario: 拒绝未知平台

- **WHEN** 用户执行 `agent-cli token usage --platform aws`
- **THEN** 系统不发起查询，向 stderr 说明已取消 `--platform`，并以非 0 退出码结束

#### Scenario: 缺少 bl

- **WHEN** PATH 中没有可执行的 `bl`，已保存一套 `aliyun` profile `work` 且无其它可成功查询的 profile，用户执行 `agent-cli token usage`
- **THEN** 系统向 stderr 说明需安装 bailian-cli，并以非 0 退出码结束

#### Scenario: 未控制台登录

- **WHEN** 本机有 `bl` 但未完成控制台登录，已保存一套 `aliyun` profile 且无其它可成功查询的 profile，用户执行 `agent-cli token usage`
- **THEN** 系统向 stderr 提示执行 `bl auth login --console`，并以非 0 退出码结束

#### Scenario: 拒绝多余参数

- **WHEN** 用户执行 `agent-cli token usage extra`
- **THEN** 系统向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 文本输出

- **WHEN** 已保存恰好一套 `deepseek` profile `ds`，用户执行 `agent-cli token usage --output text`，且余额请求成功
- **THEN** 系统向 stdout 输出以 `ds` 开头的文本摘要（含可用状态与币种余额，且不是表格），并以退出码 0 结束

#### Scenario: 显式表格输出

- **WHEN** 条件与「默认查询阿里云成功」相同，用户执行 `agent-cli token usage --output table`
- **THEN** stdout 与省略 `--output` 时一样是阿里云余量表格，并以退出码 0 结束

#### Scenario: 原始输出

- **WHEN** 已保存恰好一套 `deepseek` profile `ds`，用户执行 `agent-cli token usage --output raw`，且 `GET …/user/balance` 返回含 `is_available` 与 `balance_infos` 的成功响应
- **THEN** 系统向 stdout 输出以 `ds` 与 `deepseek` 开头的一段，段内为该响应根对象的 JSON，并以退出码 0 结束

#### Scenario: 拒绝未知 output

- **WHEN** 用户执行 `agent-cli token usage --output csv`
- **THEN** 系统不发起查询，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 查询不改配置

- **WHEN** 用户执行 `agent-cli token usage`（无论成功或失败）
- **THEN** 系统不修改 `token-profile.json` 或任何 agent 工具配置

#### Scenario: 多 profile 部分失败仍成功

- **WHEN** 已保存 `aliyun` profile `work`（`bl` 不可用）与 `deepseek` profile `ds`（余额请求成功），用户执行 `agent-cli token usage`
- **THEN** 系统向 stderr 输出 `work` 的失败原因，向 stdout 输出 `ds` 的摘要，并以退出码 0 结束

#### Scenario: 暂无 profile

- **WHEN** 尚未保存任何 profile，用户执行 `agent-cli token usage`
- **THEN** 系统向 stdout 提示暂无 profile，并以退出码 0 结束

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`、`token sync-model-list`、`token usage`，并在 `use` 上说明 `--all`、`--tool` 和 `--model`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。必须说明 `--tool` 可指定 `claude-code`、`opencode`、`dsh`、`pi`。必须说明 `--model` 对 Claude Code、DeepSeek Harness（dsh）与 pi 有效。必须说明把 profile 应用到 pi 时会设置 `defaultProvider`（profile 名称）与 `defaultModel`（有 `--model` 时用该 id，否则用该 profile 模型列表第一项）。必须用显示名 DeepSeek Harness（dsh）称呼该工具，不得在帮助正文里只写 `dsh` 来指代它（`--tool` 的取值仍是 `dsh`）。必须说明配置目录或对应程序不存在的工具会被跳过，且不会因此创建该配置目录。必须说明 `sync-model-list` 可按 `--name` 同步单个 profile，可按 `--platform` 过滤，省略 `--name` 时同步全部目标 profile，且每个目标都用该 profile 自己的 `{baseUrl}/models`。必须说明 `--platform` 对 `add` / `sync-model-list` 可取 `aliyun`、`tencent`、`deepseek`、`kimi`、`glm`。必须说明 `token add` 可为 tencent 指定 `--product-type`（缺省 `personal` 个人版，`token usage` 暂不支持个人版查询，可设 `enterprise` 企业版专业套餐或 `enterprise-auto` 企业版轻享套餐）。必须说明 DeepSeek、Kimi 与 GLM 添加时可省略 `--base-url` / `--claude-base-url` 并使用官方预设，显式传入则覆盖；GLM 预设为中国站 Coding Plan。必须说明 `token usage` 按已保存 profile 分段查询套餐余量或账户余额并分别展示：aliyun 依赖本机 `bl` 的控制台登录；deepseek 与 kimi 使用各自 profile 的 token；tencent 查询 TokenHub 套餐余量、需要设置 `TENCENTCLOUD_SECRET_ID` 与 `TENCENTCLOUD_SECRET_KEY`（region 可用 `TENCENTCLOUD_REGION` 覆盖、默认 `ap-guangzhou`），凭据缺失时提示设置或前往 TokenHub 控制台；glm 暂不支持 API 查询、需前往控制台。成功段之间以空行分隔，失败段之间同样以空行分隔；省略 `--name` 时查询全部 profile，可用 `--name` 指定单套；必须说明 `--output` 可取 `table`、`text` 或 `raw`，省略时默认为表格。不得再说明 usage 接受或默认 `--platform`。不得再说明按平台共享 `model-list.json` 或同步腾讯云使用 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`。

#### Scenario: 帮助中出现 token 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 token 的 add、delete、list、use、sync-model-list、usage 命令

#### Scenario: 帮助说明 add 可问答

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token add` 可省略标志并在终端问答补齐

#### Scenario: 帮助说明 use 的模型标志

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 的 `--model` 对 Claude Code、DeepSeek Harness（dsh）与 pi 有效

#### Scenario: 帮助说明 pi 启动默认

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明应用到 pi 时会设置 `defaultProvider` 与 `defaultModel`；提供 `--model` 时使用该 id，否则使用 profile 模型列表第一项

#### Scenario: 帮助说明缺失工具会被跳过

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 在目标工具的配置目录或对应程序不存在时跳过该工具，且不创建该配置目录

#### Scenario: 帮助说明同步模型列表

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token sync-model-list` 可按 `--name` 同步单个 profile、可按 `--platform` 过滤、省略 `--name` 时同步全部目标，每个目标使用该 profile 的 `{baseUrl}/models`，且不含按平台 `model-list.json` 或 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`

#### Scenario: 帮助列出平台含 deepseek

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--platform` 可指定 `aliyun`、`tencent`、`deepseek`、`kimi`、`glm`

#### Scenario: 帮助说明 DeepSeek URL 预设

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 DeepSeek 可省略 base-url / claude-base-url 并使用预设，显式传入则覆盖

#### Scenario: 帮助说明 Kimi URL 预设

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 Kimi 可省略 base-url / claude-base-url 并使用中国站预设，显式传入则覆盖

#### Scenario: 帮助说明 GLM URL 预设

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 GLM 可省略 base-url / claude-base-url 并使用中国站 Coding Plan 预设，显式传入则覆盖

#### Scenario: 帮助列出 dsh

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出用显示名 DeepSeek Harness（dsh）称呼该工具，并说明 `--tool` 可指定 `dsh`

#### Scenario: 帮助列出 pi

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `pi`

#### Scenario: 帮助列出 usage

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token usage` 按 profile 分段展示余量、段间空行，可用 `--name` 指定 profile、`--output` 取 `table`（默认）、`text` 或 `raw`，且不将 `--platform` 作为 usage 的参数说明；说明 aliyun 依赖 `bl`、deepseek 与 kimi 使用 profile token、tencent 查询需 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`（可 `TENCENTCLOUD_REGION` 覆盖 region）；并说明智谱 GLM 暂不支持 API 余额查询、需前往控制台；不得把腾讯云列为「暂不支持 API 余额查询」的平台