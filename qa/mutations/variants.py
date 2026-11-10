from pathlib import Path
import subprocess,difflib
root=Path(__file__).resolve().parents[2]
def variant(id,slug,target,path,replacements,desc):
 before=subprocess.check_output(['git','-C',str(root/'product'),'show','HEAD:'+path],text=True)
 after=before
 for old,new in replacements:
  assert old in after,(id,old)
  after=after.replace(old,new,1)
 after+='\n'+(':root { --mutation-lab: "mutation-lab:'+id+'"; }' if path.endswith('.css') else 'Object.assign(globalThis, { __mutationLab: "mutation-lab:'+id+'" });')+'\n'
 diff=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+path,tofile='b/'+path))
 (root/'qa/mutations'/f'{id}-{slug}.patch').write_text(f'# {id} | Sensitivity | targets: {target} | {desc}\n'+diff)
f='frontend/src/'
variant('M03b','missing-status-active','S05',f+'components/DeviceList.tsx',[("const flight = dd?.flight_status?.flight_status;","const flight = dd?.flight_status?.flight_status ?? 'in_flight';")],'Missing status falls back to active flight; may expose missing-state coverage gap')
variant('M03c','grounded-mapped-airborne','S05 S04',f+'components/DeviceList.tsx',[("const flight = dd?.flight_status?.flight_status;","const rawFlight = dd?.flight_status?.flight_status;\n          const flight = ['standby', 'landed', 'on_dock'].includes(rawFlight ?? '') ? 'in_flight' : rawFlight;")],'Grounded status mapped airborne in list only; baseline calls grounded standby')
variant('M09b','phone-list-collapsed','S08',f+'styles.css',[("\n", "\n")],'At phone width the device list silently collapses')
p=root/'qa/mutations/M09b-phone-list-collapsed.patch'
# Generate collapse rule as a source append before marker, without changing product.
path=f+'styles.css';before=subprocess.check_output(['git','-C',str(root/'product'),'show','HEAD:'+path],text=True)
after=before+'\n@media (max-width:480px) { .device-list { overflow:hidden; max-height:0; } }\n:root { --mutation-lab: "mutation-lab:M09b"; }\n'
p.write_text('# M09b | Responsive | targets: S08 | Device list silently disappears at <=480px\n'+''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+path,tofile='b/'+path)))
variant('M05b','previous-battery-source','S03',f+'components/TelemetryPanel.tsx',[("import { useTelemetryStore }", "import { useRef } from 'react';\nimport { useTelemetryStore }"),("  const device = devices.find", "  const lastSelected = useRef(selected);\n  const previousSelected = useRef(selected);\n  if (lastSelected.current === null && selected !== null) {\n    lastSelected.current = selected;\n    previousSelected.current = selected;\n  } else if (lastSelected.current !== selected) {\n    previousSelected.current = lastSelected.current;\n    lastSelected.current = selected;\n  }\n  const previousBattery = previousSelected.current ? data[previousSelected.current]?.battery : undefined;\n\n  const device = devices.find"),("fmt(drone?.battery?.percent, '%', 0)","fmt(previousBattery?.percent, '%', 0)")],'Battery comes from previously selected drone while other telemetry remains selected')
