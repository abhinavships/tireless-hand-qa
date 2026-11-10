from pathlib import Path
import subprocess, difflib
root=Path(__file__).resolve().parents[2]
# Generation uses immutable source reads and temporary in-memory variants; product is never modified.
def patch(id,slug,category,target,path,old,new,desc):
 p=root/'product'/path; before=p.read_text()
 if old is None: after=before+new
 else:
  assert old in before,(id,path,old)
  after=before.replace(old,new,1)
 after += ('\n<!-- mutation-lab:'+id+' -->\n' if path.endswith('.html') else ('\n:root { --mutation-lab: \"mutation-lab:'+id+'\"; }\n' if path.endswith('.css') else '\nObject.assign(globalThis, { __mutationLab: \"mutation-lab:'+id+'\" });\n'))
 diff=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+path,tofile='b/'+path))
 (root/'qa/mutations'/f'{id}-{slug}.patch').write_text(f'# {id} | {category} | targets: {target} | {desc}\n'+diff)
f='frontend/src/'
patch('M01','hide-video','Visual','S01',f+'pages/CockpitPage.tsx','        <VideoTile />','        {/* Video tile accidentally omitted */}','Required FPV tile removed')
patch('M02','remove-control-link','Visual','S01',f+'pages/CockpitPage.tsx','          <a className="dashboard-link" href={`${config.apiUrl}/dashboard`} target="_blank" rel="noreferrer">\n            Control panel →\n          </a>','          {/* Control panel link omitted */}','Operator cannot reach control panel')
patch('M03','online-when-offline','Telemetry','S05',f+'components/DeviceList.tsx','const flight = dd?.flight_status?.flight_status;',"const flight = 'online';",'Device row falsely claims online even with simulator offline')
patch('M04','drop-last-drone','Functional','S02',f+'components/DeviceList.tsx',"const drones = devices.filter((d) => d.type === 'drone');","const drones = devices.filter((d) => d.type === 'drone').slice(0, -1);",'Last fleet device silently omitted')
patch('M05','zero-battery','Telemetry','S03',f+'components/TelemetryPanel.tsx',"fmt(drone?.battery?.percent, '%', 0)","fmt(0, '%', 0)",'Selected drone battery falsely displays zero')
patch('M06','stuck-flight-status','Functional','S04',f+'components/TelemetryPanel.tsx',"const status = drone?.flight_status?.flight_status ?? 'unknown';","const status = 'docked';",'Panel flight status stuck docked throughout flight')
patch('M07','connected-badge','Network','S06',f+'components/SocketBadge.tsx','socket {status}','socket connected','Socket badge falsely claims connected during disconnection')
patch('M08','live-when-off','Video','S07',f+'components/VideoTile.tsx',"const label = !enabled ? 'off' : state === 'playing' ? 'live' : state;","const label = !enabled ? 'live' : state === 'playing' ? 'live' : state;",'Stopped video falsely labeled live')
patch('M09','phone-offscreen','Responsive','S08',f+'styles.css',None,'\n@media (max-width: 800px) { .cockpit-left { transform: translateX(650px); } }\n','Device list and telemetry pushed off narrow viewport')
patch('M10','name-html','Security','S09',f+'components/DeviceList.tsx','<span className="device-name">{drone.name}</span>','<span className="device-name" dangerouslySetInnerHTML={{ __html: drone.name }} />','Operator supplied name executes as HTML')
# No guard exists in clean server. This explicit baseline metadata must never count as a mutation catch.
(root/'qa/mutations/M11-org-guard-absent.patch').write_text('# M11 | Security | targets: S10 | BASELINE_ONLY: clean backend already ignores org-id; no removable guard\n')
# Synthetic evaluator-added protected route. Contract tests must opt into /settings as requiresAuth.
patch('M12','unguarded-settings','Security','S11',f+'App.tsx','        <Route path="/" element={<CockpitPage />} />','        <Route path="/" element={<CockpitPage />} />\n        <Route path="/settings" element={<main><h1>Protected settings</h1><button>Save settings</button></main>} />','SYNTHETIC: evaluator-added protected route renders to signed-out visitors')
p='backend/public/dashboard.html';b=(root/'product'/p).read_text();line=next(x for x in b.splitlines() if 'data-cmd="land"' in x)
patch('M13','remove-land','Functional','S12',p,line,'          <!-- Land action omitted -->','Land action removed from control dashboard')
patch('M14','unnamed-dashboard-button','Accessibility','S13',p,'<button id="sim-start" class="primary" data-testid="dash-sim-start">Start</button>','<button id="sim-start" class="primary" data-testid="dash-sim-start"><span aria-hidden="true">▶</span></button>','Simulator start button loses accessible name')
patch('M15','swapped-map-coordinates','Map','S14',f+'components/CesiumMap.tsx','Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, droneH)','Cesium.Cartesian3.fromDegrees(pos.latitude, pos.longitude, droneH)','Drone marker latitude and longitude swapped')
