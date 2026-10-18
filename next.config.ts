import type {NextConfig} from 'next';
const nextConfig:NextConfig={
 poweredByHeader:false,
 experimental:{useTypeScriptCli:false},
 async headers(){if(process.env.SCHEMA_CUSTOMER_HOST!=='true')return [];return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), geolocation=()'},{key:'Strict-Transport-Security',value:'max-age=31536000'}]},{source:'/api/:path*',headers:[{key:'Cache-Control',value:'private, no-store'}]},{source:'/auth/:path*',headers:[{key:'Cache-Control',value:'private, no-store'}]}];}
};
export default nextConfig;
