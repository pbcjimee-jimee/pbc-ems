import { describe, expect, it } from 'vitest';
import { resolveSydneyDateTime, formatSydneyInput } from '@/lib/domain/sydney-date-time';
import { calendarRange, addDays, visitInterval, overlaps, visitOnDate } from '@/lib/schedule/dates';
import { visitSchema } from '@/lib/schedule/schemas';
describe('Sydney schedules', () => {
  it('rejects nonexistent DST times and resolves repeated times explicitly', () => {
    expect(resolveSydneyDateTime('2026-10-04','02:30')).toMatchObject({ok:false,error:{code:'NONEXISTENT_TIME'}});
    expect(resolveSydneyDateTime('2026-04-05','02:30')).toMatchObject({ok:false,error:{code:'AMBIGUOUS_TIME'}});
    expect(resolveSydneyDateTime('2026-04-05','02:30','earlier')).toMatchObject({ok:true,data:{iso:'2026-04-04T15:30:00.000Z'}});
    expect(resolveSydneyDateTime('2026-04-05','02:30','later')).toMatchObject({ok:true,data:{iso:'2026-04-04T16:30:00.000Z'}});
    expect(formatSydneyInput('2026-10-15T13:00:00Z')).toBe('2026-10-16T00:00');
  });
  it('keeps inclusive all-day ranges and DST day lengths', () => {
    const interval=visitInterval({allDay:true,startDate:'2026-10-04',endDate:'2026-10-04',startsAt:null,endsAt:null});
    expect(interval.end-interval.start).toBe(23*3600000);
    expect(visitOnDate({allDay:true,startDate:'2026-10-03',endDate:'2026-10-05',startsAt:null,endsAt:null},'2026-10-05')).toBe(true);
    expect(visitOnDate({allDay:false,startDate:null,endDate:null,startsAt:'2026-10-15T12:30:00Z',endsAt:'2026-10-15T13:00:00Z'},'2026-10-16')).toBe(false);
  });
  it('uses half-open intervals so adjoining appointments do not conflict', () => {
    expect(overlaps({start:0,end:10},{start:10,end:20})).toBe(false);
    expect(overlaps({start:0,end:11},{start:10,end:20})).toBe(true);
  });
  it('uses calendar arithmetic across month/year and Monday week boundaries', () => {
    expect(addDays('2026-12-31',1)).toBe('2027-01-01');
    expect(calendarRange('2026-10-16','week')).toEqual({from:'2026-10-12',to:'2026-10-18'});
    expect(calendarRange('2026-02-16','month')).toEqual({from:'2026-01-26',to:'2026-03-01'});
  });
  it('rejects invalid dates, mixed date fields, reversed spans and duplicate assignees', () => {
    const d={title:'Repaint',allDay:true,startDate:'2026-10-16',endDate:'2026-10-17'};
    expect(visitSchema.safeParse(d).success).toBe(true);
    for(const bad of [{...d,startDate:'2026-02-30'},{...d,endDate:'2026-10-15'},{...d,startsAt:'2026-10-16T00:00:00Z'},{...d,assigneeIds:['20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002']}]) expect(visitSchema.safeParse(bad).success).toBe(false);
  });
});
