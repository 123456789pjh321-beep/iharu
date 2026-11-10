// Device-only foundation for a future briefing. Never send coordinates or persist them.
export const locationPreferenceKey='iharu:briefing-location:v1';
export const locationMaxAge=30*60*1000;
export type BriefingLocation={latitude:number;longitude:number;accuracyMeters:number;capturedAt:number;expiresAt:number};
type Choice='ask'|'later'|'enabled'|'off';
type Permission=PermissionState|'unknown'|'unsupported'|'insecure';
export type LocationState={choice:Choice;permission:Permission;status:'idle'|'locating'|'ready'|'error';point:BriefingLocation|null;message:string};
type Environment={storage:Pick<Storage,'getItem'|'setItem'>;secure:boolean;geolocation?:Pick<Geolocation,'getCurrentPosition'>;permissions?:Pick<Permissions,'query'>;now:()=>number;visible:()=>boolean};
function choice(storage:Environment['storage']):Choice{try{const v=JSON.parse(storage.getItem(locationPreferenceKey)||'null');return v?.version===1&&['ask','later','enabled','off'].includes(v.choice)?v.choice:'ask';}catch{return 'ask';}}
export function approximateLocation(position:GeolocationPosition,now:number):BriefingLocation|null{
 const {latitude,longitude,accuracy}=position.coords,stamp=position.timestamp;
 if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(stamp)||stamp>now+60000||stamp<=now-locationMaxAge)return null;
 return {latitude:Math.round(latitude*100)/100,longitude:Math.round(longitude*100)/100,accuracyMeters:Math.max(1500,Math.ceil(accuracy/100)*100),capturedAt:stamp,expiresAt:stamp+locationMaxAge};
}
export class BriefingLocationController{
 private state:LocationState;private listeners=new Set<()=>void>();private active=false;private generation=0;private permissionRequest=0;private pending=false;private lastAttempt=-Infinity;private expiry:ReturnType<typeof setTimeout>|undefined;private permissionStatus:PermissionStatus|undefined;
 constructor(private env:Environment){this.state={choice:choice(env.storage),permission:!env.secure?'insecure':!env.geolocation?'unsupported':'unknown',status:'idle',point:null,message:''};}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private update(patch:Partial<LocationState>){this.state={...this.state,...patch};for(const fn of this.listeners)fn();}
 private save(next:Choice){try{this.env.storage.setItem(locationPreferenceKey,JSON.stringify({version:1,choice:next}));}catch{/* Private browsing may reject storage; current-session choices still work. */}this.update({choice:next});}
 private clear(){++this.generation;this.pending=false;clearTimeout(this.expiry);this.expiry=undefined;this.update({point:null,status:'idle',message:''});}
 setActive(value:boolean){if(this.active===value)return;this.active=value;if(!value){++this.permissionRequest;this.detachPermission();this.clear();this.lastAttempt=-Infinity;}else void this.checkPermission();}
 private detachPermission(){this.permissionStatus?.removeEventListener('change',this.changed);this.permissionStatus=undefined;}
 private changed=()=>{if(!this.active||!this.permissionStatus)return;this.acceptPermission(this.permissionStatus.state);};
 private acceptPermission(value:PermissionState){this.update({permission:value});if(value==='prompt'&&this.pending)return;if(value!=='granted'){this.clear();if(value==='denied'){if(this.state.choice==='enabled')this.save('off');this.update({status:'error',message:'위치 접근이 허용되지 않았어요. 브라우저·앱의 위치 권한을 확인해 주세요.'});}}else this.refresh(true);}
 async checkPermission(){
  if(!this.active||!this.env.secure||!this.env.geolocation||!this.env.permissions)return;
  const id=++this.permissionRequest;try{const status=await this.env.permissions.query({name:'geolocation'});if(!this.active||id!==this.permissionRequest)return;this.detachPermission();this.permissionStatus=status;status.addEventListener('change',this.changed);this.acceptPermission(status.state);}catch{/* Some browsers do not implement the geolocation permission query. Use the explicit button. */}
 }
 enable=()=>{if(!this.active)return;++this.permissionRequest;this.save('enabled');this.refresh();};
 later=()=>{this.clear();this.save('later');};
 disable=()=>{this.clear();this.save('off');};
 syncPreference=()=>{const next=choice(this.env.storage);if(next===this.state.choice)return;this.clear();this.update({choice:next});if(next==='enabled')void this.checkPermission();};
 visibilityChanged=()=>{if(!this.env.visible()){this.clear();this.lastAttempt=-Infinity;}else if(this.active)void this.checkPermission();};
 refresh=(automatic=false)=>{
  if(!this.active||!this.env.visible()||this.state.choice!=='enabled'||this.pending)return;
  if(!this.env.secure||!this.env.geolocation){this.update({status:'error',message:!this.env.secure?'안전한 HTTPS 주소에서 위치를 사용할 수 있어요.':'이 브라우저에서는 위치를 사용할 수 없어요. 지원 브라우저에서 다시 열어 주세요.'});return;}
  if(automatic&&(this.state.permission!=='granted'||this.getBriefingLocation()||this.env.now()-this.lastAttempt<30000))return;
  const id=++this.generation;this.pending=true;this.lastAttempt=this.env.now();this.update({point:null,status:'locating',message:'현재 위치를 확인하고 있어요.'});
  try{this.env.geolocation.getCurrentPosition(position=>{
   if(id!==this.generation||!this.active||!this.env.visible()||this.state.choice!=='enabled')return;this.pending=false;
   const point=approximateLocation(position,this.env.now());if(!point){this.update({status:'error',message:'위치를 확인하지 못했어요. 다시 확인해 주세요.'});return;}
   this.update({permission:'granted',point,status:'ready',message:'현재 위치를 확인했어요.'});clearTimeout(this.expiry);this.expiry=setTimeout(()=>{this.expiry=undefined;this.update({point:null,status:'idle',message:'위치를 새로 확인해 주세요.'});},Math.max(0,point.expiresAt-this.env.now()));
  },error=>{
   if(id!==this.generation||!this.active)return;this.pending=false;
   if(error.code===1){this.save('off');this.update({permission:'denied',point:null,status:'error',message:'위치 접근이 허용되지 않았어요. 브라우저·앱의 위치 권한을 확인해 주세요.'});}
   else this.update({point:null,status:'error',message:error.code===3?'위치 확인 시간이 길어지고 있어요. 잠시 후 다시 확인해 주세요.':'기기의 위치 기능과 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'});
  },{enableHighAccuracy:false,timeout:12000,maximumAge:5*60*1000});}catch{if(id===this.generation){this.pending=false;this.update({point:null,status:'error',message:'위치 권한을 확인하지 못했어요. 브라우저·앱 설정을 확인해 주세요.'});}}
 };
 getBriefingLocation=():BriefingLocation|null=>{const {point,choice,permission}=this.state;return this.active&&this.env.visible()&&choice==='enabled'&&permission==='granted'&&point&&point.expiresAt>this.env.now()?{...point}:null;};
 destroy(){this.setActive(false);this.listeners.clear();}
}
