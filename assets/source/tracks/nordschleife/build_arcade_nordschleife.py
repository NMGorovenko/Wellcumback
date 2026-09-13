#!/usr/bin/env python3
"""Bake a driveable 14m arcade Nordschleife from the full-size sourced points.

Requires numpy==2.4.4 and scipy==1.18.1 for the validated numerical result.
No game/course import, network access, runtime dependency or raw-source mutation.

From repository root:
  python3 assets/source/tracks/nordschleife/build_arcade_nordschleife.py \
    --source lib/game/race/nordschleife-data.ts \
    --output lib/game/race/nordschleife-arcade.ts \
    --json /tmp/nordschleife-arcade.json

The source is already attributed in assets/source/tracks/nordschleife/README.md.
The output is game metres, including scale 0.18. Do not scale it a second time.
"""
import argparse
import ast
import hashlib
import json
import math
import re
import time
from pathlib import Path

import numpy as np
import scipy
from scipy.optimize import least_squares
from scipy.sparse import coo_matrix
from scipy.spatial import cKDTree
from scipy.interpolate import CubicSpline

def validate_branch_separation(points, minimum=18.0, arc_gap=40.0):
    """Exact 2D segment distance; local turn triangles are validated separately."""
    p = np.asarray([[v['x'], v['z']] for v in points[:-1]], dtype=np.float64)
    closed = np.vstack([p, p[0]])
    lengths = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    stations = np.r_[0, np.cumsum(lengths)]
    # A close pair of segments must have start vertices within threshold+2*maxLength.
    pairs = cKDTree(p).query_pairs(minimum + 5.0 + 2.0 * lengths.max())
    best = float('inf')
    def cross(a, b):
        return a[0] * b[1] - a[1] * b[0]
    def project(q, a, b):
        ab = b-a
        return max(0.0, min(1.0, float(np.dot(q-a, ab) / np.dot(ab, ab))))
    for i, j in pairs:
        a, b, c, d = closed[i], closed[i+1], closed[j], closed[j+1]
        candidates = [(0.0, project(a, c, d)), (1.0, project(b, c, d)),
                      (project(c, a, b), 0.0), (project(d, a, b), 1.0)]
        ab, cd, q = b-a, d-c, c-a
        den = cross(ab, cd)
        if abs(den) > 1e-12:
            t, u = cross(q, cd) / den, cross(q, ab) / den
            if 0 <= t <= 1 and 0 <= u <= 1:
                candidates.append((t, u))
        distance, t, u = min((float(np.linalg.norm(a+ab*t-c-cd*u)), t, u)
                             for t, u in candidates)
        gap = abs(stations[i] + lengths[i]*t - stations[j] - lengths[j]*u)
        gap = min(gap, stations[-1]-gap)
        if gap > arc_gap:
            best = min(best, distance)
    if best <= minimum:
        raise ValueError(f'Branch separation {best:.6f}m must exceed {minimum}m')
    return best

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, default=Path('lib/game/race/nordschleife-data.ts'))
parser.add_argument('--output', type=Path, default=Path('lib/game/race/nordschleife-arcade.ts'))
parser.add_argument('--json', type=Path)
parser.add_argument('--scale', type=float, default=0.18)
parser.add_argument('--spacing', type=float, default=1.0)
parser.add_argument('--sigma', type=float, default=3.5)
parser.add_argument('--radius', type=float, default=12.0)
parser.add_argument('--separation', type=float, default=20.0)
parser.add_argument('--spread', type=float, default=5.2)
parser.add_argument('--spread-radius', type=float, default=170.0)
parser.add_argument('--max-evaluations', type=int, default=500)
args = parser.parse_args()
source_bytes = args.source.read_bytes()
if args.source.suffix == '.json':
    source_data = json.loads(source_bytes)
    # Match the millimetre rounding in the immutable nordschleifePoints module.
    rows = [[round(p['x'], 3), round(p['z'], 3), round(p['y'], 3), p.get('name', '')]
            for p in source_data['points']]
