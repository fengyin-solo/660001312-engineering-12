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

每种图案（spiral / fractal / wave / circles / noise）各固定 low / mid / high 三档
迭代数与缩放参数，测量**图案生成**、**SVG 组装**、**总耗时**三步的单次耗时中位数，
并与门槛逐项对照。参数组合与门槛只有一份来源 `frontend/perf/baseline.json`，
构建（`npm run build` 的 prebuild 钩子）与本地开发共用，不存在两套标准。

- `npm run perf`：按 `baseline.json` 跑全部参数组合，打印每步耗时、与门槛的差值、
  与上次本地结果的差值；任一步超过门槛则以非零码退出，日志明确指出是哪一组参数
  （`图案/档位`、`iterations`、`scale`）和哪一步。
- `npm run perf:update`：重测并用「实测中位数 × (1 + 余量) 」（不低于地板值）
  重写 `baseline.json` 中的门槛。仅在确认性能变化合理后使用，变更需随代码提交评审。
- 每次测量结果都会保存到 `frontend/perf/.last-run.json`（已 gitignore，本机复用），
  下次运行时打印「较上次 +x.xxxms」的差异。

测量方式：每组参数先预热再多次计时（次数在 `baseline.json` 的 `measurement` 中配置），
取中位数，避免单次抖动。被测代码直接来自 `src/generators`（界面渲染也走同一模块
`src/generators/render.ts`），因此基线反映的就是真实生成路径。

参数组合缺失（某图案缺少 low/mid/high 任一档）或门槛取值不合法（负数、非数值、
基线未建立时的 0 值）时，脚本会在日志中逐条说明原因并失败退出，不会静默跳过该参数组。
新增图案时，在 `baseline.json` 的 `cases` 中补齐三档后再执行一次 `npm run perf:update`。

