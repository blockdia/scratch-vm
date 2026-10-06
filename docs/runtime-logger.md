# 内部运行日志

`runtime.logger` 用于作品作者需要看到的运行提示，例如扩展参数无效。它属于每个 Runtime，
无需 GUI 或 debugger 插件；引擎开发者使用的 `src/util/log.js` 保持独立。

## 记录与定位

```js
runtime.logger.log('普通消息');
runtime.logger.info('状态信息', {source: 'my-extension'});
runtime.logger.warn(message, {
    source: 'my-extension',
    code: 'INVALID_ARGUMENT',
    targetId: util.target.id,
    blockId: util.thread?.peekStack()
});
runtime.logger.error(message, context);
```

四个级别都只记录消息，不抛异常、不暂停作品。`message` 转为字符串；`context` 可省略。
用户可见文案通过现有 `format-message` 翻译，`code` 保持稳定，供程序识别。

涉及异步操作、启动其他脚本或删除角色时，先保存调用位置：

```js
const context = runtime.logger.captureContext(util.thread);
// 执行操作；之后 thread 的栈或 target 可能已改变。
runtime.logger.warn(message, {...context, source: 'my-extension', code: 'OPERATION_FAILED'});
```

记录只保留字符串、数字和布尔值，包括角色内部 ID、名称、原角色 ID、公开 ID、是否为克隆体、
积木 ID、级别、来源、错误码、操作对象名称 `subjectName`、上限 `limit`、首次/末次时间戳和重复次数。
`subjectName` 和 `limit` 也是有长度限制的字符串。不会保存 Thread、Target 或任意自定义对象。
角色和积木不存在时，日志仍可阅读；导航消费者应在点击时重新检查目标是否存在。

## 读取与订阅

```js
const render = entries => { /* 更新列表或其他输出端 */ };
const unsubscribe = runtime.logger.subscribe(render);
render(runtime.logger.getEntries());
// 消费者被销毁时调用；仅隐藏日志窗口时不必取消。
unsubscribe();
```

`getEntries()` 返回新的数组，其中记录不可修改。订阅回调接收当前完整快照，写入后的通知按
50 ms 合并，避免在执行积木时同步刷新界面。消费者异常不会传播到作品或其他消费者。
`clear()` 立即清空并通知，取消待发送批次；`flush()` 立即发送当前快照并取消待发送批次。

最多保留最近 1000 条记录，各文本字段最多 4096 个 UTF-16 代码单元。
这是与旧 debugger 最多保留 200000 条日志的行为差异：默认启用的内部日志服务采用较小的有界缓存。
超过 1000 条后丢弃最旧记录，界面和导出只能读取仍在缓存中的记录；持续输出不同日志时需要及时导出。
连续且内容、级别、来源、错误码、位置和角色快照相同的日志合并计数。
连续重复日志只占一条缓存，重复次数不受 1000 条限制。
不同消息穿插出现时保留顺序，不跨记录合并。UI 最多每秒收到约 20 次写入通知，清空和显式 flush 除外。

## 生命周期与展示

- `stopAll()` 和 VM 自身的绿旗操作保留日志。debugger 可按“点击绿旗清除日志”设置清空。
- `runtime.dispose()` / `vm.clear()` 清空作品日志，保留消费者订阅；日志不写入 SB3。
- GUI 加载作品也会调用 `quit()` 暂停帧循环，因此它只 flush，不销毁日志服务。
  flush 会立即通知当前快照并取消通知定时器；订阅保留是因为此时没有调用 logger.dispose()。
- 无需采集时调用 `setEnabled(false)`；恢复用 `setEnabled(true)`。关闭采集不会删除历史。
- 宿主永久销毁消费者和服务时可调用 `dispose()`，取消通知、清空历史及订阅，并关闭采集。

Blockdia GUI 的 debugger 读取该服务。日志积木标记为 `source: 'script'`，debugger 的运行信息标记为
`source: 'debugger'`，克隆扩展使用 `source: 'clones'`。来源不改变级别；内部警告也显示未读提示。
关闭或隐藏窗口保留历史，清除按钮操作 VM 中的日志。导出用重复次数标记，避免展开大量重复行。
按住 Shift 点击导出可以自定义格式：`{sprite}` 为角色名称，`{content}` 为正文，`{type}` 为级别，
`{count}` 为重复次数，`{source}` 为来源，`{code}` 为错误码。重复记录还会附加 `×次数`。