else:
    match = re.search(r'=\s*(\[.*\])\s*;', source_bytes.decode(), re.S)
    if not match:
        raise ValueError('Expected the literal nordschleifePoints TypeScript array')
    rows = ast.literal_eval(match.group(1))
source = np.asarray([p[:3] for p in rows], dtype=np.float64)
names = [p[3] for p in rows]
raw_distance = [0.0]
for i in range(1, len(source)):
    raw_distance.append(raw_distance[-1] + math.hypot(
        source[i, 0] - source[i-1, 0], source[i, 1] - source[i-1, 1]))
a, b = [min(range(len(rows)), key=lambda i: abs(raw_distance[i] - at))
        for at in (11955.6, 12303.8)]
vx, vz = source[a, :2] - source[b, :2]
norm = math.hypot(vx, vz)
def spread_weight(distance, centre):
    delta = distance - centre
    if abs(delta) >= args.spread_radius:
        return 0.0
    return (1.0 + math.cos(math.pi * delta / args.spread_radius)) * 0.5
src = source * args.scale
src[:, 2] -= source[0, 2] * args.scale
for i, distance in enumerate(raw_distance):
    spread = (spread_weight(distance, raw_distance[a]) -
              spread_weight(distance, raw_distance[b])) * args.spread
    src[i, 0] += vx / norm * spread
    src[i, 1] += vz / norm * spread
# Preserve closure and forward (clockwise) point order at T13.
if np.linalg.norm(src[-1] - src[0]) > 1e-8:
    raise ValueError('Source must have an explicit matching closure point')
arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(src[:,:2],axis=0),axis=1))];L=arc[-1];N=math.ceil(L/args.spacing);station=np.arange(N)*L/N;orig=np.array([np.interp(station,arc,src[:,j])for j in range(3)]).T
names0=[names[max(0,np.searchsorted(arc,d,side='right')-1)]for d in station]
def smooth(p,sigma):
 r=math.ceil(sigma*4);k=np.arange(-r,r+1);w=np.exp(-k*k/(2*sigma*sigma));w/=w.sum();return sum(np.roll(p,int(i),axis=0)*v for i,v in zip(k,w))
def curvature(p):
 a=p-np.roll(p,1,axis=0);b=np.roll(p,-1,axis=0)-p;c=a+b;aa=np.sum(a*a,axis=1);bb=np.sum(b*b,axis=1);cc=np.sum(c*c,axis=1);den=np.sqrt(aa*bb*cc);cross=a[:,0]*b[:,1]-a[:,1]*b[:,0];k=2*cross/np.maximum(1e-12,den)
 return k,a,b,c,aa,bb,cc,den
base=smooth(orig[:,:2],args.sigma/(L/N));pairs=np.array(sorted(cKDTree(base).query_pairs(35)));sep=np.abs(pairs[:,0]-pairs[:,1])*L/N;pairs=pairs[np.minimum(sep,L-sep)>40]
print('N',N,'repulsion pairs',len(pairs),flush=True)
I=np.arange(N);prev=(I-1)%N;nex=(I+1)%N
KMAX=1/args.radius;WK=800.;WP=.1;WL=.3;WR=5.
origlen=np.linalg.norm(np.roll(base,-1,axis=0)-base,axis=1)
count=0
def residual(x):
 global count
 p=x.reshape(N,2);k,*_=curvature(p);edge=np.roll(p,-1,axis=0)-p;el=np.linalg.norm(edge,axis=1);delta=p[pairs[:,0]]-p[pairs[:,1]];dist=np.linalg.norm(delta,axis=1)
 r=np.r_[(p-base).ravel()*WP,np.maximum(0,np.abs(k)-KMAX)*WK,(el-origlen)*WL,np.maximum(0,.45-el)*20,np.maximum(0,args.separation-dist)*WR]
 count+=1
 if count%15==1:print('eval',count,'radius',1/max(abs(k)),'mindist',dist.min(),'maxmove',np.linalg.norm(p-orig[:,:2],axis=1).max(),'cost',np.dot(r,r)/2,flush=True)
 return r
