/**
 * Evaluator registry. 加新评估维度只需在这里注册一行 + 写一个新 evaluator 文件。
 *
 * 顺序决定报告里的展示顺序，无运行依赖（每个 evaluator 独立）。
 */

import type { Evaluator } from "./types";
import { groundingEvaluator } from "./grounding";
import { scenarioEvaluator } from "./scenario";
import { relatedEvaluator } from "./related";
import { actionEvaluator } from "./action";
import { toolEvaluator } from "./tool";
import { whyEvaluator } from "./why";
import { parallelToolsEvaluator } from "./parallelTools";
import { judgeEvaluator } from "./judge";

export const ALL_EVALUATORS: Evaluator[] = [
  groundingEvaluator,
  scenarioEvaluator,
  relatedEvaluator,
  actionEvaluator,
  toolEvaluator,
  whyEvaluator,
  parallelToolsEvaluator,
  judgeEvaluator,
];

export type { Evaluator, EvaluatorResult, RunOutput, Scenario } from "./types";
