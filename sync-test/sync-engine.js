/* Local-first, per-record LWW. No whole-state cloud replacement. */
(function(root){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const safe=k=>!['__proto__','constructor','prototype'].includes(k);
function flatten(p){const out={};for(const section of ['state','listenState'])for(const [key,value] of Object.entries(p[section]||{})){if(!safe(key)||['lastOpenedDay','syncMetadata','exportedAt','listenState'].includes(key))continue;
 if((section==='state'&&['records','history','todayPlans'].includes(key))||(section==='listenState'&&key==='completed')){for(const [id,v] of Object.entries(value||{}))if(safe(id))out[JSON.stringify([section,key,id])]=v;}
 else out[JSON.stringify([section,key])]=value;
}return clone(out);}
function newer(a,b){return !b||a.updatedAt>b.updatedAt||(a.updatedAt===b.updatedAt&&a.mutationId>b.mutationId);}
function project(entries){const p={schemaVersion:3,state:{version:6,records:{},history:{},todayPlans:{}},listenState:{completed:{}}};for(const [key,e] of Object.entries(entries)){if(e.deleted)continue;const path=JSON.parse(key);if(path.some(k=>!safe(k)))continue;let o=p;for(const k of path.slice(0,-1))o=o[k]||(o[k]={});o[path.at(-1)]=clone(e.value);if(path[0]==='state'&&path[1]==='records'&&o[path.at(-1)]&&typeof o[path.at(-1)]==='object')o[path.at(-1)].updatedAt=e.updatedAt;}
 p.theme=p.state.theme||'system';return p;}
function strip(v){if(v&&typeof v==='object'&&!Array.isArray(v)){v=clone(v);delete v.updatedAt;}return v;}
class Engine{
 constructor({storage,scope,initial,rpc,onApply=()=>{},onStatus=()=>{},id=()=>crypto.randomUUID(),now=()=>Date.now()}){Object.assign(this,{storage,scope,rpc,onApply,onStatus,id,now});this.prefix='cet6:test3:'+scope+':';this.busy=null;this.entries=this.read('base')||{};
 for(const [key,value] of Object.entries(flatten(initial)))if(!this.entries[key])this.entries[key]={key,value:strip(value),updatedAt:Number(value?.updatedAt)||0,mutationId:'legacy',deleted:false};
 this.overlay();this.current=project(this.entries);this.clock=Math.max(0,...Object.values(this.entries).map(x=>x.updatedAt));this.persist();}
 read(k){try{return JSON.parse(this.storage.getItem(this.prefix+k)||'null')}catch{return null}}
 pending(){const out=[];for(let i=0;i<this.storage.length;i++){const k=this.storage.key(i);if(k?.startsWith(this.prefix+'op:')){const e=JSON.parse(this.storage.getItem(k));if(e)out.push(e);}}return out;}
 persist(){this.storage.setItem(this.prefix+'base',JSON.stringify(this.entries));}
 overlay(){for(const e of this.pending())if(newer(e,this.entries[e.key]))this.entries[e.key]=e;}
 present(){this.overlay();this.persist();this.current=project(this.entries);this.onApply(clone(this.current));}
 tick(){this.clock=Math.max(this.now(),this.clock+1);return this.clock;}
 queue(key,value,deleted=false,updatedAt=this.tick()){const e={key,value:strip(value),deleted,updatedAt,mutationId:this.id()};this.storage.setItem(this.prefix+'op:'+e.mutationId,JSON.stringify(e));this.entries[key]=e;return e;}
 capture(payload){const before=flatten(this.current),after=flatten(payload);let changed=false;for(const [key,value]of Object.entries(after))if(!equal(strip(before[key]),strip(value))){this.queue(key,value);changed=true;}if(changed){this.persist();this.current=project(this.entries);this.onStatus('pending');}return changed;}
 adopt(entries){for(const e of Object.values(entries))if(newer(e,this.entries[e.key])){this.entries[e.key]=clone(e);if(e.mutationId!=='legacy')this.storage.setItem(this.prefix+'op:'+e.mutationId,JSON.stringify(e));}this.present();}
 importPayload(payload){for(const [key,value] of Object.entries(flatten(payload)))this.queue(key,value);this.present();this.onStatus('pending');}
 replace(payload){const next=flatten(payload);for(const key of Object.keys(this.entries))if(!(key in next))this.queue(key,null,true);this.importPayload(payload);}
 async sync(){if(this.busy)return this.busy;this.busy=this.run();try{return await this.busy}finally{this.busy=null}}
 async run(){this.onStatus('syncing');try{
 // Seed historical rows with timestamp 0. Existing cloud rows always win ties.
 let row=await this.rpc({changes:[],seed:this.read('seeded')?[]:Object.values(this.entries).filter(e=>e.mutationId==='legacy')});this.merge(row.records);this.storage.setItem(this.prefix+'seeded','true');
 for(let pass=0;pass<20;pass++){const batch=this.pending().slice(0,300);if(!batch.length)break;row=await this.rpc({changes:batch,seed:[]});this.merge(row.records);for(const e of batch)this.storage.removeItem(this.prefix+'op:'+e.mutationId);if(pass===19&&this.pending().length)throw Error('待同步队列较长，请重试');}
 this.present();this.onStatus('synced');return true;
 }catch(e){this.onStatus('error',e);throw e;}}
 merge(rows){for(const e of rows||[]){this.clock=Math.max(this.clock,e.updatedAt);if(newer(e,this.entries[e.key])||(e.updatedAt===0&&this.entries[e.key]?.mutationId==='legacy'))this.entries[e.key]=e;}this.persist();}
}
const api={Engine,flatten,project,newer};if(typeof module!=='undefined')module.exports=api;else root.CET6Sync=api;
})(typeof window==='undefined'?{}:window);
