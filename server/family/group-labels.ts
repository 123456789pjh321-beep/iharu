// Old generated names remain in storage; expose the current group terminology.
const groupName=(name:string)=>name==='가족 미연결'?'그룹 미연결':name==='우리 가족'?'우리 그룹':name.replace(/의 가족$/,'의 그룹');
type RecordValue=Record<string,unknown>;
const object=(value:unknown):value is RecordValue=>!!value&&typeof value==='object'&&!Array.isArray(value);
function named(value:unknown){return object(value)&&typeof value.name==='string'?{...value,name:groupName(value.name)}:value;}
function member(value:unknown){return object(value)&&typeof value.familyName==='string'?{...value,familyName:groupName(value.familyName)}:value;}

export function groupLabels<T>(op:string,value:T):T{
 if(!object(value))return value;
 const result:RecordValue={...value};
 if(typeof result.familyName==='string')result.familyName=groupName(result.familyName);
 if(object(result.family))result.family=named(result.family);
 for(const key of ['families','pending'])if(Array.isArray(result[key]))result[key]=result[key].map(named);
 if(Array.isArray(result.rooms))result.rooms=result.rooms.map(member);
 if(op==='admin.members'&&Array.isArray(result.groups))result.groups=result.groups.map(group=>{
  const labeled=named(group);return object(labeled)&&Array.isArray(labeled.members)?{...labeled,members:labeled.members.map(member)}:labeled;
 });
 if(op==='admin.roles'&&Array.isArray(result.admins))result.admins=result.admins.map(member);
 return result as T;
}
