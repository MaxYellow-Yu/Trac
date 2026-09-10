'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type AppPage = 'record' | 'events' | 'stats';
type EventType = 'daily' | 'todo' | 'habit';
type LegacyMatrix = 'important-urgent' | 'urgent' | 'important' | 'later';
type Importance = 'important' | 'unimportant';
type Period = 'day' | 'week' | 'month';
type TrendMode = 'workload' | 'event' | 'tag' | 'category' | 'habit';
type TrendSeries = { label: string; color: string; values: number[] };
type MetricRecordDraft = { value: string; at: string };
type EventDraft = {
  type: EventType;
  name: string;
  tags: string[];
  category: string;
  importance: Importance;
  deadline: string;
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
  importance?: Importance;
  deadline?: string;
  matrix?: LegacyMatrix;
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

type TimelineDraftItem = Segment & { active?: boolean };

type PersistedState = {
  events: TracEvent[];
  segments: Segment[];
  activeEventId: string | null;
  activeStartedAt: string | null;
  trendMode?: TrendMode;
  chartMode?: 'line' | 'heatmap';
  categories?: string[];
  tags?: string[];
};

const STORAGE_KEY = 'trac-campus-life-state-v2';
const LEGACY_STORAGE_KEY = 'trac-campus-life-state-v1';
const SEED_TIMELINE_MIGRATION_KEY = 'trac-seed-timeline-cleared-v1';
const seedSegmentIds = new Set(['seg-1', 'seg-2', 'seg-3']);

const typeMeta: Record<EventType, { label: string; icon: string }> = {
  daily: { label: '日常', icon: 'routine' },
  todo: { label: '待办', icon: 'assignment_turned_in' },
  habit: { label: '习惯', icon: 'self_improvement' },
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
    filter: (event) => event.type === 'todo' && getEventImportance(event) === 'important' && isUrgentDeadline(event.deadline) && !event.completed,
  },
  {
    key: 'urgent',
    label: '不重要紧急的待办',
    filter: (event) => event.type === 'todo' && getEventImportance(event) === 'unimportant' && isUrgentDeadline(event.deadline) && !event.completed,
  },
  {
    key: 'important',
    label: '重要不紧急的待办',
    filter: (event) => event.type === 'todo' && getEventImportance(event) === 'important' && !isUrgentDeadline(event.deadline) && !event.completed,
  },
  {
    key: 'later',
    label: '不重要不紧急的待办',
    filter: (event) => event.type === 'todo' && getEventImportance(event) === 'unimportant' && !isUrgentDeadline(event.deadline) && !event.completed,
  },
  { key: 'habit', label: '习惯', filter: (event) => event.type === 'habit' },
];

