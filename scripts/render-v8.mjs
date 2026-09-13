/** Real Chromium OfflineAudioContext render, with no speaker playback or game profile changes. */
import { build } from 'esbuild';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(path.join(os.tmpdir(), 'wellcum-v8-render-'));
const output = path.join(root, 'outputs/audio');
await mkdir(output, { recursive: true });
try {
  const entry = `import {createCityFoley} from ${JSON.stringify(path.join(root, 'lib/game/audio/city-foley.ts'))};
import {advanceV8,freshV8} from ${JSON.stringify(path.join(root, 'lib/game/audio/v8-model.ts'))};
import {freshCity,tickCity} from ${JSON.stringify(path.join(root, 'lib/game/city/engine.ts'))};
window.renderMotor=async()=>{
const rate=48000,duration=12,context=new OfflineAudioContext(1,rate*duration,rate),graph=createCityFoley(context),s=freshV8();
const city={...freshCity(),x:-104,z:-63,heading:Math.PI/2},telemetry=[];
for(let frame=0;frame<11*60;frame++){const t=frame/60;
tickCity(city,1/60,new Set(t>=2&&t<8?['KeyW']:[]));
advanceV8(s,{speed:city.speed,forward:city.vx,lateral:city.vz,throttle:city.throttle,horn:t>9&&t<9.4},1/60);graph.update(s,true,t);
telemetry.push({time:t,gear:s.gear,rpm:s.rpm,load:s.load,speed:city.speed});}
graph.silence(11);const buffer=await context.startRendering();graph.dispose();graph.dispose();
const analysis=new OfflineAudioContext(1,rate*duration,rate),source=analysis.createBufferSource(),high=analysis.createBiquadFilter();
source.buffer=buffer;high.type='highpass';high.frequency.value=2000;high.Q.value=.707;source.connect(high).connect(analysis.destination);source.start();
const bright=await analysis.startRendering();
return {samples:Array.from(buffer.getChannelData(0)),bright:Array.from(bright.getChannelData(0)),telemetry,bumps:city.bumps};};`;
  const bundled = await build({
    stdin: { contents: entry, resolveDir: root },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
  });
  await writeFile(
    path.join(temp, 'render.js'),
    bundled.outputFiles[0].contents,
  );
  await writeFile(
    path.join(temp, 'index.html'),
    '<script src="render.js"></script>',
  );
  await writeFile(
    path.join(temp, 'package.json'),
    JSON.stringify({ name: 'wellcum-audio-test', main: 'main.cjs' }),
  );
  await writeFile(
    path.join(temp, 'main.cjs'),
    `const {app,BrowserWindow}=require('electron');const fs=require('node:fs');const assert=require('node:assert/strict');
app.setPath('userData',${JSON.stringify(path.join(temp, 'profile'))});
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
await w.loadFile(${JSON.stringify(path.join(temp, 'index.html'))});const rendered=await w.webContents.executeJavaScript('renderMotor()');
const data=Float32Array.from(rendered.samples);
const segments=[];for(let second=0;second<12;second++){let sum=0,max=0;for(let i=second*48000;i<(second+1)*48000;i++){sum+=data[i]*data[i];max=Math.max(max,Math.abs(data[i]));}segments.push({second,rms:Math.sqrt(sum/48000),peak:max});}
assert(segments.every(s=>Number.isFinite(s.rms)&&s.peak<0.16),'quiet signal with headroom');assert(segments[0].rms>0.01,'audible idle');assert(segments[7].rms>segments[0].rms*1.1,'load changes sound');
assert.equal(rendered.bumps,0,'sound sample drives a real clear city road');
let full=0,bright=0;for(let i=6*48000;i<8*48000;i++){full+=data[i]*data[i];bright+=rendered.bright[i]*rendered.bright[i];}
const brightnessRatio=bright/full;assert(brightnessRatio<.012,'upper frequencies stay soft at sustained full speed');
const shifts=rendered.telemetry.filter((s,i,a)=>i>0&&s.gear>a[i-1].gear).map(s=>({time:s.time,gear:s.gear,rpm:s.rpm,minimumRpm:Math.min(...rendered.telemetry.filter(f=>f.time>=s.time&&f.time<s.time+.31).map(f=>f.rpm))}));
assert.equal(shifts.length,3);assert(shifts.every(s=>s.minimumRpm<s.rpm*.76),'audible pitch falls throughout all shifts');
let tail=0;for(let i=11.7*48000;i<data.length;i++)tail=Math.max(tail,Math.abs(data[i]));assert(tail<1e-6,'mute decays to silence');
const wav=Buffer.alloc(44+data.length*2);wav.write('RIFF');wav.writeUInt32LE(36+data.length*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(data.length*2,40);for(let i=0;i<data.length;i++)wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,data[i]))*32767),44+i*2);
fs.writeFileSync(${JSON.stringify(path.join(output, 'Mustang-V8.wav'))},wav);fs.writeFileSync(${JSON.stringify(path.join(output, 'v8-render.json'))},JSON.stringify({sampleRate:48000,segments,shifts,brightnessRatio,tail},null,2));console.log('V8_RENDER_OK',JSON.stringify({segments,shifts,brightnessRatio,tail}));w.destroy();app.quit();}).catch(error=>{console.error(error);app.exit(1)});`,
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [temp], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 30000,
  });
  if (result.status !== 0) throw new Error(result.stderr + result.stdout);
  console.log(result.stdout.trim());
} finally {
  await rm(temp, { recursive: true, force: true });
}
