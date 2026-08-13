const BALL_MM = 42.67;
const TILT_LIMIT = 0.3;
const STABLE_MS = 1000;
const screens = [...document.querySelectorAll('.screen')];
const video = document.querySelector('#camera');
const captureCanvas = document.querySelector('#captureCanvas');
const photoCanvas = document.querySelector('#photoCanvas');
const ctx = photoCanvas.getContext('2d');
let stream = null, image = null, points = [], stableSince = 0, lastMotion = 0, counting = false, captured = false, gravityAvailable = false;
let ballMode = 'auto', ballCandidate = null, searchRegion = null;

function show(id){ screens.forEach(s=>s.classList.toggle('active',s.id===id)); }
function stopCamera(){ if(stream) stream.getTracks().forEach(t=>t.stop()); stream=null; window.removeEventListener('deviceorientation',onOrientation); window.removeEventListener('devicemotion',onMotion); }

async function requestSensors(){
  try{
    if(typeof window.DeviceOrientationEvent?.requestPermission==='function'){
      const state=await window.DeviceOrientationEvent.requestPermission();
      if(state!=='granted') return false;
    }
    if(typeof window.DeviceMotionEvent?.requestPermission==='function') await window.DeviceMotionEvent.requestPermission();
    window.addEventListener('deviceorientation',onOrientation,true);
    window.addEventListener('devicemotion',onMotion,true);
    return true;
  }catch{return false;}
}

