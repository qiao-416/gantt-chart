export const DAY = 86400000;
const COLORS = new Set(['purple', 'pink', 'green']);
export const DEFAULT_GROUPS = [
  {id:'initiation',name:'项目启动',color:'purple'},
  {id:'development',name:'核心开发',color:'pink'},
  {id:'delivery',name:'测试与交付',color:'green'}
];
export function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期需使用 YYYY-MM-DD 格式。');
  const time = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== value) throw new Error('请填写有效的日期。');
  if (value < '1900-01-01' || value > '2100-12-31') throw new Error('日期应在 1900–2100 年之间。');
  return Math.round(time / DAY);
}
export function isoDay(day) {return new Date(day * DAY).toISOString().slice(0,10);}
export function monday(day) {const weekday = new Date(day * DAY).getUTCDay(); return day - (weekday + 6) % 7;}
export function text(value, fallback='') {
  if (value == null) return fallback;
  if (typeof value !== 'string' || value.length > 80 || /[\r\n:;`<>]|%%/.test(value)) throw new Error('名称请使用 80 字以内的单行文本，避免图表分隔符。');
  return value.trim() || fallback;
}
export function normalizeSchedule(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.tasks) || !input.tasks.length || input.tasks.length > 300) throw new Error('排期应包含 1–300 项任务。');
  const title = text(input.title, '项目计划');
  const rawGroups = input.groups ?? DEFAULT_GROUPS;
  if (!Array.isArray(rawGroups) || !rawGroups.length || rawGroups.length > 20) throw new Error('请填写有效的阶段分组。');
  const ids = new Set();
  const groups = rawGroups.map(group => {
    if (!group || !/^[a-z][a-z0-9_-]{0,39}$/.test(group.id) || ids.has(group.id) || !COLORS.has(group.color)) throw new Error('阶段 ID 必须唯一，颜色为 purple、pink 或 green。');
    ids.add(group.id);
    return {id:group.id,name:text(group.name,group.id),color:group.color};
  });
  const tasks = input.tasks.map(task => {
    if (!task || typeof task !== 'object') throw new Error('任务格式不正确。');
    const start = dayNumber(task.start), end = dayNumber(task.end);
    if (end < start) throw new Error('结束日期不能早于开始日期。');
    const group = task.group ?? groups[0].id;
    if (!ids.has(group)) throw new Error('任务引用了不存在的阶段。');
    let status = task.status ?? 'planned';
    if (!['planned','active','done'].includes(status)) throw new Error('任务状态不正确。');
    const progress = task.progress ?? (status === 'done' ? 100 : 0);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw new Error('完成进度应为 0–100 的整数。');
    if (task.progress !== undefined) status = progress===100?'done':progress>0?'active':'planned';
    return {name:text(task.name,'未命名任务'),assigned_to:text(task.assigned_to,'未分配'),group,progress,start:task.start,end:task.end,status};
  });
  const starts = tasks.map(task => dayNumber(task.start)), ends = tasks.map(task => dayNumber(task.end));
  if (Math.max(...ends) - Math.min(...starts) > 730) throw new Error('单份排期请控制在两年以内。');
  return {title,groups,tasks};
}
export function timelineRange(tasks, today) {
  const first = Math.min(...tasks.map(task => dayNumber(task.start)));
  const last = Math.max(...tasks.map(task => dayNumber(task.end)));
  const nearbyToday = today >= first-31 && today <= last+31;
  const start = monday(nearbyToday ? Math.min(first,today) : first);
  const end = monday(nearbyToday ? Math.max(last,today) : last) + 6;
  return {start,end,count:end-start+1};
}
export function taskGeometry(task, range, width) {
  return {left:(dayNumber(task.start)-range.start)*width,width:(dayNumber(task.end)-dayNumber(task.start)+1)*width};
}
