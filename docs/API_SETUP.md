# Agnes AI 密钥配置傻瓜教程（3分钟搞定）

AI数字人"小匠"现在使用 **Agnes AI 的 agnes-2.0-flash 模型**（当前免费，$0/1M tokens），由前端直连 Agnes 官方接口。你只需要申请一个 API Key，填进 `ai.html`，就能开始对话。

## 📋 配置前须知

| 问题 | 答案 |
| --- | --- |
| 要花钱吗？ | ❌ 不用，agnes-2.0-flash 当前免费（$0/1M tokens） |
| 要梯子吗？ | 一般不用，Agnes 官方接口可直连；若打不开官网再考虑 |
| 配置完要重启吗？ | 不用，保存文件后刷新页面即可 |
| 改错了会崩吗？ | 不会，页面有降级话术，会提示你去配置 Key |

## 🔑 第一步：申请 Agnes API Key

1. 打开 [https://platform.agnes-ai.com](https://platform.agnes-ai.com)，注册并登录。
2. 在平台的 API Key 管理页面点击"创建 API Key"。
3. 你会得到一个 `sk-` 开头的一串字符，**立刻复制保存**。

> ⚠️ **Key 只显示一次！** 关闭弹窗后就再也看不到了。务必第一时间复制到记事本，丢了只能重新创建一个。

## ✏️ 第二步：把 Key 填到 ai.html（重点！）

1. 打开项目根目录的 `ai.html`（就是双击能打开 AI 页面的那个文件）。
2. 按 `Ctrl + F`，搜索：

   ```
   YOUR_AGNES_API_KEY_HERE
   ```

3. 会定位到第 218 行附近，【A 区】的这一行：

   ```js
   const AGNES_API_KEY = 'YOUR_AGNES_API_KEY_HERE';
   ```

4. **只把引号中间的 `YOUR_AGNES_API_KEY_HERE` 换成你的 Key**，两边的单引号 `'` 原样保留。

✅ **正确示例**（引号保留，Key 完整粘贴）：

```js
const AGNES_API_KEY = 'sk-xxxxxxxx';
```

❌ **错误示例一**（把引号一起删了）：

```js
const AGNES_API_KEY = sk-xxxxxxxx;
```

❌ **错误示例二**（Key 前后多了空格，或只粘贴了一半）：

```js
const AGNES_API_KEY = ' sk-xxxxxx';
```

改完保存（`Ctrl + S`）即可。

## 🚀 第三步：验证

1. 打开 AI 页面（本地一般是 `http://localhost:8124/ai.html`，以你实际端口为准）。
2. 发一句"你好"：
   - **没配 Key**：会收到指路提示话术，告诉你去哪里填 Key；
   - **配置成功**：AI 会正常回答木雕相关问题。
3. 如果没反应，按 `F12` 打开控制台（Console）看红色报错：

| 报错关键词 | 原因 | 解决办法 |
| --- | --- | --- |
| `401` / `Unauthorized` | Key 填错了 | 回到第二步，重新核对粘贴的 Key，注意别带空格 |
| `CORS` / 跨域被拦 | 浏览器直连被拦 | 需回退到服务端代理（见下方安全提醒） |
| 请求超时 | Agnes 偶发慢（官方确认个别请求超 40 秒） | 前端已设 60 秒超时，稍等片刻重试即可 |

## 🔒 安全提醒（重要！）

- 前端直连 = **Key 明文写在 HTML 里**，任何人按 `F12` → Sources 都能看到你的 Key。
- 本地学习、个人使用、课堂演示随便用；**要公网部署给别人访问，必须换回服务端代理**（`worker/` 目录的 Worker 方案还在，可随时回退）。
- **绝不把含真实 Key 的 ai.html 上传到公开仓库**，一旦泄露立刻去 Agnes 平台撤销并重建 Key。

## 📎 文件位置速查表

| 项目 | 内容 |
| --- | --- |
| 文件 | 项目根目录的 `ai.html` |
| 位置 | 第 218 行附近，【A 区】`const AGNES_API_KEY = ...` |
| 要替换的内容 | `YOUR_AGNES_API_KEY_HERE` |
| 替换成 | 你的 `sk-xxxxxxxx`（单引号保留） |

---

配置有问题？按 F12 看控制台红色报错，截图发给AI助手。
