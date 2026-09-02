const BALL_MM = 42.67;
const TILT_LIMIT = 1.5;
const STABLE_MS = 1000;
const screens = [...document.querySelectorAll('.screen')];
const video = document.querySelector('#camera');
const captureCanvas = document.querySelector('#captureCanvas');
const photoCanvas = document.querySelector('#photoCanvas');
const ctx = photoCanvas.getContext('2d');
let stream = null, image = null, points = [], stableSince = 0, lastMotion = 0, counting = false, captured = false, gravityAvailable = false;
let ballMode = 'auto', ballCandidate = null, searchRegion = null;
let draggedPoint = -1, shaftAxis = null;
let dragOffset = {x:0,y:0};
let sensorReceived=false,sensorCheckTimer=null;

function show(id){ screens.forEach(s=>s.classList.toggle('active',s.id===id)); }
function stopCamera(){ if(stream) stream.getTracks().forEach(t=>t.stop()); stream=null;if(sensorCheckTimer)clearTimeout(sensorCheckTimer);sensorCheckTimer=null; window.removeEventListener('deviceorientation',onOrientation,true); window.removeEventListener('devicemotion',onMotion,true); }

async function requestSensors(){
  try{
    let orientationState='granted',motionState='granted';
    if(typeof window.DeviceOrientationEvent?.requestPermission==='function'){
      orientationState=await window.DeviceOrientationEvent.requestPermission();
    }
    if(typeof window.DeviceMotionEvent?.requestPermission==='function') motionState=await window.DeviceMotionEvent.requestPermission();
    if(orientationState!=='granted'||motionState!=='granted')return false;
    window.addEventListener('deviceorientation',onOrientation,true);
    window.addEventListener('devicemotion',onMotion,true);
    return true;
  }catch{return false;}
}

function onMotion(e){
  const gravity=e.accelerationIncludingGravity;
  if(gravity&&gravity.x!=null&&gravity.y!=null&&gravity.z!=null){
    sensorReceived=true;
    gravityAvailable=true;
    const gx=gravity.x,gy=gravity.y,gz=gravity.z;
    const tiltX=Math.atan2(gx,Math.hypot(gy,gz))*180/Math.PI;
    const tiltY=Math.atan2(gy,Math.hypot(gx,gz))*180/Math.PI;
    updateLevel(tiltX,tiltY);
  }
  const a=e.acceleration;
  if(a){
    const movement=Math.hypot(a.x||0,a.y||0,a.z||0);
    if(movement>.35){lastMotion=performance.now();stableSince=0;cancelCountdown();}
  }
}

async function startCamera(){
  captured=false; stableSince=0; counting=false; gravityAvailable=false;sensorReceived=false; show('cameraScreen');
  try{
    const sensorPermission=await requestSensors();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
    video.srcObject=stream; await video.play();
    if(!sensorPermission){document.querySelector('#levelTitle').textContent='센서 권한이 꺼져 있습니다';document.querySelector('#levelDetail').textContent='브라우저 설정에서 동작 및 방향 센서를 허용한 뒤 다시 시작하세요';}
    else sensorCheckTimer=setTimeout(()=>{if(!sensorReceived&&!captured){document.querySelector('#levelTitle').textContent='센서값을 받지 못했습니다';document.querySelector('#levelDetail').textContent='브라우저의 동작 및 방향 센서 권한을 확인한 뒤 다시 시도하세요';}},2500);
  }catch(err){
    stopCamera(); show('homeScreen');
    alert('카메라를 열 수 없습니다. 카메라 권한을 허용하거나 기존 사진을 불러와 주세요.');
  }
}

function onOrientation(e){
  if(captured||gravityAvailable) return;
  if(Number.isFinite(e.gamma)&&Number.isFinite(e.beta))sensorReceived=true;
  updateLevel(e.gamma??99,e.beta??99);
}

function updateLevel(x,y){
  if(captured)return;
  const level=document.querySelector('#level');
  const title=document.querySelector('#levelTitle');
  const detail=document.querySelector('#levelDetail');
  level.querySelector('i').style.transform=`translate(${Math.max(-25,Math.min(25,x*2))}px,${Math.max(-25,Math.min(25,y*2))}px)`;
  const ok=Math.abs(x)<=TILT_LIMIT&&Math.abs(y)<=TILT_LIMIT;
  level.classList.toggle('ok',ok);
  if(ok){
    title.textContent='수평이 맞았습니다'; detail.textContent=`좌우 ${x.toFixed(1)}° · 위아래 ${y.toFixed(1)}° — 움직이지 마세요`;
    if(!stableSince) stableSince=performance.now();
    if(performance.now()-stableSince>=STABLE_MS&&performance.now()-lastMotion>=STABLE_MS&&!counting) autoCountdown();
  }else{
    stableSince=0; cancelCountdown(); title.textContent='휴대폰을 수평으로 맞춰주세요';
    detail.textContent=`좌우 ${x.toFixed(1)}° · 위아래 ${y.toFixed(1)}° (허용 ±${TILT_LIMIT}°)`;
  }
}

async function autoCountdown(){
  counting=true; const el=document.querySelector('#countdown');
  for(let n=3;n>0;n--){ if(!counting)return; el.textContent=n; await new Promise(r=>setTimeout(r,1000)); }
  if(counting) takePhoto();
}
function cancelCountdown(){ counting=false; document.querySelector('#countdown').textContent=''; }