def jacobian(x):
 p=x.reshape(N,2);k,a,b,c,aa,bb,cc,den=curvature(p);active=(np.abs(k)>KMAX)*np.sign(k)*WK
 J=lambda v:np.stack([-v[:,1],v[:,0]],axis=1)
 ga=2*J(b)/den[:,None]-k[:,None]*(-a/aa[:,None]-c/cc[:,None])
 gb=-2*J(c)/den[:,None]-k[:,None]*(a/aa[:,None]-b/bb[:,None])
 gc=2*J(a)/den[:,None]-k[:,None]*(b/bb[:,None]+c/cc[:,None])
 rows=[np.arange(2*N)];cols=[np.arange(2*N)];vals=[np.full(2*N,WP)]
 for indices,grad in [(prev,ga),(I,gb),(nex,gc)]:
  rows.append(np.repeat(2*N+I,2));cols.append((2*indices[:,None]+np.arange(2)).ravel());vals.append((grad*active[:,None]).ravel())
 edge=np.roll(p,-1,axis=0)-p;el=np.linalg.norm(edge,axis=1);g=edge/el[:,None]
 for block,factor in [(3*N,np.full(N,WL)),(4*N,-20*(el<.45))]:
  for indices,sign in [(I,-1),(nex,1)]:rows.append(np.repeat(block+I,2));cols.append((2*indices[:,None]+np.arange(2)).ravel());vals.append((g*sign*factor[:,None]).ravel())
 delta=p[pairs[:,0]]-p[pairs[:,1]];dist=np.linalg.norm(delta,axis=1);g=delta/dist[:,None]*(-WR*(dist<args.separation))[:,None]
 for col,sign in [(0,1),(1,-1)]:rows.append(np.repeat(5*N+np.arange(len(pairs)),2));cols.append((2*pairs[:,col,None]+np.arange(2)).ravel());vals.append((g*sign).ravel())
 return coo_matrix((np.concatenate(vals),(np.concatenate(rows),np.concatenate(cols))),shape=(5*N+len(pairs),2*N)).tocsr()
t0=time.time();result=least_squares(residual,base.ravel(),jac=jacobian,max_nfev=args.max_evaluations,ftol=1e-9,xtol=1e-10,gtol=1e-6,tr_solver='lsmr',verbose=1)
p=result.x.reshape(N,2);print('optimization seconds',time.time()-t0,flush=True)
# Smooth cubic interpolation removes derivative kinks from reparameterising a polyline.
p3=np.column_stack([p,orig[:,2]]);closed=np.vstack([p3,p3[0]]);d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(closed[:,:2],axis=0),axis=1))];n=math.ceil(d[-1]/args.spacing);ss=np.arange(n)*d[-1]/n
v=CubicSpline(d,closed,axis=0,bc_type='periodic')(ss);v[:,:2]=smooth(v[:,:2],1.0)
inds=np.maximum(0,np.minimum(N-1,np.searchsorted(d,ss,side='right')-1));outnames=[names0[i]for i in inds]
v[:,:2]-=v[0,:2];v[:,2]-=v[0,2];r=1/np.maximum(1e-10,np.abs(curvature(v[:,:2])[0]));length=np.linalg.norm(np.diff(np.vstack([v,v[0]]),axis=0),axis=1).sum();length2=np.linalg.norm(np.diff(np.vstack([v[:,:2],v[0,:2]]),axis=0),axis=1).sum()
points=[{'x':round(float(x),6),'z':round(float(z),6),'y':round(float(y),6),'name':name}for(x,z,y),name in zip(v,outnames)];points.append(dict(points[0]))
report={'points':points,'stats':{'minRadius':float(r.min()),'length3D':float(length),'length2D':float(length2),'maxDisplacement':float(np.linalg.norm(p-orig[:,:2],axis=1).max()),'rmsDisplacement':float(np.sqrt(np.mean(np.sum((p-orig[:,:2])**2,axis=1)))),'optimizationSeconds':time.time()-t0,'iterations':result.nfev,'radiusTarget':args.radius,'separationTarget':args.separation,'heightMin':float(v[:,2].min()),'heightMax':float(v[:,2].max()),'worstRadiusNames':[outnames[i]for i in np.argsort(r)[:10]]}}
# Validate the baked, rounded coordinates, not just the optimizer control points.
baked = np.asarray([[p['x'], p['z']] for p in points[:-1]])
baked_radius = 1 / np.maximum(1e-10, np.abs(curvature(baked)[0]))
if baked_radius.min() <= 9.5:
    raise ValueError(f'Minimum baked radius {baked_radius.min():.6f} must exceed 9.5m')
