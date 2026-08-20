﻿# AI 服务安全配置

本项目不再将 AI API 密钥写入浏览器代码。`ai.html` 只会向同源接口 `/api/chat` 发送用户消息，后端根据 `AI_PROVIDER` 从启动进程的环境变量读取对应密钥并转发请求。默认使用硅基流动的 `Qwen/Qwen3-8B`。

## 启动

在 PowerShell 中执行：

```powershell
$env:AI_PROVIDER = 'siliconflow'
$env:SILICONFLOW_MODEL = 'Qwen/Qwen3-8B'
$env:SILICONFLOW_API_KEY = '你的硅基流动密钥'
py -3 server/start_server.py
```

然后访问 `http://127.0.0.1:8124/ai.html`。关闭终端或新开终端后需要重新设置环境变量；请勿把密钥写入 `ai.html`、`start.bat` 或提交到仓库。

## 防护措施

- 服务默认仅监听 `127.0.0.1`，不向局域网公开。
- API 仅接受 `/api/chat` 的 JSON `message` 字段，限制请求体为 4 KB、消息为 1000 字符。
- 单个客户端每分钟最多 12 次 AI 请求，避免本地密钥被滥用。
- 静态目录禁止目录列表，并发送基础安全响应头。
- 未设置当前提供商密钥时接口返回 `503`，不会把密钥暴露给浏览器。

## 部署注意事项

生产环境在 EdgeOne Pages 环境变量中设置 `AI_PROVIDER=siliconflow` 和 `SILICONFLOW_API_KEY`；可选设置 `SILICONFLOW_MODEL=Qwen/Qwen3-8B`。不要直接把本地 Python 服务暴露到互联网。

## 密钥泄露

如果密钥曾经被写入页面、日志或提交历史，请立即在对应服务商控制台撤销该密钥并创建新密钥。
