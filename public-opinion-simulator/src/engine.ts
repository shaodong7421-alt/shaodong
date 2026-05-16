import { initialMetricState, randomEvents, scenario } from "./data/scenario";
import type { Answer, Choice, MetricKey, MetricState, RandomEvent, SimulationRun, Stage } from "./types";

const STORAGE_KEY = "public-opinion-simulator-run-v1";

export const metricMeta: Record<MetricKey, { label: string; tone: "warn" | "danger" | "trust" | "good"; goodDirection: "up" | "down" }> = {
  publicHeat: { label: "舆情热度", tone: "warn", goodDirection: "down" },
  rumorSpread: { label: "谣言传播强度", tone: "warn", goodDirection: "down" },
  publicTrust: { label: "公众信任指数", tone: "trust", goodDirection: "up" },
  platformGovernance: { label: "平台治理有效性", tone: "good", goodDirection: "up" },
  secondaryRisk: { label: "次生舆情风险", tone: "danger", goodDirection: "down" },
};

export const metricKeys = Object.keys(metricMeta) as MetricKey[];

export function createRun(): SimulationRun {
  return {
    scenarioId: scenario.id,
    currentStageIndex: 0,
    answers: [],
    metricState: { ...initialMetricState },
    totalScore: 0,
  };
}

export function clampMetric(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function applyMetricDelta(current: MetricState, delta: Partial<MetricState>): MetricState {
  return metricKeys.reduce((next, key) => {
    next[key] = clampMetric(current[key] + (delta[key] ?? 0));
    return next;
  }, {} as MetricState);
}

export function combineDelta(base: Partial<MetricState>, extra?: Partial<MetricState>): Partial<MetricState> {
  if (!extra) return base;
  return metricKeys.reduce((merged, key) => {
    const value = (base[key] ?? 0) + (extra[key] ?? 0);
    if (value !== 0) merged[key] = value;
    return merged;
  }, {} as Partial<MetricState>);
}

export function selectRandomEvent(stage: Stage, enabled: boolean, answerCount: number): RandomEvent | undefined {
  if (!enabled || !["stage-2", "stage-3", "stage-4"].includes(stage.id)) return undefined;
  const candidates = randomEvents.filter((event) => event.stageIds.includes(stage.id));
  if (!candidates.length) return undefined;
  const seed = stage.id.charCodeAt(stage.id.length - 1) + answerCount * 7 + new Date().getMinutes();
  return candidates[seed % candidates.length];
}

export function submitChoice(run: SimulationRun, stage: Stage, choice: Choice, event?: RandomEvent): SimulationRun {
  const metricBefore = { ...run.metricState };
  const metricAfter = applyMetricDelta(metricBefore, combineDelta(choice.metricDelta, event?.metricDelta));
  const answer: Answer = {
    stageId: stage.id,
    choiceId: choice.id,
    choiceSnapshot: choice,
    score: choice.score,
    metricBefore,
    metricAfter,
    event,
  };
  const answers = [...run.answers, answer];
  const nextStageIndex = Math.min(run.currentStageIndex + 1, scenario.stages.length);

  return {
    ...run,
    answers,
    metricState: metricAfter,
    currentStageIndex: nextStageIndex,
    totalScore: answers.reduce((sum, item) => sum + item.score, 0),
    completedAt: nextStageIndex >= scenario.stages.length ? new Date().toISOString() : undefined,
  };
}

export function getChoice(stageId: string, choiceId: string): Choice | undefined {
  return scenario.stages.find((stage) => stage.id === stageId)?.choices.find((choice) => choice.id === choiceId);
}

export function getScoreBand(score: number) {
  return scenario.finalScoreBands.find((band) => score >= band.min && score <= band.max) ?? scenario.finalScoreBands.at(-1)!;
}

export function getRiskLevel(metrics: MetricState): { label: string; className: string; text: string } {
  const riskLoad = Math.round((metrics.publicHeat + metrics.rumorSpread + metrics.secondaryRisk + (100 - metrics.publicTrust)) / 4);
  if (riskLoad >= 72) return { label: "高风险", className: "risk-high", text: "舆情仍处在高压区，任何压制式动作都可能触发二次危机。" };
  if (riskLoad >= 50) return { label: "中风险", className: "risk-mid", text: "舆情进入可控但敏感状态，需要持续公开进展并保持协同。" };
  return { label: "低风险", className: "risk-low", text: "核心风险已被压低，下一步重点是复盘、制度化公开和信任修复。" };
}

export function getTrendText(metrics: MetricState): string {
  if (metrics.publicTrust >= 72 && metrics.publicHeat <= 42) return "信任正在回升，舆论焦点从质疑转向观察整改结果。";
  if (metrics.secondaryRisk >= 70) return "次生舆情风险偏高，公众注意力可能转向“是否掩盖、是否打压”。";
  if (metrics.rumorSpread >= 65) return "谣言传播仍有惯性，需要用可核验材料和第三方证据压缩想象空间。";
  if (metrics.platformGovernance >= 70) return "平台治理与公开信息形成合力，传播结构开始向澄清内容倾斜。";
  return "舆情处于拉锯状态，透明进展和外部背书将决定后续走势。";
}

export function buildReview(run: SimulationRun) {
  const choices = run.answers
    .map((answer) => {
      const stage = scenario.stages.find((item) => item.id === answer.stageId);
      const choice = getChoice(answer.stageId, answer.choiceId) ?? answer.choiceSnapshot;
      return stage && choice ? { stage, choice, answer } : undefined;
    })
    .filter(Boolean) as Array<{ stage: Stage; choice: Choice; answer: Answer }>;

  const strengths = choices
    .filter(({ choice }) => choice.score >= 18)
    .map(({ stage, choice }) => `${stage.name.replace("：", " ")}选择“${choice.label}”，体现了透明回应与风险控制意识。`);

  const risks = choices
    .filter(({ choice }) => choice.score <= 8)
    .map(({ stage, choice }) => `${stage.name.replace("：", " ")}选择“${choice.label}”，存在${choice.riskTags.slice(0, 2).join("、")}风险。`);

  return {
    strengths: strengths.length ? strengths : ["没有明显高分决策，建议优先练习公开回应、第三方背书和复盘整改。"],
    risks: risks.length ? risks : ["未出现严重低分决策，整体风险控制较稳定。"],
  };
}

export function saveRun(run: SimulationRun) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
}

export function loadRun(): SimulationRun | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SimulationRun;
    if (parsed.scenarioId !== scenario.id) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function clearRun() {
  window.localStorage.removeItem(STORAGE_KEY);
}
