import {notFound} from 'next/navigation';
import {AuthForm} from '../form';
export const dynamic='force-dynamic';
export default async function AuthPage({params,searchParams}:{params:Promise<{action:string}>;searchParams:Promise<{link?:string}>}){const {action}=await params;if(!['login','signup','forgot','resend','reset','logout'].includes(action))notFound();return <AuthForm action={action} linkExpired={(await searchParams).link==='expired'}/>;}
