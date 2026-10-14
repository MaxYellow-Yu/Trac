/** Portable, read-only export. No app startup migration or storage deletion. */
export const BACKUP_FORMAT = 'trac-backup';
export const STATE_KEY = 'trac-campus-life-state-v2';
export const OLD_STATE_KEY = 'trac-campus-life-state-v1';
export const SEED_MARKER = 'trac-seed-timeline-cleared-v1';
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('数据必须是 JSON 对象');
  return value as Record<string, unknown>;
}
function list(value: unknown, name: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${name}格式错误`); return value; }
function time(value: unknown): number {
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('日期／时间无效'); return result;
}
function text(value: unknown, name: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}缺失`); return value; }
export function validateLegacyState(value: unknown): Record<string, unknown> {
  const state = object(value), ids = new Set<string>(), segmentIds = new Set<string>();
  for (const item of list(state.events, '事件模板')) {
    const event = object(item), id = text(event.id, '模板 ID'); text(event.name, '事件名称');
    if (ids.has(id) || !['daily', 'todo', 'habit'].includes(String(event.type))) throw new Error('模板 ID 重复或类型错误'); ids.add(id);
    if (event.tags !== undefined && list(event.tags, '标签').some(tag => typeof tag !== 'string')) throw new Error('标签格式错误');
    if (event.totalMs !== undefined && (typeof event.totalMs !== 'number' || !Number.isFinite(event.totalMs) || event.totalMs < 0)) throw new Error('累计时间无效');
    if (event.workload !== undefined && (!Number.isInteger(event.workload) || Number(event.workload) < 1 || Number(event.workload) > 5)) throw new Error('工作量需为 1—5');
    if (event.completed !== undefined && typeof event.completed !== 'boolean') throw new Error('完成状态无效');
    if (event.completedAt !== undefined && event.completedAt !== null) time(event.completedAt);
    for (const record of list(event.metricRecords ?? [], '指标记录')) { const metric = object(record); time(metric.at); if (typeof metric.value !== 'number' || !Number.isFinite(metric.value)) throw new Error('指标数值无效'); }
    for (const at of list(event.completionRecords ?? [], '完成记录')) time(at);
  }
  for (const item of list(state.segments, '历史记录')) {
    const segment = object(item), id = text(segment.id, '历史 ID'); text(segment.eventId, '历史事件 ID'); text(segment.eventName, '历史名称');
    if (segmentIds.has(id) || !['daily', 'todo', 'habit'].includes(String(segment.eventType)) || time(segment.end) < time(segment.start)) throw new Error('历史 ID 重复、类型或时间错误'); segmentIds.add(id);
  }
  if (state.activeEventId != null) { if (!ids.has(text(state.activeEventId, '当前模板 ID'))) throw new Error('当前事件引用了不存在的模板'); time(state.activeStartedAt); }
  else if (state.activeStartedAt != null) throw new Error('当前事件缺少 ID');
  if (state.categories !== undefined) for (const category of list(state.categories, '分类')) {
    if (typeof category === 'string') text(category, '分类'); else { const c = object(category); text(c.name, '分类'); if (typeof c.color !== 'string' || !/^#[\da-f]{6}$/i.test(c.color)) throw new Error('分类颜色无效'); }
  }
  if (state.tags !== undefined && list(state.tags, '标签').some(tag => typeof tag !== 'string')) throw new Error('标签无效');
  if (state.trendMode !== undefined && !['event', 'tag', 'category', 'habit', 'workload'].includes(String(state.trendMode))) throw new Error('统计模式无效');
  return state;
}
/** Convert Android's committed export to a compatible browser view; keep its full file as backup. */
function nativeToLegacy(snapshot: Record<string, unknown>): Record<string, unknown> {
  const rows = list(snapshot.events, '事件'), templates = list(snapshot.templates, '模板'), settings = object(snapshot.settings);
  const events = templates.filter(item => object(item).enabled !== false).map(item => {
    const template = object(item), todo = template.todo ? object(template.todo) : null, habit = template.habit ? object(template.habit) : null;
    const facts = rows.map(object).filter(row => row.templateId === template.id), ended = facts.filter(row => row.endTime !== null);
    const completions = ended.filter(row => object(row.outcome ?? {}).completed === true).map(row => time(row.endTime)).sort((a,b)=>a-b);
    return { id:template.id,name:template.title,type:String(template.type).toLowerCase(),category:template.category,tags:template.tags,
      totalMs:ended.reduce((sum,row)=>sum+Math.max(0,time(row.endTime)-time(row.startTime)),0),
      ...(todo ? {importance:todo.important?'important':'unimportant',workload:todo.workload,deadline:todo.deadlineTimeMillis==null?undefined:new Date(time(todo.deadlineTimeMillis)).toLocaleDateString('sv-SE'),completed:completions.length>0,completedAt:completions.length?new Date(completions.at(-1)!).toISOString():undefined}:{}),
      ...(habit ? {hasMetric:habit.hasMetric,metricPrompt:habit.metricPrompt,metricUnit:habit.metricUnit,repeatKind:habit.repeatKind,repeatWeekdays:habit.repeatWeekdays,repeatIntervalDays:habit.repeatIntervalDays,repeatAnchorDate:habit.repeatAnchorTime==null?undefined:new Date(time(habit.repeatAnchorTime)).toLocaleDateString('sv-SE'),completionRecords:completions.map(at=>new Date(at).toISOString())}:{}),
      metricRecords:ended.filter(row=>object(row.outcome??{}).metric!=null).map(row=>({value:object(row.outcome).metric,at:new Date(time(row.endTime)).toISOString()})) };
  });
  const active=rows.map(object).filter(row=>row.endTime===null);if(active.length>1)throw new Error('当前事件超过一个');
  if(active[0]&&!events.some(event=>event.id===active[0].templateId))throw new Error('当前自定义／停用事件无法在浏览器完整表示，请保留 Android 备份');
  return validateLegacyState({events,segments:rows.map(object).filter(row=>row.endTime!==null&&time(row.endTime)>time(row.startTime)).map(row=>({id:row.id,eventId:row.templateId??row.id,eventName:row.title,eventType:String(object(row.templateSnapshot).type).toLowerCase(),start:new Date(time(row.startTime)).toISOString(),end:new Date(time(row.endTime)).toISOString(),durationMs:time(row.endTime)-time(row.startTime)})),
    activeEventId:active[0]?.templateId??null,activeStartedAt:active[0]?new Date(time(active[0].startTime)).toISOString():null,...settings});
}
export function parseBackup(raw: string): { state: Record<string, unknown>; backup: Record<string, unknown> } {
  if (raw.length > 16_777_216) throw new Error('备份超过 16 MiB');
  const backup=object(JSON.parse(raw));
  if(backup.format===BACKUP_FORMAT) {
    if(backup.version!==1)throw new Error('不支持的备份版本');
    if(backup.source==='android')return {state:nativeToLegacy(object(backup.snapshot)),backup};
    if(backup.source!=='browser')throw new Error('未知备份来源');
    const storage=object(backup.storage), saved=storage[STATE_KEY]??storage[OLD_STATE_KEY];
    if(typeof saved!=='string')throw new Error('备份没有旧网页数据');return {state:validateLegacyState(JSON.parse(saved)),backup};
  }
  return {state:validateLegacyState(backup),backup};
}
export function createBrowserBackup(storage: Pick<Storage,'getItem'|'key'|'length'>, state: Record<string, unknown>, now=Date.now()): Record<string, unknown> {
  validateLegacyState(state);const values:Record<string,string>={};
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith('trac-')){const value=storage.getItem(key);if(value!==null)values[key]=value;}}
  // Current React state is the complete committed UI view; original values are retained.
  return {format:BACKUP_FORMAT,version:1,source:'browser',exportedAt:now,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    storage:{...values,[STATE_KEY]:JSON.stringify(state)},originalStorage:values};
}
export function downloadJson(value: unknown, filename: string) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
