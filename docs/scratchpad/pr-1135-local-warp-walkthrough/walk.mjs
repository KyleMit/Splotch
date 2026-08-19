import * as c from './corr.mjs';
import * as v from './warpviz.mjs';
const CASES = [
  ['farm/dog-tall','light',10,14],['shapes/heart-tall','light',11,6],['space/astronaut-wide','light',17,6],
  ['farm/horse-tall','night',7,2],['space/ship-wide','night',4,13],['farm/horse-wide','night',20,2],
  ['vehicles/excavator-wide','light',5,5],
];
for (const [rel,theme,tx,ty] of CASES) {
  const {source,fill}=await v.loadPair(rel,theme);
  const sf=await c.surface(source,fill,tx,ty,20);
  const {grid,n,R}=sf; const out=[];
  for (const rad of [6,8,10,12,16,20]) {
    let best={dx:0,dy:0,s:-1};
    for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++){const s=grid[(dy+R)*n+(dx+R)];if(s>best.s)best={dx,dy,s};}
    out.push(`±${rad}:${best.dx},${best.dy}(${Math.hypot(best.dx,best.dy).toFixed(1)})`);
  }
  console.log(`${rel} ${theme} tile ${tx},${ty}  ${out.join('  ')}`);
}
