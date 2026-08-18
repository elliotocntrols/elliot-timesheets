export type Role='staff'|'pm'|'admin';
export type WorkType='Work'|'Annual Leave'|'Sick Leave'|'RDO'|'Public Holiday'|'Training'|'Other Paid Leave';
export type User={employeeId:string;name:string;email:string;role:Role;position:string;mustChangePassword:boolean};
export type StaffRow={employeeId:string;name:string;email:string;position:string;role:Role;active:boolean;mustChangePassword:boolean;workDays:number[]};
export type Entry={id:string;employeeId:string;employee:string;date:string;type:WorkType;jobNumber:string;start:string;finish:string;breakMinutes:number;totalHours:number;notes:string;status:'Submitted'|'PM Approved'|'Admin Approved'|'Rejected';rejectionReason?:string;simproStatus?:string};
export type JobOption={id:number;name:string;site:string;customer:string};
export const workTypes:WorkType[]=['Work','Annual Leave','Sick Leave','RDO','Public Holiday','Training','Other Paid Leave'];
export async function api<T>(path:string,init?:RequestInit):Promise<T>{const r=await fetch(path,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...(init?.headers||{})}});const t=await r.text();if(!r.ok){let m=t||'Request failed';try{m=JSON.parse(t).error||m}catch{}throw new Error(m)}return(t?JSON.parse(t):{}) as T}
export function hoursBetween(s:string,f:string,b:number){if(!s||!f)return 0;const[sh,sm]=s.split(':').map(Number),[fh,fm]=f.split(':').map(Number);let m=fh*60+fm-(sh*60+sm)-b;if(m<0)m+=1440;return Math.max(0,Math.round(m/60*100)/100)}
export function setManifest(admin:boolean){document.title=admin?'Elliot Office Admin':'Elliot Timesheets';let l=document.querySelector('link[rel="manifest"]') as HTMLLinkElement|null;if(!l){l=document.createElement('link');l.rel='manifest';document.head.appendChild(l)}l.href=admin?'/manifest-admin.webmanifest':'/manifest-worker.webmanifest'}
