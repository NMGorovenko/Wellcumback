#!/usr/bin/env python3
"""Build metre-scale Nordschleife from downloaded OSM + official RLP DGM1.

Requires Python 3 and Pillow. No checkout files are read or changed.
Run: python3 build_nordschleife.py --data-dir /tmp/wellcum-race-research

OSM supplies topology/plan geometry, NOT surveyed centreline accuracy or width.
The DGM is bare-earth elevation. Bridge deck heights below are explicitly
estimated by linear interpolation between terrain samples 25 m beyond each
mapped bridge end; original sampled elevations are exported separately.
"""
import argparse
import bisect
import hashlib
import json
import math
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
from PIL import Image

START_WAY = 41395670
SPACING = 5.0
BRIDGE_APPROACH = 25.0


def utm32(lon, lat):
    """ETRS89 geographic -> UTM32 (GRS80), conventional TM series.

    Treat OSM WGS84 lon/lat as ETRS89 geographic; no epoch-dependent datum
    transform is implied. That uncertainty is smaller than map tracing errors.
    """
    a, inv_f, k = 6378137.0, 298.257222101, 0.9996
    f = 1 / inv_f
    e = f * (2 - f)
    p, l = math.radians(lat), math.radians(lon - 9)
    ep = e / (1 - e)
    N = a / math.sqrt(1 - e * math.sin(p) ** 2)
    T, C, A = math.tan(p) ** 2, ep * math.cos(p) ** 2, math.cos(p) * l
    M = a * ((1-e/4-3*e**2/64-5*e**3/256)*p
             -(3*e/8+3*e**2/32+45*e**3/1024)*math.sin(2*p)
             +(15*e**2/256+45*e**3/1024)*math.sin(4*p)
             -35*e**3/3072*math.sin(6*p))
    x = 500000 + k*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep)*A**5/120)
    y = k*(M+N*math.tan(p)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24
                           +(61-58*T+T*T+600*C-330*ep)*A**6/720))
    return x, y


