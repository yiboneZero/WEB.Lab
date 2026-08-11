const BALL_MM = 42.67;
const TILT_LIMIT = 3;
const STABLE_MS = 1000;
const screens = [...document.querySelectorAll('.screen')];
const video = document.querySelector('#camera');
const captureCanvas = document.querySelector('#captureCanvas');
const photoCanvas = document.querySelector('#photoCanvas');
const ctx = photoCanvas.getContext('2d');
let stream = null, image = null, points = [], stableSince = 0, lastMotion = 0, counting = false, captured = false, gravityAvailable = false;

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

function loadImage(src){
  const img=new Image(); img.onload=()=>{image=img;points=[];draw();show('measureScreen');updateStep();}; img.src=src;
}
function draw(){
  if(!image)return; photoCanvas.width=image.naturalWidth||image.width; photoCanvas.height=image.naturalHeight||image.height; ctx.drawImage(image,0,0);
  const colors=['#b9ff3d','#b9ff3d','#ff633f','#ff633f'];
  points.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,Math.max(10,photoCanvas.width/120),0,Math.PI*2);ctx.fillStyle=colors[i];ctx.fill();ctx.lineWidth=Math.max(3,photoCanvas.width/400);ctx.strokeStyle='#fff';ctx.stroke();ctx.fillStyle='#0b0d0c';ctx.font=`bold ${Math.max(18,photoCanvas.width/70)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i+1,p.x,p.y);});
  if(points.length>=2){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);ctx.lineTo(points[1].x,points[1].y);ctx.strokeStyle='#b9ff3d';ctx.lineWidth=Math.max(4,photoCanvas.width/300);ctx.stroke();}
  if(points.length>=4){ctx.beginPath();ctx.moveTo(points[2].x,points[2].y);ctx.lineTo(points[3].x,points[3].y);ctx.strokeStyle='#ff633f';ctx.stroke();}
}
function updateStep(){
  const title=document.querySelector('#stepTitle'),help=document.querySelector('#stepHelp');
  if(points.length<2){title.textContent='골프공의 양 끝을 선택하세요';help.textContent='골프공 지름을 가로지르는 두 점을 차례로 터치하세요.';}
  else{title.textContent='퍼터의 양 끝을 선택하세요';help.textContent='그립 끝과 퍼터 헤드의 가장 먼 끝을 터치하세요.';}
  document.querySelector('#tapHint').textContent=Math.min(points.length+1,4); document.querySelector('#progressBar').style.width=`${points.length*25}%`;
}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function calculate(){
  const ballPx=distance(points[0],points[1]),putterPx=distance(points[2],points[3]);
  if(ballPx<5)return alert('골프공 기준점이 너무 가깝습니다. 다시 지정해 주세요.');
  const mm=putterPx/ballPx*BALL_MM; document.querySelector('#resultCm').textContent=(mm/10).toFixed(1);document.querySelector('#resultIn').textContent=(mm/25.4).toFixed(2);show('resultScreen');
}

photoCanvas.addEventListener('pointerup',e=>{if(points.length>=4)return;const r=photoCanvas.getBoundingClientRect();points.push({x:(e.clientX-r.left)*photoCanvas.width/r.width,y:(e.clientY-r.top)*photoCanvas.height/r.height});draw();updateStep();if(points.length===4)setTimeout(calculate,300);});
document.querySelector('#startButton').addEventListener('click',startCamera);
document.querySelector('#manualCapture').addEventListener('click',takePhoto);
document.querySelector('#closeCamera').addEventListener('click',()=>{stopCamera();show('homeScreen');});
document.querySelector('#retakeButton').addEventListener('click',()=>{points=[];show('homeScreen');});
document.querySelector('#newMeasure').addEventListener('click',()=>{points=[];show('homeScreen');});
document.querySelector('#undoButton').addEventListener('click',()=>{points.pop();draw();updateStep();});
document.querySelector('#resetPoints').addEventListener('click',()=>{points=[];draw();updateStep();});
document.querySelector('#fileInput').addEventListener('change',e=>{const f=e.target.files[0];if(f)loadImage(URL.createObjectURL(f));e.target.value='';});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream)stopCamera();});
