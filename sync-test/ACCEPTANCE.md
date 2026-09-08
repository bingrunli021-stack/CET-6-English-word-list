# CET-6 同步测试验收记录

日期：2026-09-08。Supabase：bihhvfccunyjicdxwiym，套餐 free。

| 要求 | 实际验证 | 结果 |
|---|---|---|
| A学习，B自动读取 | A把consistent标记为完成；B使用独立学习存储首次打开后自动读取 | 通过 |
| B改其他词，A原记录保留 | B把competent标记为模糊，A及C收到，consistent保持完成 | 通过 |
| 同一词较晚修改胜出 | A把preserve设为完成，B随后设为模糊，C最终显示模糊；SQL和引擎另测旧操作晚到不能覆盖 | 通过 |
| 断网后自动补传 | C阻断同步传输后学习proximately；数据库确认该词尚不存在；恢复连接后自动上传并在B显示 | 通过（应用传输层模拟断网） |
| JSON导入同步 | C通过文件选择器导入possession及听力笔记，B收到；稀疏导入前后另一词updated_at完全一致 | 通过 |
| 退出重登 | 实际调用Supabase退出，再由用户通过安全窗口重新登录；词汇和听力笔记恢复 | 通过 |

A、B、C为三个独立学习存储的浏览器客户端；共享同一登录账号。不是三台实体设备。浏览器服务没有提供系统级断网控制，所以没有实测系统飞行模式、完全离线启动及三种设备系统的差异。离线重启持久队列另由Node回归测试覆盖；Service Worker已实现首访缓存。

## 代码与数据库

`node tests/sync.test.cjs` 的8项回归全部通过，含请求期间新编辑不丢失。真实数据库事务中验证条件UPSERT、跨账号RLS、空设备保护，所有事务测试写入回滚。客户端只使用publishable key，未获取或嵌入service_role key。

RLS覆盖SELECT、INSERT、UPDATE；UPDATE包含USING及WITH CHECK。RPC为SECURITY INVOKER，拒绝未登录调用。安全顾问没有报告测试表的RLS问题；项目已有的泄露密码保护未启用提示仍存在，参见[Supabase密码保护说明](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。

## 部署与数据边界

GitHub Pages自动部署成功。只新增sync-test目录和tests文件，根目录旧index.html及原Sites项目未改动。新表不读写cet6_user_state或旧备份表。

测试账号目前有验收记录。迁入真实学习进度：旧网站设置→导出学习进度；新测试网站设置→导入学习进度，选择备份，等待已同步。导入包含的记录作为新的恢复操作提交；未包含的现有记录保留。如果真实备份没有听力笔记，测试笔记仍需在听力页面手动清空。确认三台实体设备表现正常之前，不替换原网站。

## 同步语义

单词整体为一条LWW记录，时间戳为编辑时毫秒值，等时按mutation_id稳定排序。历史/计划按日期，听力完成项按题套，其余设置分别存储。恢复导入会产生新的编辑时间。没有可信编辑时间的历史种子仅补云端缺失行。不同记录不会因全量JSON覆盖丢失。客户端使用单调编辑时钟；不同设备系统时间严重不准时，无法保证现实时间上的先后排序。