function onMotion(e){
  const gravity=e.accelerationIncludingGravity;
  if(gravity&&gravity.x!=null&&gravity.y!=null&&gravity.z!=null){
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
  captured=false; stableSince=0; counting=false; gravityAvailable=false; show('cameraScreen');
  try{
    await requestSensors();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
    video.srcObject=stream; await video.play();
  }catch(err){
    stopCamera(); show('homeScreen');
    alert('카메라를 열 수 없습니다. 카메라 권한을 허용하거나 기존 사진을 불러와 주세요.');
  }
}

function onOrientation(e){
  if(captured||gravityAvailable) return;
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
  for(let n=3;n>0;n--){ if(!counting)return; el.textContent=n; navigator.vibrate?.(35); await new Promise(r=>setTimeout(r,1000)); }
  if(counting) takePhoto();
}
function cancelCountdown(){ counting=false; document.querySelector('#countdown').textContent=''; }

function takePhoto(){
  if(captured||!video.videoWidth)return; captured=true; cancelCountdown();
  captureCanvas.width=video.videoWidth; captureCanvas.height=video.videoHeight;
  captureCanvas.getContext('2d').drawImage(video,0,0); loadImage(captureCanvas.toDataURL('image/jpeg',.92)); stopCamera();
}

function loadImage(src,cleanup){
  const img=new Image();
  img.onload=()=>{image=img;points=[];ballMode='auto';ballCandidate=null;searchRegion=null;document.querySelector('#ballConfirm').hidden=true;draw();show('measureScreen');updateStep();cleanup?.();};
  img.onerror=()=>{cleanup?.();alert('사진을 불러오지 못했습니다. JPG, PNG 또는 WebP 사진으로 다시 시도해 주세요.');};
  img.src=src;
}
function draw(){
  if(!image)return; photoCanvas.width=image.naturalWidth||image.width; photoCanvas.height=image.naturalHeight||image.height; ctx.drawImage(image,0,0);
  if(searchRegion){
    ctx.save();ctx.beginPath();ctx.rect(0,0,photoCanvas.width,photoCanvas.height);ctx.arc(searchRegion.x,searchRegion.y,searchRegion.radius,0,Math.PI*2,true);ctx.fillStyle='rgba(0,0,0,.58)';ctx.fill('evenodd');
    ctx.beginPath();ctx.arc(searchRegion.x,searchRegion.y,searchRegion.radius,0,Math.PI*2);ctx.setLineDash([14,10]);ctx.lineWidth=Math.max(4,photoCanvas.width/350);ctx.strokeStyle='#fff';ctx.stroke();ctx.restore();
  }
  if(ballCandidate){ctx.save();ctx.beginPath();ctx.arc(ballCandidate.x,ballCandidate.y,ballCandidate.radius,0,Math.PI*2);ctx.lineWidth=Math.max(6,photoCanvas.width/260);ctx.strokeStyle='#b9ff3d';ctx.shadowColor='#000';ctx.shadowBlur=8;ctx.stroke();ctx.restore();}
  const colors=['#b9ff3d','#b9ff3d','#ff633f','#ff633f'];
  points.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,Math.max(10,photoCanvas.width/120),0,Math.PI*2);ctx.fillStyle=colors[i];ctx.fill();ctx.lineWidth=Math.max(3,photoCanvas.width/400);ctx.strokeStyle='#fff';ctx.stroke();ctx.fillStyle='#0b0d0c';ctx.font=`bold ${Math.max(18,photoCanvas.width/70)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i+1,p.x,p.y);});
  if(points.length>=2){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);ctx.lineTo(points[1].x,points[1].y);ctx.strokeStyle='#b9ff3d';ctx.lineWidth=Math.max(4,photoCanvas.width/300);ctx.stroke();}
  if(points.length>=4){ctx.beginPath();ctx.moveTo(points[2].x,points[2].y);ctx.lineTo(points[3].x,points[3].y);ctx.strokeStyle='#ff633f';ctx.stroke();}
}
function updateStep(){
  const title=document.querySelector('#stepTitle'),help=document.querySelector('#stepHelp');
  if(points.length<2&&ballMode==='auto'&&!ballCandidate){title.textContent='골프공을 터치하세요';help.textContent='터치점을 중심으로 원형 영역을 만들고 그 안에서 자동으로 찾습니다.';}
  else if(points.length<2){title.textContent='골프공 위치를 다시 선택하세요';help.textContent='골프공 중심을 한 번 터치하면 주변에서 자동으로 찾습니다.';}
  else{title.textContent='퍼터의 양 끝을 선택하세요';help.textContent='그립 끝과 퍼터 헤드의 가장 먼 끝을 터치하세요.';}
  document.querySelector('#tapHint').textContent=Math.min(points.length+1,4); document.querySelector('#progressBar').style.width=`${points.length*25}%`;
}
function luminance(data,index){return data[index]*.299+data[index+1]*.587+data[index+2]*.114;}
function median(values){const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:0;}
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
  const key=(gx,gy)=>gy*cols+gx,seen=new Uint8Array(cols*rows),queue=[[sx,sy]];
  let head=0,count=0,sumX=0,sumY=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  while(head<queue.length){
    const [gx,gy]=queue[head++];if(gx<0||gy<0||gx>=cols||gy>=rows||seen[key(gx,gy)])continue;seen[key(gx,gy)]=1;
    const px=Math.min(width-1,gx*step),py=Math.min(height-1,gy*step);if(Math.hypot(px-x,py-y)>roiRadius*.7)continue;
    const value=luminance(pixels,(py*width+px)*4),inside=bright?value>=threshold:value<=threshold;if(!inside)continue;
    count++;sumX+=px;sumY+=py;minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)if(ox||oy)queue.push([gx+ox,gy+oy]);
  }
  if(count<12)return null;
  const diameterX=maxX-minX+step,diameterY=maxY-minY+step,ratio=Math.min(diameterX,diameterY)/Math.max(diameterX,diameterY);
  const radius=(diameterX+diameterY)/4;
  if(ratio<.72||radius<roiRadius*.045||radius>roiRadius*.34)return null;
  return{x:sumX/count,y:sumY/count,radius,baseRadius:radius,score:Math.abs(contrast),method:'contrast'};
}
function detectBallAt(x,y){
  const roiRadius=Math.round(Math.min(photoCanvas.width,photoCanvas.height)*.14);
  searchRegion=null;ballCandidate=null;draw();
  const pixels=ctx.getImageData(0,0,photoCanvas.width,photoCanvas.height).data;
  searchRegion={x,y,radius:roiRadius};
  const contrastBall=detectContrastBlob(pixels,photoCanvas.width,photoCanvas.height,x,y,roiRadius);
  if(contrastBall){
    ballCandidate=contrastBall;draw();document.querySelector('#ballSize').value='100';document.querySelector('#ballSizeValue').textContent='100%';document.querySelector('#ballConfirm').hidden=false;document.querySelector('#stepTitle').textContent='골프공을 찾았습니다';document.querySelector('#stepHelp').textContent='밝은 골프공 외곽을 찾았습니다. 초록색 원을 확인하세요.';return;
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
function calculate(){
  const ballPx=distance(points[0],points[1]),putterPx=distance(points[2],points[3]);
  if(ballPx<5)return alert('골프공 기준점이 너무 가깝습니다. 다시 지정해 주세요.');
  const mm=putterPx/ballPx*BALL_MM; document.querySelector('#resultCm').textContent=(mm/10).toFixed(1);document.querySelector('#resultIn').textContent=(mm/25.4).toFixed(2);show('resultScreen');
}

photoCanvas.addEventListener('pointerup',e=>{if(points.length>=4||ballCandidate)return;const r=photoCanvas.getBoundingClientRect();const p={x:(e.clientX-r.left)*photoCanvas.width/r.width,y:(e.clientY-r.top)*photoCanvas.height/r.height};if(points.length===0&&ballMode==='auto')return detectBallAt(p.x,p.y);points.push(p);draw();updateStep();if(points.length===4)setTimeout(calculate,300);});
document.querySelector('#confirmBall').addEventListener('click',()=>{if(!ballCandidate)return;points=[{x:ballCandidate.x-ballCandidate.radius,y:ballCandidate.y},{x:ballCandidate.x+ballCandidate.radius,y:ballCandidate.y}];ballCandidate=null;searchRegion=null;document.querySelector('#ballConfirm').hidden=true;draw();updateStep();});
document.querySelector('#retryBall').addEventListener('click',()=>{ballCandidate=null;searchRegion=null;document.querySelector('#ballConfirm').hidden=true;draw();updateStep();});
document.querySelector('#ballSize').addEventListener('input',e=>{if(!ballCandidate)return;const percent=Number(e.target.value);ballCandidate.radius=ballCandidate.baseRadius*percent/100;document.querySelector('#ballSizeValue').textContent=`${percent}%`;draw();});
document.querySelector('#startButton').addEventListener('click',startCamera);
document.querySelector('#manualCapture').addEventListener('click',takePhoto);
document.querySelector('#closeCamera').addEventListener('click',()=>{stopCamera();show('homeScreen');});
document.querySelector('#retakeButton').addEventListener('click',()=>{points=[];show('homeScreen');});
document.querySelector('#newMeasure').addEventListener('click',()=>{points=[];show('homeScreen');});
document.querySelector('#fileInput').addEventListener('change',e=>{
  const input=e.currentTarget,file=input.files?.[0];
  if(!file)return;
  if(!file.type.startsWith('image/')){alert('이미지 파일을 선택해 주세요.');input.value='';return;}
  const objectUrl=URL.createObjectURL(file);
  loadImage(objectUrl,()=>URL.revokeObjectURL(objectUrl));input.value='';
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream)stopCamera();});
