import test from 'node:test';
import assert from 'node:assert/strict';
import { outcomeTitle, rolesValid, countsFor, dealRound, checkWinner, roundPoints, describeOrder, retrieveTourist, afterElimination, loadSetup, clampRoles } from '../../src/components/ui/yaaruAvanEngine';
import type { Seat } from '../../src/components/ui/yaaruAvanEngine';
import { assignSpecials, activeSpecial, SPECIALS, specialBonus, maxSpecialPlayers } from '../../src/components/ui/yaaruAvanSpecials';
const seat = (name:string, role:Seat['role'], extra:Partial<Seat> = {}):Seat => ({ name,role,alive:true,word:role==='pickpocket'?null:role==='tourist'?'Beach':'Island',seat:name,...extra });
const pair = {id:'test',a:'Beach',b:'Island',level:'medium',category:'places'} as const;
test('no specials: every valid 3–20-player split deals correct roles and words; opening speaker is never Pickpocket', () => {
 for(let n=3;n<=20;n++) for(let s=0;s<n;s++) for(let p=0;p<=2;p++) if(rolesValid(n,s,p)) {
  const r=dealRound(Array.from({length:n},(_,i)=>`P${i}`),countsFor(n,s,p),pair);
  assert.equal(r.seats.filter(x=>x.role==='stranger').length,s); assert.equal(r.seats.filter(x=>x.role==='pickpocket').length,p);
  assert.equal(new Set(r.seats.map(x=>x.seat)).size,n);
  for(const x of r.seats) { assert.equal(x.special,undefined); assert.equal(x.word,x.role==='tourist'?r.touristWord:x.role==='stranger'?r.strangerWord:null); }
  assert.notEqual(r.seats[describeOrder(r.seats,0,1)[0]].role,'pickpocket');
 }
});
test('base wins and scoring: eliminated Tourists still win, eliminated Strangers do not',()=>{
 const a=[seat('T','tourist'),seat('T2','tourist',{alive:false}),seat('S','stranger')];
 assert.equal(checkWinner(a),'sneaky');assert.deepEqual(roundPoints(a,'strangers'),{T:0,T2:0,S:10});
 a[2].alive=false;assert.equal(checkWinner(a),'tourists');assert.deepEqual(roundPoints(a,'tourists'),{T:2,T2:2,S:0});
});
test('only the guessing Pickpocket earns steal points',()=>{
 const a=[seat('P1','pickpocket'),seat('P2','pickpocket'),seat('T','tourist')];
 assert.deepEqual(roundPoints(a,'pickpocket-steal','P1'),{P1:6,P2:0,T:0});
});
test('saved zero-Stranger setup survives reopening, and malformed counts are sanitized',()=>{
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({names:['A','B','C'],strangers:0,pickpockets:1})}});
 assert.equal(loadSetup().strangers,0); assert.equal(loadSetup().pickpockets,1);
 assert.equal(rolesValid(6,1.5,0),false);assert.equal(rolesValid(6,NaN,0),false);
 assert.deepEqual(clampRoles(5,Infinity,-2),{strangers:1,pickpockets:0});
});
test('2,000 randomized special deals: cap, uniqueness, pair symmetry and core-role restrictions',()=>{
 let seed=42;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let k=0;k<2000;k++) {
  const n=5+k%16,names=Array.from({length:n},(_,i)=>`P${i}`);const s=n>=7?2:1;
  const ids=SPECIALS.filter(()=>rng()<.7).map(x=>x.id);
  const result=assignSpecials(names,ids,rng,x=>x==='P0',x=>Number(x.slice(1))>=n-s);
  assert.ok(result.size<=maxSpecialPlayers(n));const abilities=new Map();
  for(const [name,x] of result) {
   const sp=activeSpecial(x)!;abilities.set(sp,(abilities.get(sp)??0)+1);
   if(['joyFool','revenger','sniper','retriever'].includes(sp)) assert.notEqual(name,'P0');
   if(sp==='retriever'){assert.ok(s>=2);assert.ok(Number(name.slice(1))<n-s);}
   if(x.partner) assert.equal(result.get(x.partner)?.partner,name);
  }
  for(const [sp,count] of abilities) assert.equal(count,['duelists','lovers'].includes(sp)?2:1);
 }
});
test('6 players with three selected singles get all three; Vendor replaces its chosen ability',()=>{
 const names=['A','B','C','D','E','F'];
 assert.equal(assignSpecials(names,['joyFool','ghost','boomerang']).size,3);
 const r=assignSpecials(names,['falafelVendor','ghost']);assert.equal(r.size,1);assert.equal([...r.values()][0].dipAs,'ghost');
 assert.equal(assignSpecials(names,['falafelVendor']).size,0);
});
test('Retriever can defer a winning elimination, revive only the direct Tourist and spend once',()=>{
 const a=[seat('R','tourist',{special:'retriever'}),seat('T','tourist',{alive:false,outOrder:1,lastOutOrder:1,special:'joyFool'}),seat('S','stranger'),seat('S2','stranger')];
 assert.equal(afterElimination(a,1),'retrieve');assert.equal(retrieveTourist(a,1,false),null);
 const b=retrieveTourist(a,1)!;assert.equal(b[1].alive,true);assert.equal(b[0].retrievalUsed,true);assert.equal(b[1].outOrder,undefined);
 assert.equal(specialBonus(b).T,0);b[1].alive=false;assert.equal(retrieveTourist(b,1),null);
 assert.equal(afterElimination(a,1,true,true),'sneaky');
});
test('last Stranger Revenger acts before Tourists win; spent revenge cannot repeat',()=>{
 const a=[seat('T','tourist'),seat('T2','tourist'),seat('S','stranger',{special:'revenger',alive:false})];
 assert.equal(afterElimination(a,2),'revenger');a[2].revengeDone=true;assert.equal(afterElimination(a,2),'tourists');
});
test('Joy Fool and Duelists bonuses follow elimination order',()=>{
 assert.deepEqual(specialBonus([{name:'J',special:'joyFool',outOrder:1},{name:'A',special:'duelists',partner:'B',outOrder:2},{name:'B',special:'duelists',partner:'A'}]),{J:4,A:-2,B:2});
});

test('surviving Pickpockets are named correctly when no Stranger survives',()=>{
 assert.equal(outcomeTitle('strangers',['pickpocket','tourist']),'The Pickpocket got away!');
 assert.equal(outcomeTitle('strangers',['pickpocket','pickpocket','tourist']),'The Pickpockets got away!');
});
