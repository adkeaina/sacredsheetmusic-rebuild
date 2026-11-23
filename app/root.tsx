import '@fontsource/great-vibes/400.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import './styles/site.css';
import { data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { SiteShell } from './components/SiteShell';
import { cloudflareContext } from './lib/context.server';
import { getTags } from './lib/db.server';
import { visitorSession } from './lib/visitor.server';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError, isRouteErrorResponse, Link } from 'react-router';
export function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex,nofollow"/><title>Free Sacred Sheet Music · Independent preview</title><Meta/><Links/></head><body>{children}<ScrollRestoration/><Scripts/></body></html>; }
export async function loader({request,context}:LoaderFunctionArgs){const {env}=context.get(cloudflareContext);const visitor=await visitorSession(request,env);return data({tags:await getTags(env),viewer:null},{headers:visitor.header?{'Set-Cookie':visitor.header,'Cache-Control':'private, no-store'}:{'Cache-Control':'private, no-store'}});}
export default function App(){const {tags}=useLoaderData<typeof loader>();return <SiteShell tags={tags}><Outlet/></SiteShell>;}
export function ErrorBoundary(){ const error=useRouteError(); const missing=isRouteErrorResponse(error)&&error.status===404; return <main style={{maxWidth:720,margin:'5rem auto',fontFamily:'sans-serif',padding:24}}><h1>{missing?'That page could not be found':'This page could not load'}</h1><p>{missing?'Try searching for the music or browsing a category.':'Your saved information is still here. Please try again.'}</p><Link to="/">Return to sheet music</Link></main>; }