const editableSectionOrder: { key: string; label: string; filter: (event: TracEvent) => boolean }[] = [
  { key: 'daily', label: '日常', filter: (event) => event.type === 'daily' && !event.completed },
  {
    key: 'important-urgent',
    label: '重要紧急的待办',
    filter: (event) => event.type === 'todo' && getEventImportance(event) === 'important' && isUrgentDeadline(event.deadline) && !event.completed,
  },
  {
    key: 'urgent',
    label: '不重要紧急的待办',
    filter: (event) => event.type === 'todo' && getEventImportance(event) === 'unimportant' && isUrgentDeadline(event.deadline) && !event.completed,
  },
  {
    key: 'important',
    label: '重要不紧急的待办',
    filter: (event) => event.type === 'todo' && getEventImportance(event) === 'important' && !isUrgentDeadline(event.deadline) && !event.completed,
  },
  {
    key: 'later',
    label: '不重要不紧急的待办',
    filter: (event) => event.type === 'todo' && getEventImportance(event) === 'unimportant' && !isUrgentDeadline(event.deadline) && !event.completed,
  },
  { key: 'habit', label: '习惯', filter: (event) => event.type === 'habit' },
  { key: 'completed', label: '今日已完成', filter: (event) => event.type === 'todo' && Boolean(event.completed && event.completedAt && isToday(event.completedAt)) },
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
    importance: 'important',
    deadline: dateInputValue(new Date(Date.now() + 3 * 86400000)),
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
    importance: 'important',
    deadline: dateInputValue(new Date(Date.now() + 12 * 86400000)),
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

const emptyDraft: EventDraft = {
  type: 'todo',
  name: '',
  tags: [],
  category: '默认',
  importance: 'important',
  deadline: '',
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

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateTimeLocalValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function timeInputValue(date: string | Date) {
  const target = new Date(date);
  return `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
}

function timeOnDate(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function formatDateLabel(date: string | Date) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(date));
}

function getEventImportance(event: TracEvent): Importance {
  if (event.importance) return event.importance;
  return event.matrix === 'important-urgent' || event.matrix === 'important' ? 'important' : 'unimportant';
}

function isUrgentDeadline(deadline?: string) {
  if (!deadline) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${deadline}T00:00:00`);
  return Number.isFinite(target.getTime()) && target.getTime() - today.getTime() <= 7 * 86400000;
}

function eventMetaLine(event: TracEvent) {
  if (event.type === 'todo') {
    return [
      event.deadline ? `DDL ${formatDateLabel(`${event.deadline}T00:00:00`)}` : '',
      `工作量 ${event.workload || 0}`,
      event.category || '默认',
      ...(event.tags || []),
    ].filter(Boolean).join(' · ');
  }
  return [event.category || '默认', ...(event.tags || [])].filter(Boolean).join(' · ');
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
  if (period === 'week') copy.setDate(copy.getDate() - 6);
  if (period === 'month') copy.setDate(copy.getDate() - 29);
  return copy;
}

function periodBounds(period: Period, anchorDate: string) {
  const end = new Date(`${anchorDate}T00:00:00`);
  const start = startOfPeriod(end, period);
  const exclusiveEnd = new Date(end);
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
  return { start, end, exclusiveEnd };
}

function inPeriod(date: string, period: Period, anchorDate = dateInputValue(new Date())) {
  const target = new Date(date);
  const { start, exclusiveEnd } = periodBounds(period, anchorDate);
  return target >= start && target < exclusiveEnd;
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

const trendColors = ['#4f46e5', '#059669', '#d97706', '#e11d48', '#0891b2', '#7c3aed', '#65a30d', '#ea580c', '#0f766e', '#be123c'];

function buildTrendSeries(period: Period, mode: TrendMode, segments: Segment[], events: TracEvent[], anchorDate: string) {
  if (period === 'day') return { labels: [] as string[], dateKeys: [] as string[], series: [] as TrendSeries[] };
  const count = period === 'week' ? 7 : 30;
  const dates = Array.from({ length: count }, (_, index) => {
    const date = new Date(`${anchorDate}T00:00:00`);
    date.setDate(date.getDate() - (count - 1 - index));
    return date;
  });
  const labels = dates.map((date) => formatDateLabel(date));
  const dateKeys = dates.map(dateInputValue);
  const eventLookup = new Map(events.map((event) => [event.id, event]));
  const valuesByLabel = new Map<string, number[]>();

  function ensure(label: string) {
    if (!valuesByLabel.has(label)) valuesByLabel.set(label, Array(count).fill(0));
  }

  function add(label: string, dateKey: string, value: number) {
    const index = dateKeys.indexOf(dateKey);
    if (index < 0) return;
    const values = valuesByLabel.get(label) || Array(count).fill(0);
    values[index] += value;
    valuesByLabel.set(label, values);
  }

  if (mode === 'workload') {
    ensure('日工作量');
    events.forEach((event) => {
      if (event.type === 'todo' && event.completedAt) add('日工作量', dateInputValue(new Date(event.completedAt)), event.workload || 0);
    });
  } else if (mode === 'habit') {
    events.filter((event) => event.type === 'habit' && event.hasMetric).forEach((event) => ensure(event.name));
    events.filter((event) => event.type === 'habit' && event.hasMetric).forEach((event) => {
      event.metricRecords.forEach((record) => add(event.name, dateInputValue(new Date(record.at)), record.value));
    });
  } else {
    if (mode === 'event') events.forEach((event) => ensure(event.name));
    if (mode === 'category') events.forEach((event) => ensure(event.category || '默认'));
    if (mode === 'tag') events.forEach((event) => (event.tags?.length ? event.tags : ['未标记']).forEach(ensure));
    segments.forEach((segment) => {
      const event = eventLookup.get(segment.eventId);
      const dateKey = dateInputValue(new Date(segment.start));
      const minutes = segment.durationMs / 60000;
      if (mode === 'event') add(segment.eventName, dateKey, minutes);
      if (mode === 'category') add(event?.category || '默认', dateKey, minutes);
      if (mode === 'tag') (event?.tags?.length ? event.tags : ['未标记']).forEach((tag) => add(tag, dateKey, minutes));
    });
  }

  const series = Array.from(valuesByLabel.entries())
    .sort((a, b) => b[1].reduce((sum, value) => sum + value, 0) - a[1].reduce((sum, value) => sum + value, 0))
    .map(([label, values], index) => ({ label, values, color: trendColors[index % trendColors.length] }));
  return { labels, dateKeys, series };
}

function eventToDraft(event: TracEvent): EventDraft {
  return {
    type: event.type,
    name: event.name,
    tags: event.tags || [],
    category: event.category || '默认',
    importance: getEventImportance(event),
    deadline: event.deadline || '',
    workload: event.workload || 3,
    hasMetric: Boolean(event.hasMetric),
    metricPrompt: event.metricPrompt || '',
  };
}

export default function Home() {
  const [page, setPage] = useState<AppPage>('record');
  const [events, setEvents] = useState<TracEvent[]>(seedEvents);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [categories, setCategories] = useState<string[]>(defaultCategories);
  const [tags, setTags] = useState<string[]>(defaultTags);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeStartedAt, setActiveStartedAt] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('day');
  const [statsAnchorDate, setStatsAnchorDate] = useState(() => dateInputValue(new Date()));
  const [trendMode, setTrendMode] = useState<TrendMode>('event');
  const [tick, setTick] = useState(Date.now());
  const [switchOpen, setSwitchOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [metricOpen, setMetricOpen] = useState(false);
  const [metricValue, setMetricValue] = useState('');
  const [pendingEndAt, setPendingEndAt] = useState<string | null>(null);
  const [pendingCompletion, setPendingCompletion] = useState(false);
  const [pendingMetric, setPendingMetric] = useState<number | undefined>(undefined);
  const [customEndOpen, setCustomEndOpen] = useState(false);
  const [customEndValue, setCustomEndValue] = useState('');
  const [customEndError, setCustomEndError] = useState('');
  const [metricEditorId, setMetricEditorId] = useState<string | null>(null);
  const [metricRecordDrafts, setMetricRecordDrafts] = useState<MetricRecordDraft[]>([]);
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
      const shouldClearSeedTimeline = !localStorage.getItem(SEED_TIMELINE_MIGRATION_KEY);
      const savedSegments = parsed.segments || [];
      const hadSeedTimeline = savedSegments.some((segment) => seedSegmentIds.has(segment.id));
      const savedEvents = (parsed.events?.length ? parsed.events : seedEvents).map((event) => ({
        ...event,
        importance: getEventImportance(event),
      }));
      setEvents(savedEvents);
      setSegments(shouldClearSeedTimeline ? savedSegments.filter((segment) => !seedSegmentIds.has(segment.id)) : savedSegments);
      setActiveEventId(shouldClearSeedTimeline && hadSeedTimeline ? null : parsed.activeEventId ?? null);
      setActiveStartedAt(shouldClearSeedTimeline && hadSeedTimeline ? null : parsed.activeStartedAt ?? null);
      setTrendMode(parsed.trendMode || 'event');
      setCategories(parsed.categories?.length ? parsed.categories : deriveCategories(savedEvents));
      setTags(parsed.tags?.length ? parsed.tags : deriveTags(savedEvents));
      if (shouldClearSeedTimeline) localStorage.setItem(SEED_TIMELINE_MIGRATION_KEY, '1');
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const payload: PersistedState = { events, segments, activeEventId, activeStartedAt, trendMode, categories, tags };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [events, segments, activeEventId, activeStartedAt, trendMode, categories, tags]);

  const activeEvent = events.find((event) => event.id === activeEventId) || null;
  const elapsedMs = activeStartedAt ? tick - new Date(activeStartedAt).getTime() : 0;
  const periodSegments = useMemo(() => segments.filter((segment) => inPeriod(segment.start, period, statsAnchorDate)), [segments, period, statsAnchorDate]);

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
      .filter((event) => event.type === 'todo' && event.completed && event.completedAt && inPeriod(event.completedAt, period, statsAnchorDate))
      .reduce((sum, event) => sum + (event.workload || 0), 0);

    return { byEvent, byTag, byCategory, dailyTotal, focusedTotal, completedWorkload };
  }, [events, period, periodSegments, statsAnchorDate]);

  const trend = useMemo(() => buildTrendSeries(period, trendMode, segments, events, statsAnchorDate), [events, period, segments, statsAnchorDate, trendMode]);

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
          completed: event.type !== 'daily' && completed ? true : event.completed,
          completedAt: event.type !== 'daily' && completed ? endAt.toISOString() : event.completedAt,
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
    const endAt = new Date().toISOString();
    setPendingEndAt(endAt);
    if (activeEvent.type === 'daily') {
      prepareSwitch(false, undefined, endAt);
      return;
    }
    setCompletionOpen(true);
  }

  function answerCompletion(done: boolean) {
    setCompletionOpen(false);
    if (activeEvent?.type === 'habit' && activeEvent.hasMetric) {
      setMetricValue('');
      setMetricOpen(true);
      return;
    }
    prepareSwitch(done);
  }

  function submitMetric(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(metricValue);
    prepareSwitch(false, Number.isFinite(value) ? value : undefined);
    setMetricOpen(false);
  }

  function skipMetric() {
    prepareSwitch(false);
    setMetricOpen(false);
  }

  function prepareSwitch(done: boolean, metric?: number, endAt = pendingEndAt || new Date().toISOString()) {
    setPendingEndAt(endAt);
    setPendingCompletion(done);
    setPendingMetric(metric);
    setSwitchOpen(true);
  }

  function cancelPendingSwitch() {
    setPendingEndAt(null);
    setPendingCompletion(false);
    setPendingMetric(undefined);
    setSwitchOpen(false);
  }

  function switchEvent(eventId: string) {
    if (activeEventId === eventId) {
      cancelPendingSwitch();
      return;
    }
    const transitionAt = pendingEndAt ? new Date(pendingEndAt) : new Date();
    if (activeEvent && activeStartedAt) closeActive(transitionAt, pendingCompletion, pendingMetric);
    setActiveEventId(eventId);
    setActiveStartedAt(transitionAt.toISOString());
    setPendingEndAt(null);
    setPendingCompletion(false);
    setPendingMetric(undefined);
    setSwitchOpen(false);
  }

  function sayGoodNight() {
    if (activeEvent && activeStartedAt && pendingEndAt) closeActive(new Date(pendingEndAt), pendingCompletion, pendingMetric);
    setActiveEventId(null);
    setActiveStartedAt(null);
    setPendingEndAt(null);
    setPendingCompletion(false);
    setPendingMetric(undefined);
    setSwitchOpen(false);
  }

  function openCustomEnd() {
    if (!activeEvent || !activeStartedAt) return;
    setCustomEndValue(dateTimeLocalValue(new Date()));
    setCustomEndError('');
    setCustomEndOpen(true);
  }

  function submitCustomEnd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeEvent || !activeStartedAt) return;
    const endAt = new Date(customEndValue);
    const startedAt = new Date(activeStartedAt);
    if (!customEndValue || Number.isNaN(endAt.getTime()) || endAt <= startedAt) {
      setCustomEndError('实际终止时间必须晚于本阶段开始时间。');
      return;
    }
    if (endAt > new Date()) {
      setCustomEndError('实际终止时间不能晚于当前时间。');
      return;
    }
    setCustomEndOpen(false);
    prepareSwitch(false, undefined, endAt.toISOString());
  }

  function openMetricRecords(event: TracEvent) {
    setMetricEditorId(event.id);
    setMetricRecordDrafts(event.metricRecords.map((record) => ({ value: String(record.value), at: dateTimeLocalValue(new Date(record.at)) })));
  }

  function saveMetricRecords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!metricEditorId) return;
    const records = metricRecordDrafts.flatMap((record) => {
      const value = Number(record.value);
      const at = new Date(record.at);
      return Number.isFinite(value) && record.value !== '' && !Number.isNaN(at.getTime()) ? [{ value, at: at.toISOString() }] : [];
    }).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    setEvents((current) => current.map((item) => item.id === metricEditorId ? { ...item, metricRecords: records } : item));
    setMetricEditorId(null);
  }

  function shiftStatsAnchor(days: number) {
    setStatsAnchorDate((current) => {
      const next = new Date(`${current}T00:00:00`);
      next.setDate(next.getDate() + days);
      const today = dateInputValue(new Date());
      return next > new Date(`${today}T00:00:00`) ? today : dateInputValue(next);
    });
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
                importance: normalizedDraft.type === 'todo' ? normalizedDraft.importance : undefined,
                deadline: normalizedDraft.type === 'todo' ? normalizedDraft.deadline || undefined : undefined,
                matrix: undefined,
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
        importance: normalizedDraft.type === 'todo' ? normalizedDraft.importance : undefined,
        deadline: normalizedDraft.type === 'todo' ? normalizedDraft.deadline || undefined : undefined,
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

  function toggleEventDone(eventId: string) {
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? { ...event, completed: !event.completed, completedAt: !event.completed ? new Date().toISOString() : undefined }
          : event,
      ),
    );
  }

  function deleteEvent(eventId: string) {
    setEvents((current) => current.filter((event) => event.id !== eventId));
    setSegments((current) => current.filter((segment) => segment.eventId !== eventId));
    if (activeEventId === eventId) {
      setActiveEventId(null);
      setActiveStartedAt(null);
    }
    if (editingId === eventId) {
      setEventModalOpen(false);
      setEditingId(null);
    }
  }

  function saveTimeline(date: string, drafts: TimelineDraftItem[]) {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const belongsToDay = (value: string) => {
      const start = new Date(value);
      return start >= dayStart && start < dayEnd;
    };
    const oldDaySegments = segments.filter((segment) => belongsToDay(segment.start));
    const nextDaySegments: Segment[] = drafts
      .filter((item) => !item.active)
      .map((item) => ({
        id: item.id,
        eventId: item.eventId,
        eventName: item.eventName,
        eventType: item.eventType,
        start: item.start,
        end: item.end,
        durationMs: Math.max(0, new Date(item.end).getTime() - new Date(item.start).getTime()),
      }));
    const totals = (items: Segment[]) => items.reduce<Record<string, number>>((result, item) => {
      result[item.eventId] = (result[item.eventId] || 0) + item.durationMs;
      return result;
    }, {});
    const oldTotals = totals(oldDaySegments);
    const nextTotals = totals(nextDaySegments);
    const affectedIds = new Set([...Object.keys(oldTotals), ...Object.keys(nextTotals)]);

    setSegments((current) => [...current.filter((segment) => !belongsToDay(segment.start)), ...nextDaySegments]);
    setEvents((current) => current.map((item) => affectedIds.has(item.id)
      ? { ...item, totalMs: Math.max(0, item.totalMs - (oldTotals[item.id] || 0) + (nextTotals[item.id] || 0)) }
      : item));

    if (date === dateInputValue(new Date())) {
      const activeDraft = drafts.find((item) => item.active);
      const activeStartedBeforeThisDay = activeStartedAt && new Date(activeStartedAt) < dayStart;
      if (activeDraft) {
        setActiveEventId(activeDraft.eventId);
        setActiveStartedAt(activeDraft.start);
      } else if (!activeStartedBeforeThisDay) {
        setActiveEventId(null);
        setActiveStartedAt(null);
      }
    }
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
          <h1>Trac</h1>
          <p className="brand-subtitle">校园生活时间记录</p>
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
          events={events}
          segments={segments}
          onEnd={requestEnd}
          onCustomEnd={openCustomEnd}
          onMorning={() => setSwitchOpen(true)}
          onSaveTimeline={saveTimeline}
        />
      )}

      {page === 'events' && (
        <EventsPage
          events={events}
          activeEventId={activeEventId}
          onAdd={openAddEvent}
          onEdit={openEditEvent}
          onEditMetrics={openMetricRecords}
          onEditCategories={() => { setListModal('category'); setListInput(''); }}
          onEditTags={() => { setListModal('tag'); setListInput(''); }}
          onToggleDone={toggleEventDone}
          onDelete={deleteEvent}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          reorder={reorder}
          moveEvent={(sourceId, targetId) => {
            setEvents((current) => {
              const next = [...current];
              const from = next.findIndex((item) => item.id === sourceId);
              const to = next.findIndex((item) => item.id === targetId);
              if (from < 0 || to < 0) return current;
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved);
              return next;
            });
          }}
        />
      )}

      {page === 'stats' && (
        <StatsPage
          period={period}
          setPeriod={setPeriod}
          anchorDate={statsAnchorDate}
          onShiftAnchor={shiftStatsAnchor}
          trendMode={trendMode}
          setTrendMode={setTrendMode}
          stats={stats}
          trend={trend}
          events={events}
        />
      )}

      <SwitchModal open={switchOpen} events={events} activeEventId={activeEventId} onPick={switchEvent} onAdd={openAddEvent} onGoodNight={sayGoodNight} onClose={cancelPendingSwitch} />

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
        onDelete={editingId ? () => deleteEvent(editingId) : undefined}
        onClose={() => setEventModalOpen(false)}
      />

      <Dialog open={customEndOpen} title="补记实际终止时间" icon="history" onClose={() => setCustomEndOpen(false)}>
        <form className="event-form" onSubmit={submitCustomEnd}>
          <p className="dialog-copy">修正“{activeEvent?.name}”的结束时间。下一步将使用与普通结束相同的任务选择窗口。</p>
          <label>
            实际终止时间
            <input type="datetime-local" value={customEndValue} min={activeStartedAt ? dateTimeLocalValue(new Date(new Date(activeStartedAt).getTime() + 60000)) : undefined} max={dateTimeLocalValue(new Date())} onChange={(event) => { setCustomEndValue(event.target.value); setCustomEndError(''); }} />
          </label>
          {customEndError && <p className="form-error" role="alert">{customEndError}</p>}
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => setCustomEndOpen(false)}>取消</button>
            <button className="primary-button inline" type="submit">下一步</button>
          </div>
        </form>
      </Dialog>

      <MetricRecordsModal
        open={Boolean(metricEditorId)}
        event={events.find((item) => item.id === metricEditorId) || null}
        records={metricRecordDrafts}
        setRecords={setMetricRecordDrafts}
        onSubmit={saveMetricRecords}
        onClose={() => setMetricEditorId(null)}
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

