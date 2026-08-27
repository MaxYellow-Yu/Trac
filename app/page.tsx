'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type AppPage = 'record' | 'events' | 'stats';
type EventType = 'daily' | 'todo' | 'habit';
type Matrix = 'important-urgent' | 'urgent' | 'important' | 'later';
type Period = 'day' | 'week' | 'month';
type ChartMode = 'line' | 'heatmap';
type EventDraft = {
  type: EventType;
  name: string;
  tags: string[];
  category: string;
  matrix: Matrix;
  workload: number;
  hasMetric: boolean;
  metricPrompt: string;
};

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
  categories?: string[];
  tags?: string[];
};

const STORAGE_KEY = 'trac-campus-life-state-v2';
const LEGACY_STORAGE_KEY = 'trac-campus-life-state-v1';

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

const pageMeta: Record<AppPage, { label: string; icon: string }> = {
  record: { label: '时间记录', icon: 'timer' },
  events: { label: '事件编辑', icon: 'edit_note' },
  stats: { label: '统计数据', icon: 'monitoring' },
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

const defaultCategories = ['默认', '学习', '作业', '预习', '健康', '习惯'];
const defaultTags = ['英语', '微积分', '作业', '演讲', '运动'];

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

const emptyDraft: EventDraft = {
  type: 'todo',
  name: '',
  tags: [],
  category: '默认',
  matrix: 'important-urgent',
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

function uniqueList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function deriveCategories(events: TracEvent[]) {
  return uniqueList([...defaultCategories, ...events.map((event) => event.category || '默认')]);
}

function deriveTags(events: TracEvent[]) {
  return uniqueList([...defaultTags, ...events.flatMap((event) => event.tags || [])]);
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

function isToday(date: string) {
  const target = new Date(date);
  const today = new Date();
  return target.getFullYear() === today.getFullYear() && target.getMonth() === today.getMonth() && target.getDate() === today.getDate();
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

function eventToDraft(event: TracEvent): EventDraft {
  return {
    type: event.type,
    name: event.name,
    tags: event.tags || [],
    category: event.category || '默认',
    matrix: event.matrix || 'important-urgent',
    workload: event.workload || 3,
    hasMetric: Boolean(event.hasMetric),
    metricPrompt: event.metricPrompt || '',
  };
}

export default function Home() {
  const [page, setPage] = useState<AppPage>('record');
  const [events, setEvents] = useState<TracEvent[]>(seedEvents);
  const [segments, setSegments] = useState<Segment[]>(seedSegments);
  const [categories, setCategories] = useState<string[]>(defaultCategories);
  const [tags, setTags] = useState<string[]>(defaultTags);
  const [activeEventId, setActiveEventId] = useState<string | null>('todo-english');
  const [activeStartedAt, setActiveStartedAt] = useState<string | null>(new Date(Date.now() - 17 * 60000).toISOString());
  const [period, setPeriod] = useState<Period>('day');
  const [chartMode, setChartMode] = useState<ChartMode>('line');
  const [tick, setTick] = useState(Date.now());
  const [switchOpen, setSwitchOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [metricOpen, setMetricOpen] = useState(false);
  const [metricValue, setMetricValue] = useState('');
  const [pendingEndAt, setPendingEndAt] = useState<string | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [listModal, setListModal] = useState<'category' | 'tag' | null>(null);
  const [listInput, setListInput] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as PersistedState;
      const savedEvents = parsed.events?.length ? parsed.events : seedEvents;
      setEvents(savedEvents);
      setSegments(parsed.segments || []);
      setActiveEventId(parsed.activeEventId ?? null);
      setActiveStartedAt(parsed.activeStartedAt ?? null);
      setChartMode(parsed.chartMode || 'line');
      setCategories(parsed.categories?.length ? parsed.categories : deriveCategories(savedEvents));
      setTags(parsed.tags?.length ? parsed.tags : deriveTags(savedEvents));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const payload: PersistedState = { events, segments, activeEventId, activeStartedAt, chartMode, categories, tags };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [events, segments, activeEventId, activeStartedAt, chartMode, categories, tags]);

  const activeEvent = events.find((event) => event.id === activeEventId) || null;
  const elapsedMs = activeStartedAt ? tick - new Date(activeStartedAt).getTime() : 0;
  const todaySegments = useMemo(() => segments.filter((segment) => isToday(segment.start)), [segments]);
  const periodSegments = useMemo(() => segments.filter((segment) => inPeriod(segment.start, period)), [segments, period]);

  const stats = useMemo(() => {
    const byEvent = groupTotal(periodSegments.map((segment) => ({ keys: [segment.eventName], ms: segment.durationMs })));
    const eventLookup = new Map(events.map((event) => [event.id, event]));
    const dailyTotal = periodSegments.filter((segment) => segment.eventType === 'daily').reduce((sum, segment) => sum + segment.durationMs, 0);
    const focusedTotal = periodSegments.filter((segment) => segment.eventType !== 'daily').reduce((sum, segment) => sum + segment.durationMs, 0);
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

  function closeActive(endAt: Date, completed?: boolean, metric?: number) {
    if (!activeEvent || !activeStartedAt) return;
    const started = new Date(activeStartedAt);
    const durationMs = Math.max(0, endAt.getTime() - started.getTime());
    if (durationMs >= 1000) {
      const segment: Segment = {
        id: makeId('segment'),
        eventId: activeEvent.id,
        eventName: activeEvent.name,
        eventType: activeEvent.type,
        start: started.toISOString(),
        end: endAt.toISOString(),
        durationMs,
      };
      setSegments((current) => [segment, ...current]);
    }

    setEvents((current) =>
      current.map((event) => {
        if (event.id !== activeEvent.id) return event;
        return {
          ...event,
          totalMs: event.totalMs + durationMs,
          completed: event.type === 'todo' && completed ? true : event.completed,
          completedAt: event.type === 'todo' && completed ? endAt.toISOString() : event.completedAt,
          metricRecords:
            event.type === 'habit' && event.hasMetric && metric !== undefined
              ? [...event.metricRecords, { value: metric, at: endAt.toISOString() }]
              : event.metricRecords,
        };
      }),
    );
  }

  function requestEnd() {
    if (!activeEvent) {
      setSwitchOpen(true);
      return;
    }
    setPendingEndAt(new Date().toISOString());
    setCompletionOpen(true);
  }

  function answerCompletion(done: boolean) {
    setCompletionOpen(false);
    if (activeEvent?.type === 'habit' && activeEvent.hasMetric) {
      setMetricValue('');
      setMetricOpen(true);
      return;
    }
    finishEnd(done);
  }

  function submitMetric(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(metricValue);
    finishEnd(false, Number.isFinite(value) ? value : undefined);
    setMetricOpen(false);
  }

  function skipMetric() {
    finishEnd(false);
    setMetricOpen(false);
  }

  function finishEnd(done: boolean, metric?: number) {
    const endAt = new Date(pendingEndAt || new Date().toISOString());
    closeActive(endAt, done, metric);
    setActiveEventId(null);
    setActiveStartedAt(null);
    setPendingEndAt(null);
    setSwitchOpen(true);
  }

  function switchEvent(eventId: string) {
    setActiveEventId(eventId);
    setActiveStartedAt(new Date().toISOString());
    setSwitchOpen(false);
  }

  function sayGoodNight() {
    setActiveEventId(null);
    setActiveStartedAt(null);
    setSwitchOpen(false);
  }

  function openAddEvent() {
    setEditingId(null);
    setDraft({ ...emptyDraft, category: categories[0] || '默认' });
    setEventModalOpen(true);
  }

  function openEditEvent(event: TracEvent) {
    setEditingId(event.id);
    setDraft(eventToDraft(event));
    setEventModalOpen(true);
  }

  function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    const normalizedDraft = {
      ...draft,
      name,
      tags: draft.type === 'daily' ? [] : draft.tags,
      category: draft.type === 'daily' ? '默认' : draft.category || '默认',
    };

    if (editingId) {
      setEvents((current) =>
        current.map((item) =>
          item.id === editingId
            ? {
                ...item,
                type: normalizedDraft.type,
                name: normalizedDraft.name,
                tags: normalizedDraft.tags,
                category: normalizedDraft.category,
                matrix: normalizedDraft.type === 'todo' ? normalizedDraft.matrix : undefined,
                workload: normalizedDraft.type === 'todo' ? normalizedDraft.workload : undefined,
                hasMetric: normalizedDraft.type === 'habit' ? normalizedDraft.hasMetric : undefined,
                metricPrompt: normalizedDraft.type === 'habit' && normalizedDraft.hasMetric ? normalizedDraft.metricPrompt.trim() : undefined,
              }
            : item,
        ),
      );
    } else {
      const nextEvent: TracEvent = {
        id: makeId('event'),
        type: normalizedDraft.type,
        name: normalizedDraft.name,
        tags: normalizedDraft.tags,
        category: normalizedDraft.category,
        matrix: normalizedDraft.type === 'todo' ? normalizedDraft.matrix : undefined,
        workload: normalizedDraft.type === 'todo' ? normalizedDraft.workload : undefined,
        hasMetric: normalizedDraft.type === 'habit' ? normalizedDraft.hasMetric : undefined,
        metricPrompt: normalizedDraft.type === 'habit' && normalizedDraft.hasMetric ? normalizedDraft.metricPrompt.trim() : undefined,
        totalMs: 0,
        metricRecords: [],
        completed: false,
      };
      setEvents((current) => [...current, nextEvent]);
    }
    setEventModalOpen(false);
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

  function reorder(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    setEvents((current) => {
      const next = [...current];
      const from = next.findIndex((event) => event.id === draggingId);
      const to = next.findIndex((event) => event.id === targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function addListItem() {
    const value = listInput.trim();
    if (!value || !listModal) return;
    if (listModal === 'category') setCategories((current) => uniqueList([...current, value]));
    if (listModal === 'tag') setTags((current) => uniqueList([...current, value]));
    setListInput('');
  }

  function removeListItem(value: string) {
    if (listModal === 'category') {
      setCategories((current) => current.filter((item) => item !== value));
      setEvents((current) => current.map((event) => (event.category === value ? { ...event, category: '默认' } : event)));
    }
    if (listModal === 'tag') {
      setTags((current) => current.filter((item) => item !== value));
      setEvents((current) => current.map((event) => ({ ...event, tags: event.tags.filter((tag) => tag !== value) })));
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Campus life tracker</p>
          <h1>Trac</h1>
        </div>
        <nav className="page-tabs" aria-label="页面导航">
          {(['record', 'events', 'stats'] as AppPage[]).map((item) => (
            <button className={page === item ? 'selected' : ''} key={item} onClick={() => setPage(item)}>
              <span className="material-symbols-outlined" aria-hidden="true">{pageMeta[item].icon}</span>
              {pageMeta[item].label}
            </button>
          ))}
        </nav>
      </header>

      {page === 'record' && (
        <RecordPage
          activeEvent={activeEvent}
          activeStartedAt={activeStartedAt}
          elapsedMs={elapsedMs}
          segments={todaySegments}
          onEnd={requestEnd}
          onMorning={() => setSwitchOpen(true)}
        />
      )}

      {page === 'events' && (
        <EventsPage
          events={events}
          activeEventId={activeEventId}
          onAdd={openAddEvent}
          onEdit={openEditEvent}
          onEditCategories={() => { setListModal('category'); setListInput(''); }}
          onEditTags={() => { setListModal('tag'); setListInput(''); }}
          onToggleDone={toggleTodoDone}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          reorder={reorder}
        />
      )}

      {page === 'stats' && (
        <StatsPage
          period={period}
          setPeriod={setPeriod}
          chartMode={chartMode}
          setChartMode={setChartMode}
          stats={stats}
          series={series}
          events={events}
        />
      )}

      <SwitchModal open={switchOpen} events={events} activeEventId={activeEventId} onPick={switchEvent} onGoodNight={sayGoodNight} onClose={() => setSwitchOpen(false)} />

      <Dialog open={completionOpen} title="事件完成了吗？" icon="task_alt" onClose={() => answerCompletion(false)}>
        <p className="dialog-copy">结束“{activeEvent?.name}”前，先记录它是否已经完成。日常和习惯事件会继续保存本段时间。</p>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={() => answerCompletion(false)}>未完成</button>
          <button className="primary-button inline" onClick={() => answerCompletion(true)}>已完成</button>
        </div>
      </Dialog>

      <Dialog open={metricOpen} title="记录习惯指标" icon="straighten" onClose={skipMetric}>
        <form className="event-form" onSubmit={submitMetric}>
          <label>
            {activeEvent?.metricPrompt || '请输入指标数值'}
            <input type="number" value={metricValue} onChange={(event) => setMetricValue(event.target.value)} autoFocus />
          </label>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={skipMetric}>跳过</button>
            <button className="primary-button inline" type="submit">保存</button>
          </div>
        </form>
      </Dialog>

      <EventEditorModal
        open={eventModalOpen}
        draft={draft}
        setDraft={setDraft}
        editing={Boolean(editingId)}
        categories={categories}
        tags={tags}
        onSubmit={saveEvent}
        onClose={() => setEventModalOpen(false)}
      />

      <ListEditorModal
        kind={listModal}
        items={listModal === 'category' ? categories : tags}
        input={listInput}
        setInput={setListInput}
        onAdd={addListItem}
        onRemove={removeListItem}
        onClose={() => setListModal(null)}
      />
    </main>
  );
}

function RecordPage({ activeEvent, activeStartedAt, elapsedMs, segments, onEnd, onMorning }: {
  activeEvent: TracEvent | null;
  activeStartedAt: string | null;
  elapsedMs: number;
  segments: Segment[];
  onEnd: () => void;
  onMorning: () => void;
}) {
  return (
    <div className="page-grid record-grid">
      <section className={`tracker-panel ${activeEvent ? '' : 'sleeping'}`} aria-label="当前事件">
        <div className="current-block">
          <span className="material-symbols-outlined active-icon" aria-hidden="true">
            {activeEvent ? typeMeta[activeEvent.type].icon : 'bedtime'}
          </span>
          <div>
            <p className="eyebrow">{activeEvent ? '当前任务情况' : '晚安模式'}</p>
            <h2>{activeEvent ? activeEvent.name : '当前没有事件'}</h2>
            <p>{activeEvent ? `${typeMeta[activeEvent.type].label} · 从 ${formatClock(activeStartedAt || new Date())} 开始` : '休息结束后，按下早安选择今天的第一件事。'}</p>
          </div>
        </div>
        <div className="timer-readout" aria-live="polite">{activeEvent ? formatDuration(elapsedMs) : '休息中'}</div>
        {activeEvent ? (
          <button className="icon-button stop" onClick={onEnd}>
            <span className="material-symbols-outlined" aria-hidden="true">stop_circle</span>
            <span>结束</span>
          </button>
        ) : (
          <button className="primary-button inline" onClick={onMorning}>
            <span className="material-symbols-outlined" aria-hidden="true">wb_sunny</span>
            <span>早安</span>
          </button>
        )}
      </section>

      <section className="timeline wide" aria-label="今日轨迹">
        <div className="section-head">
          <div>
            <p className="eyebrow">Timeline</p>
            <h2>今日轨迹</h2>
          </div>
          <span className="live-dot">今天</span>
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
          {segments.length === 0 && !activeEvent ? <p className="empty">今天还没有轨迹。</p> : segments.map((segment) => (
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
    </div>
  );
}

function EventsPage({ events, activeEventId, onAdd, onEdit, onEditCategories, onEditTags, onToggleDone, draggingId, setDraggingId, reorder }: {
  events: TracEvent[];
  activeEventId: string | null;
  onAdd: () => void;
  onEdit: (event: TracEvent) => void;
  onEditCategories: () => void;
  onEditTags: () => void;
  onToggleDone: (id: string) => void;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  reorder: (targetId: string) => void;
}) {
  return (
    <div className="page-grid">
      <section className="chooser wide" aria-label="事件编辑">
        <div className="section-head">
          <div>
            <p className="eyebrow">Events</p>
            <h2>事件编辑</h2>
          </div>
          <div className="toolbar">
            <button className="primary-button inline" onClick={onAdd}><span className="material-symbols-outlined" aria-hidden="true">add</span>添加事件</button>
            <button className="secondary-button" onClick={onEditCategories}><span className="material-symbols-outlined" aria-hidden="true">category</span>编辑分类</button>
            <button className="secondary-button" onClick={onEditTags}><span className="material-symbols-outlined" aria-hidden="true">sell</span>编辑标签</button>
          </div>
        </div>
        <div className="event-sections">
          {sectionOrder.map((section) => {
            const items = events.filter(section.filter);
            return (
              <div className="event-section" key={section.key}>
                <h3>{section.label}</h3>
                {items.length === 0 ? <p className="empty">暂无事件</p> : (
                  <div className="event-list">
                    {items.map((event) => (
                      <article
                        className={`event-row editable ${activeEventId === event.id ? 'selected' : ''} ${draggingId === event.id ? 'dragging' : ''}`}
                        key={event.id}
                        draggable
                        onDragStart={() => setDraggingId(event.id)}
                        onDragEnter={() => reorder(event.id)}
                        onDragOver={(dragEvent) => dragEvent.preventDefault()}
                        onDragEnd={() => setDraggingId(null)}
                      >
                        <span className="material-symbols-outlined drag-icon" aria-hidden="true">drag_indicator</span>
                        <span>
                          <strong>{event.name}</strong>
                          <small>
                            {event.type === 'todo' && event.matrix ? `${matrixMeta[event.matrix].label} · 工作量 ${event.workload}` : event.category}
                            {event.tags.length ? ` · ${event.tags.join(' / ')}` : ''}
                          </small>
                        </span>
                        {event.type === 'todo' && (
                          <label className="mini-check">
                            <input type="checkbox" checked={Boolean(event.completed)} onChange={() => onToggleDone(event.id)} />
                            完成
                          </label>
                        )}
                        <button className="icon-only" onClick={() => onEdit(event)} aria-label={`编辑 ${event.name}`}>
                          <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatsPage({ period, setPeriod, chartMode, setChartMode, stats, series, events }: {
  period: Period;
  setPeriod: (period: Period) => void;
  chartMode: ChartMode;
  setChartMode: (mode: ChartMode) => void;
  stats: { byEvent: Record<string, number>; byTag: Record<string, number>; byCategory: Record<string, number>; dailyTotal: number; focusedTotal: number; completedWorkload: number };
  series: number[];
  events: TracEvent[];
}) {
  return (
    <section className="analytics" aria-label="统计数据">
      <div className="section-head">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>统计数据</h2>
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
        <article><span className="material-symbols-outlined" aria-hidden="true">schedule</span><p>日常总耗时</p><strong>{formatDuration(stats.dailyTotal)}</strong></article>
        <article><span className="material-symbols-outlined" aria-hidden="true">bolt</span><p>习惯与待办</p><strong>{formatDuration(stats.focusedTotal)}</strong></article>
        <article><span className="material-symbols-outlined" aria-hidden="true">fitness_center</span><p>完成工作量</p><strong>{stats.completedWorkload}</strong></article>
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
  );
}

function SwitchModal({ open, events, activeEventId, onPick, onGoodNight, onClose }: {
  open: boolean;
  events: TracEvent[];
  activeEventId: string | null;
  onPick: (id: string) => void;
  onGoodNight: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title="切换任务" icon="swap_horiz" onClose={onClose} wide>
      <div className="event-sections modal-sections">
        <button className="good-night-button" onClick={onGoodNight}>
          <span className="material-symbols-outlined" aria-hidden="true">nights_stay</span>
          <span><strong>晚安</strong><small>结束今天的记录，不再设置当前事件。</small></span>
        </button>
        {sectionOrder.map((section) => {
          const items = events.filter(section.filter);
          return (
            <div className="event-section" key={section.key}>
              <h3>{section.label}</h3>
              {items.length === 0 ? <p className="empty">暂无事件</p> : (
                <div className="event-list">
                  {items.map((event) => (
                    <button className={`event-row ${activeEventId === event.id ? 'selected' : ''}`} key={event.id} onClick={() => onPick(event.id)}>
                      <span className="material-symbols-outlined" aria-hidden="true">{typeMeta[event.type].icon}</span>
                      <span>
                        <strong>{event.name}</strong>
                        <small>{event.category}{event.tags.length ? ` · ${event.tags.join(' / ')}` : ''}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

function EventEditorModal({ open, draft, setDraft, editing, categories, tags, onSubmit, onClose }: {
  open: boolean;
  draft: EventDraft;
  setDraft: (draft: EventDraft) => void;
  editing: boolean;
  categories: string[];
  tags: string[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  function toggleTag(tag: string) {
    setDraft({ ...draft, tags: draft.tags.includes(tag) ? draft.tags.filter((item) => item !== tag) : [...draft.tags, tag] });
  }

  return (
    <Dialog open={open} title={editing ? '编辑事件' : '添加事件'} icon={editing ? 'edit_note' : 'add_task'} onClose={onClose} wide>
      <form className="event-form" onSubmit={onSubmit}>
        <label>
          类型
          <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as EventType })}>
            <option value="daily">日常</option>
            <option value="todo">待办</option>
            <option value="habit">习惯</option>
          </select>
        </label>
        <label>
          名称
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如 复习线性代数" autoFocus />
        </label>
        {draft.type !== 'daily' && (
          <>
            <div className="field-block">
              <span>分类</span>
              <div className="chip-grid">
                {categories.map((category) => (
                  <button type="button" className={`choice-chip ${draft.category === category ? 'selected' : ''}`} key={category} onClick={() => setDraft({ ...draft, category })}>
                    {category}
                  </button>
                ))}
              </div>
            </div>
            <div className="field-block">
              <span>标签</span>
              <div className="chip-grid">
                {tags.map((tag) => (
                  <button type="button" className={`choice-chip ${draft.tags.includes(tag) ? 'selected' : ''}`} key={tag} onClick={() => toggleTag(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {draft.type === 'todo' && (
          <>
            <label>
              重要紧急程度
              <select value={draft.matrix} onChange={(event) => setDraft({ ...draft, matrix: event.target.value as Matrix })}>
                {Object.entries(matrixMeta).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}
              </select>
            </label>
            <label>
              工作量
              <input type="range" min="1" max="5" value={draft.workload} onChange={(event) => setDraft({ ...draft, workload: Number(event.target.value) })} />
              <span className="range-value">{draft.workload}</span>
            </label>
          </>
        )}
        {draft.type === 'habit' && (
          <>
            <label className="toggle-line">
              <input type="checkbox" checked={draft.hasMetric} onChange={(event) => setDraft({ ...draft, hasMetric: event.target.checked })} />
              记录数字指标
            </label>
            {draft.hasMetric && (
              <label>
                指标提示
                <input value={draft.metricPrompt} onChange={(event) => setDraft({ ...draft, metricPrompt: event.target.value })} placeholder="例如 背了多少个单词？" />
              </label>
            )}
          </>
        )}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button inline" type="submit">保存</button>
        </div>
      </form>
    </Dialog>
  );
}

function ListEditorModal({ kind, items, input, setInput, onAdd, onRemove, onClose }: {
  kind: 'category' | 'tag' | null;
  items: string[];
  input: string;
  setInput: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(kind)} title={kind === 'category' ? '编辑分类' : '编辑标签'} icon={kind === 'category' ? 'category' : 'sell'} onClose={onClose}>
      <div className="list-editor">
        <div className="inline-input">
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={kind === 'category' ? '新分类名称' : '新标签名称'} />
          <button className="primary-button inline" onClick={onAdd}>添加</button>
        </div>
        <div className="managed-list">
          {items.map((item) => (
            <span key={item}>
              {item}
              <button onClick={() => onRemove(item)} aria-label={`删除 ${item}`}>
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </span>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function Dialog({ open, title, icon, onClose, children, wide = false }: {
  open: boolean;
  title: string;
  icon: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
          <h2>{title}</h2>
          <button className="icon-only" onClick={onClose} aria-label="关闭弹窗">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
        {children}
      </section>
    </div>
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
        <span key={index} style={{ opacity: 0.2 + (value / max) * 0.8 }} title={`${value} 分钟`} />
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
          <div><span>{label}</span><small>{formatDuration(value)}</small></div>
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