normals = np.roll(baked, -1, axis=0) - np.roll(baked, 1, axis=0)
normals = np.column_stack([-normals[:, 1], normals[:, 0]]) / np.linalg.norm(normals, axis=1)[:, None]
def cross2(a, b):
    return a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]
band_checks = []
for inner, outer in [(-7, 7), (-8.6, -7), (7, 8.6), (-9.7, -8.6), (8.6, 9.7)]:
    a = (baked + normals * inner).astype(np.float32).astype(np.float64)
    b = (baked + normals * outer).astype(np.float32).astype(np.float64)
    c, d = np.roll(a, -1, axis=0), np.roll(b, -1, axis=0)
    areas = np.r_[-cross2(b-a, c-a), -cross2(d-b, c-b)] * .5
    if areas.min() <= 0:
        raise ValueError(f'Turned strip triangle in [{inner}, {outer}]')
    band_checks.append({'inner': inner, 'outer': outer, 'minimumTriangleArea': float(areas.min())})
report['stats']['minimumSeparateBranchDistance'] = validate_branch_separation(points)
report['stats']['bakedMinimumRadius'] = float(baked_radius.min())
report['stats']['bandsFloat32'] = band_checks
report['provenance'] = {
    'sourceFile': args.source.name,
    'sourceSha256': hashlib.sha256(source_bytes).hexdigest(),
    'numpyVersion': np.__version__,
    'scipyVersion': scipy.__version__,
    'parameters': {k: v for k, v in vars(args).items() if not isinstance(v, Path)},
    'coordinates': 'Already compressed game metres; x=easting delta, z=negative northing delta, y=relative T13 height',
    'sourceLicenses': ['OpenStreetMap contributors, ODbL 1.0', 'GeoBasis-DE / LVermGeoRP 2026, dl-de/by-2-0'],
    'pipeline': [
        'Scale raw x/z and relative y by 0.18; preserve existing Karussell cosine opening (5.2m amplitude; 170m source radius)',
        'Resample closed line at uniform planar spacing at most1m; cyclic Gaussian x/z sigma3.5m',
        'Offline sparse least squares: curvature target radius12m, separation20m for original arc gaps>40m; retain source shape and edge lengths',
        'Periodic cubic reparameterization to uniform approximately1m spacing; final cyclic Gaussian sigma1 sample on x/z only',
        'Transport source height along stations with periodic interpolation; no added vertical gain; reanchor T13 to0,0,0',
    ],
    'optimizerStatus': result.status,
    'optimizerMessage': result.message,
    'validation': 'Baked radius and actual Float32 road/shoulder/embankment triangle orientation asserted; run race-geometry-audit and physics checks after integration',
}
header = ('// Generated by assets/source/tracks/nordschleife/build_arcade_nordschleife.py.\n'
          '// Derived from OSM (ODbL) and LVermGeoRP DGM1 (dl-de/by-2-0).\n'
          '// Source attribution: assets/source/tracks/nordschleife/README.md.\n'
          '// Baked GAME METRES at scale0.18; do not scale again.\n'
          'export const NORDSCHLEIFE_GAME_HALF_WIDTH = 7;\n'
          'export const nordschleifeArcadePoints: readonly (readonly [number, number, number, string])[] = [\n')
module = header + ''.join('  ' + json.dumps([p['x'], p['z'], p['y'], p.get('name', '')], ensure_ascii=False) + ',\n' for p in points) + '];\n'
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(module)
if args.json:
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report['stats'], ensure_ascii=False), flush=True)
print(f'Wrote {args.output}', flush=True)
