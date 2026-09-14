// Local verification server. Fixtures stay outside the repository and deployment.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const M=require('../assets/journey-model.js');
const root=path.resolve(__dirname,'..');
const port=Number(process.argv[3]) || 8765;
let data=JSON.parse(fs.readFileSync(process.argv[2],'utf8')), mode='normal';
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/test-mode'){mode=url.searchParams.get('mode');res.end('ok');return;}
  if(url.pathname==='/api') {
    res.setHeader('Content-Type','application/json');
    if(req.method==='GET'){res.end(JSON.stringify(data));return;}
    let text='';for await(const chunk of req)text+=chunk;
    if(mode==='invalid'){res.setHeader('Content-Type','text/html');res.end('<html>upstream error</html>');mode='normal';return;}
    try{const b=JSON.parse(text),j=b.payload.journey,current=data.journeys.find(r=>r.id===j.id);
      if(mode==='conflict' && current){current.version++;mode='normal';}
      const saved=M.save(current,j,b.payload.expectedVersion,b.requestId,new Date().toISOString());
      data.journeys=[...data.journeys.filter(r=>r.id!==j.id),saved];
      if(mode==='lost'){mode='normal';req.socket.destroy();return;}
      res.end(JSON.stringify({ok:true,schemaVersion:2,journey:saved,version:saved.version,requestId:b.requestId}));
    }catch(e){res.end(JSON.stringify({ok:false,message:e.message}));}return;
  }
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{let content=fs.readFileSync(file);if(file.endsWith('index.html'))content=content.toString().replace(/const GOOGLE_SCRIPT_URL = "[^"]+";/,`const GOOGLE_SCRIPT_URL = "http://localhost:${port}/api";`);
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html;charset=utf-8':file.endsWith('.js')||file.endsWith('.cjs')?'text/javascript;charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/json;charset=utf-8');res.end(content);
  }catch{res.writeHead(404).end();}
}).listen(port,'127.0.0.1',()=>console.log(`TravelHub preview: http://localhost:${port}`));
