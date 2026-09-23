# 生成艺术 SVG 海报设计器

参数化生成艺术工具，支持螺旋、分形树、波浪、圆环、噪声场五种图案，8 种颜色主题，SVG/PNG 导出。

## 功能

- 5 种图案类型：螺旋、分形树、波浪、圆环、噪声场
- 8 种预设颜色主题（日落、海洋、霓虹、森林、单色、糖果、火焰、极光）
- 种子随机数生成器（确定性重现）
- 参数实时预览：迭代数、缩放、旋转、描边、透明度
- SVG 矢量导出 & PNG 高清导出

## 技术栈

- React + TypeScript + Vite
- D3.js（数据处理）
- Zustand（状态管理）
- Tailwind CSS

## 运行

```bash
cd frontend && npm install && npm run dev
```

## 性能基线

构建和本地开发共用同一份固定参数与门槛：

- 固定参数：`frontend/performance/baseline-cases.json`
- 共享门槛：`frontend/performance/performance-thresholds.json`
- 本地最近一次测量结果：`frontend/performance/.last-baseline.json`（自动生成，不提交）

本地运行：

```bash
cd frontend
npm run perf:baseline
```

`npm run build` 会先执行同一个性能基线脚本；任一参数组的准备、图案生成、SVG 序列化或总耗时超过门槛，构建会失败并输出对应的参数组、步骤和实际耗时。每次运行会对每组参数预热 3 次并采样 9 次，输出中位数，同时把每一步与门槛、上一次本地基线的差异打印出来。最近一次测量结果会保存到本地供下一次复用。

新增或删除参数组合后，需要同步修改 `baseline-cases.json` 和 `performance-thresholds.json`。每种图案都必须有 `low`、`medium`、`high` 三档，门槛值必须是大于 0 的毫秒数字；配置缺失或非法时脚本会列出原因并终止，不会静默跳过。
