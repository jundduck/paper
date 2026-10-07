import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoadmap} from '../public/roadmap.js';
const venue={acronym:'CVPR',type:'conference',category:'ai',year:2027,deadline:'2026-11-16T23:59:59-12:00',startDate:'2027-06-20',endDate:'2027-06-25',notification:{edition:2027,date:'2027-02-25'},sourceUrl:'https://cvpr.thecvf.com/Conferences/2027/Dates'};
test('Roadmap converts timed deadlines to KST and never marks projected editions official',()=>{
 const events=buildRoadmap([venue]);
 assert.equal(events.find(e=>e.year===2027&&e.kind==='deadline').date,'2026-11-17');
 assert.ok(events.filter(e=>e.year!==2027).every(e=>e.estimate));
 assert.ok(events.every(e=>e.date.slice(0,7)>='2026-10'&&e.date.slice(0,7)<='2029-02'));
 assert.equal(events.find(e=>e.year===2029&&e.kind==='talk'),undefined);
});
test('Roadmap omits journals and alternating-year conference editions',()=>{
 assert.deepEqual(buildRoadmap([{...venue,type:'journal'}]),[]);
 assert.ok(buildRoadmap([{...venue,acronym:'ICCV',deadline:'2027-03-01'}]).every(e=>e.year%2===1));
});
test('Past notification is a projected month, never a current confirmed result',()=>{
 const result=buildRoadmap([{...venue,notification:{edition:2026,date:'2026-02-25'}}]).find(e=>e.year===2027&&e.kind==='decision');
 assert.equal(result.estimate,true);assert.equal(result.date,'2027-02');
});
test('Fresh official data replaces a roadmap forecast',()=>{
 const initial=buildRoadmap([{...venue,deadline:null,previousDeadline:{edition:2026,date:'2025-11-13'}}]);
 assert.equal(initial.find(e=>e.year===2027&&e.kind==='deadline').estimate,true);
 const updated=buildRoadmap([venue]);assert.equal(updated.find(e=>e.year===2027&&e.kind==='deadline').estimate,false);
});