class Terrain:
    def __init__(self, directory):
        self.directory = directory
        self.images = {}
        self.used = {}
        ns = {'m': 'urn:ietf:params:xml:ns:metalink'}
        self.files = {}
        for item in ET.parse(directory / 'dgm1-index.meta4').findall('m:file', ns):
            name = item.attrib['name']
            if not name.endswith('.tif'):
                continue
            fields = name.split('_')
            self.files[(int(fields[2]), int(fields[3]))] = {
                'file': name, 'url': item.find('m:url', ns).text,
                'sha256': item.find('m:hash', ns).text,
            }

    def pixel(self, ix, iy):
        # Integer ix/iy identify cell lower-left; centres are ix+.5, iy+.5.
        key = (ix // 1000, iy // 1000)
        if key not in self.images:
            entry = self.files[key]
            path = self.directory / entry['file']
            if not path.exists():
                path.write_bytes(urllib.request.urlopen(entry['url'], timeout=30).read())
            assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256']
            im = Image.open(path)
            assert im.mode == 'F' and im.size == (1000, 1000)
            assert im.tag_v2[33550] == (1.0, 1.0, 1.0)
            self.images[key] = im
            self.used[key] = entry
        value = self.images[key].getpixel((ix - key[0]*1000, 999-(iy-key[1]*1000)))
        assert math.isfinite(value) and value != -9999, (key, ix, iy, value)
        return value

    def sample(self, x, y):
        ix, iy = math.floor(x-.5), math.floor(y-.5)
        dx, dy = x-(ix+.5), y-(iy+.5)
        return sum(self.pixel(ix+i, iy+j)*(dx if i else 1-dx)*(dy if j else 1-dy)
                   for i in (0, 1) for j in (0, 1))


def build(directory):
    source = directory / 'overpass-api.de.json'
    osm = json.loads(source.read_text())
    nodes = {e['id']: e for e in osm['elements'] if e['type'] == 'node'}
    ways = [e for e in osm['elements'] if e['type'] == 'way'
            and e.get('tags', {}).get('highway') == 'raceway'
            and e.get('tags', {}).get('fee') == 'yes']
    # This selector is validated against the pinned local snapshot, not a
    # general promise that any future OSM fee-tagged way belongs to this lap.
    assert len(ways) == 52
    assert all(w['tags'].get('oneway') == 'yes' for w in ways)
    by_start = {w['nodes'][0]: w for w in ways}
    assert len(by_start) == len(ways)
    first = next(w for w in ways if w['id'] == START_WAY)
    ordered, visited, current = [], set(), first
    while current['id'] not in visited:
        ordered.append(current)
        visited.add(current['id'])
        current = by_start[current['nodes'][-1]]
    assert current['id'] == START_WAY and len(visited) == len(ways)
    assert ordered[-1]['nodes'][-1] == first['nodes'][0]

    segments, sections, bridge_ranges = [], [], []
    distance = 0.0
    for way in ordered:
        start = distance
        for a, b in zip(way['nodes'], way['nodes'][1:]):
            pa, pb = utm32(nodes[a]['lon'], nodes[a]['lat']), utm32(nodes[b]['lon'], nodes[b]['lat'])
            length = math.dist(pa, pb)
            assert length > 0
            segments.append({'a': pa, 'b': pb, 's': distance, 'length': length,
                             'wayId': way['id'], 'nodeA': a, 'nodeB': b,
                             'name': way['tags'].get('name'), 'bridge': way['tags'].get('bridge') == 'yes'})
            distance += length
        sections.append({'osmWayId': way['id'], 'name': way['tags'].get('name'),
                         'startMetres': start, 'endMetres': distance})
        if way['tags'].get('bridge') == 'yes':
            bridge_ranges.append({'osmWayId': way['id'], 'startMetres': start, 'endMetres': distance})
    length = distance
    starts = [p['s'] for p in segments]
    origin = segments[0]['a']
    terrain = Terrain(directory)

    def at(s):
        s %= length
        i = min(len(segments)-1, max(0, bisect.bisect_right(starts, s)-1))
        seg = segments[i]
        t = (s-seg['s'])/seg['length']
        return (seg['a'][0]+(seg['b'][0]-seg['a'][0])*t,
                seg['a'][1]+(seg['b'][1]-seg['a'][1])*t)

    corrections = []
    for bridge in bridge_ranges:
        a, b = bridge['startMetres']-BRIDGE_APPROACH, bridge['endMetres']+BRIDGE_APPROACH
        ya, yb = terrain.sample(*at(a)), terrain.sample(*at(b))
        corrections.append({**bridge, 'fromMetres': a, 'toMetres': b,
                            'fromHeightMetres': ya, 'toHeightMetres': yb,
                            'approachMetres': BRIDGE_APPROACH,
                            'method': 'Linear height interpolation across mapped bridge plus 25 m on each approach; cyclic distance at T13.'})

    def corrected_height(s, raw):
        for correction in corrections:
            for candidate in (s-length, s, s+length):
                a, b = correction['fromMetres'], correction['toMetres']
                if a <= candidate <= b:
                    t = (candidate-a)/(b-a)
                    return (correction['fromHeightMetres']*(1-t)+correction['toHeightMetres']*t,
                            correction['osmWayId'])
        return raw, None

    points, raw_points = [], []
    # Preserve EVERY mapped OSM vertex; only linearly subdivide its segments.
    # Thus long straights receive real DGM samples without flattening the hill.
    for seg in segments:
        count = max(1, math.ceil(seg['length']/SPACING))
        for k in range(count):
            t = k/count
            s = seg['s']+seg['length']*t
            e = seg['a'][0]+(seg['b'][0]-seg['a'][0])*t
            n = seg['a'][1]+(seg['b'][1]-seg['a'][1])*t
            raw = terrain.sample(e, n)
            y, correction = corrected_height(s, raw)
            point = {'x': round(e-origin[0], 6), 'z': round(origin[1]-n, 6), 'y': round(y, 6)}
            if seg['name']:
                point['name'] = seg['name']
            points.append(point)
            raw_points.append({**point, 'y': round(raw, 6), 'correctedY': round(y, 6),
                               's': round(s, 6), 'osmWayId': seg['wayId'],
                               'osmNodeId': seg['nodeA'] if k == 0 else None,
                               'interpolatedBridgeWayId': correction})
    points.append(dict(points[0]))
    raw_points.append({**raw_points[0], 's': round(length, 6)})
    area = sum(a['x']*b['z']-b['x']*a['z'] for a, b in zip(points, points[1:]))/2
    assert area > 0  # Clockwise in east/north; z=-north reverses signed area.
    heading = math.atan2(points[1]['x']-points[0]['x'], -(points[1]['z']-points[0]['z']))
    def stats(pts):
        spatial = sum(math.dist((a['x'],a['z'],a['y']), (b['x'],b['z'],b['y']))
                      for a,b in zip(pts,pts[1:]))
        grades = [abs(b['y']-a['y'])/math.hypot(b['x']-a['x'], b['z']-a['z'])
                  for a,b in zip(pts,pts[1:])]
        return {'length3DMetres': spatial, 'minHeightMetres': min(p['y'] for p in pts),
                'maxHeightMetres': max(p['y'] for p in pts), 'maxAbsoluteGrade': max(grades)}
    provenance = {
        'track': 'Nuerburgring Nordschleife, full T13 loop; excludes GP and pit lanes',
        'officialLengthMetres': 20832, 'geometryScaled': False,
        'horizontalCRS': 'ETRS89 / UTM zone 32N (EPSG:25832), metres; OSM lon/lat treated as ETRS89 geographic',
        'heightCRS': 'DHHN2016 height, EPSG:7837, metres above NHN (not relative y)',
        'localAxes': 'x=easting-origin.easting; z=origin.northing-northing; y=absolute corrected NHN height',
        'origin': {'osmNodeId': first['nodes'][0], 'latitude': nodes[first['nodes'][0]]['lat'],
                   'longitude': nodes[first['nodes'][0]]['lon'], 'easting': origin[0], 'northing': origin[1],
                   'description': 'First mapped node of T13 way; near T13, not a survey of the painted official timing line'},
        'clockwise': True, 'startHeadingRadians': heading,
        'length2DMetres': length, 'pointCountIncludingClosure': len(points),
        'sampleSpacingMaximumMetres': SPACING, 'originalWayCount': len(ordered),
        'originalNodeCountIncludingClosure': len(segments)+1,
        'osm': {'sourceUrl': 'https://overpass-api.de/api/interpreter',
                'query': '[out:json][timeout:25];way[highway=raceway](50.32,6.90,50.40,7.04);out body;>;out skel qt;',
                'snapshot': osm.get('osm3s'), 'rawFile': source.name,
                'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'orderedWayIds': [w['id'] for w in ordered],
                'attribution': '© OpenStreetMap contributors',
                'license': 'ODbL 1.0', 'licenseUrl': 'https://www.openstreetmap.org/copyright'},
        'elevation': {'authority': 'Landesamt fuer Vermessung und Geobasisinformation Rheinland-Pfalz',
                      'sourceUrl': 'https://www.geoshop.rlp.de/opendata-dgm1.html',
                      'manifestUrl': 'https://geobasis-rlp.de/data/dgm1/current/meta4/dgm1_tif_07.meta4',
                      'manifestFile': 'dgm1-index.meta4', 'resolutionMetres': 1,
                      'sampling': 'Bilinear Float32 GeoTIFF pixel centres, including neighbouring tiles at boundaries',
                      'attribution': '©GeoBasis-DE / LVermGeoRP 2026, dl-de/by-2-0, www.lvermgeo.rlp.de [Daten bearbeitet]',
                      'licenseUrl': 'https://www.govdata.de/dl-de/by-2-0',
                      'tiles': [terrain.used[k] for k in sorted(terrain.used)]},
        'officialReferenceUrl': 'https://www.nuerburgring.de/info/nuerburgring/records?locale=en',
        'accuracyLimitations': ['Open mapped line, not a certified or laser-scanned road centreline.',
                                'Road width, camber, barriers and kerbs are not supplied by this line.',
                                'Only bridge heights are estimated; no global scale, elevation rescale, spline or smoothing is applied.',
                                'All original OSM vertices retained; added x/z points interpolate original straight segments.',
                                'Bridge interpolation endpoints are terrain samples 25 m beyond mapped structures, not surveyed deck heights.'],
        'bridgeCorrections': corrections,
        'rawElevationStats': stats(raw_points), 'correctedElevationStats': stats(points),
    }
    (directory/'nordschleife-metric.json').write_text(json.dumps({'points': points, 'sections': sections, 'provenance': provenance}, ensure_ascii=False, indent=2)+'\n')
    (directory/'nordschleife-elevation-raw.json').write_text(json.dumps({'points': raw_points, 'provenance': provenance}, ensure_ascii=False, indent=2)+'\n')
    for im in terrain.images.values():
        im.close()
    print(json.dumps({k: provenance[k] for k in ['origin', 'clockwise', 'startHeadingRadians', 'length2DMetres',
          'pointCountIncludingClosure', 'rawElevationStats', 'correctedElevationStats', 'bridgeCorrections']}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', type=Path, default=Path(__file__).resolve().parent)
    build(parser.parse_args().data_dir)
