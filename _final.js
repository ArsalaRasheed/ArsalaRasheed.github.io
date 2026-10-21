const fs=require("fs"),path=require("path"),{spawn}=require("child_process");
const CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",PORT=9420;
const UD=path.join(process.env.TEMP,"opencode","cdp-final");
const URL="file:///"+path.join(__dirname,"index.html").replace(/\\/g,"/");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.rmSync(UD,{recursive:true,force:true});
 const chrome=spawn(CHROME,["--headless=new","--disable-gpu","--hide-scrollbars","--no-first-run","--remote-debugging-port="+PORT,"--user-data-dir="+UD,"--window-size=1200,900","about:blank"],{stdio:"ignore"});
 let ws,id=0;const pending=new Map();
 const send=(m,p={})=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}))});
 for(let i=0;i<40;i++){try{await(await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break}catch{await sleep(250)}}
 const t=(await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x=>x.type==="page");
 ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener("open",r));
 ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result)}});
 await send("Page.enable");await send("Runtime.enable");
 const ev=async x=>(await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true,timeout:60000})).result.value;
 const issues=[];

 console.log("=== VIEWPORTS ===");
 for(const d of [[320,568],[360,740],[390,844],[414,896],[600,900],[768,1024],[820,1180],[1024,768],[1280,800],[1440,900],[1920,1080]]){
  await send("Emulation.setDeviceMetricsOverride",{width:d[0],height:d[1],deviceScaleFactor:1,mobile:d[0]<820});
  await send("Page.navigate",{url:URL});await sleep(1600);
  const r=JSON.parse(await ev(`(()=>{const h=document.documentElement;
    const c=document.querySelector('.hero__actions .btn--wa').getBoundingClientRect();
    const brand=document.querySelector('.brand-grid').getBoundingClientRect();
    return JSON.stringify({hs:h.scrollWidth>h.clientWidth+1,cta:c.bottom<=innerHeight,
      wa:document.querySelector('.hero__actions .btn--wa').href.indexOf('https://wa.me/923498272533?text=')===0,
      brandW:Math.round(brand.width)});})()`));
  const bad=[]; if(r.hs)bad.push("hscroll"); if(!r.cta)bad.push("cta-below-fold"); if(!r.wa)bad.push("wa");
  console.log(`  ${String(d[0]).padStart(4)}x${d[1]}  brandRow=${String(r.brandW).padStart(4)}  ${bad.length?"<-- "+bad.join(","):"ok"}`);
  if(bad.length && d[0]!==320) issues.push(d[0]+"x"+d[1]+": "+bad.join(","));
  else if(bad.length) issues.push(d[0]+"x"+d[1]+": "+bad.join(",")+" (known)");
 }

 await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send("Page.navigate",{url:URL});await sleep(2600);
 await ev(`document.documentElement.style.scrollBehavior='auto';
   document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-revealed'))`);
 await ev(`(async()=>{const H=document.documentElement.scrollHeight;
   for(let y=0;y<H;y+=350){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,45));}window.scrollTo(0,0);})()`);
 // The store photo is lazy, so its load failure fires asynchronously only once
 // it has actually been seen. Bring it into view and let that settle, otherwise
 // the fallback assertion below reports a false negative.
 await ev(`(()=>{const f=document.querySelector('.store__frame');
   if(f){const r=f.getBoundingClientRect();window.scrollTo(0,Math.round(r.top+scrollY-200));}})()`);
 await sleep(1400);
 await ev(`window.scrollTo(0,0)`);
 await sleep(1800);

 console.log("\n=== INTEGRITY ===");
 const r=JSON.parse(await ev(`(()=>{
   const imgs=[...document.querySelectorAll('img')];
   const ids=new Set([...document.querySelectorAll('[id]')].map(e=>e.id));
   const logos=[...document.querySelectorAll('.brand-tile__logo')];
   return JSON.stringify({
     brands:document.querySelectorAll('.brand-tile').length,
     logosLive:logos.filter(l=>l.classList.contains('is-ok')).length,
     logoFiles:logos.filter(l=>l.getAttribute('src')).map(l=>l.getAttribute('src').split('/').pop()),
     categories:document.querySelectorAll('.cat-card').length,
     sikken:/sikken/i.test(document.body.innerText),
     automotive:/utomotive/i.test(document.body.innerText),
     waCtas:document.querySelectorAll('[data-wa]').length,
     waOk:[...document.querySelectorAll('[data-wa]')].every(a=>a.href.indexOf('https://wa.me/923498272533?text=')===0),
     brokenAnchors:[...document.querySelectorAll('a[href^="#"]')].map(a=>a.getAttribute('href').slice(1)).filter(Boolean).filter(x=>!ids.has(x)),
     imgsNoAlt:imgs.filter(i=>!i.hasAttribute('alt')).length,
     h1:document.querySelectorAll('h1').length,
     storePlaceholder:document.querySelector('.store__frame').classList.contains('is-missing'),
     jsonLd:(()=>{try{JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);return "valid"}catch(e){return "INVALID"}})(),
     lazyBrandLogos:logos.filter(l=>l.getAttribute('loading')==="lazy").length
   });})()`));
 for(const [k,v] of Object.entries(r)) console.log("  "+k.padEnd(20),JSON.stringify(v));
 if(r.sikken)issues.push("Sikken still in page text");
 if(r.automotive)issues.push("automotive still in page text");
 if(!r.waOk)issues.push("a WhatsApp CTA is wrong");
 if(r.brokenAnchors.length)issues.push("broken anchors: "+r.brokenAnchors.join(","));
 if(r.imgsNoAlt)issues.push("images without alt: "+r.imgsNoAlt);
 if(r.jsonLd!=="valid")issues.push("JSON-LD invalid");
 if(r.lazyBrandLogos)issues.push("brand logos regressed to loading=lazy");
 // 9 tiles, but Crono has no authentic logo file anywhere, so 8 resolve to real artwork.
 if(r.logosLive!==8)issues.push("expected 8 live logos, got "+r.logosLive);

 // WCAG AA contrast is audited separately by _contrast.js, which samples real
 // painted pixels. getComputedStyle cannot see gradient backgrounds, so a
 // CSS-only checker produces false positives here.
 console.log("\n=== CONTRAST ===");
 console.log("  see _contrast.js (pixel-based)");
 ws.close();chrome.kill();
 console.log("\n"+(issues.length?"ISSUES:\n  "+issues.join("\n  "):"ALL CLEAN"));
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
