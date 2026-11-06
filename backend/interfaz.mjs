import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const tipos={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
export async function servirInterfaz(req,res,directorio){
 if(!directorio || !['GET','HEAD'].includes(req.method))return false;
 const raiz=resolve(directorio),url=new URL(req.url,'http://localhost');
 let ruta;try{ruta=decodeURIComponent(url.pathname);}catch{res.writeHead(400);res.end();return true;}
 if(ruta.includes('\\')||ruta.includes('\0')){res.writeHead(400);res.end();return true;}
 let archivo=resolve(raiz,'.'+ruta);
 if(archivo!==raiz && !archivo.startsWith(raiz+sep)){res.writeHead(404);res.end();return true;}
 let info;try{info=await stat(archivo);}catch{}
 if(!info?.isFile()){
  if(extname(ruta)){res.writeHead(404,{'Cache-Control':'no-store'});res.end();return true;}
  archivo=resolve(raiz,'index.html');try{info=await stat(archivo);}catch{res.writeHead(503);res.end('La interfaz no está compilada.');return true;}
 }
 const extension=extname(archivo),nombre=archivo.split(sep).at(-1);
 const cache=/^(?:main|styles|chunk)-[\w-]+\.(?:js|css)$/.test(nombre)?'public, max-age=31536000, immutable':'no-cache';
 res.writeHead(200,{'Content-Type':tipos[extension]||'application/octet-stream','Content-Length':info.size,'Cache-Control':cache,'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin'});
 if(req.method==='HEAD')res.end();else createReadStream(archivo).on('error',()=>res.destroy()).pipe(res);
 return true;
}
