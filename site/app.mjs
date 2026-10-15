import {DAY,dayNumber,isoDay,normalizeSchedule,timelineRange,taskGeometry} from './gantt-core.mjs';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'gantt-chart-draft-v1';
const weekdays = ['日','一','二','三','四','五','六'];
const published = normalizeSchedule(JSON.parse($('initialSchedule').textContent));
const sourceKey = JSON.stringify(published);
const buildMeta = JSON.parse($('buildMeta').textContent);
let schedule = structuredClone(published), dirty = false, editingIndex = null;
let view = 'fit', collapsed = new Set(), oldDraft = null, toastTimer;
const today = dayNumber(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
let range, dayWidth, frozenWidth, lastWidth = 0;

function element(tag, className='', value=null) {
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(value !== null) node.textContent = value;
  return node;
}
function button(className,label,handler) {
  const node=element('button',className,label); node.type='button'; node.addEventListener('click',handler); return node;
}
function applyGroup(node,group) {
  node.style.setProperty('--group-color',`var(--${group.color})`);
  node.style.setProperty('--group-soft',`var(--${group.color}-soft)`);
  node.style.setProperty('--group-head',`var(--${group.color}-head)`);
}
function notify(message) {
  clearTimeout(toastTimer); $('toast').textContent=message; $('toast').hidden=false;
  toastTimer=setTimeout(()=>{$('toast').hidden=true;},5000);
}
function storeDraft() {
  dirty=true;
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify({base:sourceKey,schedule,updatedAt:new Date().toISOString()})); }
  catch { notify('浏览器无法保存草稿，请及时导出排期。'); }
}
function restoreDraft() {
  try {
    const draft=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(!draft) return;
    const valid=normalizeSchedule(draft.schedule);
    if(draft.base===sourceKey) {schedule=valid;dirty=true;}
    else {oldDraft=valid;$('recoverButton').hidden=false;}
  } catch { /* A damaged or unavailable local draft must not prevent loading the published plan. */ }
}
function formatShort(iso) {return iso.slice(5).replace('-','/');}
function columns() {
  return window.matchMedia('(max-width:760px)').matches
    ? [{key:'name',label:'任务',width:156},{key:'progress',label:'进度',width:72}]
    : [{key:'name',label:'任务',width:200},{key:'assigned_to',label:'负责人',width:100},{key:'progress',label:'进度',width:90},{key:'start',label:'开始',width:94},{key:'end',label:'结束',width:94}];
}
function todayLine(canvas) {
  if(today<range.start||today>range.end) return;
  const line=element('span','today-line');line.style.left=`${(today-range.start+.5)*dayWidth}px`;line.setAttribute('aria-hidden','true');canvas.append(line);
}
function timelineCanvas(withGrid=true) {
  const canvas=element('div','timeline-canvas');canvas.style.width=`${range.count*dayWidth}px`;
  if(withGrid) for(let i=0;i<range.count;i++) {
    const weekday=new Date((range.start+i)*DAY).getUTCDay();
    if(weekday===0||weekday===6) {
      const band=element('span','weekend-band');band.style.left=`${i*dayWidth}px`;band.style.width=`${dayWidth}px`;canvas.append(band);
    }
  }
  todayLine(canvas);return canvas;
}
function render() {
  const scroll=$('sheetScroll'), savedLeft=scroll.scrollLeft, savedTop=scroll.scrollTop;
  const cols=columns();frozenWidth=cols.reduce((sum,col)=>sum+col.width,0);
  range=timelineRange(schedule.tasks,today);
  dayWidth=view==='day'?36:Math.max(22,Math.floor((scroll.clientWidth-frozenWidth)/range.count));
  $('ganttTable').style.setProperty('--day-width',`${dayWidth}px`);
  $('ganttTable').style.width=`${frozenWidth+range.count*dayWidth}px`;
  const colgroup=element('colgroup');
  [...cols,...Array.from({length:range.count},()=>({width:dayWidth}))].forEach(col=>{const node=element('col');node.style.width=`${col.width}px`;colgroup.append(node);});
  const head=element('thead'), weekRow=element('tr'), dateRow=element('tr'), weekdayRow=element('tr');
  const corner=element('th','corner frozen');corner.rowSpan=2;corner.colSpan=cols.length;
  const cornerLabel=element('div','corner-title');cornerLabel.append(element('span','corner-square'),element('span','',`任务明细 · ${schedule.tasks.length} 项`));corner.append(cornerLabel);weekRow.append(corner);
  for(let i=0;i<range.count;i+=7) {
    const first=isoDay(range.start+i),last=isoDay(range.start+Math.min(i+6,range.count-1));
    const week=element('th','week-header',`${formatShort(first)} – ${formatShort(last)}`);week.colSpan=Math.min(7,range.count-i);week.scope='colgroup';weekRow.append(week);
  }
  let left=0;
  cols.forEach(col=>{const th=element('th',`frozen column-header ${['progress','start','end'].includes(col.key)?'center':''}`,col.label);th.scope='col';th.style.left=`${left}px`;left+=col.width;weekdayRow.append(th);});
  for(let i=0;i<range.count;i++) {
    const day=range.start+i,date=new Date(day*DAY),weekend=[0,6].includes(date.getUTCDay());
    const classes=`${weekend?'weekend ':''}${day===today?'is-today':''}`;
    const number=element('th',`day-header ${classes}`,String(date.getUTCDate()));number.title=isoDay(day)+(day===today?' · 今天':'');dateRow.append(number);
    const weekday=element('th',`weekday-header ${classes}`,weekdays[date.getUTCDay()]);weekday.scope='col';weekdayRow.append(weekday);
  }
  head.append(weekRow,dateRow,weekdayRow);
  const body=element('tbody');
  schedule.groups.forEach(group=>{
    const tasks=schedule.tasks.map((task,index)=>({task,index})).filter(({task})=>task.group===group.id);
    if(!tasks.length) return;
    const groupRow=element('tr','group-row');applyGroup(groupRow,group);
    const groupCell=element('th','frozen group-cell');groupCell.colSpan=cols.length;groupCell.scope='rowgroup';
    const toggle=button('group-toggle','',()=>{collapsed.has(group.id)?collapsed.delete(group.id):collapsed.add(group.id);render();});
    toggle.setAttribute('aria-expanded',String(!collapsed.has(group.id)));
    toggle.append(element('span','group-arrow',collapsed.has(group.id)?'▸':'▾'),element('span','',group.name),element('span','group-count',`${tasks.length} 项`));
    groupCell.append(toggle);const groupTimeline=element('td','group-timeline');groupTimeline.colSpan=range.count;groupTimeline.append(timelineCanvas(false));groupRow.append(groupCell,groupTimeline);body.append(groupRow);
    if(collapsed.has(group.id)) return;
    tasks.forEach(({task,index})=>{
      const row=element('tr','task-row');applyGroup(row,group);let offset=0;
      cols.forEach(col=>{
        const cell=element('td',`frozen ${col.key==='name'?'name-cell':col.key==='progress'?'progress-cell':col.key==='assigned_to'?'owner-cell':'date-cell'}`);cell.style.left=`${offset}px`;offset+=col.width;
        if(col.key==='name') {const edit=button('task-name',task.name,()=>openTask(index));edit.title=`编辑 ${task.name}`;cell.append(edit);}
        else if(col.key==='progress') {
          const meter=element('div','progress-meter');meter.setAttribute('aria-label',`${task.name}：完成 ${task.progress}%`);
          const fill=element('span','progress-meter-fill');fill.style.width=`${task.progress}%`;meter.append(fill,element('span','progress-meter-value',`${task.progress}%`));cell.append(meter);
        } else {cell.textContent=col.key==='assigned_to'?task.assigned_to:formatShort(task[col.key]);cell.title=task[col.key];}
        row.append(cell);
      });
      const timeline=element('td','timeline-cell');timeline.colSpan=range.count;const canvas=timelineCanvas();
      const geometry=taskGeometry(task,range,dayWidth),bar=button('task-bar','',()=>openTask(index));bar.style.left=`${geometry.left}px`;bar.style.width=`${geometry.width}px`;
      bar.title=`${task.name} · ${task.assigned_to}\n${task.start} → ${task.end} · ${task.progress}%`;
      bar.setAttribute('aria-label',`编辑 ${task.name}，${task.start} 至 ${task.end}，完成 ${task.progress}%`);
      const progress=element('span','bar-progress');progress.style.width=`${task.progress}%`;bar.append(progress);
      if(geometry.width>=90) bar.append(element('span','bar-label',task.name));
      canvas.append(bar);timeline.append(canvas);row.append(timeline);body.append(row);
    });
  });
  $('ganttTable').replaceChildren(colgroup,head,body);
  $('projectTitle').textContent=schedule.title;document.title=`${schedule.title} · Gantt`;
  $('taskCount').textContent=`${schedule.tasks.length} 项任务`;
  $('dateRange').textContent=`${isoDay(range.start).replaceAll('-','.')} — ${isoDay(range.end).replaceAll('-','.')}`;
  $('syncState').textContent=dirty?'本机草稿':'已发布排期';$('syncState').classList.toggle('draft',dirty);
  const earliest=Math.min(...schedule.tasks.map(task=>dayNumber(task.start))),latest=Math.max(...schedule.tasks.map(task=>dayNumber(task.end)));
  $('planSummary').textContent=`${formatShort(isoDay(earliest))} – ${formatShort(isoDay(latest))} · ${latest-earliest+1} 天 · ${schedule.tasks.filter(task=>task.progress===100).length} 项已完成`;
  $('legend').replaceChildren(...schedule.groups.filter(group=>schedule.tasks.some(task=>task.group===group.id)).map(group=>{const item=element('span','legend-item');applyGroup(item,group);item.append(element('span','legend-dot'),element('span','',group.name));return item;}));
  $('fitButton').setAttribute('aria-pressed',String(view==='fit'));$('dayButton').setAttribute('aria-pressed',String(view==='day'));
  scroll.scrollLeft=savedLeft;scroll.scrollTop=savedTop;
}
function openTask(index=null) {
  editingIndex=index;
  const task=index===null?{name:'',assigned_to:'',group:schedule.groups[0].id,progress:0,start:isoDay(today),end:isoDay(today)}:schedule.tasks[index];
  $('dialogTitle').textContent=index===null?'添加任务':'编辑任务';
  $('taskGroup').replaceChildren(...schedule.groups.map(group=>{const option=element('option','',group.name);option.value=group.id;return option;}));
  for(const [id,key] of [['taskName','name'],['taskOwner','assigned_to'],['taskGroup','group'],['taskProgress','progress'],['taskStart','start'],['taskEnd','end']]) $(id).value=task[key];
  $('formError').hidden=true;$('taskDialog').showModal();
}
function closeTask() {$('taskDialog').close();}
$('taskForm').addEventListener('submit',event=>{
  event.preventDefault();
  const progress=Number($('taskProgress').value);
  const task={name:$('taskName').value.trim(),assigned_to:$('taskOwner').value.trim()||'未分配',group:$('taskGroup').value,progress,start:$('taskStart').value,end:$('taskEnd').value,status:progress===100?'done':progress>0?'active':'planned'};
  try {
    const candidate=structuredClone(schedule);
    if(editingIndex===null) candidate.tasks.push(task);else candidate.tasks[editingIndex]=task;
    schedule=normalizeSchedule(candidate);storeDraft();closeTask();render();notify('任务已保存为本机草稿。');
  } catch(error) {$('formError').textContent=error.message;$('formError').hidden=false;}
});
$('addButton').addEventListener('click',()=>openTask());
$('closeDialog').addEventListener('click',closeTask);$('cancelDialog').addEventListener('click',closeTask);
$('helpButton').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());
for(const dialog of [$('taskDialog'),$('helpDialog')]) dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
$('fitButton').addEventListener('click',()=>{view='fit';render();});$('dayButton').addEventListener('click',()=>{view='day';render();});
$('todayButton').addEventListener('click',()=>{
  if(today<range.start||today>range.end){notify('今天不在当前排期范围内。');return;}
  $('sheetScroll').scrollTo({left:Math.max(0,(today-range.start+.5)*dayWidth-($('sheetScroll').clientWidth-frozenWidth)/2),behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  notify(`今天：${isoDay(today)}`);
});
$('exportButton').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(schedule,null,2)+'\n'],{type:'application/json'}));
  const anchor=element('a');anchor.href=url;anchor.download='schedule.json';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('排期已导出；更新仓库的 schedule.json 后会自动发布。');
});
$('importButton').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try {if(file.size>1048576) throw new Error('排期文件请小于 1 MB。');schedule=normalizeSchedule(JSON.parse(await file.text()));collapsed.clear();storeDraft();render();notify('排期已导入并保存为本机草稿。');}
  catch(error){notify(`导入失败：${error.message}`);}finally{event.target.value='';}
});
$('recoverButton').addEventListener('click',()=>{if(!oldDraft)return;schedule=oldDraft;oldDraft=null;$('recoverButton').hidden=true;storeDraft();render();notify('已恢复旧草稿，请核对后导出。');});
if(buildMeta.published_at) $('publishedAt').textContent='发布于 '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Europe/London',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(buildMeta.published_at));
restoreDraft();render();
new ResizeObserver(entries=>{const width=Math.round(entries[0].contentRect.width);if(width!==lastWidth){lastWidth=width;render();}}).observe($('sheetScroll'));
window.matchMedia('(max-width:760px)').addEventListener('change',()=>render());
