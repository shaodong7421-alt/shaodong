export type MetricKey =
  | "publicHeat"
  | "rumorSpread"
  | "publicTrust"
  | "platformGovernance"
  | "secondaryRisk";

export type MetricState = Record<MetricKey, number>;

export type Choice = {
  id: string;
  label: string;
  score: number;
  feedback: string;
  metricDelta: Partial<MetricState>;
  riskTags: string[];
};

export type Stage = {
  id: string;
  name: string;
  story: string;
  teachingPoint: string;
  choices: Choice[];
};

export type FinalScoreBand = {
  min: number;
  max: number;
  label: string;
  summary: string;
};

export type Scenario = {
  id: string;
  title: string;
  background: string;
  learningGoals: string[];
  stages: Stage[];
  finalScoreBands: FinalScoreBand[];
};

export type RandomEvent = {
  id: string;
  stageIds: string[];
  title: string;
  description: string;
  metricDelta: Partial<MetricState>;
};

export type Answer = {
  stageId: string;
  choiceId: string;
  choiceSnapshot: Choice;
  score: number;
  metricBefore: MetricState;
  metricAfter: MetricState;
  event?: RandomEvent;
};

export type SimulationRun = {
  scenarioId: string;
  currentStageIndex: number;
  answers: Answer[];
  metricState: MetricState;
  totalScore: number;
  completedAt?: string;
};
