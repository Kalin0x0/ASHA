/**
 * Temporary self-contained diagnostic page served at GET /diag (i.e.
 * https://<host>/proxy/diag). Loads the REAL guacamole-common-js 1.5.0 over HTTPS
 * (ES module, works because it is same-origin HTTPS — not file://), connects to a
 * fixed test session, mounts the actual Client/Display, and prints live render
 * diagnostics on the page: client state, display.onresize, display element size,
 * scale, per-opcode counts and any error. Lets us see whether guacamole-common-js
 * itself renders the stream, isolating library/render vs our Next.js viewer.
 *
 * The proxy injects a freshly-signed access token and the test kasmId.
 */
export function diagHtml(token: string, kasmId: string): string {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"/><title>Chista guacd Render-Diagnose</title>
<style>
 html,body{margin:0;background:#1a1a2e;color:#e7e7ea;font-family:ui-monospace,Consolas,monospace}
 #log{position:fixed;inset:0 0 auto 0;max-height:46vh;overflow:auto;background:rgba(0,0,0,.9);padding:10px 12px;font-size:12px;line-height:1.45;z-index:10;border-bottom:2px solid #d4af37}
 #state{font-size:15px;font-weight:700;color:#d4af37;margin-bottom:6px}
 .k{color:#d4af37}.e{color:#f0616d;font-weight:700}.g{color:#34d399}
 #disp{margin-top:48vh;display:flex;justify-content:center}
 #disp canvas{display:block}
</style></head><body>
<div id="log"><div id="state">init…</div><div id="lines"></div></div>
<div id="disp"></div>
<script type="module">
const TOKEN=${JSON.stringify(token)};
const KASM=${JSON.stringify(kasmId)};
const lines=document.getElementById('lines'),stateEl=document.getElementById('state');
const counts={}; let imgLoad=0,imgErr=0;
// Count image decode successes/failures guacamole-common-js triggers.
const OrigImage=window.Image;
window.Image=function(w,h){const i=(w!==undefined)?new OrigImage(w,h):new OrigImage();i.addEventListener('load',()=>imgLoad++);i.addEventListener('error',()=>{imgErr++;});return i;};
window.Image.prototype=OrigImage.prototype;
const _ce=document.createElement.bind(document);
document.createElement=function(t){const el=_ce(t);if((t+'').toLowerCase()==='img'){el.addEventListener('load',()=>imgLoad++);el.addEventListener('error',()=>{imgErr++;});}return el;};
function log(m,c){const d=document.createElement('div');if(c)d.className=c;d.innerHTML=m;lines.appendChild(d);}
function setState(s){stateEl.textContent='STATE: '+s;}
window.addEventListener('error',e=>log('JS-ERROR: '+(e.message||e)+' @'+(e.filename||'')+':'+(e.lineno||''),'e'));
window.addEventListener('unhandledrejection',e=>log('PROMISE-REJECT: '+(e.reason&&e.reason.message||e.reason),'e'));
let Guacamole;
try { Guacamole=(await import('https://cdn.jsdelivr.net/npm/guacamole-common-js@1.5.0/dist/esm/guacamole-common.min.js')).default; }
catch(e){ log('Import FEHLGESCHLAGEN: '+e.message,'e'); }
if(!Guacamole){ log('Guacamole nicht geladen — Abbruch.','e'); }
else {
 log('Guacamole geladen ('+(typeof Guacamole.Client)+'). Verbinde zu Session '+KASM);
 const wsbase=location.origin.replace(/^http/,'ws')+'/proxy/session/'+KASM;
 const tunnel=new Guacamole.WebSocketTunnel(wsbase);
 const client=new Guacamole.Client(tunnel);
 const ci=tunnel.oninstruction;
 tunnel.oninstruction=function(op,a){counts[op]=(counts[op]||0)+1;if(counts[op]===1)log('1. <span class=k>'+op+'</span> '+JSON.stringify(a).slice(0,70));if(ci)ci(op,a);};
 tunnel.onerror=function(st){log('TUNNEL-ERROR: '+(st&&st.message?st.message:JSON.stringify(st)),'e');};
 const display=client.getDisplay();
 document.getElementById('disp').appendChild(display.getElement());
 display.onresize=function(w,h){log('display.onresize → <span class=g>'+w+'x'+h+'</span>');};
 const N=['IDLE','CONNECTING','WAITING','CONNECTED','DISCONNECTING','DISCONNECTED'];
 client.onstatechange=function(s){setState((N[s]||s)+' ('+s+')');log('client state → '+(N[s]||s));};
 client.onerror=function(st){log('CLIENT-ERROR: '+(st&&st.message?st.message:JSON.stringify(st)),'e');};
 setInterval(function(){
   const el=display.getElement();const cv=el.getElementsByTagName('canvas');
   let px='n/a';
   if(cv[0]){try{const ctx=cv[0].getContext('2d');const pts=[[100,80],[640,300],[300,500],[900,160]];
     px=pts.map(p=>{const d=ctx.getImageData(p[0],p[1],1,1).data;return d[0]+'/'+d[1]+'/'+d[2]+'/'+d[3];}).join(' ');}catch(e){px='getImageData-ERR:'+e.message;}}
   log('— img '+JSON.stringify(counts.img||0)+'/blob'+(counts.blob||0)+'/copy'+(counts.copy||0)+' | imgLoad=<span class=g>'+imgLoad+'</span> imgErr=<span class=e>'+imgErr+'</span> | dispEl '+el.offsetWidth+'x'+el.offsetHeight+' scale '+display.getScale()+' | canvas0 '+(cv[0]?cv[0].width+'x'+cv[0].height:'none')+' | px(RGBA) '+px);
 },3500);
 try{client.connect('token='+TOKEN);}catch(e){log('connect() warf: '+e.message,'e');}
 const mouse=new Guacamole.Mouse(display.getElement());
 mouse.onmousedown=mouse.onmouseup=mouse.onmousemove=function(st){try{client.sendMouseState(st);}catch(e){}};
}
</script>
</body></html>`;
}
