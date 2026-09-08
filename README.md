# CET-6 学习舱

面向电脑、手机和平板的 CET-6 词汇与听力学习站。界面操作先写入浏览器本地存储，登录后通过 Supabase 自动同步。

## 数据与安全

- 前端只使用 Supabase publishable key。
- 学习数据保存在 `public.cet6_user_state`。
- Row Level Security 已启用，策略使用 `auth.uid() = user_id` 限制每个账户只能访问自己的记录。
- 同步内容包括单词记录、每日计划、历史、学习设置、听力训练完成状态与笔记。

## 部署

该仓库使用 GitHub Actions 部署到 GitHub Pages。Supabase 数据库定义见 `supabase-schema.sql`。
