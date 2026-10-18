import {getPlatformSession} from '#schema-platform';
import {redirect} from 'next/navigation';
import {DeviceGate} from './device-lock';
import SchemaApp from './schema-app';
export const dynamic='force-dynamic';
export default async function Page(){const {user,mode}=await getPlatformSession();if(!user&&mode==='customer')redirect('/auth/login');return user?<DeviceGate key={user.userId} owner={user.userId} authMode={mode}><SchemaApp session={{id:user.userId,name:user.fullName??'',email:user.email}} authMode={mode}/></DeviceGate>:<SchemaApp session={null}/>;}