function RecordPage({ activeEvent, activeStartedAt, elapsedMs, events, segments, onEnd, onCustomEnd, onMorning, onSaveTimeline }: {
  activeEvent: TracEvent | null;
  activeStartedAt: string | null;
  elapsedMs: number;
  events: TracEvent[];
  segments: Segment[];
  onEnd: () => void;
  onCustomEnd: () => void;
  onMorning: () => void;
  onSaveTimeline: (date: string, items: TimelineDraftItem[]) => void;
}) {
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [selectedDate, setSelectedDate] = useState(() => dateInputValue(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [endMenuOpen, setEndMenuOpen] = useState(false);
  const [timelineEditorOpen, setTimelineEditorOpen] = useState(false);
  const [timelineDraft, setTimelineDraft] = useState<TimelineDraftItem[]>([]);
  const todayDate = dateInputValue(new Date());
  const selectedIsToday = selectedDate === todayDate;
  function adjustTimelineZoom(delta: number) {
    setTimelineZoom((current) => Math.min(3.5, Math.max(1, Math.round((current + delta) * 4) / 4)));
  }

  function openTimelineEditor() {
    const dayStart = new Date(`${selectedDate}T00:00:00`);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const items: TimelineDraftItem[] = segments
      .filter((segment) => {
        const start = new Date(segment.start);
        return start >= dayStart && start < dayEnd;
      })
      .map((segment) => ({ ...segment, active: false }));
    if (selectedIsToday && activeEvent && activeStartedAt) {
      const activeStart = new Date(activeStartedAt);
      if (activeStart >= dayStart && activeStart < dayEnd) {
        items.push({
          id: 'active',
          eventId: activeEvent.id,
          eventName: activeEvent.name,
          eventType: activeEvent.type,
          start: activeStartedAt,
          end: new Date().toISOString(),
          durationMs: Date.now() - activeStart.getTime(),
          active: true,
        });
      }
    }
    setTimelineDraft(items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
    setTimelineEditorOpen(true);
  }

  return (
    <div className="page-grid record-grid">
      <section className={`tracker-panel ${activeEvent ? '' : 'sleeping'}`} aria-label="当前事件">
        <div className="current-block">
          <span className="active-icon" aria-hidden="true">
            <span className="material-symbols-outlined">{activeEvent ? typeMeta[activeEvent.type].icon : 'bedtime'}</span>
          </span>
          <div>
            <p className="eyebrow">{activeEvent ? '当前任务情况' : '晚安模式'}</p>
            <h2>{activeEvent ? activeEvent.name : '当前没有事件'}</h2>
            <p>{activeEvent ? `${typeMeta[activeEvent.type].label} · 从 ${formatClock(activeStartedAt || new Date())} 开始` : '休息结束后，按下早安选择今天的第一件事。'}</p>
          </div>
        </div>
        <div className="timer-readout" aria-live="polite">{activeEvent ? formatDuration(elapsedMs) : '休息中'}</div>
        {activeEvent ? (
          <div className="stop-control">
            <button className="icon-button stop stop-main" onClick={() => { setEndMenuOpen(false); onEnd(); }}>
              <span className="material-symbols-outlined" aria-hidden="true">stop_circle</span>
              <span>结束</span>
            </button>
            <button className="stop-dropdown" onClick={() => setEndMenuOpen((open) => !open)} aria-label="更多结束选项" aria-expanded={endMenuOpen}>
              <span className="material-symbols-outlined" aria-hidden="true">arrow_drop_down</span>
            </button>
            {endMenuOpen && (
              <div className="stop-menu">
                <button onClick={() => { setEndMenuOpen(false); onCustomEnd(); }}>
                  <span className="material-symbols-outlined" aria-hidden="true">history</span>
                  <span><strong>补记结束时间</strong><small>填写实际终止时间后选择下一事件</small></span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className="primary-button inline" onClick={onMorning}>
            <span className="material-symbols-outlined" aria-hidden="true">wb_sunny</span>
            <span>早安</span>
          </button>
        )}
      </section>

      <section className="timeline wide" aria-label={`${selectedIsToday ? '今日' : formatDateLabel(`${selectedDate}T00:00:00`)}轨迹`}>
        <div className="section-head">
          <div>
            <p className="eyebrow">Timeline</p>
            <h2>{selectedIsToday ? '今日轨迹' : `${formatDateLabel(`${selectedDate}T00:00:00`)}轨迹`}</h2>
          </div>
          <div className="timeline-tools">
            <button className="secondary-button timeline-edit-button" onClick={openTimelineEditor}>
              <span className="material-symbols-outlined" aria-hidden="true">edit</span>
              <span>编辑</span>
            </button>
            <div className="calendar-anchor">
              <button
                className={`date-picker-trigger ${selectedIsToday ? 'today' : ''}`}
                onClick={() => {
                  const month = new Date(`${selectedDate}T00:00:00`);
                  month.setDate(1);
                  setCalendarMonth(month);
                  setCalendarOpen((open) => !open);
                }}
                aria-expanded={calendarOpen}
                aria-haspopup="dialog"
              >
                <span className="material-symbols-outlined" aria-hidden="true">calendar_today</span>
                <span>{selectedIsToday ? '今天' : formatDateLabel(`${selectedDate}T00:00:00`)}</span>
              </button>
              {calendarOpen && (
                <CalendarPopover
                  month={calendarMonth}
                  selectedDate={selectedDate}
                  maxDate={todayDate}
                  onMonthChange={setCalendarMonth}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setCalendarOpen(false);
                  }}
                  onClose={() => setCalendarOpen(false)}
                />
              )}
            </div>
            <div className="timeline-zoom-controls" aria-label="轨迹缩放">
              <button className="icon-only" onClick={() => adjustTimelineZoom(-0.25)} disabled={timelineZoom <= 1} aria-label="缩小轨迹">
                <span className="material-symbols-outlined" aria-hidden="true">remove</span>
              </button>
              <span>{Math.round(timelineZoom * 100)}%</span>
              <button className="icon-only" onClick={() => adjustTimelineZoom(0.25)} disabled={timelineZoom >= 3.5} aria-label="放大轨迹">
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
              </button>
            </div>
          </div>
        </div>
        <DayTimeline activeEvent={activeEvent} activeStartedAt={activeStartedAt} elapsedMs={elapsedMs} segments={segments} selectedDate={selectedDate} zoom={timelineZoom} onZoom={adjustTimelineZoom} />
      </section>

      <TimelineEditorModal
        open={timelineEditorOpen}
        selectedDate={selectedDate}
        items={timelineDraft}
        setItems={setTimelineDraft}
        events={events}
        onSave={() => {
          onSaveTimeline(selectedDate, timelineDraft);
          setTimelineEditorOpen(false);
        }}
        onClose={() => setTimelineEditorOpen(false)}
      />
    </div>
  );
}

function TimelineEditorModal({ open, selectedDate, items, setItems, events, onSave, onClose }: {
  open: boolean;
  selectedDate: string;
  items: TimelineDraftItem[];
  setItems: (items: TimelineDraftItem[]) => void;
  events: TracEvent[];
  onSave: () => void;
  onClose: () => void;
}) {
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertStart, setInsertStart] = useState('');
  const [insertEnd, setInsertEnd] = useState('');
  const [pendingInsert, setPendingInsert] = useState<{ start: Date; end: Date } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setInsertOpen(false);
    setInsertStart('');
    setInsertEnd('');
    setPendingInsert(null);
    setError('');
  }, [open, selectedDate]);

  function withDurations(next: TimelineDraftItem[]) {
    return next
      .map((item) => ({ ...item, durationMs: Math.max(0, new Date(item.end).getTime() - new Date(item.start).getTime()) }))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  function changeBoundary(index: number, edge: 'start' | 'end', value: string) {
    const boundary = timeOnDate(selectedDate, value);
    if (Number.isNaN(boundary.getTime())) return;
    const next = items.map((item) => ({ ...item }));
    if (edge === 'start') {
      next[index].start = boundary.toISOString();
      if (index > 0) next[index - 1].end = boundary.toISOString();
    } else {
      next[index].end = boundary.toISOString();
      if (index < next.length - 1) next[index + 1].start = boundary.toISOString();
    }
    setError('');
    setItems(withDurations(next));
  }

  function removeItem(index: number) {
    const next = items.map((item) => ({ ...item }));
    const [removed] = next.splice(index, 1);
    const previous = next[index - 1];
    const following = next[index];
    if (previous && following) {
      const midpoint = new Date(Math.round((new Date(removed.start).getTime() + new Date(removed.end).getTime()) / 120000) * 60000).toISOString();
      previous.end = midpoint;
      following.start = midpoint;
    } else if (previous) {
      previous.end = removed.end;
      if (removed.active) {
        previous.active = true;
        previous.id = 'active';
      }
    } else if (following) {
      following.start = removed.start;
    }
    setError('');
    setItems(withDurations(next));
  }

  function requestInsert() {
    const start = timeOnDate(selectedDate, insertStart);
    const end = timeOnDate(selectedDate, insertEnd);
    const now = new Date();
    if (!insertStart || !insertEnd || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError('插入事件的结束时间必须晚于开始时间。');
      return;
    }
    if (selectedDate === dateInputValue(now) && end > now) {
      setError('插入事件的结束时间不能晚于当前时间。');
      return;
    }
    setError('');
    setPendingInsert({ start, end });
  }

  function insertEvent(chosen: TracEvent) {
    if (!pendingInsert) return;
    const { start, end } = pendingInsert;
    const next: TimelineDraftItem[] = [];
    items.forEach((item) => {
      const itemStart = new Date(item.start);
      const itemEnd = new Date(item.end);
      if (itemEnd <= start || itemStart >= end) {
        next.push({ ...item });
        return;
      }
      const hasLeft = itemStart < start;
      const hasRight = itemEnd > end;
      if (hasLeft) {
        next.push({
          ...item,
          id: item.active ? makeId('segment') : item.id,
          end: start.toISOString(),
          active: false,
        });
      }
      if (hasRight) {
        next.push({
          ...item,
          id: item.active ? 'active' : hasLeft ? makeId('segment') : item.id,
          start: end.toISOString(),
          active: item.active,
        });
      }
    });
    next.push({
      id: makeId('segment'),
      eventId: chosen.id,
      eventName: chosen.name,
      eventType: chosen.type,
      start: start.toISOString(),
      end: end.toISOString(),
      durationMs: end.getTime() - start.getTime(),
      active: false,
    });
    setItems(withDurations(next));
    setPendingInsert(null);
    setInsertOpen(false);
    setInsertStart('');
    setInsertEnd('');
  }

  function validateAndSave() {
    const ordered = [...items].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    for (let index = 0; index < ordered.length; index += 1) {
      const item = ordered[index];
      const start = new Date(item.start);
      const end = new Date(item.end);
      if (end <= start) {
        setError(`“${item.eventName}”的结束时间必须晚于开始时间。`);
        return;
      }
      if (index > 0 && start < new Date(ordered[index - 1].end)) {
        setError(`“${item.eventName}”与前一事件的时间发生重叠。`);
        return;
      }
    }
    onSave();
  }

  return (
    <Dialog open={open} title={`编辑 ${formatDateLabel(`${selectedDate}T00:00:00`)}轨迹`} icon="edit_calendar" onClose={onClose} wide>
      {pendingInsert ? (
        <div className="timeline-event-picker">
          <button className="secondary-button picker-back" onClick={() => setPendingInsert(null)}>
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            返回时间设置
          </button>
          <p className="dialog-copy">选择 {insertStart}–{insertEnd} 期间进行的事件。原轨迹会自动为这一时段腾出空间。</p>
          <div className="event-sections modal-sections">
            {sectionOrder.map((section) => {
              const sectionEvents = events.filter(section.filter);
              return (
                <div className="event-section" key={section.key}>
                  <h3>{section.label}</h3>
                  {sectionEvents.length === 0 ? <p className="empty">暂无事件</p> : (
                    <div className="event-list">
                      {sectionEvents.map((item) => (
                        <button className="event-row" key={item.id} onClick={() => insertEvent(item)}>
                          <span className="material-symbols-outlined" aria-hidden="true">{typeMeta[item.type].icon}</span>
                          <span><strong>{item.name}</strong><small>{eventMetaLine(item)}</small></span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <p className="dialog-copy timeline-editor-copy">调整相邻事件的时间点时，两侧会同步衔接；删除事件后，相邻事件会自动补齐空出的时段。</p>
          <div className="timeline-edit-list">
            {items.length === 0 ? <p className="empty">当天还没有事件，可以先插入一段轨迹。</p> : items.map((item, index) => (
              <article className={`timeline-edit-row ${item.active ? 'active' : ''}`} key={item.id}>
                <span className="timeline-edit-order">{index + 1}</span>
                <span className="timeline-edit-event">
                  <span className="material-symbols-outlined" aria-hidden="true">{typeMeta[item.eventType].icon}</span>
                  <span><strong>{item.eventName}</strong><small>{item.active ? '当前事件' : typeMeta[item.eventType].label}</small></span>
                </span>
                <label>
                  开始
                  <input type="time" value={timeInputValue(item.start)} onChange={(event) => changeBoundary(index, 'start', event.target.value)} />
                </label>
                <span className="timeline-time-link material-symbols-outlined" aria-hidden="true">sync_alt</span>
                <label>
                  结束
                  {item.active ? <span className="timeline-now-field">现在</span> : <input type="time" value={timeInputValue(item.end)} onChange={(event) => changeBoundary(index, 'end', event.target.value)} />}
                </label>
                <button className="icon-only event-tool danger" onClick={() => removeItem(index)} aria-label={`从轨迹删除 ${item.eventName}`}>
                  <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                </button>
              </article>
            ))}
          </div>

          {insertOpen ? (
            <div className="timeline-insert-panel">
              <div>
                <strong>插入事件</strong>
                <small>先设置要腾出的时间区间</small>
              </div>
              <label>开始<input type="time" value={insertStart} onChange={(event) => { setInsertStart(event.target.value); setError(''); }} /></label>
              <label>结束<input type="time" value={insertEnd} onChange={(event) => { setInsertEnd(event.target.value); setError(''); }} /></label>
              <button className="primary-button inline" onClick={requestInsert}>选择事件</button>
              <button className="icon-only" onClick={() => { setInsertOpen(false); setError(''); }} aria-label="取消插入">
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
          ) : (
            <button className="secondary-button timeline-add-segment" onClick={() => setInsertOpen(true)}>
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
              插入事件
            </button>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button className="secondary-button" onClick={onClose}>取消</button>
            <button className="primary-button inline" onClick={validateAndSave}>保存轨迹</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function CalendarPopover({ month, selectedDate, maxDate, onMonthChange, onSelect, onClose }: {
  month: Date;
  selectedDate: string;
  maxDate: string;
  onMonthChange: (month: Date) => void;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const max = new Date(`${maxDate}T00:00:00`);
  const currentMonthStart = new Date(max.getFullYear(), max.getMonth(), 1);
  const leading = (monthStart.getDay() + 6) % 7;
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(leading).fill(null), ...Array.from({ length: dayCount }, (_, index) => index + 1)];

  function moveMonth(delta: number) {
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  return (
    <div className="calendar-popover" role="dialog" aria-label="选择轨迹日期">
      <div className="calendar-head">
        <button className="icon-only" onClick={() => moveMonth(-1)} aria-label="上个月"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>
        <strong>{month.getFullYear()}年{month.getMonth() + 1}月</strong>
        <button className="icon-only" onClick={() => moveMonth(1)} disabled={monthStart >= currentMonthStart} aria-label="下个月"><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
        <button className="calendar-close icon-only" onClick={onClose} aria-label="关闭日历"><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-days">
        {cells.map((day, index) => {
          if (day === null) return <span key={`empty-${index}`} />;
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          const value = dateInputValue(date);
          const disabled = date > max;
          return (
            <button className={`${value === selectedDate ? 'selected' : ''} ${value === maxDate ? 'today' : ''}`} disabled={disabled} onClick={() => onSelect(value)} key={value} aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月${day}日`}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayTimeline({ activeEvent, activeStartedAt, elapsedMs, segments, selectedDate, zoom, onZoom }: {
  activeEvent: TracEvent | null;
  activeStartedAt: string | null;
  elapsedMs: number;
  segments: Segment[];
  selectedDate: string;
  zoom: number;
  onZoom: (delta: number) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dayStart = new Date(`${selectedDate}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const now = new Date();
  const selectedIsToday = selectedDate === dateInputValue(now);
  const currentMs = selectedIsToday ? Math.min(dayEnd.getTime(), Math.max(dayStart.getTime(), now.getTime())) : null;
  const dayMs = dayEnd.getTime() - dayStart.getTime();
  const selectedSegments = segments
    .filter((segment) => {
      const start = new Date(segment.start);
      return start >= dayStart && start < dayEnd;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const intervals = [
    ...selectedSegments.map((segment) => ({
      id: segment.id,
      eventName: segment.eventName,
      eventType: segment.eventType,
      start: new Date(segment.start),
      end: new Date(segment.end),
      durationMs: segment.durationMs,
      active: false,
    })),
    ...(selectedIsToday && activeEvent && activeStartedAt
      ? [{
          id: 'active',
          eventName: activeEvent.name,
          eventType: activeEvent.type,
          start: new Date(activeStartedAt),
          end: now,
          durationMs: elapsedMs,
          active: true,
        }]
      : []),
  ].filter((item) => item.start >= dayStart && item.start < dayEnd);

  const markers = [
    ...intervals.flatMap((item) => [item.start, item.end]),
    ...(selectedIsToday ? [now] : []),
  ]
    .filter((date) => date >= dayStart && date <= dayEnd)
    .map((date) => date.getTime());
  const uniqueMarkers = Array.from(new Set(markers)).sort((a, b) => a - b);

  function topFor(date: Date | number) {
    const time = typeof date === 'number' ? date : date.getTime();
    return `${((time - dayStart.getTime()) / dayMs) * 100}%`;
  }

  return (
    <div
      className="timeline-viewport"
      onWheel={(event) => {
        event.preventDefault();
        onZoom(event.deltaY < 0 ? 0.25 : -0.25);
      }}
      aria-label={`${selectedDate} 轨迹，可用鼠标滚轮或缩放按钮调整比例`}
    >
      <div className="day-timeline" style={{ height: `${620 * zoom}px` }}>
        <div className="time-labels" aria-hidden="true">
          <span>00:00</span>
          <span>12:00</span>
          <span>24:00</span>
        </div>
        <div className="day-axis" aria-hidden="true">
          {intervals.map((item) => (
            <span
              className={`day-period ${item.active ? 'active' : ''} ${expandedId === item.id ? 'highlighted' : ''}`}
              key={`period-${item.id}`}
              style={{ top: topFor(item.start), height: `${Math.max(((item.end.getTime() - item.start.getTime()) / dayMs) * 100, 0.35)}%` }}
              onMouseEnter={() => setExpandedId(item.id)}
              onMouseLeave={() => setExpandedId(null)}
            />
          ))}
          {uniqueMarkers.map((time) => (
            <span className={`day-dot ${currentMs !== null && Math.abs(time - currentMs) < 1000 ? 'now' : ''}`} key={time} style={{ top: topFor(time) }} />
          ))}
        </div>
        <div className="day-events">
          {intervals.length === 0 ? <p className="empty">这一天还没有轨迹。</p> : intervals.map((item) => {
            const midpoint = (item.start.getTime() + item.end.getTime()) / 2;
            const expanded = expandedId === item.id;
            return (
              <article
                className={`day-event ${item.active ? 'active' : ''} ${expanded ? 'expanded' : ''}`}
                key={item.id}
                style={{ top: topFor(midpoint) }}
                tabIndex={0}
                onMouseEnter={() => setExpandedId(item.id)}
                onMouseLeave={() => setExpandedId(null)}
                onFocus={() => setExpandedId(item.id)}
                onBlur={() => setExpandedId(null)}
                onClick={() => setExpandedId((current) => current === item.id ? null : item.id)}
              >
                <h3>{item.eventName}</h3>
                <div className="day-event-details">
                  <time>{formatClock(item.start)} - {item.active ? '现在' : formatClock(item.end)}</time>
                  <p>{typeMeta[item.eventType].label} · {formatDuration(item.durationMs)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventsPage({ events, activeEventId, onAdd, onEdit, onEditMetrics, onEditCategories, onEditTags, onToggleDone, onDelete, draggingId, setDraggingId, reorder, moveEvent }: {
  events: TracEvent[];
  activeEventId: string | null;
  onAdd: () => void;
  onEdit: (event: TracEvent) => void;
  onEditMetrics: (event: TracEvent) => void;
  onEditCategories: () => void;
  onEditTags: () => void;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  reorder: (targetId: string) => void;
  moveEvent: (sourceId: string, targetId: string) => void;
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
          {editableSectionOrder.map((section) => {
            const items = events.filter(section.filter);
            return (
              <div className="event-section" key={section.key}>
                <h3>{section.label}</h3>
                {items.length === 0 ? <p className="empty">暂无事件</p> : (
                  <div className="event-list">
                    {items.map((event, index) => (
                      <article
                        className={`event-row editable ${activeEventId === event.id ? 'selected' : ''} ${draggingId === event.id ? 'dragging' : ''}`}
                        key={event.id}
                        draggable
                        onDragStart={() => setDraggingId(event.id)}
                        onDragEnter={() => reorder(event.id)}
                        onDragOver={(dragEvent) => dragEvent.preventDefault()}
                        onDragEnd={() => setDraggingId(null)}
                      >
                        <span className="drag-handle-cell">
                          <span className="material-symbols-outlined drag-icon" aria-hidden="true">drag_indicator</span>
                          <span className="mobile-order-tools">
                            <button className="icon-only event-tool" disabled={index === 0} onClick={() => index > 0 && moveEvent(event.id, items[index - 1].id)} aria-label={`上移 ${event.name}`}>
                              <span className="material-symbols-outlined" aria-hidden="true">keyboard_arrow_up</span>
                            </button>
                            <button className="icon-only event-tool" disabled={index === items.length - 1} onClick={() => index < items.length - 1 && moveEvent(event.id, items[index + 1].id)} aria-label={`下移 ${event.name}`}>
                              <span className="material-symbols-outlined" aria-hidden="true">keyboard_arrow_down</span>
                            </button>
                          </span>
                        </span>
                        <span>
                          <strong>{event.name}</strong>
                          <small>{eventMetaLine(event)}</small>
                        </span>
                        <span className="event-actions">
                          {event.type === 'habit' && event.hasMetric && (
                            <button className="icon-only event-tool metric-tool" onClick={() => onEditMetrics(event)} aria-label={`查看和编辑 ${event.name} 的指标记录`}>
                              <span className="material-symbols-outlined" aria-hidden="true">monitoring</span>
                            </button>
                          )}
                          <button className="icon-only event-tool edit-tool" onClick={() => onEdit(event)} aria-label={`编辑 ${event.name}`}>
                            <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                          </button>
                          <button className="icon-only event-tool danger delete-tool" onClick={() => onDelete(event.id)} aria-label={`删除 ${event.name}`}>
                            <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                          </button>
                          {event.type !== 'daily' && (
                            <button className={`icon-only event-tool completion-tool ${event.completed ? 'done' : ''}`} onClick={() => onToggleDone(event.id)} aria-label={`${event.completed ? '取消完成' : '完成'} ${event.name}`}>
                              <span className="material-symbols-outlined" aria-hidden="true">{event.completed ? 'check_box' : 'check_box_outline_blank'}</span>
                            </button>
                          )}
                        </span>
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

function StatsPage({ period, setPeriod, anchorDate, onShiftAnchor, trendMode, setTrendMode, stats, trend, events }: {
  period: Period;
  setPeriod: (period: Period) => void;
  anchorDate: string;
  onShiftAnchor: (days: number) => void;
  trendMode: TrendMode;
  setTrendMode: (mode: TrendMode) => void;
  stats: { byEvent: Record<string, number>; byTag: Record<string, number>; byCategory: Record<string, number>; dailyTotal: number; focusedTotal: number; completedWorkload: number };
  trend: { labels: string[]; dateKeys: string[]; series: TrendSeries[] };
  events: TracEvent[];
}) {
  const trendOptions: { value: TrendMode; label: string }[] = [
    { value: 'workload', label: '日工作量' },
    { value: 'event', label: '事件耗时' },
    { value: 'tag', label: '标签耗时' },
    { value: 'category', label: '分类耗时' },
    { value: 'habit', label: '习惯指标' },
  ];
  const [trendItem, setTrendItem] = useState('');
  useEffect(() => {
    if (!trend.series.some((item) => item.label === trendItem)) setTrendItem(trend.series[0]?.label || '');
  }, [trend.series, trendItem]);
  const selectedSeries = trend.series.find((item) => item.label === trendItem) || trend.series[0];
  const valueLabel = trendMode === 'workload' ? '工作量' : trendMode === 'habit' ? '指标值' : '分钟';
  const bounds = periodBounds(period, anchorDate);
  const rangeLabel = period === 'day' ? formatDateLabel(bounds.end) : `${formatDateLabel(bounds.start)} — ${formatDateLabel(bounds.end)}`;
  const atToday = anchorDate === dateInputValue(new Date());
  const largeStep = period === 'week' ? 7 : 30;
  return (
    <section className="analytics" aria-label="统计数据">
      <div className="section-head">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>统计数据</h2>
        </div>
        <div className="stats-head-controls">
          <div className="segmented">
            {(['day', 'week', 'month'] as Period[]).map((item) => (
              <button className={period === item ? 'selected' : ''} onClick={() => setPeriod(item)} key={item}>
                {item === 'day' ? '日' : item === 'week' ? '周' : '月'}
              </button>
            ))}
          </div>
          <div className="stats-history" aria-label="统计日期回溯">
            {period !== 'day' && <button className="history-jump" onClick={() => onShiftAnchor(-largeStep)} aria-label={`向前${largeStep}日`}>-{largeStep}</button>}
            <button className="icon-only" onClick={() => onShiftAnchor(-1)} aria-label="向前1日"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>
            <strong>{rangeLabel}</strong>
            <button className="icon-only" onClick={() => onShiftAnchor(1)} disabled={atToday} aria-label="向后1日"><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
            {period !== 'day' && <button className="history-jump" onClick={() => onShiftAnchor(largeStep)} disabled={atToday} aria-label={`向后${largeStep}日`}>+{largeStep}</button>}
          </div>
        </div>
      </div>
      <div className="stat-grid">
        <article><span className="stat-icon" aria-hidden="true"><span className="material-symbols-outlined">schedule</span></span><p>日常总耗时</p><strong>{formatDuration(stats.dailyTotal)}</strong></article>
        <article><span className="stat-icon" aria-hidden="true"><span className="material-symbols-outlined">bolt</span></span><p>习惯与待办</p><strong>{formatDuration(stats.focusedTotal)}</strong></article>
        <article><span className="stat-icon" aria-hidden="true"><span className="material-symbols-outlined">fitness_center</span></span><p>完成工作量</p><strong>{stats.completedWorkload}</strong></article>
      </div>
      {period !== 'day' && (
        <div className="chart-card">
          <div className="chart-toolbar">
            <div>
              <h3>时间趋势</h3>
              <p>{rangeLabel}</p>
            </div>
            <div className="trend-selectors">
              <label className="trend-selector">
                <span>统计内容</span>
                <select value={trendMode} onChange={(event) => setTrendMode(event.target.value as TrendMode)}>
                  {trendOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
              {trendMode !== 'workload' && (
                <label className="trend-selector">
                  <span>具体项目</span>
                  <select value={selectedSeries?.label || ''} onChange={(event) => setTrendItem(event.target.value)} disabled={!selectedSeries}>
                    {trend.series.map((item) => <option value={item.label} key={item.label}>{item.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
          {!selectedSeries ? (
            <div className="trend-empty"><span className="material-symbols-outlined" aria-hidden="true">query_stats</span><p>该时间范围内暂无数据</p></div>
          ) : period === 'month' ? (
            <MonthHeatmap dates={trend.dateKeys} values={selectedSeries.values} itemLabel={selectedSeries.label} valueLabel={valueLabel} color={selectedSeries.color} />
          ) : (
            <TrendChart labels={trend.labels} series={[selectedSeries]} valueLabel={valueLabel} />
          )}
        </div>
      )}
      <div className="breakdowns">
        <Breakdown title="事件耗时" values={stats.byEvent} />
        <Breakdown title="标签耗时" values={stats.byTag} />
        <Breakdown title="分类耗时" values={stats.byCategory} />
        <MetricPanel events={events} period={period} anchorDate={anchorDate} />
      </div>
    </section>
  );
}

function SwitchModal({ open, events, activeEventId, onPick, onAdd, onGoodNight, onClose }: {
  open: boolean;
  events: TracEvent[];
  activeEventId: string | null;
  onPick: (id: string) => void;
  onAdd: () => void;
  onGoodNight: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title="切换任务" icon="swap_horiz" onClose={onClose} wide>
      <div className="event-sections modal-sections">
        <button className="primary-button switch-add-button" onClick={onAdd}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
          <span>添加新事件</span>
        </button>
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
                        <small>{eventMetaLine(event)}</small>
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

function EventEditorModal({ open, draft, setDraft, editing, categories, tags, onSubmit, onDelete, onClose }: {
  open: boolean;
  draft: EventDraft;
  setDraft: (draft: EventDraft) => void;
  editing: boolean;
  categories: string[];
  tags: string[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete?: () => void;
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
              重要程度
              <select value={draft.importance} onChange={(event) => setDraft({ ...draft, importance: event.target.value as Importance })}>
                <option value="important">重要</option>
                <option value="unimportant">不重要</option>
              </select>
            </label>
            <label>
              DDL（可选）
              <input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} />
              <small className="field-hint">距今天 7 日以内自动归为紧急，其他情况归为不紧急。</small>
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
          {editing && onDelete && (
            <button className="secondary-button danger" type="button" onClick={onDelete}>
              <span className="material-symbols-outlined" aria-hidden="true">delete</span>
              删除
            </button>
          )}
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
          <span className="dialog-icon" aria-hidden="true"><span className="material-symbols-outlined">{icon}</span></span>
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

function TrendChart({ labels, series, valueLabel }: { labels: string[]; series: TrendSeries[]; valueLabel: string }) {
  if (series.length === 0) return <div className="trend-empty"><span className="material-symbols-outlined" aria-hidden="true">query_stats</span><p>该时间范围内暂无数据</p></div>;
  const width = labels.length > 7 ? 1220 : 760;
  const height = 270;
  const left = 48;
  const right = 18;
  const top = 18;
  const bottom = 52;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(...series.flatMap((item) => item.values), 1);
  const xFor = (index: number) => left + (index * plotWidth) / Math.max(labels.length - 1, 1);
  const yFor = (value: number) => top + plotHeight - (value / max) * plotHeight;

  return (
    <div className="trend-chart-wrap">
      <div className="trend-legend">
        {series.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}
      </div>
      <div className="trend-scroll">
        <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: `${width}px` }} role="img" aria-label={`时间趋势，单位：${valueLabel}`}>
          {[0, .25, .5, .75, 1].map((ratio) => {
            const y = top + plotHeight - ratio * plotHeight;
            return <g key={ratio}><line x1={left} x2={width - right} y1={y} y2={y} /><text x={left - 8} y={y + 4} textAnchor="end">{Math.round(max * ratio * 10) / 10}</text></g>;
          })}
          {labels.map((label, index) => <text className="trend-date" x={xFor(index)} y={height - 18} textAnchor="middle" key={`${label}-${index}`}>{label}</text>)}
          {series.map((item) => {
            const points = item.values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(' ');
            return (
              <g key={item.label} style={{ color: item.color }}>
                <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {item.values.map((value, index) => <circle key={index} cx={xFor(index)} cy={yFor(value)} r="3.5"><title>{labels[index]} · {item.label}: {Math.round(value * 10) / 10} {valueLabel}</title></circle>)}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function MonthHeatmap({ dates, values, itemLabel, valueLabel, color }: { dates: string[]; values: number[]; itemLabel: string; valueLabel: string; color: string }) {
  const firstDate = dates[0] ? new Date(`${dates[0]}T00:00:00`) : new Date();
  const leading = (firstDate.getDay() + 6) % 7;
  const cells: ({ date: string; value: number } | null)[] = [
    ...Array(leading).fill(null),
    ...dates.map((date, index) => ({ date, value: values[index] || 0 })),
  ];
  const columns = Math.ceil(cells.length / 7);
  const max = Math.max(...values, 1);
  const formatFullDate = (date: string) => {
    const value = new Date(`${date}T00:00:00`);
    return `${value.getMonth() + 1}月${value.getDate()}日`;
  };

  return (
    <div className="month-heatmap" aria-label={`${itemLabel}最近30日热力图`}>
      <div className="heatmap-scroll">
        <div className="heatmap-layout">
          <div className="heatmap-weekdays" aria-hidden="true"><span>一</span><span /><span>三</span><span /><span>五</span><span /><span>日</span></div>
          <div className="heatmap-grid" style={{ gridTemplateColumns: `repeat(${columns}, 24px)` }}>
            {cells.map((cell, index) => cell ? (
              <button
                className={`heat-tile ${cell.value > 0 ? 'has-value' : ''}`}
                style={{ backgroundColor: cell.value > 0 ? `color-mix(in srgb, ${color} ${Math.round(25 + (cell.value / max) * 75)}%, white)` : undefined }}
                aria-label={`${formatFullDate(cell.date)}，${itemLabel}：${Math.round(cell.value * 10) / 10}${valueLabel}`}
                key={cell.date}
              >
                <span className="heat-tooltip">{formatFullDate(cell.date)} · {itemLabel}：{Math.round(cell.value * 10) / 10} {valueLabel}</span>
              </button>
            ) : <span className="heat-placeholder" key={`empty-${index}`} />)}
          </div>
        </div>
      </div>
      <div className="heatmap-caption">
        <span>{formatFullDate(dates[0])} — {formatFullDate(dates[dates.length - 1])}</span>
        <span className="heatmap-scale"><span>少</span>{[20, 40, 60, 80, 100].map((strength) => <i style={{ backgroundColor: `color-mix(in srgb, ${color} ${strength}%, white)` }} key={strength} />)}<span>多</span></span>
      </div>
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

function MetricPanel({ events, period, anchorDate }: { events: TracEvent[]; period: Period; anchorDate: string }) {
  const habits = events.filter((event) => event.type === 'habit' && event.hasMetric);
  return (
    <article className="breakdown-card">
      <h3>习惯指标</h3>
      {habits.length === 0 ? <p className="empty">暂无指标</p> : habits.map((habit) => {
        const total = habit.metricRecords.filter((record) => inPeriod(record.at, period, anchorDate)).reduce((sum, record) => sum + record.value, 0);
        return (
          <div className="metric-row" key={habit.id}>
            <span>{habit.name}</span>
            <strong>{Math.round(total * 100) / 100}</strong>
            <small>{habit.metricPrompt || '指标值'} · {period === 'day' ? '当日合计' : period === 'week' ? '7 日合计' : '30 日合计'}</small>
          </div>
        );
      })}
    </article>
  );
}

function MetricRecordsModal({ open, event, records, setRecords, onSubmit, onClose }: {
  open: boolean;
  event: TracEvent | null;
  records: MetricRecordDraft[];
  setRecords: React.Dispatch<React.SetStateAction<MetricRecordDraft[]>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title={`${event?.name || '习惯'} · 指标记录`} icon="monitoring" onClose={onClose} wide>
      <form className="event-form" onSubmit={onSubmit}>
        <p className="dialog-copy">{event?.metricPrompt || '查看、补充或修正每一次指标数值。'}</p>
        <div className="metric-record-list">
          {records.length === 0 ? <p className="empty">暂无指标记录</p> : records.map((record, index) => (
            <div className="metric-record-row" key={`${record.at}-${index}`}>
              <label>
                时间
                <input type="datetime-local" value={record.at} onChange={(changeEvent) => setRecords((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, at: changeEvent.target.value } : item))} />
              </label>
              <label>
                数值
                <input type="number" step="any" value={record.value} onChange={(changeEvent) => setRecords((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: changeEvent.target.value } : item))} />
              </label>
              <button className="icon-only event-tool danger" type="button" onClick={() => setRecords((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="删除这条指标记录">
                <span className="material-symbols-outlined" aria-hidden="true">delete</span>
              </button>
            </div>
          ))}
        </div>
        <button className="secondary-button metric-add-record" type="button" onClick={() => setRecords((current) => [...current, { value: '', at: dateTimeLocalValue(new Date()) }])}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>添加指标记录
        </button>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button inline" type="submit">保存记录</button>
        </div>
      </form>
    </Dialog>
  );
}
