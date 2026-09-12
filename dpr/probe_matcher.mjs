import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext()).newPage();
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
await p.goto('file:///home/user/AD/dpr/DPR_Consolidator_offline.html');
const pairs = [
 ['Fltration Main Bldg (P-1)','Filtration Main Building (Part-1)','structure'],
 ['Fltration Main Bldg (P-1)','Filtration Main Building (Part-2)','structure'],
 ['Conv. Gallery J1C1-J1C2','Conveyor gallery J1C1 & J1C2','structure'],
 ['JH-02','JH02','structure'],
 ['JH-02','JH01','structure'],
 ['Elect. Sub-stn RMHS','Electrical Substation RMHS','structure'],
 ['Interm. slurry agitator tk (Part 2)','Intermediate slurry agitator tank (Part-2)','structure'],
 ['Interm. slurry agitator tk (Part 2)','Intermediate slurry agitator tank (Part-1)','structure'],
 ['Pump House with sump & pump','Pump house with sump and pump','structure'],
 ['Buffer thickner','Buffer thickener','structure'],
 ['M/s Meher Foundations Pvt. Ltd.','Meher Foundation','agency'],
 ['ITD Cementation India Limited','ITD Cementation','agency'],
 ['Goel Constructions','Vensar Constructions','agency'],
 ['MHS','Material Handling Facilities','area'],
 ['Filtration','Filtration Unit','area'],
 ['WTP','Water Treatment Plant','area'],
 ['Filtration Unit','Water Treatment Plant','area'],
 ['BS - Filtration Main Building','TS - Filtration Main Building','structure'],
 ['BS - Filtration Main Building','BS - Filtration Main Bldg','structure'],
 ['Cooling Tower','Cooling Tower-1','structure'],
 ['Stacker (Filtration Side) 1-8','Stacker (Filtration Side) 9','structure'],
 ['Stacker (Filtration Side) 1-8','Stacker Filtration Side 1 to 8','structure']];
const r = await p.evaluate(ps => ps.map(x => (x[0] + '  ~  ' + x[1]).padEnd(76) + Math.round(simName(x[0], x[1], x[2]) * 100) + '%'), pairs);
r.forEach(l => console.log(l));
await b.close();
