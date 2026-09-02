const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const width = 700, height = 360, pixels = new Uint8ClampedArray(width * height * 4);
for (let i = 0; i < width * height; i++) { pixels[i * 4] = 220; pixels[i * 4 + 1] = 220; pixels[i * 4 + 2] = 220; pixels[i * 4 + 3] = 255; }
function paint(x,y,v){if(x<0||y<0||x>=width||y>=height)return;const i=(y*width+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=v;}
const start={x:90,y:250},end={x:610,y:105},dx=end.x-start.x,dy=end.y-start.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,nx=-uy,ny=ux;
for(let t=0;t<=len;t+=.5)for(let o=-8;o<=8;o++)paint(Math.round(start.x+ux*t+nx*o),Math.round(start.y+uy*t+ny*o),35);

const noop=()=>{};let element;
element=new Proxy({width,height,hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',style:{},classList:{add:noop,remove:noop,toggle:noop},addEventListener:noop,removeEventListener:noop,querySelector(){return element;},getContext(){return{drawImage:noop,getImageData(){return{data:pixels}}}},getBoundingClientRect(){return{left:0,top:0,width,height}}},{get:(t,k)=>k in t?t[k]:noop});
const sandbox={console,Uint8Array,Uint8ClampedArray,Float32Array,Math,Number,performance:{now:()=>0},document:{querySelectorAll:()=>[],querySelector:()=>element,createElement:()=>element,addEventListener:noop},window:{addEventListener:noop,removeEventListener:noop},navigator:{},alert:noop,Image:function(){},URL:{createObjectURL:noop,revokeObjectURL:noop},setTimeout:noop};
vm.createContext(sandbox);const source=fs.readFileSync('v1-1/app.v11.js','utf8');
vm.runInContext(`${source}\nimage={};photoCanvas.width=${width};photoCanvas.height=${height};points=[{x:0,y:0},{x:40,y:0},{x:82,y:252},{x:618,y:102}];this.ok=refineOfficialAxisPoints();this.axis=shaftAxis;this.measured=distance(points[2],points[3]);this.ballDetector=typeof findBallInRegion;`,sandbox);
assert(sandbox.ok,'axis refinement should succeed');
assert(Math.abs(sandbox.axis.ux-ux)<.04,'detected center axis should follow the shaft');
assert(Math.abs(sandbox.measured-len)<35,'refined endpoints should remain near the object boundaries');
assert.strictEqual(sandbox.ballDetector,'function','V1.1 should include the existing golf-ball detector');
console.log('V1.1 synthetic shaft-axis test passed.');