function takePhoto(){
  if(captured||!video.videoWidth)return; captured=true; cancelCountdown();
  const frame=document.querySelector('.frame').getBoundingClientRect(),videoRect=video.getBoundingClientRect();
  const sourceWidth=video.videoWidth,sourceHeight=video.videoHeight,coverScale=Math.max(videoRect.width/sourceWidth,videoRect.height/sourceHeight);
  const renderedWidth=sourceWidth*coverScale,renderedHeight=sourceHeight*coverScale;
  const cropX=(frame.left-videoRect.left+(renderedWidth-videoRect.width)/2)/coverScale;
  const cropY=(frame.top-videoRect.top+(renderedHeight-videoRect.height)/2)/coverScale;
  const cropWidth=frame.width/coverScale,cropHeight=frame.height/coverScale;
  const sx=Math.max(0,Math.min(sourceWidth-1,cropX)),sy=Math.max(0,Math.min(sourceHeight-1,cropY));
  const sw=Math.max(1,Math.min(sourceWidth-sx,cropWidth)),sh=Math.max(1,Math.min(sourceHeight-sy,cropHeight));
  captureCanvas.width=Math.round(sw);captureCanvas.height=Math.round(sh);
  captureCanvas.getContext('2d').drawImage(video,sx,sy,sw,sh,0,0,captureCanvas.width,captureCanvas.height);
  loadImage(captureCanvas.toDataURL('image/jpeg',.94));stopCamera();
}

