(() => {
'use strict';
const canvas=document.querySelector('#space');
const ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile=matchMedia('(max-width: 780px)').matches;
const TAU=Math.PI*2;
let W=0,H=0,DPR=1,lastTime=performance.now(),flowTime=0;
let dragging=false,moved=false,pointerId=null,hover=null,selected=null;
let pointer={x:-9999,y:-9999},lastPointer={x:0,y:0};
let yawVelocity=0,pitchVelocity=0,idleSeconds=0,query='';
const active=new Set(SUBJECTS.map(s=>s.id));
const camera={yaw:-.7,pitch:.48,distance:isMobile?1950:1650,targetYaw:-.7,targetPitch:.48,targetDistance:isMobile?1950:1650,focal:920};
const ui={legend:document.querySelector('.legend'),status:document.querySelector('#status'),details:document.querySelector('#details'),intro:document.querySelector('#intro'),hint:document.querySelector('#hint'),search:document.querySelector('#search'),dSubject:document.querySelector('#dSubject'),dTitle:document.querySelector('#dTitle'),dPath:document.querySelector('#dPath'),dDesc:document.querySelector('#dDesc'),dPoints:document.querySelector('#dPoints')};
function seeded(seed){let h=2166136261;for(let i=0;i<seed.length;i++)h=Math.imul(h^seed.charCodeAt(i),16777619);return()=>((h=Math.imul(h^(h>>>13),1274126177))>>>0)/4294967296}
const random=seeded('408-knowledge-universe-3d');
function gaussian(){return(random()+random()+random()+random()-2)*.72}
function hexRgb(hex){const n=parseInt(hex.slice(1),16);return[n>>16,(n>>8)&255,n&255]}
SUBJECTS.forEach(s=>s.rgb=hexRgb(s.color));
const particles=[];
const particleCount=isMobile?5200:11800;
for(let i=0;i<particleCount;i++){
 const arm=i%4,radius=35+Math.pow(random(),.62)*1040,coreMix=random();
 const angle=arm*TAU/4+radius*.0092+gaussian()*(.11+radius/3600);
 particles.push({radius,angle,y:gaussian()*(8+radius*.055)*(coreMix<.12?2.2:1),arm,size:.45+Math.pow(random(),5)*3.2,alpha:.18+random()*.72,speed:.012+(1-radius/1100)*.018,warm:coreMix<.18||radius<190,bright:random()>.993});
}
for(let i=0;i<(isMobile?550:1300);i++){
 const radius=Math.pow(random(),2.35)*300;
 particles.push({radius,angle:random()*TAU,y:gaussian()*(80-radius*.13),arm:i%4,size:.6+random()*2.5,alpha:.3+random()*.7,speed:.026+random()*.035,warm:true,bright:random()>.985});
}
const deepStars=[];
for(let i=0;i<(isMobile?420:900);i++){
 const theta=random()*TAU,u=random()*2-1,shell=1900+random()*1500;
 deepStars.push({x:Math.sqrt(1-u*u)*Math.cos(theta)*shell,y:u*shell*.7,z:Math.sqrt(1-u*u)*Math.sin(theta)*shell,size:.25+random()*1.15,alpha:.2+random()*.55});
}
const nodes=[],links=[];
SUBJECTS.forEach((subject,si)=>{
 const armBase=si*TAU/4;
 const core={id:subject.id,name:subject.name,subject,level:0,radius:92+si*10,angle:armBase+.35,y:(si-1.5)*8,size:13,desc:`${subject.name}大纲知识星系`,points:['选择章节恒星继续深入'],path:'408'};
 nodes.push(core);
 subject.chapters.forEach((chapter,ci)=>{
  const radius=235+ci*92,angle=armBase+radius*.0092+(ci%2?.06:-.05);
  const chapterNode={id:`${subject.id}-${ci}`,name:chapter[0],subject,level:1,radius,angle,y:(ci%3-1)*24,size:8,desc:`${subject.name}中的${chapter[0]}知识群。`,points:chapter[1].map(item=>item[0]),path:subject.name};
  nodes.push(chapterNode);links.push([core,chapterNode]);
  chapter[1].forEach((point,pi)=>{
   const r=radius+58+pi*34,a=armBase+r*.0092+(pi-(chapter[1].length-1)/2)*.052;
   const node={id:`${subject.id}-${ci}-${pi}`,name:point[0],subject,level:2,radius:r,angle:a,y:(pi%3-1)*32+(ci%2?12:-12),size:4.5,desc:point[1],points:point[2].split('|'),path:`${subject.name} / ${chapter[0]}`};
   nodes.push(node);links.push([chapterNode,node]);
  });
 });
});
function resize(){DPR=Math.min(devicePixelRatio||1,isMobile?1.35:1.8);W=innerWidth;H=innerHeight;canvas.width=Math.floor(W*DPR);canvas.height=Math.floor(H*DPR);canvas.style.width=`${W}px`;canvas.style.height=`${H}px`;ctx.setTransform(DPR,0,0,DPR,0,0);camera.focal=Math.min(W,H)*(isMobile?1.34:1.2)}
function worldFromPolar(item,spin=0){const a=item.angle+spin;return{x:Math.cos(a)*item.radius,y:item.y,z:Math.sin(a)*item.radius}}
function project(world){const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);const x1=world.x*cy-world.z*sy,z1=world.x*sy+world.z*cy,y2=world.y*cp-z1*sp,z2=world.y*sp+z1*cp,depth=camera.distance+z2;if(depth<80)return null;const scale=camera.focal/depth;return{x:W*.5+x1*scale,y:H*.5+y2*scale,depth,scale}}
function rgba(rgb,a){return`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`}
function matches(node){return!query||`${node.name}${node.path}${node.desc}${node.points.join('')}`.toLowerCase().includes(query)}
function drawBackground(){ctx.fillStyle='#010207';ctx.fillRect(0,0,W,H);const glow=ctx.createRadialGradient(W*.5,H*.51,0,W*.5,H*.51,Math.max(W,H)*.68);glow.addColorStop(0,'rgba(18,32,49,.66)');glow.addColorStop(.24,'rgba(7,15,27,.42)');glow.addColorStop(1,'rgba(1,2,7,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H)}
function drawDeepStars(){ctx.fillStyle='#d8ecff';for(const star of deepStars){const p=project(star);if(!p||p.x<0||p.x>W||p.y<0||p.y>H)continue;ctx.globalAlpha=star.alpha;const size=Math.max(.3,star.size*p.scale*1.8);ctx.fillRect(p.x,p.y,size,size)}ctx.globalAlpha=1}
function drawGalaxy(dt){
 if(!reduceMotion)flowTime+=dt;
 const center=project({x:0,y:0,z:0});
 if(center){const radius=Math.max(45,190*center.scale),coreGlow=ctx.createRadialGradient(center.x,center.y,0,center.x,center.y,radius);coreGlow.addColorStop(0,'rgba(255,239,192,.42)');coreGlow.addColorStop(.12,'rgba(244,201,107,.2)');coreGlow.addColorStop(.5,'rgba(99,151,205,.08)');coreGlow.addColorStop(1,'rgba(20,45,72,0)');ctx.fillStyle=coreGlow;ctx.beginPath();ctx.arc(center.x,center.y,radius,0,TAU);ctx.fill()}
 for(const star of particles){const p=project(worldFromPolar(star,flowTime*star.speed));if(!p||p.x<-5||p.x>W+5||p.y<-5||p.y>H+5)continue;const subject=SUBJECTS[star.arm],rgb=star.warm?[244,215,160]:subject.rgb,depthFade=Math.max(.12,Math.min(1,2200/p.depth)),size=Math.max(.35,Math.min(3.2,star.size*p.scale*1.5));ctx.globalAlpha=star.alpha*depthFade;ctx.fillStyle=rgba(rgb,.92);ctx.fillRect(p.x,p.y,size,size);if(star.bright&&size>.65){ctx.globalAlpha*=.3;ctx.beginPath();ctx.arc(p.x+size/2,p.y+size/2,size*4.8,0,TAU);ctx.fill()}}
 ctx.globalAlpha=1;
}
function drawKnowledge(){
 const nodeSpin=flowTime*.016,visible=nodes.filter(n=>active.has(n.subject.id));for(const node of visible)node._screen=project(worldFromPolar(node,nodeSpin));
 for(const[a,b]of links){if(!active.has(a.subject.id))continue;const A=a._screen,B=b._screen;if(!A||!B)continue;ctx.globalAlpha=query&&!matches(b)?.035:Math.max(.07,Math.min(.3,760/((A.depth+B.depth)/2)));ctx.strokeStyle=a.subject.color;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke()}
 ctx.globalAlpha=1;hover=null;
 const ordered=visible.filter(n=>n._screen).sort((a,b)=>b._screen.depth-a._screen.depth);
 for(const node of ordered){const p=node._screen;if(p.x<-90||p.x>W+90||p.y<-60||p.y>H+60)continue;const dim=query&&!matches(node),radius=Math.max(2.2,Math.min(16,node.size*p.scale*2.1)),hitRadius=Math.max(12,radius+7);if(Math.hypot(pointer.x-p.x,pointer.y-p.y)<hitRadius)hover=node;ctx.globalAlpha=dim?.08:1;const emphasized=node===selected||node===hover||(query&&matches(node));if(node.level<2||emphasized){const halo=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius*(emphasized?7:4.5));halo.addColorStop(0,node.subject.color+'aa');halo.addColorStop(.22,node.subject.color+'32');halo.addColorStop(1,node.subject.color+'00');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(p.x,p.y,radius*(emphasized?7:4.5),0,TAU);ctx.fill()}ctx.fillStyle=emphasized?'#fffdf7':node.subject.color;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,TAU);ctx.fill();const labelVisible=node.level===0||emphasized||(node.level===1&&camera.distance<2100)||(node.level===2&&camera.distance<950);if(labelVisible){const fontSize=node.level===0?15:node.level===1?12:10;ctx.globalAlpha=dim?.08:Math.max(.45,Math.min(1,1500/p.depth));ctx.font=`${node.level===0?650:500} ${fontSize}px "Microsoft YaHei UI"`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#e8f3ff';ctx.fillText(node.name,p.x+radius+7,p.y)}}ctx.globalAlpha=1;
}
function updateCamera(dt){const ease=1-Math.pow(.0005,dt);camera.yaw+=(camera.targetYaw-camera.yaw)*ease;camera.pitch+=(camera.targetPitch-camera.pitch)*ease;camera.distance+=(camera.targetDistance-camera.distance)*ease;if(!dragging&&!reduceMotion){idleSeconds+=dt;yawVelocity*=Math.pow(.035,dt);pitchVelocity*=Math.pow(.025,dt);camera.targetYaw+=yawVelocity*dt*60;camera.targetPitch+=pitchVelocity*dt*60;if(idleSeconds>1.4)camera.targetYaw+=dt*.018}camera.targetPitch=Math.max(-.15,Math.min(1.18,camera.targetPitch));camera.targetDistance=Math.max(430,Math.min(3400,camera.targetDistance))}
function render(now){const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;updateCamera(dt);drawBackground();drawDeepStars();drawGalaxy(dt);drawKnowledge();canvas.style.cursor=dragging?'grabbing':hover?'pointer':'grab';requestAnimationFrame(render)}
function showNode(node){selected=node;ui.details.style.setProperty('--node-color',node.subject.color);ui.dSubject.textContent=node.subject.name;ui.dTitle.textContent=node.name;ui.dPath.textContent=node.path;ui.dDesc.textContent=node.desc;ui.dPoints.innerHTML=node.points.map(point=>`<li>${point}</li>`).join('');ui.details.classList.add('open');ui.intro.classList.add('gone');ui.hint.classList.add('hide')}
function focusNode(node,open=false){const currentAngle=node.angle+flowTime*.016;camera.targetYaw=Math.PI/2-currentAngle;camera.targetPitch=.3;camera.targetDistance=node.level===2?620:node.level===1?920:1250;idleSeconds=0;if(open)showNode(node)}
function resetView(){camera.targetYaw=-.7;camera.targetPitch=.48;camera.targetDistance=isMobile?1950:1650;selected=null;query='';ui.search.value='';ui.details.classList.remove('open');ui.status.textContent=`${nodes.length} 颗知识星体 · ${particles.length.toLocaleString()} 颗流动星尘`}
SUBJECTS.forEach(subject=>{const button=document.createElement('button');button.className='filter active';button.style.setProperty('--c',subject.color);button.textContent=subject.name;button.addEventListener('click',()=>{active.has(subject.id)?active.delete(subject.id):active.add(subject.id);button.classList.toggle('active',active.has(subject.id));ui.status.textContent=`${nodes.filter(n=>active.has(n.subject.id)).length} 颗可见知识星体`});ui.legend.appendChild(button)});
ui.status.textContent=`${nodes.length} 颗知识星体 · ${particles.length.toLocaleString()} 颗流动星尘`;
canvas.addEventListener('pointerdown',event=>{dragging=true;moved=false;pointerId=event.pointerId;idleSeconds=0;lastPointer={x:event.clientX,y:event.clientY};canvas.setPointerCapture(pointerId)});
canvas.addEventListener('pointermove',event=>{pointer={x:event.clientX,y:event.clientY};if(!dragging)return;const dx=event.clientX-lastPointer.x,dy=event.clientY-lastPointer.y;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;camera.targetYaw+=dx*.0042;camera.targetPitch+=dy*.0042;yawVelocity=dx*.00067;pitchVelocity=dy*.0005;lastPointer=pointer;ui.intro.classList.add('gone')});
canvas.addEventListener('pointerup',()=>{dragging=false;if(pointerId!==null)canvas.releasePointerCapture(pointerId);pointerId=null;if(!moved&&hover)focusNode(hover,true)});
canvas.addEventListener('pointerleave',()=>{if(!dragging)pointer={x:-9999,y:-9999}});
canvas.addEventListener('wheel',event=>{event.preventDefault();idleSeconds=0;camera.targetDistance*=Math.exp(event.deltaY*.00115);ui.intro.classList.add('gone')},{passive:false});
ui.search.addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();const hits=nodes.filter(matches);ui.status.textContent=query?`找到 ${hits.length} 个相关知识点`:`${nodes.length} 颗知识星体 · ${particles.length.toLocaleString()} 颗流动星尘`;if(query&&hits.length)focusNode(hits[0])});
document.addEventListener('keydown',event=>{if(event.key==='/'&&document.activeElement.tagName!=='INPUT'){event.preventDefault();ui.search.focus()}if(event.key==='Escape'){ui.details.classList.remove('open');selected=null;ui.search.blur()}});
document.querySelector('#plus').addEventListener('click',()=>{camera.targetDistance/=1.28;idleSeconds=0});
document.querySelector('#minus').addEventListener('click',()=>{camera.targetDistance*=1.28;idleSeconds=0});
document.querySelector('#home').addEventListener('click',resetView);
document.querySelector('#close').addEventListener('click',()=>{ui.details.classList.remove('open');selected=null});
document.querySelector('#enter').addEventListener('click',()=>{ui.intro.classList.add('gone');camera.targetDistance=1250;idleSeconds=0;ui.hint.classList.remove('hide')});
addEventListener('resize',resize);resize();requestAnimationFrame(render);
})();

