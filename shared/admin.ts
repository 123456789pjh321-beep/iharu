export type AdminMember={id:string;profileId:string|null;name:string;email:string|null;loginId:string|null;kind:'PARENT'|'CHILD';status:'ACTIVE'|'SUSPENDED'|'DELETION_PENDING';verified:boolean;createdAt:string;familyId:string|null;familyName:string|null;host:boolean;superAdmin:boolean;roleVersion:number;version:number;lastSeenAt:string|null;activeSessions:number};
export type AdminGroup={id:string;familyId:string|null;name:string;members:AdminMember[]};
export type AdminMembers={page:number;pageSize:number;totalGroups:number;matchedMembers:number;groups:AdminGroup[]};
export type AdminOverview={members:number;parents:number;children:number;families:number;suspended:number;admins:number;newMembers:number;errors24h:number;events24h:number;collectionStartedAt:string|null;serverNow:string};
export type AdminEvent={id:string;category:string;action:string;actorName:string;targetId:string|null;requestId:string|null;reason:string;details:Record<string,unknown>;createdAt:string};
export type AdminLog={id:string;requestId:string;operation:string;method:string;status:number;durationMs:number;createdAt:string};
export type AdminPage<T>={page:number;pageSize:number;total:number;items:T[]};