function loadImage(src,cleanup){
  const img=new Image();
  img.onload=()=>{image=img;points=[];shaftAxis=null;ballMode='auto';ballCandidate=null;searchRegion=null;draggedPoint=-1;document.querySelector('#ballConfirm').hidden=true;document.querySelector('#adjustPanel').hidden=true;document.querySelector('#axisStatus').hidden=true;document.querySelector('#canvasWrap').classList.remove('adjusting');draw();show('measureScreen');updateStep();cleanup?.();};
  img.onerror=()=>{cleanup?.();alert('사진을 불러오지 못했습니다. JPG, PNG 또는 WebP 사진으로 다시 시도해 주세요.');};
  img.src=src;
}
function draw(){
  if(!image)return; photoCanvas.width=image.naturalWidth||image.width; photoCanvas.height=image.naturalHeight||image.height; ctx.drawImage(image,0,0);
  if(searchRegion){
    ctx.save();ctx.beginPath();ctx.rect(0,0,photoCanvas.width,photoCanvas.height);ctx.arc(searchRegion.x,searchRegion.y,searchRegion.radius,0,Math.PI*2,true);ctx.fillStyle='rgba(0,0,0,.18)';ctx.fill('evenodd');
    ctx.beginPath();ctx.arc(searchRegion.x,searchRegion.y,searchRegion.radius,0,Math.PI*2);ctx.setLineDash([14,10]);ctx.lineWidth=Math.max(4,photoCanvas.width/350);ctx.strokeStyle='#fff';ctx.stroke();ctx.restore();
  }
  if(ballCandidate){ctx.save();ctx.beginPath();ctx.arc(ballCandidate.x,ballCandidate.y,ballCandidate.radius,0,Math.PI*2);ctx.lineWidth=Math.max(3,photoCanvas.width/520);ctx.strokeStyle='rgba(185,255,61,.88)';ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=4;ctx.stroke();ctx.restore();}
  const colors=['#b9ff3d','#b9ff3d','#ff633f','#ff633f'];
  points.forEach((p,i)=>{
    const putterPoint=i>=2;
    if(!putterPoint){const radius=Math.max(7,photoCanvas.width/170);ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fillStyle='rgba(185,255,61,.38)';ctx.fill();ctx.lineWidth=Math.max(2,photoCanvas.width/600);ctx.strokeStyle='rgba(255,255,255,.8)';ctx.stroke();return;}
    const radius=Math.max(52,photoCanvas.width/11),stroke=Math.max(7,photoCanvas.width/180),accent=draggedPoint===i?'#ffe45e':'#ff633f';
    ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.lineWidth=stroke;ctx.strokeStyle=accent;ctx.stroke();
    ctx.beginPath();ctx.moveTo(p.x-radius*.45,p.y);ctx.lineTo(p.x+radius*.45,p.y);ctx.moveTo(p.x,p.y-radius*.45);ctx.lineTo(p.x,p.y+radius*.45);ctx.lineWidth=Math.max(4,stroke*.55);ctx.strokeStyle='#fff';ctx.stroke();
    const badgeX=p.x+radius*.88,badgeY=p.y-radius*.88,badgeR=radius*.42;ctx.beginPath();ctx.arc(badgeX,badgeY,badgeR,0,Math.PI*2);ctx.fillStyle=accent;ctx.fill();ctx.lineWidth=Math.max(3,stroke*.45);ctx.strokeStyle='#fff';ctx.stroke();ctx.fillStyle='#101311';ctx.font=`bold ${Math.max(24,photoCanvas.width/32)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i-1,badgeX,badgeY);ctx.restore();
  });
  if(points.length>=2){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);ctx.lineTo(points[1].x,points[1].y);ctx.strokeStyle='rgba(185,255,61,.48)';ctx.lineWidth=Math.max(2,photoCanvas.width/600);ctx.stroke();}
  if(points.length>=4){ctx.save();ctx.beginPath();ctx.moveTo(points[2].x,points[2].y);ctx.lineTo(points[3].x,points[3].y);ctx.strokeStyle='rgba(255,99,63,.75)';ctx.setLineDash([Math.max(14,photoCanvas.width/80),Math.max(10,photoCanvas.width/120)]);ctx.lineWidth=Math.max(5,photoCanvas.width/220);ctx.stroke();ctx.restore();}
  if(shaftAxis){const span=Math.hypot(photoCanvas.width,photoCanvas.height);ctx.save();ctx.beginPath();ctx.moveTo(shaftAxis.x-shaftAxis.ux*span,shaftAxis.y-shaftAxis.uy*span);ctx.lineTo(shaftAxis.x+shaftAxis.ux*span,shaftAxis.y+shaftAxis.uy*span);ctx.strokeStyle='rgba(39,210,232,.9)';ctx.lineWidth=Math.max(3,photoCanvas.width/420);ctx.setLineDash([Math.max(18,photoCanvas.width/70),Math.max(10,photoCanvas.width/110)]);ctx.stroke();ctx.restore();}
}
function updateStep(){
  const title=document.querySelector('#stepTitle'),help=document.querySelector('#stepHelp'),panel=document.querySelector('#adjustPanel'),panelTitle=panel.querySelector('b'),panelHelp=panel.querySelector('span'),confirm=document.querySelector('#confirmPutter');
  let stage=1;
  if(points.length<2&&ballMode==='auto'&&!ballCandidate){title.textContent='골프공을 터치하세요';help.textContent='공이 들어 있는 영역을 터치하면 실제 외곽을 자동으로 찾습니다.';}
  else if(points.length<2){title.textContent='검출된 골프공을 확인하세요';help.textContent='초록색 원이 공 외곽과 맞으면 확인하고, 아니면 다시 선택하세요.';}
  else if(points.length===2){stage=2;title.textContent='그립 상단 주변을 선택하세요';help.textContent='샤프트 축이 시작되는 그립 맨 끝 주변을 터치하세요.';}
  else if(points.length===3){stage=3;title.textContent='솔 기준점 주변을 선택하세요';help.textContent='샤프트 직선축을 솔까지 연장했을 때 만나는 주변을 터치하세요.';}
  else{stage=4;title.textContent='자동 기준선을 확인하세요';help.textContent='청록색 샤프트 중심축과 주황색 두 기준점을 확인하고 필요하면 드래그하세요.';}
  panel.hidden=points.length<2;confirm.disabled=points.length<4;
  if(points.length===2){panelTitle.textContent='1. 그립 상단 주변 선택';panelHelp.textContent='정확한 한 점이 아니어도 됩니다. 자동으로 축과 외곽을 찾습니다.';confirm.textContent='두 점을 선택하면 자동 보정합니다';}
  else if(points.length===3){panelTitle.textContent='2. 샤프트 축이 만나는 솔 주변 선택';panelHelp.textContent='헤드 최외곽이 아니라 샤프트 직선축의 연장선 기준입니다.';confirm.textContent='솔 주변을 선택해 주세요';}
  else if(points.length>=4){panelTitle.textContent='공식 길이 기준점 확인';panelHelp.textContent='자동 보정 결과가 다르면 주황색 점을 드래그해 수정하세요.';confirm.textContent='이 기준으로 측정';}
  document.querySelector('#tapHint').textContent=stage;document.querySelector('#tapHint').hidden=stage===4;document.querySelector('#progressBar').style.width=`${stage*25}%`;
}
function luminance(data,index){return data[index]*.299+data[index+1]*.587+data[index+2]*.114;}
function median(values){const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:0;}
function solve3(matrix,vector){
  const a=matrix.map((row,i)=>[...row,vector[i]]);
  for(let col=0;col<3;col++){
    let pivot=col;for(let row=col+1;row<3;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(Math.abs(a[pivot][col])<1e-9)return null;
    [a[col],a[pivot]]=[a[pivot],a[col]];
    const divisor=a[col][col];for(let j=col;j<4;j++)a[col][j]/=divisor;
    for(let row=0;row<3;row++)if(row!==col){const factor=a[row][col];for(let j=col;j<4;j++)a[row][j]-=factor*a[col][j];}
  }
  return[a[0][3],a[1][3],a[2][3]];
}
function fitCircle(points){
  if(points.length<8)return null;
  const mx=points.reduce((sum,p)=>sum+p.x,0)/points.length,my=points.reduce((sum,p)=>sum+p.y,0)/points.length;
  let uu=0,uv=0,vv=0,u=0,v=0,uq=0,vq=0,qsum=0;
  for(const p of points){const dx=p.x-mx,dy=p.y-my,q=dx*dx+dy*dy;uu+=dx*dx;uv+=dx*dy;vv+=dy*dy;u+=dx;v+=dy;uq+=dx*q;vq+=dy*q;qsum+=q;}
  const result=solve3([[uu,uv,u],[uv,vv,v],[u,v,points.length]],[-uq,-vq,-qsum]);if(!result)return null;
  const [A,B,C]=result,cx=-A/2,cy=-B/2,radius=Math.sqrt(Math.max(0,cx*cx+cy*cy-C));
  return radius>0&&Number.isFinite(radius)?{x:mx+cx,y:my+cy,radius}:null;
}
function robustCircle(points,step){
  let active=points,fit=null;
  for(let pass=0;pass<3;pass++){
    fit=fitCircle(active);if(!fit)return null;
    const residuals=active.map(p=>Math.abs(Math.hypot(p.x-fit.x,p.y-fit.y)-fit.radius));
    const mad=median(residuals),limit=Math.max(step*1.8,mad*2.8);
    active=active.filter((p,i)=>residuals[i]<=limit);if(active.length<8)return null;
  }
  const error=median(active.map(p=>Math.abs(Math.hypot(p.x-fit.x,p.y-fit.y)-fit.radius)))/fit.radius;
  return{...fit,error,pointCount:active.length};
}
function refineBallOuterEdge(pixels,width,height,initial,step){
  const edgePoints=[],sampleGap=Math.max(2,step*2),minR=initial.radius*.72,maxR=initial.radius*1.42;
  for(let angle=0;angle<Math.PI*2;angle+=Math.PI/72){
    const cs=Math.cos(angle),sn=Math.sin(angle);let bestRadius=0,bestScore=0;
    for(let radius=minR;radius<=maxR;radius+=Math.max(1,step)){
      const ix=Math.round(initial.x+cs*(radius-sampleGap)),iy=Math.round(initial.y+sn*(radius-sampleGap));
      const ox=Math.round(initial.x+cs*(radius+sampleGap)),oy=Math.round(initial.y+sn*(radius+sampleGap));
      if(ix<0||iy<0||ox<0||oy<0||ix>=width||ox>=width||iy>=height||oy>=height)continue;
      const score=luminance(pixels,(iy*width+ix)*4)-luminance(pixels,(oy*width+ox)*4);
      if(score>bestScore){bestScore=score;bestRadius=radius;}
    }
    if(bestRadius&&bestScore>10)edgePoints.push({x:initial.x+cs*bestRadius,y:initial.y+sn*bestRadius,radius:bestRadius,score:bestScore});
  }
  if(edgePoints.length<36)return initial;
  const typicalRadius=median(edgePoints.map(p=>p.radius));
  const consistent=edgePoints.filter(p=>Math.abs(p.radius-typicalRadius)<=Math.max(step*3,typicalRadius*.16));
  const refined=robustCircle(consistent,Math.max(1,step));
  if(!refined||refined.error>.08||refined.radius<initial.radius*.88||refined.radius>initial.radius*1.35)return initial;
  return{...refined,baseRadius:refined.radius,score:median(consistent.map(p=>p.score)),method:'outer-edge-circle-fit'};
}
function detectContrastBlob(pixels,width,height,x,y,roiRadius){
  const step=Math.max(1,Math.round(roiRadius/110));
  const centerSamples=[],backgroundSamples=[];
  for(let py=Math.max(0,Math.round(y-roiRadius));py<=Math.min(height-1,Math.round(y+roiRadius));py+=step){
    for(let px=Math.max(0,Math.round(x-roiRadius));px<=Math.min(width-1,Math.round(x+roiRadius));px+=step){
      const d=Math.hypot(px-x,py-y),value=luminance(pixels,(py*width+px)*4);
      if(d<roiRadius*.09)centerSamples.push(value);
      else if(d>roiRadius*.62&&d<roiRadius*.9)backgroundSamples.push(value);
    }
  }
  const centerTone=median(centerSamples),backgroundTone=median(backgroundSamples),contrast=centerTone-backgroundTone;
  if(Math.abs(contrast)<28)return null;
  const bright=contrast>0,threshold=backgroundTone+contrast*.46;
  const cols=Math.ceil(width/step),rows=Math.ceil(height/step),sx=Math.round(x/step),sy=Math.round(y/step);
  const key=(gx,gy)=>gy*cols+gx,seen=new Uint8Array(cols*rows),insideMask=new Uint8Array(cols*rows),queue=[[sx,sy]],component=[];
  let head=0,count=0,sumX=0,sumY=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  while(head<queue.length){
    const [gx,gy]=queue[head++];if(gx<0||gy<0||gx>=cols||gy>=rows||seen[key(gx,gy)])continue;seen[key(gx,gy)]=1;
    const px=Math.min(width-1,gx*step),py=Math.min(height-1,gy*step);if(Math.hypot(px-x,py-y)>roiRadius*.7)continue;
    const value=luminance(pixels,(py*width+px)*4),inside=bright?value>=threshold:value<=threshold;if(!inside)continue;
    insideMask[key(gx,gy)]=1;component.push([gx,gy]);count++;sumX+=px;sumY+=py;minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)if(ox||oy)queue.push([gx+ox,gy+oy]);
  }
  if(count<12)return null;
  const diameterX=maxX-minX+step,diameterY=maxY-minY+step,ratio=Math.min(diameterX,diameterY)/Math.max(diameterX,diameterY);
  if(ratio<.68)return null;
  const boundary=component.filter(([gx,gy])=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>gx+dx<0||gy+dy<0||gx+dx>=cols||gy+dy>=rows||!insideMask[key(gx+dx,gy+dy)])).map(([gx,gy])=>({x:gx*step,y:gy*step}));
  const circle=robustCircle(boundary,step);if(!circle)return null;
  if(circle.error>.12||circle.radius<roiRadius*.045||circle.radius>roiRadius*.34||Math.hypot(circle.x-x,circle.y-y)>circle.radius*1.25)return null;
  const initial={x:circle.x,y:circle.y,radius:circle.radius,baseRadius:circle.radius,score:Math.abs(contrast),fitError:circle.error,method:'robust-circle-fit'};
  return refineBallOuterEdge(pixels,width,height,initial,step);
}
function findBallInRegion(pixels,width,height,x,y,roiRadius){
  const step=Math.max(1,Math.round(roiRadius/100)),left=Math.max(0,Math.floor(x-roiRadius)),top=Math.max(0,Math.floor(y-roiRadius));
  const right=Math.min(width-1,Math.ceil(x+roiRadius)),bottom=Math.min(height-1,Math.ceil(y+roiRadius));
  const cols=Math.floor((right-left)/step)+1,rows=Math.floor((bottom-top)/step)+1,tones=[];
  const key=(gx,gy)=>gy*cols+gx,mask=new Uint8Array(cols*rows),seen=new Uint8Array(cols*rows);
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
    const px=left+gx*step,py=top+gy*step;if(Math.hypot(px-x,py-y)>roiRadius*.92)continue;
    tones.push(luminance(pixels,(py*width+px)*4));
  }
  if(tones.length<30)return null;
  const sorted=[...tones].sort((a,b)=>a-b),background=sorted[Math.floor(sorted.length*.5)],brightTone=sorted[Math.floor(sorted.length*.86)];
  const threshold=Math.max(135,background+28,brightTone+5);
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
    const px=left+gx*step,py=top+gy*step;if(Math.hypot(px-x,py-y)>roiRadius*.92)continue;
    if(luminance(pixels,(py*width+px)*4)>=threshold)mask[key(gx,gy)]=1;
  }
  const candidates=[];
  for(let sy=0;sy<rows;sy++)for(let sx=0;sx<cols;sx++){
    if(!mask[key(sx,sy)]||seen[key(sx,sy)])continue;
    const queue=[[sx,sy]],component=[];seen[key(sx,sy)]=1;
    for(let head=0;head<queue.length;head++){
      const [gx,gy]=queue[head];component.push([gx,gy]);
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
        if(!ox&&!oy)continue;const nx=gx+ox,ny=gy+oy;
        if(nx<0||ny<0||nx>=cols||ny>=rows||seen[key(nx,ny)]||!mask[key(nx,ny)])continue;
        seen[key(nx,ny)]=1;queue.push([nx,ny]);
      }
    }
    if(component.length<18)continue;
    let minGX=Infinity,maxGX=-Infinity,minGY=Infinity,maxGY=-Infinity;
    for(const [gx,gy] of component){minGX=Math.min(minGX,gx);maxGX=Math.max(maxGX,gx);minGY=Math.min(minGY,gy);maxGY=Math.max(maxGY,gy);}
    const spanX=(maxGX-minGX+1)*step,spanY=(maxGY-minGY+1)*step;
    const ratio=Math.min(spanX,spanY)/Math.max(spanX,spanY);if(ratio<.62)continue;
    const boundary=component.filter(([gx,gy])=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>gx+dx<0||gy+dy<0||gx+dx>=cols||gy+dy>=rows||!mask[key(gx+dx,gy+dy)])).map(([gx,gy])=>({x:left+gx*step,y:top+gy*step}));
    const circle=robustCircle(boundary,step);if(!circle||circle.error>.15||circle.radius<roiRadius*.025||circle.radius>roiRadius*.28)continue;
    if(Math.hypot(circle.x-x,circle.y-y)+circle.radius>roiRadius*.94)continue;
    const initial={...circle,baseRadius:circle.radius,score:(brightTone-background)*ratio,fitError:circle.error,method:'region-component-circle'};
    const refined=refineBallOuterEdge(pixels,width,height,initial,step);
    candidates.push({...refined,regionScore:refined.radius*ratio/(1+(refined.error||circle.error)*8)});
  }
  candidates.sort((a,b)=>b.regionScore-a.regionScore);return candidates[0]||null;
}
function detectBallAt(x,y){
  const roiRadius=Math.round(Math.min(photoCanvas.width,photoCanvas.height)*.14);
  searchRegion=null;ballCandidate=null;draw();
  const pixels=ctx.getImageData(0,0,photoCanvas.width,photoCanvas.height).data;
  searchRegion={x,y,radius:roiRadius};
  const contrastBall=findBallInRegion(pixels,photoCanvas.width,photoCanvas.height,x,y,roiRadius);
  if(contrastBall){
    ballCandidate=contrastBall;draw();document.querySelector('#ballSize').value='100';document.querySelector('#ballSizeValue').textContent='100%';document.querySelector('#ballConfirm').hidden=false;document.querySelector('#stepTitle').textContent='골프공을 찾았습니다';document.querySelector('#stepHelp').textContent='외곽점에 원의 방정식을 맞췄습니다. 초록색 원을 확인하세요.';return;
  }
  const edgeRadii=[],edgeScores=[];
  const minR=Math.max(8,Math.round(roiRadius*.12)),maxR=Math.round(roiRadius*.78);
  for(let a=0;a<Math.PI*2;a+=Math.PI/36){
    let rayRadius=0,rayScore=0;
    for(let r=minR;r<=maxR;r+=2){
      const cs=Math.cos(a),sn=Math.sin(a),inner=r-3,outer=r+3;
      const x1=Math.round(x+cs*inner),y1=Math.round(y+sn*inner),x2=Math.round(x+cs*outer),y2=Math.round(y+sn*outer);
      if(x1<0||y1<0||x2<0||y2<0||x1>=photoCanvas.width||x2>=photoCanvas.width||y1>=photoCanvas.height||y2>=photoCanvas.height)continue;
      const gradient=Math.abs(luminance(pixels,(y1*photoCanvas.width+x1)*4)-luminance(pixels,(y2*photoCanvas.width+x2)*4));
      const score=gradient*(.8+.2*r/maxR);
      if(score>rayScore){rayScore=score;rayRadius=r;}
    }
    if(rayRadius){edgeRadii.push(rayRadius);edgeScores.push(rayScore);}
  }
  const bestRadius=median(edgeRadii),deviation=median(edgeRadii.map(r=>Math.abs(r-bestRadius))),confidence=median(edgeScores);
  ballCandidate=bestRadius&&confidence>7&&deviation<bestRadius*.38?{x,y,radius:bestRadius,baseRadius:bestRadius,score:confidence}:null;
  draw();
  if(ballCandidate){document.querySelector('#ballSize').value='100';document.querySelector('#ballSizeValue').textContent='100%';document.querySelector('#ballConfirm').hidden=false;document.querySelector('#stepTitle').textContent='골프공을 찾았습니다';document.querySelector('#stepHelp').textContent='슬라이더로 초록색 원을 실제 외곽에 정확히 맞추세요.';}
  else{ballMode='auto';searchRegion=null;alert('골프공 테두리를 찾지 못했습니다. 골프공 중심을 다시 터치하거나 다시 촬영해 주세요.');draw();updateStep();}
}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function captureHorizontalBallPoints(ball){return[{x:ball.x,y:ball.y-ball.radius},{x:ball.x,y:ball.y+ball.radius}];}
function captureHorizontalBallDiameter(){return points.length>=2?Math.abs(points[1].y-points[0].y):0;}
function constrainPointToShaftAxis(point){
  if(!shaftAxis)return point;const t=(point.x-shaftAxis.x)*shaftAxis.ux+(point.y-shaftAxis.y)*shaftAxis.uy,candidates=[];
  if(Math.abs(shaftAxis.ux)>.0001){candidates.push((0-shaftAxis.x)/shaftAxis.ux,(photoCanvas.width-shaftAxis.x)/shaftAxis.ux);}if(Math.abs(shaftAxis.uy)>.0001){candidates.push((0-shaftAxis.y)/shaftAxis.uy,(photoCanvas.height-shaftAxis.y)/shaftAxis.uy);}
  const valid=candidates.filter(v=>{const x=shaftAxis.x+shaftAxis.ux*v,y=shaftAxis.y+shaftAxis.uy*v;return x>=-1&&x<=photoCanvas.width+1&&y>=-1&&y<=photoCanvas.height+1;}),minT=valid.length?Math.min(...valid):t,maxT=valid.length?Math.max(...valid):t,clamped=Math.max(minT,Math.min(maxT,t));return{x:shaftAxis.x+shaftAxis.ux*clamped,y:shaftAxis.y+shaftAxis.uy*clamped};
}
function fitAxisPca(samples){
  if(samples.length<4)return null;const x=samples.reduce((s,p)=>s+p.x,0)/samples.length,y=samples.reduce((s,p)=>s+p.y,0)/samples.length;
  let xx=0,xy=0,yy=0;for(const p of samples){const dx=p.x-x,dy=p.y-y;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;}
  const angle=.5*Math.atan2(2*xy,xx-yy);return{x,y,ux:Math.cos(angle),uy:Math.sin(angle)};
}
function sampleGray(data,w,h,x,y){x=Math.max(0,Math.min(w-1,Math.round(x)));y=Math.max(0,Math.min(h-1,Math.round(y)));return luminance(data,(y*w+x)*4);}
function sampleRgb(data,w,h,x,y){x=Math.max(0,Math.min(w-1,Math.round(x)));y=Math.max(0,Math.min(h-1,Math.round(y)));const i=(y*w+x)*4;return[data[i],data[i+1],data[i+2]];}
function colorDistance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}
function medianNumber(values){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;}
function detectShaftAndEndpointsAutomatic(){
  shaftAxis=null;if(!image)return false;
  const sample=document.createElement('canvas'),maxSide=720,scale=Math.min(1,maxSide/Math.max(photoCanvas.width,photoCanvas.height));sample.width=Math.max(1,Math.round(photoCanvas.width*scale));sample.height=Math.max(1,Math.round(photoCanvas.height*scale));
  const sctx=sample.getContext('2d',{willReadFrequently:true});sctx.drawImage(image,0,0,sample.width,sample.height);const w=sample.width,h=sample.height,data=sctx.getImageData(0,0,w,h).data,gray=new Float32Array(w*h),edges=[],magnitudes=[];
  for(let i=0;i<w*h;i++)gray[i]=luminance(data,i*4);
  for(let y=2;y<h-2;y+=2)for(let x=2;x<w-2;x+=2){const i=y*w+x,gx=gray[i+1]-gray[i-1],gy=gray[i+w]-gray[i-w],m=Math.hypot(gx,gy);magnitudes.push(m);edges.push({x,y,gx,gy,m});}
  magnitudes.sort((a,b)=>a-b);const threshold=Math.max(20,magnitudes[Math.floor(magnitudes.length*.82)]||20),strong=edges.filter(e=>e.m>=threshold);if(strong.length<100)return false;
  const diag=Math.ceil(Math.hypot(w,h)),rhoSize=diag*2+3,candidates=[];
  for(let angle=0;angle<180;angle+=2){const rad=angle*Math.PI/180,d={x:Math.cos(rad),y:Math.sin(rad)},n={x:-d.y,y:d.x},pos=new Uint16Array(rhoSize),neg=new Uint16Array(rhoSize);
    for(const e of strong){const align=(e.gx*n.x+e.gy*n.y)/Math.max(1,e.m);if(Math.abs(align)<.68)continue;const r=Math.round(e.x*n.x+e.y*n.y)+diag;(align>=0?pos:neg)[r]++;}
    const peaks=(arr,sign)=>{const out=[];for(let r=2;r<rhoSize-2;r++)if(arr[r]>=6&&arr[r]>=arr[r-1]&&arr[r]>=arr[r+1])out.push({rho:r-diag,v:arr[r],sign});return out.sort((a,b)=>b.v-a.v).slice(0,12);},left=peaks(pos,1),right=peaks(neg,-1),minWidth=Math.max(2,w*.0025),maxWidth=Math.max(10,w*.035);
    for(const a of left)for(const b of right){const width=Math.abs(a.rho-b.rho);if(width>=minWidth&&width<=maxWidth)candidates.push({d,n,rho:(a.rho+b.rho)/2,width,votes:a.v+b.v});}
  }
  candidates.sort((a,b)=>b.votes-a.votes);let best=null;
  for(const c of candidates.slice(0,90)){const step=Math.max(2,c.width*.7),hits=[];for(let t=-diag;t<=diag;t+=step){const x=c.n.x*c.rho+c.d.x*t,y=c.n.y*c.rho+c.d.y*t;if(x<2||y<2||x>=w-2||y>=h-2)continue;const gap=Math.max(1.2,c.width*.2),lx=x-c.n.x*c.width/2,ly=y-c.n.y*c.width/2,rx=x+c.n.x*c.width/2,ry=y+c.n.y*c.width/2,gl=sampleGray(data,w,h,lx+c.n.x*gap,ly+c.n.y*gap)-sampleGray(data,w,h,lx-c.n.x*gap,ly-c.n.y*gap),gr=sampleGray(data,w,h,rx+c.n.x*gap,ry+c.n.y*gap)-sampleGray(data,w,h,rx-c.n.x*gap,ry-c.n.y*gap),strength=Math.abs(gl)+Math.abs(gr);if(gl*gr<0&&strength>=threshold*.65)hits.push(t);}
    if(hits.length<12)continue;hits.sort((a,b)=>a-b);let runs=[],run=[hits[0]];for(let i=1;i<hits.length;i++){if(hits[i]-hits[i-1]<=step*3.2)run.push(hits[i]);else{runs.push(run);run=[hits[i]];}}runs.push(run);runs.sort((a,b)=>(b[b.length-1]-b[0])-(a[a.length-1]-a[0]));const chosen=runs[0],span=chosen[chosen.length-1]-chosen[0],score=span+c.votes*1.5;if(span>Math.max(w,h)*.22&&(!best||score>best.score))best={...c,minT:chosen[0],maxT:chosen[chosen.length-1],score};
  }
  if(!best)return false;const axis={x:best.n.x*best.rho/scale,y:best.n.y*best.rho/scale,ux:best.d.x,uy:best.d.y};shaftAxis=axis;
  const lineOrigin={x:best.n.x*best.rho,y:best.n.y*best.rho},bounds=[];if(Math.abs(best.d.x)>.0001){bounds.push((1-lineOrigin.x)/best.d.x,(w-2-lineOrigin.x)/best.d.x);}if(Math.abs(best.d.y)>.0001){bounds.push((1-lineOrigin.y)/best.d.y,(h-2-lineOrigin.y)/best.d.y);}const validBounds=bounds.filter(t=>{const x=lineOrigin.x+best.d.x*t,y=lineOrigin.y+best.d.y*t;return x>=0&&x<w&&y>=0&&y<h;}),traceStart=Math.min(...validBounds),traceEnd=Math.max(...validBounds),traceStep=2,backgroundGap=Math.max(best.width*7,18),offsets=[-.38,-.25,-.12,0,.12,.25,.38].map(v=>v*best.width),endStarts=[],endFinishes=[],contrastLimit=Math.max(22,threshold*.5),backgroundNeeded=Math.max(4,Math.round(best.width*.8/traceStep)),objectNeeded=Math.max(4,Math.round(best.width*1.25/traceStep));
  function boundaryFromEdge(samples,reverse){const ordered=reverse?[...samples].reverse():samples;let backgroundRun=0;for(let i=0;i<ordered.length-objectNeeded;i++){if(!ordered[i].fg){backgroundRun++;continue;}if(backgroundRun<backgroundNeeded){backgroundRun=0;continue;}let support=0;for(let k=0;k<objectNeeded;k++)if(ordered[i+k].fg)support++;if(support>=Math.ceil(objectNeeded*.72))return ordered[i].t;backgroundRun=0;}return null;}
  for(const offset of offsets){const samples=[];for(let t=traceStart;t<=traceEnd;t+=traceStep){const cx=lineOrigin.x+best.d.x*t+best.n.x*offset,cy=lineOrigin.y+best.d.y*t+best.n.y*offset;if(cx<2||cy<2||cx>=w-2||cy>=h-2)continue;const pixel=sampleRgb(data,w,h,cx,cy),bgA=sampleRgb(data,w,h,cx+best.n.x*backgroundGap,cy+best.n.y*backgroundGap),bgB=sampleRgb(data,w,h,cx-best.n.x*backgroundGap,cy-best.n.y*backgroundGap),contrast=Math.min(colorDistance(pixel,bgA),colorDistance(pixel,bgB));samples.push({t,fg:contrast>=contrastLimit});}
    const fromStart=boundaryFromEdge(samples,false),fromEnd=boundaryFromEdge(samples,true);if(fromStart!=null)endStarts.push(fromStart);if(fromEnd!=null)endFinishes.push(fromEnd);
  }
  const startConsensus=endStarts.length,endConsensus=endFinishes.length,consensus=Math.min(startConsensus,endConsensus),fallbackExtension=Math.max((best.maxT-best.minT)*.18,best.width*8),minT=startConsensus>=3?medianNumber(endStarts):best.minT-fallbackExtension,maxT=endConsensus>=3?medianNumber(endFinishes):best.maxT+fallbackExtension;
  const p1={x:(best.n.x*best.rho+best.d.x*minT)/scale,y:(best.n.y*best.rho+best.d.y*minT)/scale},p2={x:(best.n.x*best.rho+best.d.x*maxT)/scale,y:(best.n.y*best.rho+best.d.y*maxT)/scale};points=[points[0],points[1],p1,p2];
  document.querySelector('#axisStatus').hidden=false;document.querySelector('#axisStatus span').textContent=consensus>=5?`촬영 영역 양 끝에서 들어오며 그린→퍼터 경계를 ${consensus}/7 탐색선이 확인했습니다.`:`양 끝 경계 신뢰도가 낮습니다(시작 ${startConsensus}/7 · 끝 ${endConsensus}/7). 중심축 위에서 포인트를 보정해 주세요.`;document.querySelector('#canvasWrap').classList.add('adjusting');draw();updateStep();return true;
}
function refineOfficialAxisPoints(){
  shaftAxis=null;if(!image||points.length<4)return false;
  const roughA=points[2],roughB=points[3],dx=roughB.x-roughA.x,dy=roughB.y-roughA.y,len=Math.hypot(dx,dy);if(len<100)return false;
  const ux=dx/len,uy=dy/len,nx=-uy,ny=ux,scanHalf=Math.max(12,Math.min(len*.09,photoCanvas.width*.08));
  const sample=document.createElement('canvas'),maxSide=1200,scale=Math.min(1,maxSide/Math.max(photoCanvas.width,photoCanvas.height));sample.width=Math.round(photoCanvas.width*scale);sample.height=Math.round(photoCanvas.height*scale);
  const sctx=sample.getContext('2d',{willReadFrequently:true});sctx.drawImage(image,0,0,sample.width,sample.height);const data=sctx.getImageData(0,0,sample.width,sample.height).data,w=sample.width,h=sample.height;
  const centers=[];for(let f=.16;f<=.84;f+=.035){const cx=(roughA.x+dx*f)*scale,cy=(roughA.y+dy*f)*scale,half=scanHalf*scale,values=[];for(let o=-half;o<=half;o+=1)values.push(sampleGray(data,w,h,cx+nx*o,cy+ny*o));
    const gradients=[];for(let i=2;i<values.length-2;i++)gradients.push({i,g:Math.abs(values[i+2]-values[i-2])});gradients.sort((a,b)=>b.g-a.g);let pair=null;
    for(let a=0;a<Math.min(14,gradients.length)&&!pair;a++)for(let b=a+1;b<Math.min(20,gradients.length);b++){const oa=gradients[a].i-half,ob=gradients[b].i-half,width=Math.abs(ob-oa);if(oa*ob<0&&width>=3*scale&&width<=scanHalf*1.65){pair={o:(oa+ob)/2,score:gradients[a].g+gradients[b].g};break;}}
    if(pair&&pair.score>18)centers.push({x:(cx+nx*pair.o)/scale,y:(cy+ny*pair.o)/scale});
  }
  let axis=fitAxisPca(centers);if(!axis||centers.length<7)return false;if(axis.ux*dx+axis.uy*dy<0){axis.ux*=-1;axis.uy*=-1;}shaftAxis=axis;
  const project=p=>(p.x-axis.x)*axis.ux+(p.y-axis.y)*axis.uy,roughT=[project(roughA),project(roughB)],band=Math.max(4,scanHalf*.32)*scale;
  function snapEndpoint(target,index){const range=len*.11,steps=70,signals=[];for(let i=0;i<=steps;i++){const t=target-range+2*range*i/steps;let before=0,after=0,count=0;for(let o=-band;o<=band;o+=Math.max(1,band/5)){before+=sampleGray(data,w,h,(axis.x+axis.ux*(t-len*.006)+(-axis.uy)*o/scale)*scale,(axis.y+axis.uy*(t-len*.006)+axis.ux*o/scale)*scale);after+=sampleGray(data,w,h,(axis.x+axis.ux*(t+len*.006)+(-axis.uy)*o/scale)*scale,(axis.y+axis.uy*(t+len*.006)+axis.ux*o/scale)*scale);count++;}signals.push({t,score:Math.abs(after-before)/count});}
    signals.sort((a,b)=>b.score-a.score);const chosen=signals[0];if(chosen&&chosen.score>5)points[index]={x:axis.x+axis.ux*chosen.t,y:axis.y+axis.uy*chosen.t};else points[index]={x:axis.x+axis.ux*target,y:axis.y+axis.uy*target};
  }
  snapEndpoint(roughT[0],2);snapEndpoint(roughT[1],3);document.querySelector('#axisStatus').hidden=false;return true;
}
function calculate(){
  const ballPx=captureHorizontalBallDiameter(),putterPx=distance(points[2],points[3]);
  if(ballPx<5)return alert('골프공 기준점이 너무 가깝습니다. 다시 지정해 주세요.');
  const rawMm=putterPx/ballPx*BALL_MM;
  document.querySelector('#resultCm').textContent=(rawMm/10).toFixed(1);
  document.querySelector('#resultIn').textContent=(rawMm/25.4).toFixed(2);
  document.querySelector('#ballPixelDiameter').textContent=`${ballPx.toFixed(1)} px`;
  document.querySelector('#putterPixelLength').textContent=`${putterPx.toFixed(1)} px`;
  show('resultScreen');
}

function canvasPoint(e){const r=photoCanvas.getBoundingClientRect();return{x:(e.clientX-r.left)*photoCanvas.width/r.width,y:(e.clientY-r.top)*photoCanvas.height/r.height,scale:photoCanvas.width/r.width};}
photoCanvas.addEventListener('pointerdown',e=>{
  if(points.length!==4)return;
  const p=canvasPoint(e),hitRadius=68*p.scale;
  const candidates=[2,3].map(i=>({i,d:distance(p,points[i])})).filter(v=>v.d<=hitRadius).sort((a,b)=>a.d-b.d);
  if(!candidates.length)return;
  draggedPoint=candidates[0].i;dragOffset={x:points[draggedPoint].x-p.x,y:points[draggedPoint].y-p.y};photoCanvas.setPointerCapture?.(e.pointerId);draw();e.preventDefault();
});
photoCanvas.addEventListener('pointermove',e=>{if(draggedPoint<2)return;const p=canvasPoint(e),desired={x:Math.max(0,Math.min(photoCanvas.width,p.x+dragOffset.x)),y:Math.max(0,Math.min(photoCanvas.height,p.y+dragOffset.y))};points[draggedPoint]=constrainPointToShaftAxis(desired);draw();e.preventDefault();});
photoCanvas.addEventListener('pointerup',e=>{
  if(draggedPoint>=2){draggedPoint=-1;dragOffset={x:0,y:0};draw();return;}
  if(points.length>=4||ballCandidate)return;
  const p=canvasPoint(e);if(points.length===0&&ballMode==='auto')return detectBallAt(p.x,p.y);points.push({x:p.x,y:p.y});draw();updateStep();
  if(points.length===4){refineOfficialAxisPoints();document.querySelector('#canvasWrap').classList.add('adjusting');draw();updateStep();}
});
photoCanvas.addEventListener('pointercancel',()=>{draggedPoint=-1;dragOffset={x:0,y:0};draw();});
document.querySelector('#confirmBall').addEventListener('click',()=>{if(!ballCandidate)return;points=captureHorizontalBallPoints(ballCandidate);ballCandidate=null;searchRegion=null;document.querySelector('#ballConfirm').hidden=true;draw();if(!detectShaftAndEndpointsAutomatic()){document.querySelector('#axisStatus').hidden=true;updateStep();document.querySelector('#stepHelp').textContent='자동 검출하지 못했습니다. 그립 상단과 솔 기준점 주변을 차례로 선택해 주세요.';}});
document.querySelector('#retryBall').addEventListener('click',()=>{ballCandidate=null;searchRegion=null;document.querySelector('#ballConfirm').hidden=true;draw();updateStep();});
document.querySelector('#ballSize').addEventListener('input',e=>{if(!ballCandidate)return;const percent=Number(e.target.value);ballCandidate.radius=ballCandidate.baseRadius*percent/100;document.querySelector('#ballSizeValue').textContent=`${percent}%`;draw();});
document.querySelector('#confirmPutter').addEventListener('click',calculate);
document.querySelector('#startButton').addEventListener('click',startCamera);
document.querySelector('#closeCamera').addEventListener('click',()=>{stopCamera();show('homeScreen');});
document.querySelector('#retakeButton').addEventListener('click',()=>{points=[];shaftAxis=null;show('homeScreen');});
document.querySelector('#newMeasure').addEventListener('click',()=>{points=[];shaftAxis=null;show('homeScreen');});
document.querySelector('#fileInput').addEventListener('change',e=>{
  const input=e.currentTarget,file=input.files?.[0];
  if(!file)return;
  if(!file.type.startsWith('image/')){alert('이미지 파일을 선택해 주세요.');input.value='';return;}
  const objectUrl=URL.createObjectURL(file);
  loadImage(objectUrl,()=>URL.revokeObjectURL(objectUrl));input.value='';
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream)stopCamera();});
