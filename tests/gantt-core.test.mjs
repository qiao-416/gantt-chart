import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dayNumber,isoDay,monday,normalizeSchedule,timelineRange,taskGeometry} from '../site/gantt-core.mjs';
const raw=JSON.parse(readFileSync(new URL('../schedule.json',import.meta.url),'utf8'));
test('the repository schedule is valid for the independent interface',()=>{
  const schedule=normalizeSchedule(raw);
  assert.equal(schedule.tasks.length,raw.tasks.length);
  assert.ok(schedule.tasks.every(task=>schedule.groups.some(group=>group.id===task.group)));
});
test('date math stays inclusive across months and the DST transition',()=>{
  assert.equal(dayNumber('2026-11-06')-dayNumber('2026-10-26')+1,12);
  assert.equal(dayNumber('2026-10-26')-dayNumber('2026-10-24'),2);
  assert.equal(isoDay(monday(dayNumber('2026-10-15'))),'2026-10-12');
  const range={start:dayNumber('2026-10-12')};
  assert.deepEqual(taskGeometry({start:'2026-10-26',end:'2026-11-06'},range,24),{left:336,width:288});
  assert.deepEqual(taskGeometry({start:'2026-10-19',end:'2026-10-19'},range,24),{left:168,width:24});
});
test('the full range includes all tasks and nearby today without expanding indefinitely',()=>{
  const schedule=normalizeSchedule(raw),today=dayNumber('2026-10-15');
  const range=timelineRange(schedule.tasks,today);
  assert.equal(isoDay(range.start),'2026-10-12');assert.equal(isoDay(range.end),'2026-11-15');
  assert.equal(range.count,35);
  assert.ok(timelineRange(schedule.tasks,dayNumber('2030-01-01')).count<100);
});
test('invalid imports and unsafe labels are rejected',()=>{
  const patches=[{progress:-1},{progress:101},{progress:1.5},{start:'2026-02-30'},{end:'2026-10-01'},{group:'missing'},{name:'task : done'}];
  for(const patch of patches) assert.throws(()=>normalizeSchedule({...raw,tasks:[{...raw.tasks[0],...patch}]}));
  assert.throws(()=>normalizeSchedule({...raw,tasks:[]}));
  assert.throws(()=>normalizeSchedule({...raw,groups:[raw.groups[0],raw.groups[0]]}));
});
test('old schedules remain compatible and imported completion remains explicit',()=>{
  const schedule=normalizeSchedule({title:'计划',tasks:[{name:'任务',start:'2026-10-19',end:'2026-10-22',status:'done'}]});
  assert.equal(schedule.tasks[0].progress,100);assert.equal(schedule.tasks[0].assigned_to,'未分配');
  assert.equal(schedule.tasks[0].group,'initiation');
  for(const [progress,status] of [[0,'planned'],[50,'active'],[100,'done']]) assert.equal(normalizeSchedule({...raw,tasks:[{...raw.tasks[0],progress}]}).tasks[0].status,status);
});
