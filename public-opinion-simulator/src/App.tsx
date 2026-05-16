import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileDown,
  Gauge,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { scenario } from "./data/scenario";
import {
  buildReview,
  clearRun,
  createRun,
  getChoice,
  getRiskLevel,
  getScoreBand,
  getTrendText,
  loadRun,
  metricKeys,
  metricMeta,
  saveRun,
  selectRandomEvent,
  submitChoice,
} from "./engine";
import type { Choice, MetricKey, SimulationRun } from "./types";

const DECISION_SECONDS = 30;

type Screen = "start" | "decision" | "feedback" | "result";

function createTimeoutChoice(stageId: string): Choice {
  return {
    id: `${stageId}-timeout`,
    label: "超时未选择处置选项",
    score: 0,
    feedback: "30 秒内未提交处置方案，舆情窗口期被错过，信息真空会放大猜测并削弱公众信任。",
    metricDelta: {
      publicHeat: 10,
      rumorSpread: 8,
      publicTrust: -12,
      platformGovernance: -5,
      secondaryRisk: 12,
    },
    riskTags: ["超时未响应", "信息真空", "窗口期错过"],
  };
}

function App() {
  const restored = useMemo(() => loadRun(), []);
  const [run, setRun] = useState<SimulationRun>(() => restored ?? createRun());
  const [screen, setScreen] = useState<Screen>(() => {
    if (!restored || restored.answers.length === 0) return "start";
    if (restored.completedAt) return "result";
    return "decision";
  });
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [randomEnabled, setRandomEnabled] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | undefined>();
  const [secondsLeft, setSecondsLeft] = useState(DECISION_SECONDS);
  const autoSubmittedStageId = useRef<string | undefined>(undefined);

  const currentStage = scenario.stages[run.currentStageIndex];
  const lastAnswer = run.answers.at(-1);
  const lastStage = lastAnswer ? scenario.stages.find((stage) => stage.id === lastAnswer.stageId) : undefined;
  const lastChoice = lastAnswer ? getChoice(lastAnswer.stageId, lastAnswer.choiceId) ?? lastAnswer.choiceSnapshot : undefined;
  const isComplete = Boolean(run.completedAt);

  useEffect(() => {
    saveRun(run);
  }, [run]);

  useEffect(() => {
    if (screen !== "decision" || !timerEnabled || !currentStage) return;
    autoSubmittedStageId.current = undefined;
    setSecondsLeft(DECISION_SECONDS);
    const interval = window.setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [screen, timerEnabled, currentStage?.id]);

  useEffect(() => {
    if (screen !== "decision" || !timerEnabled || secondsLeft !== 0 || !currentStage) return;
    if (autoSubmittedStageId.current === currentStage.id) return;
    autoSubmittedStageId.current = currentStage.id;
    const selectedChoice = selectedChoiceId ? currentStage.choices.find((choice) => choice.id === selectedChoiceId) : undefined;
    handleSubmit(selectedChoice ?? createTimeoutChoice(currentStage.id), true);
  }, [secondsLeft, screen, timerEnabled, selectedChoiceId, currentStage]);

  function startSimulation() {
    const nextRun = createRun();
    setRun(nextRun);
    setSelectedChoiceId(undefined);
    setSecondsLeft(DECISION_SECONDS);
    setScreen("decision");
  }

  function restartSimulation() {
    clearRun();
    setRun(createRun());
    setSelectedChoiceId(undefined);
    setSecondsLeft(DECISION_SECONDS);
    setScreen("start");
  }

  function handleSubmit(choice: Choice, fromTimeout = false) {
    if (!currentStage) return;
    const event = selectRandomEvent(currentStage, randomEnabled, run.answers.length);
    const nextRun = submitChoice(run, currentStage, choice, event);
    setRun(nextRun);
    setSelectedChoiceId(undefined);
    setScreen(nextRun.completedAt ? "result" : "feedback");
    if (!fromTimeout) setSecondsLeft(DECISION_SECONDS);
  }

  function goNext() {
    if (isComplete) {
      setScreen("result");
      return;
    }
    setSecondsLeft(DECISION_SECONDS);
    setScreen("decision");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">课堂实训 · 单人决策</p>
          <h1>舆情处置模拟器</h1>
        </div>
        <div className="topbar-actions">
          <StatusPill icon={<Gauge size={16} />} label="总分" value={`${run.totalScore}/100`} />
          <StatusPill icon={<ShieldCheck size={16} />} label="风险" value={getRiskLevel(run.metricState).label} />
        </div>
      </header>

      {screen === "start" && (
        <StartScreen
          timerEnabled={timerEnabled}
          randomEnabled={randomEnabled}
          onTimerChange={setTimerEnabled}
          onRandomChange={setRandomEnabled}
          onStart={startSimulation}
          hasSavedRun={Boolean(restored && restored.answers.length > 0)}
          onResume={() => setScreen(restored?.completedAt ? "result" : "decision")}
        />
      )}

      {screen === "decision" && currentStage && (
        <DecisionScreen
          run={run}
          selectedChoiceId={selectedChoiceId}
          secondsLeft={timerEnabled ? secondsLeft : undefined}
          onSelect={setSelectedChoiceId}
          onSubmit={() => {
            const choice = currentStage.choices.find((item) => item.id === selectedChoiceId);
            if (choice) handleSubmit(choice);
          }}
        />
      )}

      {screen === "feedback" && lastAnswer && lastStage && lastChoice && (
        <FeedbackScreen answer={lastAnswer} stage={lastStage} choice={lastChoice} onNext={goNext} />
      )}

      {screen === "result" && <ResultScreen run={run} onRestart={restartSimulation} />}
    </div>
  );
}

function StatusPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="status-pill">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StartScreen({
  timerEnabled,
  randomEnabled,
  hasSavedRun,
  onTimerChange,
  onRandomChange,
  onStart,
  onResume,
}: {
  timerEnabled: boolean;
  randomEnabled: boolean;
  hasSavedRun: boolean;
  onTimerChange: (value: boolean) => void;
  onRandomChange: (value: boolean) => void;
  onStart: () => void;
  onResume: () => void;
}) {
  return (
    <main className="start-grid">
      <section className="intro-panel">
        <p className="eyebrow">食品安全危机 · 5 阶段处置</p>
        <h2>{scenario.title}</h2>
        <p className="lead">{scenario.background}</p>
        <div className="goal-grid">
          {scenario.learningGoals.map((goal) => (
            <div className="goal-card" key={goal}>
              <CheckCircle2 size={18} />
              <span>{goal}</span>
            </div>
          ))}
        </div>
        <div className="control-strip">
          <label className="switch-row">
            <input type="checkbox" checked={timerEnabled} onChange={(event) => onTimerChange(event.target.checked)} />
            <span><Timer size={16} /> 倒计时模式</span>
            <b>30秒/阶段</b>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={randomEnabled} onChange={(event) => onRandomChange(event.target.checked)} />
            <span><Sparkles size={16} /> 随机事件</span>
            <b>{randomEnabled ? "已开启" : "默认关闭"}</b>
          </label>
        </div>
        <div className="start-actions">
          <button className="primary-action" onClick={onStart}>
            <Play size={18} />
            开始模拟
          </button>
          {hasSavedRun && (
            <button className="secondary-action" onClick={onResume}>
              继续上次进度
            </button>
          )}
        </div>
      </section>
      <aside className="process-panel">
        <div className="panel-title">
          <BarChart3 size={20} />
          <h3>训练流程</h3>
        </div>
        <ol className="stage-list">
          {scenario.stages.map((stage, index) => (
            <li key={stage.id}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <span>{stage.name.replace("阶段", "阶段 ")}</span>
              <small>{stage.teachingPoint}</small>
            </li>
          ))}
        </ol>
        <div className="score-note">
          <strong>评分机制</strong>
          <p>每阶段满分 20 分，总分 100 分。提交后才显示分数与后果，避免把训练变成找答案。</p>
        </div>
      </aside>
    </main>
  );
}

function DecisionScreen({
  run,
  selectedChoiceId,
  secondsLeft,
  onSelect,
  onSubmit,
}: {
  run: SimulationRun;
  selectedChoiceId?: string;
  secondsLeft?: number;
  onSelect: (id: string) => void;
  onSubmit: () => void;
}) {
  const stage = scenario.stages[run.currentStageIndex];
  return (
    <main className="workbench">
      <section className="stage-context panel">
        <div className="stage-head">
          <span>进度 {run.currentStageIndex + 1}/{scenario.stages.length}</span>
          {secondsLeft !== undefined && (
            <span className={secondsLeft <= 10 ? "timer urgent" : "timer"}>
              <Clock3 size={16} /> {secondsLeft}s
            </span>
          )}
        </div>
        <h2>{stage.name}</h2>
        <p className="story">{stage.story}</p>
        <div className="teaching-hint">
          <AlertTriangle size={18} />
          <p>当前阶段只展示情境提示，不提前暴露最优答案。请基于回应速度、透明度与风险控制做出判断。</p>
        </div>
      </section>

      <section className="choice-panel panel">
        <div className="panel-title">
          <h3>选择处置方案</h3>
          <span>提交前不显示分数</span>
        </div>
        <div className="choice-grid">
          {stage.choices.map((choice) => (
            <button
              className={choice.id === selectedChoiceId ? "choice-card selected" : "choice-card"}
              key={choice.id}
              onClick={() => onSelect(choice.id)}
            >
              <b>{choice.id.slice(-1)}</b>
              <span>{choice.label}</span>
            </button>
          ))}
        </div>
        <button className="primary-action submit-action" disabled={!selectedChoiceId} onClick={onSubmit}>
          确认决策
        </button>
      </section>

      <MetricPanel metrics={run.metricState} trendText={getTrendText(run.metricState)} />
    </main>
  );
}

function FeedbackScreen({
  answer,
  stage,
  choice,
  onNext,
}: {
  answer: NonNullable<SimulationRun["answers"][number]>;
  stage: (typeof scenario.stages)[number];
  choice: Choice;
  onNext: () => void;
}) {
  return (
    <main className="feedback-layout">
      <section className="feedback-main panel">
        <p className="eyebrow">{stage.name}</p>
        <div className="score-hero">
          <span>本阶段得分</span>
          <strong>{choice.score}<small>/20</small></strong>
        </div>
        {answer.event && (
          <div className="event-banner">
            <Sparkles size={18} />
            <div>
              <b>{answer.event.title}</b>
              <p>{answer.event.description}</p>
            </div>
          </div>
        )}
        <div className="feedback-block">
          <h3>系统评价</h3>
          <p>{choice.feedback}</p>
        </div>
        <div className="feedback-block">
          <h3>阶段教学点</h3>
          <p>{stage.teachingPoint}</p>
        </div>
        <div className="tag-row">
          {choice.riskTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <button className="primary-action" onClick={onNext}>
          进入下一阶段
        </button>
      </section>
      <section className="panel delta-panel">
        <div className="panel-title">
          <h3>指标变化</h3>
          <span>本次选择后果</span>
        </div>
        {metricKeys.map((key) => {
          const before = answer.metricBefore[key];
          const after = answer.metricAfter[key];
          const delta = after - before;
          return <MetricDelta key={key} metricKey={key} before={before} after={after} delta={delta} />;
        })}
      </section>
    </main>
  );
}

function MetricPanel({ metrics, trendText }: { metrics: SimulationRun["metricState"]; trendText: string }) {
  const risk = getRiskLevel(metrics);
  return (
    <aside className="metric-panel panel">
      <div className="panel-title">
        <h3>舆情态势</h3>
        <span className={risk.className}>{risk.label}</span>
      </div>
      <div className="metric-stack">
        {metricKeys.map((key) => (
          <MetricBar key={key} metricKey={key} value={metrics[key]} />
        ))}
      </div>
      <div className="trend-box">
        <b>走势预测</b>
        <p>{trendText}</p>
      </div>
    </aside>
  );
}

function MetricBar({ metricKey, value }: { metricKey: MetricKey; value: number }) {
  const meta = metricMeta[metricKey];
  return (
    <div className={`metric-row ${meta.tone}`}>
      <div className="metric-label">
        <span>{meta.label}</span>
        <b>{value}</b>
      </div>
      <div className="meter">
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function MetricDelta({ metricKey, before, after, delta }: { metricKey: MetricKey; before: number; after: number; delta: number }) {
  const meta = metricMeta[metricKey];
  const positive = delta > 0;
  const helpful = meta.goodDirection === "up" ? delta >= 0 : delta <= 0;
  return (
    <div className={`delta-row ${helpful ? "helpful" : "harmful"}`}>
      <span>{meta.label}</span>
      <b>
        {before} → {after}
      </b>
      <em>{positive ? "+" : ""}{delta}</em>
    </div>
  );
}

function ResultScreen({ run, onRestart }: { run: SimulationRun; onRestart: () => void }) {
  const band = getScoreBand(run.totalScore);
  const review = buildReview(run);
  return (
    <main className="result-layout">
      <section className="result-hero panel">
        <p className="eyebrow">最终成绩</p>
        <div className="result-score">
          <strong>{run.totalScore}</strong>
          <span>/100</span>
        </div>
        <h2>{band.label}：{band.summary}</h2>
        <p>{getRiskLevel(run.metricState).text}</p>
        <div className="result-actions">
          <button className="primary-action" onClick={() => window.print()}>
            <FileDown size={18} />
            打印/保存PDF
          </button>
          <button className="secondary-action" onClick={onRestart}>
            <RotateCcw size={18} />
            重新模拟
          </button>
        </div>
      </section>

      <MetricPanel metrics={run.metricState} trendText={getTrendText(run.metricState)} />

      <section className="panel chart-panel">
        <div className="panel-title">
          <h3>五阶段得分</h3>
          <span>满分 20 分/阶段</span>
        </div>
        <div className="score-bars">
          {scenario.stages.map((stage) => {
            const answer = run.answers.find((item) => item.stageId === stage.id);
            const score = answer?.score ?? 0;
            return (
              <div className="score-bar" key={stage.id}>
                <span>{stage.name.replace("阶段", "")}</span>
                <div><i style={{ width: `${(score / 20) * 100}%` }} /></div>
                <b>{score}</b>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel review-panel">
        <div className="review-column">
          <h3>关键优秀决策</h3>
          {review.strengths.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
        <div className="review-column">
          <h3>关键风险决策</h3>
          {review.risks.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
