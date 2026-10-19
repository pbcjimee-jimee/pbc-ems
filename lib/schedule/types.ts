import type { Result, Versioned } from '@/lib/domain/types';
export type VisitStatus = 'scheduled'|'in_progress'|'completed'|'cancelled';
export type ScheduleView = 'month'|'week'|'day'|'list';
export type VisitTiming = {allDay:boolean;startDate:string|null;endDate:string|null;startsAt:string|null;endsAt:string|null};
export type Visit = Versioned & VisitTiming & {title:string;description:string;type:'visit'|'assessment'|'general';status:VisitStatus;jobId:string|null;requestId:string|null;jobTitle:string|null;requestTitle:string|null;clientName:string|null;address:string|null;assignees:{id:string;name:string}[]};
export type ConflictWarning = {visitId:string;title:string;userId:string;workerName:string};
export type SavedVisit = Versioned & {warnings:ConflictWarning[]};
export type ScheduleOptions = {workers:{id:string;name:string}[];jobs:{id:string;title:string}[];requests:{id:string;title:string}[]};
export type VisitFormState = {result?:Result<SavedVisit>;values?:Record<string,string>;assigneeIds?:string[]};
