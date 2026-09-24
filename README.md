# APSOC · 开源 AI 安全运营基座

[![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

APSOC 是一个**开源、插件化的 AI 安全运营基座（Security Base）**：用一个后端，纳管
EDR、DLP、NDR、WAF、蜜罐、漏洞、情报与自动响应（SOAR），安全能力即插即用。

- **一次采集，多处分析**：数据只在 Sensor 处采集一次，可被任意 Analyzer 订阅；
- **一个结果，多点执行**：分析结论可在数据库、终端、网络等最恰当的位置落地阻断；
- **插件化交付**：每个能力都是可独立交付、独立验收、独立计价、独立担责的插件；
- **全面开源**：代码全部可见，宽松许可（Apache-2.0），可被广泛使用、集成与吸收。

## 仓库说明

本仓库是 APSOC的**官方网站（静态站点）**，纯 HTML / CSS / JS，无构建依赖。

| 文件 | 说明 |
|---|---|
| `index.html` | 官网首页（理念、架构、能力矩阵、路线图、参与共建） |
| `news.html` | 项目动态 / 消息发布页 |
| `article-unified-data-plane.html` | 开篇文章：合规约束下的安全架构——为什么需要统一数据平面 |
| `land.js` / `globe.js` | 首页粒子地球背景 |
| `assets/` | 图片等静态资源 |

## 本地预览

```bash
python -m http.server 8000
# 浏览器打开 http://127.0.0.1:8000/
```

## 参与共建

无论你擅长平台研发、检测工程、情报研究还是社区布道，APSOC 都有你的位置。

- 提交 Issue / PR：<https://github.com/kinghtxg/apsoc/issues>
- 参与讨论：<https://github.com/kinghtxg/apsoc/discussions>

## License

本仓库站点内容采用 [Apache-2.0](LICENSE) 许可；未来安全基座内核与 SDK 的许可策略
将在对应代码仓库中另行说明。