克隆创建过程通过可选的 `onFailure(code)` 回传实际失败原因：
`INVALID_CLONE_ID`、`CLONE_ID_IN_USE`、`CLONE_LIMIT`、`CANNOT_CLONE_STAGE`、`CLONE_TARGET_NOT_FOUND`。
空 ID 继续分配自动 ID；存在性查询返回 false 不输出警告；原有失败返回值和异常传播方式保持不变。
容器克隆的 ID 预留也通过 `onFailure(code)` 返回非法 ID 和 ID 冲突，由容器扩展记录同样的错误码，
来源为 `containers`，冲突提示使用 `@container-clone:` 前缀；失败不会留下部分容器实例。

`CLONE_LIMIT` 由 VM 的实际创建路径记录一次，其他错误由扩展记录。原生克隆、克隆扩展和容器克隆
采用相同错误码；容器容量不足时整组失败，只记录一条。`subjectName` 是被克隆的角色或容器，
与执行积木的角色信息分开，`limit` 保存失败当时的实际上限。容器内部成员创建失败也归属于整组操作。
debugger 沿用 `log_failed_clone_creation` 设置控制这类记录的显示、未读提示和导出；关闭该显示选项
不会清除 VM 日志缓存，也不会隐藏非法 ID 等其他警告。

GUI 的此次接入需要同时使用含该 API 的 VM。验证未发布的两个仓库时，在 scratch-gui 使用
`BLOCKDIA_LOCAL_PACKAGES=1 npm start`；发布时同步更新 GUI 使用的 VM 依赖。

## 透视参数提示

拉伸扩展的单角设置、单角增加和四角一起设置使用 `source: 'stretch'` 的警告：

- `INVALID_PERSPECTIVE_OFFSETS`：偏移不是有限数值，或超出 −1000%～1000%。
- `INVALID_PERSPECTIVE_QUAD`：四角未保持原有绕序的严格凸四边形，包括交叉、重合、内凹或退化。

失败会保留全部旧偏移和启用状态，不夹取数值，也不中断脚本。修改多个角时，应使用一次设置四角的
积木，避免最终形状合法、逐角设置的中间形状却非法。百分比以透视前的图形宽高为参照，x 向右为正，
y 向上为正；容器使用其参考框（如启用了九宫格，则使用调整后的尺寸）。
日志定位执行命令的角色和积木，`subjectName` 保存被修改的角色名称或容器路径。连续相同失败沿用
日志服务的重复计数；成功设置、清除和查询不输出警告。底层状态校验及作品反序列化不输出积木日志。

## 裁剪与遮罩提示

裁剪扩展使用 `source: 'clipping'`，警告可定位到执行积木，`subjectName` 为被操作的角色或容器：

- `MASK_NOT_SET`：还没有遮罩来源，不能修改位置、尺寸或显示方式；先执行设置遮罩积木。
- `CLIP_NOT_SET`：还没有裁剪形状，不能切换保留内部／外部；先设置形状。
- `MASK_COSTUME_NOT_FOUND`：遮罩来源不是当前角色拥有的造型。
- `INVALID_MASK_BOUNDS`：位置或尺寸不是有限数值，或宽高不大于 0。

这些失败保留原状态，脚本继续执行；连续相同警告合并计数。成功设置、清除、报告积木与底层存档校验
均不输出警告。遮罩的「执行时的当前造型」固定来源引用，首次设置时适配范围，后续更换来源保留范围。

## 坐标变换失败

`motion` 来源的 `COORDINATE_TRANSFORM_FAILED` 表示移动或转向积木无法将舞台坐标换算到容器局部坐标，常见原因是容器零拉伸或透视超出可投影范围。保留原有位置与方向，继续执行后续积木，重复警告由日志 API 合并。解释器和编译器均记录触发的积木。

普通局部 x/y 移动仍可更新位置；不能投影的内容可能不可见，移回有效范围或清除透视即可恢复。坐标报告积木、渲染、碰撞及指针查询不产生日志。
