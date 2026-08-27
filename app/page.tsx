'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type EventType = 'daily' | 'todo' | 'habit';
type Matrix = 'important-urgent' | 'urgent' | 'important' | 'later';
type Period = 'day' | 'week' | 'month';
type ChartMode = 'line' | 'heatmap';

type TracEvent = {
  id: string;
  type: EventType;
  name: string;
  tags: string[];
  category: string;
  matrix?: Matrix;
  workload?: number;
  hasMetric?: boolean;
  metricPrompt?: string;
  completed?: boolean;
  completedAt?: string;
  totalMs: number;
  metricRecords: { value: number; at: string }[];
};

type Segment = {
  id: string;
  eventId: string;
  eventName: string;
  eventType: EventType;
  start: string;
  end: string;
  durationMs: number;
};

type PersistedState = {
  events: TracEvent[];
  segments: Segment[];
  activeEventId: string | null;
  activeStartedAt: string | null;
  chartMode: ChartMode;
};

const STORAGE_KEY = 'trac-campus-life-state-v1';

const typeMeta: Record<EventType, { label: string; icon: string }> = {
  daily: { label: '日常', icon: 'routine' },
  todo: { label: '待办', icon: 'assignment_turned_in' },
  habit: { label: '习惯', icon: 'self_improvement' },
};

const matrixMeta: Record<Matrix, { label: string; short: string }> = {
  'important-urgent': { label: '重要紧急', short: 'IU' },
  urgent: { label: '不重要紧急', short: 'U' },
  important: { label: '重要不紧急', short: 'I' },
  later: { label: '不重要不紧急', short: 'L' },
};

const sectionOrder: { key: string; label: string; filter: (event: TracEvent) => boolean }[] = [
  { key: 'daily', label: '日常', filter: (event) => event.type === 'daily' },
  {
    key: 'important-urgent',
    label: '重要紧急的待办',
    filter: (event) => event.type === 'todo' && event.matrix === 'important-urgent' && !event.completed,
  },
  {
    key: 'urgent',
    label: '不重要紧急的待办',
    filter: (event) => event.type === 'todo' && event.matrix === 'urgent' && !event.completed,
  },
  {
    key: 'important',
    label: '重要不紧急的待办',
    filter: (event) => event.type === 'todo' && event.matrix === 'important' && !event.completed,
  },
  {
    key: 'later',
    label: '不重要不紧急的待办',
    filter: (event) => event.type === 'todo' && event.matrix === 'later' && !event.completed,
  },
  { key: 'habit', label: '习惯', filter: (event) => event.type === 'habit' },
];

const seedEvents: TracEvent[] = [
  {
    id: 'daily-breakfast',
    type: 'daily',
    name: '早餐与通勤',
    tags: [],
    category: '默认',
    totalMs: 42 * 60 * 1000,
    metricRecords: [],
  },
  {
    id: 'todo-calculus',
    type: 'todo',
    name: '微积分习题集',
    tags: ['微积分', '作业'],
    category: '学习',
    matrix: 'important-urgent',
    workload: 4,
    totalMs: 86 * 60 * 1000,
    metricRecords: [],
  },
  {
    id: 'todo-english',
    type: 'todo',
    name: '英语展示准备',
    tags: ['英语', '演讲'],
    category: '预习',
    matrix: 'important',
    workload: 3,
    totalMs: 28 * 60 * 1000,
    metricRecords: [],
  },
  {
    id: 'habit-words',
    type: 'habit',
    name: '背单词',
    tags: ['英语'],
    category: '习惯',
    hasMetric: true,
    metricPrompt: '背了多少个单词？',
    totalMs: 31 * 60 * 1000,
    metricRecords: [{ value: 50, at: new Date(Date.now() - 86400000).toISOString() }],
  },
  {
    id: 'habit-run',
    type: 'habit',
    name: '夜跑',
    tags: ['运动'],
    category: '健康',
    hasMetric: true,
    metricPrompt: '跑了多少公里？',
    totalMs: 46 * 60 * 1000,
    metricRecords: [{ value: 3.2, at: new Date(Date.now() - 2 * 86400000).toISOString() }],
  },
];

