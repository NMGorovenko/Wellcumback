import test from 'node:test';
import assert from 'node:assert/strict';
import { cityBlocked, cityCarBlocked, freshCity, tickCity, resetCityCar } from '../lib/game/city/engine.ts';
import { cityStops } from '../lib/game/city/layout.ts';
const advance=(s,seconds,keys,rate=60)=>{for(let n=0;n<seconds*rate;n++)tickCity(s,1/rate,new Set(keys));};
void test('all stops are reachable over the bridges without crossing water or buildings',()=>{
 const visited=new Set(['-12,14']), queue=[[-12,14]];
 for(let i=0;i<queue.length;i++) for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const [cx,cz]=queue[i], x=cx+dx,z=cz+dz,key=`${x},${z}`;
   if(visited.has(key)||cityCarBlocked(x,z,dx?Math.PI/2:0))continue;
   visited.add(key);queue.push([x,z]);
 }
 for(const stop of cityStops)assert.ok(visited.has(`${stop.x},${stop.z}`),stop.id);
 assert.ok(cityBlocked(0,0)); assert.ok(!cityBlocked(0,10));
});
void test('driving is fixed-step; handbrake gives real lateral slip and recorded drift distance',()=>{
 const a=freshCity(),b=freshCity(); advance(a,.6,['KeyW'],30);advance(b,.6,['KeyW'],144);
 assert.ok(Math.abs(a.x-b.x)<.05&&Math.abs(a.z-b.z)<.1);
 const drift=freshCity(),grip=freshCity(); for(const s of [drift,grip]){s.x=-12;s.z=6;s.vz=-7;}
 advance(drift,.5,['KeyW','KeyD','ShiftLeft']);advance(grip,.5,['KeyW','KeyD']);
 const slip=s=>Math.abs(s.vx*Math.cos(s.heading)+s.vz*Math.sin(s.heading));
 assert.ok(slip(drift)>slip(grip)+.8);assert.ok(drift.driftDistance>0);
});
void test('high speed cannot tunnel a bonnet into walls or drive into the river',()=>{
 const s=freshCity();s.x=-12;s.z=0;s.heading=Math.PI/2;s.vx=12;
 advance(s,2,['KeyW']);assert.ok(!cityCarBlocked(s.x,s.z,s.heading));assert.ok(s.x<-8.9);assert.ok(s.bumps>0);
 s.x=0;s.z=10;s.heading=0;s.vz=-12;s.vx=0;advance(s,2,['KeyW']);
 assert.ok(!cityCarBlocked(s.x,s.z,s.heading));assert.ok(s.z>8);
 resetCityCar(s);assert.ok(!cityCarBlocked(s.x,s.z,s.heading));
});
void test('a mission needs an explicit action near a stop at low speed; no drift key autostarts',()=>{
 const s=freshCity();s.x=-12;s.z=10;advance(s,.1,['ShiftLeft']);assert.equal(s.interaction,null);
 advance(s,.1,['KeyE']);assert.equal(s.interaction,'screen');
 s.interaction=null;advance(s,.1,['KeyE']);assert.equal(s.interaction,null,'held E is not repeated');
 const fast=freshCity();fast.x=-12;fast.z=10;fast.vz=-8;advance(fast,.02,['KeyE']);assert.equal(fast.interaction,null);
 const distant=freshCity();advance(distant,.1,['KeyE']);assert.equal(distant.interaction,null);
});
void test('paused and invalid time cannot move the car',()=>{
 const s=freshCity();s.paused=true;const before=structuredClone(s);tickCity(s,1,new Set(['KeyW']));assert.deepEqual(s,before);
 s.paused=false;tickCity(s,NaN,new Set(['KeyW']));assert.equal(s.z,14);
});