const now = new Date();
const seedSegments: Segment[] = [
  {
    id: 'seg-1',
    eventId: 'daily-breakfast',
    eventName: '早餐与通勤',
    eventType: 'daily',
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 35).toISOString(),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 17).toISOString(),
    durationMs: 42 * 60 * 1000,
  },
  {
    id: 'seg-2',
    eventId: 'todo-calculus',
    eventName: '微积分习题集',
    eventType: 'todo',
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 5).toISOString(),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 31).toISOString(),
    durationMs: 86 * 60 * 1000,
  },
  {
    id: 'seg-3',
    eventId: 'habit-words',
    eventName: '背单词',
    eventType: 'habit',
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 18).toISOString(),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 49).toISOString(),
    durationMs: 31 * 60 * 1000,
  },
];

const emptyForm = {
  type: 'todo' as EventType,
  name: '',
  tags: '',
  category: '默认',
  matrix: 'important-urgent' as Matrix,
  workload: 3,
  hasMetric: false,
  metricPrompt: '',
};

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} 分钟`;
  return `${hours} 小时 ${minutes} 分钟`;
}

function formatClock(date: string | Date) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function startOfPeriod(date: Date, period: Period) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = copy.getDay() || 7;
    copy.setDate(copy.getDate() - day + 1);
  }
  if (period === 'month') {
    copy.setDate(1);
  }
  return copy;
}

function inPeriod(date: string, period: Period) {
  return new Date(date) >= startOfPeriod(new Date(), period);
}

function groupTotal<T extends string>(entries: { keys: T[]; ms: number }[]) {
  return entries.reduce<Record<T, number>>((acc, item) => {
    item.keys.forEach((key) => {
      acc[key] = (acc[key] || 0) + item.ms;
    });
    return acc;
  }, {} as Record<T, number>);
}

function miniSeries(segments: Segment[], period: Period) {
  const count = period === 'day' ? 8 : period === 'week' ? 7 : 12;
  return Array.from({ length: count }, (_, index) => {
    const relevant = segments.filter((segment) => {
      const segmentDate = new Date(segment.start);
      if (period === 'day') return Math.floor(segmentDate.getHours() / 3) === index;
      if (period === 'week') return (segmentDate.getDay() + 6) % 7 === index;
      return Math.floor((segmentDate.getDate() - 1) / 3) === index;
    });
    return Math.round(relevant.reduce((sum, segment) => sum + segment.durationMs, 0) / 60000);
  });
}

export default function Home() {
  const [events, setEvents] = useState<TracEvent[]>(seedEvents);
  const [segments, setSegments] = useState<Segment[]>(seedSegments);
  const [activeEventId, setActiveEventId] = useState<string | null>('todo-english');
  const [activeStartedAt, setActiveStartedAt] = useState<string | null>(new Date(Date.now() - 17 * 60000).toISOString());
  const [period, setPeriod] = useState<Period>('day');
  const [chartMode, setChartMode] = useState<ChartMode>('line');
  const [form, setForm] = useState(emptyForm);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as PersistedState;
      setEvents(parsed.events?.length ? parsed.events : seedEvents);
      setSegments(parsed.segments || []);
      setActiveEventId(parsed.activeEventId ?? null);
      setActiveStartedAt(parsed.activeStartedAt ?? null);
      setChartMode(parsed.chartMode || 'line');
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const payload: PersistedState = { events, segments, activeEventId, activeStartedAt, chartMode };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [events, segments, activeEventId, activeStartedAt, chartMode]);

  const activeEvent = events.find((event) => event.id === activeEventId) || null;
  const elapsedMs = activeStartedAt ? tick - new Date(activeStartedAt).getTime() : 0;

  const periodSegments = useMemo(
    () => segments.filter((segment) => inPeriod(segment.start, period)),
    [segments, period],
  );

  const stats = useMemo(() => {
    const byEvent = groupTotal(
      periodSegments.map((segment) => ({ keys: [segment.eventName], ms: segment.durationMs })),
    );
    const eventLookup = new Map(events.map((event) => [event.id, event]));
    const dailyTotal = periodSegments
      .filter((segment) => segment.eventType === 'daily')
      .reduce((sum, segment) => sum + segment.durationMs, 0);
    const focusedTotal = periodSegments
      .filter((segment) => segment.eventType !== 'daily')
      .reduce((sum, segment) => sum + segment.durationMs, 0);
    const byTag = groupTotal(
      periodSegments.map((segment) => {
        const event = eventLookup.get(segment.eventId);
        return { keys: (event?.tags?.length ? event.tags : ['未标记']) as string[], ms: segment.durationMs };
      }),
    );
    const byCategory = groupTotal(
      periodSegments.map((segment) => {
        const event = eventLookup.get(segment.eventId);
        return { keys: [event?.category || '默认'], ms: segment.durationMs };
      }),
    );
    const completedWorkload = events
      .filter((event) => event.type === 'todo' && event.completed && event.completedAt && inPeriod(event.completedAt, period))
      .reduce((sum, event) => sum + (event.workload || 0), 0);

    return { byEvent, byTag, byCategory, dailyTotal, focusedTotal, completedWorkload };
  }, [events, period, periodSegments]);

  const series = useMemo(() => miniSeries(periodSegments, period), [periodSegments, period]);

  function closeActive(nextStartedAt: Date) {
    if (!activeEvent || !activeStartedAt) return;
    const started = new Date(activeStartedAt);
    const durationMs = Math.max(0, nextStartedAt.getTime() - started.getTime());
    if (durationMs < 1000) return;

    const segment: Segment = {
      id: makeId('segment'),
      eventId: activeEvent.id,
      eventName: activeEvent.name,
      eventType: activeEvent.type,
      start: started.toISOString(),
      end: nextStartedAt.toISOString(),
      durationMs,
    };

    setSegments((current) => [segment, ...current]);
    setEvents((current) =>
      current.map((event) =>
        event.id === activeEvent.id ? { ...event, totalMs: event.totalMs + durationMs } : event,
      ),
    );

    if (activeEvent.type === 'todo' && !activeEvent.completed) {
      const done = window.confirm(`“${activeEvent.name}”已经完成了吗？`);
      if (done) {
        setEvents((current) =>
          current.map((event) =>
            event.id === activeEvent.id ? { ...event, completed: true, completedAt: nextStartedAt.toISOString() } : event,
          ),
        );
      }
    }

    if (activeEvent.type === 'habit' && activeEvent.hasMetric) {
      const answer = window.prompt(activeEvent.metricPrompt || `请输入“${activeEvent.name}”的指标数值`);
      const value = Number(answer);
      if (answer !== null && Number.isFinite(value)) {
        setEvents((current) =>
          current.map((event) =>
            event.id === activeEvent.id
              ? { ...event, metricRecords: [...event.metricRecords, { value, at: nextStartedAt.toISOString() }] }
              : event,
          ),
        );
      }
    }
  }

  function switchEvent(eventId: string) {
    const switchedAt = new Date();
    closeActive(switchedAt);
    setActiveEventId(eventId);
    setActiveStartedAt(switchedAt.toISOString());
  }

  function stopTracking() {
    closeActive(new Date());
    setActiveEventId(null);
    setActiveStartedAt(null);
  }

  function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const nextEvent: TracEvent = {
      id: makeId('event'),
      type: form.type,
      name,
      tags: form.type === 'daily' ? [] : form.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      category: form.type === 'daily' ? '默认' : form.category.trim() || '默认',
      matrix: form.type === 'todo' ? form.matrix : undefined,
      workload: form.type === 'todo' ? form.workload : undefined,
      hasMetric: form.type === 'habit' ? form.hasMetric : undefined,
      metricPrompt: form.type === 'habit' && form.hasMetric ? form.metricPrompt.trim() : undefined,
      totalMs: 0,
      metricRecords: [],
      completed: false,
    };
    setEvents((current) => [nextEvent, ...current]);
    setForm(emptyForm);
  }

  function toggleTodoDone(eventId: string) {
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? { ...event, completed: !event.completed, completedAt: !event.completed ? new Date().toISOString() : undefined }
          : event,
      ),
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Campus life tracker</p>
          <h1>Trac</h1>
        </div>
        <div className="today-pill">
          <span className="material-symbols-outlined" aria-hidden="true">calendar_today</span>
          {new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}
        </div>
      </header>

      <section className="tracker-panel" aria-label="当前事件">
        <div className="current-block">
          <span className="material-symbols-outlined active-icon" aria-hidden="true">
            {activeEvent ? typeMeta[activeEvent.type].icon : 'pause_circle'}
          </span>
          <div>
            <p className="eyebrow">当前正在进行</p>
            <h2>{activeEvent ? activeEvent.name : '尚未开始记录'}</h2>
            <p>{activeEvent ? `${typeMeta[activeEvent.type].label} · 从 ${formatClock(activeStartedAt || new Date())} 开始` : '选择一个事件，Trac 会开始记录你的时间线。'}</p>
          </div>
        </div>
        <div className="timer-readout" aria-live="polite">
          {formatDuration(elapsedMs)}
        </div>
        <button className="icon-button stop" onClick={stopTracking} disabled={!activeEvent}>
          <span className="material-symbols-outlined" aria-hidden="true">stop_circle</span>
          <span>结束</span>
        </button>
      </section>

      <div className="workspace">
        <section className="chooser" aria-label="事件切换">
          <div className="section-head">
            <div>
              <p className="eyebrow">Switch</p>
              <h2>切换事件</h2>
            </div>
            <span className="count">{events.length}</span>
          </div>

          <div className="event-sections">
            {sectionOrder.map((section) => {
              const items = events.filter(section.filter);
              return (
                <div className="event-section" key={section.key}>
                  <h3>{section.label}</h3>
                  {items.length === 0 ? (
                    <p className="empty">暂无事件</p>
                  ) : (
                    <div className="event-list">
                      {items.map((event) => (
                        <button
                          className={`event-row ${activeEventId === event.id ? 'selected' : ''}`}
                          key={event.id}
                          onClick={() => switchEvent(event.id)}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">{typeMeta[event.type].icon}</span>
                          <span>
                            <strong>{event.name}</strong>
                            <small>
                              {event.type === 'todo' && event.matrix ? `${matrixMeta[event.matrix].label} · 工作量 ${event.workload}` : event.category}
                              {event.tags.length ? ` · ${event.tags.join(' / ')}` : ''}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="timeline" aria-label="时间轴">
          <div className="section-head">
            <div>
              <p className="eyebrow">Timeline</p>
              <h2>今天的轨迹</h2>
            </div>
            <span className="live-dot">现在</span>
          </div>

          <div className="timeline-list">
            {activeEvent && (
              <article className="timeline-item active">
                <span className="rail-dot" />
                <div>
                  <time>{formatClock(activeStartedAt || new Date())} - 现在</time>
                  <h3>{activeEvent.name}</h3>
                  <p>已进行 {formatDuration(elapsedMs)}</p>
                </div>
              </article>
            )}
            {segments.slice(0, 8).map((segment) => (
              <article className="timeline-item" key={segment.id}>
                <span className="rail-dot" />
                <div>
                  <time>{formatClock(segment.start)} - {formatClock(segment.end)}</time>
                  <h3>{segment.eventName}</h3>
                  <p>{typeMeta[segment.eventType].label} · {formatDuration(segment.durationMs)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="side-stack">
          <section className="panel">
            <div className="section-head compact">
              <h2>添加事件</h2>
              <span className="material-symbols-outlined" aria-hidden="true">add_task</span>
            </div>
            <form className="event-form" onSubmit={addEvent}>
              <label>
                类型
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as EventType })}>
                  <option value="daily">日常</option>
                  <option value="todo">待办</option>
                  <option value="habit">习惯</option>
                </select>
              </label>
              <label>
                名称
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如 复习线性代数" />
              </label>
              {form.type !== 'daily' && (
                <>
                  <label>
                    标签
                    <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="英语, 微积分" />
                  </label>
                  <label>
                    分类
                    <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
                  </label>
                </>
              )}
              {form.type === 'todo' && (
                <>
                  <label>
                    重要紧急程度
                    <select value={form.matrix} onChange={(event) => setForm({ ...form, matrix: event.target.value as Matrix })}>
                      {Object.entries(matrixMeta).map(([key, value]) => (
                        <option value={key} key={key}>{value.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    工作量
                    <input type="range" min="1" max="5" value={form.workload} onChange={(event) => setForm({ ...form, workload: Number(event.target.value) })} />
                    <span className="range-value">{form.workload}</span>
                  </label>
                </>
              )}
              {form.type === 'habit' && (
                <>
                  <label className="toggle-line">
                    <input type="checkbox" checked={form.hasMetric} onChange={(event) => setForm({ ...form, hasMetric: event.target.checked })} />
                    记录数字指标
                  </label>
                  {form.hasMetric && (
                    <label>
                      指标提示
                      <input value={form.metricPrompt} onChange={(event) => setForm({ ...form, metricPrompt: event.target.value })} placeholder="例如 背了多少个单词？" />
                    </label>
                  )}
                </>
              )}
              <button className="primary-button" type="submit">
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                添加
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="section-head compact">
              <h2>待办完成</h2>
              <span className="material-symbols-outlined" aria-hidden="true">task_alt</span>
            </div>
            <div className="todo-list">
              {events.filter((event) => event.type === 'todo').map((event) => (
                <label className="todo-row" key={event.id}>
                  <input type="checkbox" checked={Boolean(event.completed)} onChange={() => toggleTodoDone(event.id)} />
                  <span>
                    <strong>{event.name}</strong>
                    <small>工作量 {event.workload} · {event.matrix ? matrixMeta[event.matrix].short : ''}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="analytics" aria-label="统计分析">
        <div className="section-head">
          <div>
            <p className="eyebrow">Analytics</p>
            <h2>统计分析</h2>
          </div>
          <div className="segmented">
            {(['day', 'week', 'month'] as Period[]).map((item) => (
              <button className={period === item ? 'selected' : ''} onClick={() => setPeriod(item)} key={item}>
                {item === 'day' ? '日' : item === 'week' ? '周' : '月'}
              </button>
            ))}
          </div>
        </div>

        <div className="stat-grid">
          <article>
            <span className="material-symbols-outlined" aria-hidden="true">schedule</span>
            <p>日常总耗时</p>
            <strong>{formatDuration(stats.dailyTotal)}</strong>
          </article>
          <article>
            <span className="material-symbols-outlined" aria-hidden="true">bolt</span>
            <p>习惯与待办</p>
            <strong>{formatDuration(stats.focusedTotal)}</strong>
          </article>
          <article>
            <span className="material-symbols-outlined" aria-hidden="true">fitness_center</span>
            <p>完成工作量</p>
            <strong>{stats.completedWorkload}</strong>
          </article>
        </div>

        <div className="chart-card">
          <div className="chart-toolbar">
            <h3>时间趋势</h3>
            <div className="segmented small">
              <button className={chartMode === 'line' ? 'selected' : ''} onClick={() => setChartMode('line')}>折线</button>
              <button className={chartMode === 'heatmap' ? 'selected' : ''} onClick={() => setChartMode('heatmap')}>热力</button>
            </div>
          </div>
          {chartMode === 'line' ? <LineChart values={series} /> : <HeatMap values={series} />}
        </div>

        <div className="breakdowns">
          <Breakdown title="事件耗时" values={stats.byEvent} />
          <Breakdown title="标签耗时" values={stats.byTag} />
          <Breakdown title="分类耗时" values={stats.byCategory} />
          <MetricPanel events={events} />
        </div>
      </section>
    </main>
  );
}

function LineChart({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = 20 + (index * 560) / Math.max(values.length - 1, 1);
      const y = 170 - (value / max) * 130;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg className="line-chart" viewBox="0 0 600 190" role="img" aria-label="时间耗时折线图">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((value, index) => {
        const x = 20 + (index * 560) / Math.max(values.length - 1, 1);
        const y = 170 - (value / max) * 130;
        return <circle key={index} cx={x} cy={y} r="6" />;
      })}
    </svg>
  );
}

function HeatMap({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="heatmap" role="img" aria-label="时间耗时热力图">
      {values.map((value, index) => (
        <span
          key={index}
          style={{ opacity: 0.2 + (value / max) * 0.8 }}
          title={`${value} 分钟`}
        />
      ))}
    </div>
  );
}

function Breakdown({ title, values }: { title: string; values: Record<string, number> }) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(...entries.map((entry) => entry[1]), 1);
  return (
    <article className="breakdown-card">
      <h3>{title}</h3>
      {entries.length === 0 ? <p className="empty">暂无数据</p> : entries.map(([label, value]) => (
        <div className="bar-row" key={label}>
          <div>
            <span>{label}</span>
            <small>{formatDuration(value)}</small>
          </div>
          <span className="bar-track"><span style={{ width: `${(value / max) * 100}%` }} /></span>
        </div>
      ))}
    </article>
  );
}

function MetricPanel({ events }: { events: TracEvent[] }) {
  const habits = events.filter((event) => event.type === 'habit' && event.hasMetric);
  return (
    <article className="breakdown-card">
      <h3>习惯指标</h3>
      {habits.length === 0 ? <p className="empty">暂无指标</p> : habits.map((habit) => {
        const latest = habit.metricRecords.at(-1);
        return (
          <div className="metric-row" key={habit.id}>
            <span>{habit.name}</span>
            <strong>{latest ? latest.value : '-'}</strong>
            <small>{habit.metricPrompt || '指标值'}</small>
          </div>
        );
      })}
    </article>
  );
}
