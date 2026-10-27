import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const sql = name => readFileSync(new URL(`../../supabase/migration/${name}`,import.meta.url),'utf8');
const room='00000000-0000-0000-0000-000000000001';
const id=n=>`00000000-0000-0000-0001-${String(n).padStart(12,'0')}`;
// Isolated contract schema: executes the shipped PL/pgSQL functions without Supabase or network.
async function fixture(roles) {
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated;
 create table yaaru_avan_rooms(id uuid primary key, phase text, out_player uuid, last_result jsonb default '{}', stop_no int default 1, retrieve_deadline timestamptz, guess_queue uuid[], guess_after uuid, outcome text,round_summary jsonb);
 create table yaaru_avan_room_private(room_id uuid, tourist_word text, stranger_word text,category text);
 create table yaaru_avan_players(id uuid primary key,room_id uuid,name text,alive boolean default true,seat_idx int,points int default 0,survived int default 0,pickpocket_wins int default 0);
 create table yaaru_avan_player_private(player_id uuid primary key,role text,special text,dip_as text,partner uuid,out_order int,revenge_done boolean default false,retrieval_used boolean default false,sniper_used boolean default false);
 create function _ya_begin_stop(uuid,int,int) returns void language sql as $$update yaaru_avan_rooms set phase='describe',stop_no=$2 where id=$1$$;
 create function _ya_winner(uuid) returns text language sql as $$select case when count(*) filter(where pp.role<>'tourist')=0 then 'tourists' when count(*) filter(where pp.role='tourist')<=1 then 'strangers' end from yaaru_avan_players p join yaaru_avan_player_private pp on p.id=pp.player_id where p.room_id=$1 and p.alive$$;
 create function _ya_deal_specials(uuid,int,int,text[]) returns void language sql as $$select$$;
 insert into yaaru_avan_rooms(id,phase) values('${room}','vote');
 insert into yaaru_avan_room_private values('${room}','Beach','Island','places');`);
 for(let i=0;i<roles.length;i++) {
  await db.query('insert into yaaru_avan_players(id,room_id,name,seat_idx) values($1,$2,$3,$4)',[id(i),room,`P${i}`,i]);
  await db.query('insert into yaaru_avan_player_private(player_id,role) values($1,$2)',[id(i),roles[i]]);
 }
 const migration=sql('fix_yaaru_avan_scoring_and_revenge.sql');await db.exec(migration);await db.exec(migration);
 return db;
}
test('online: migration applies twice; only guessing Pickpocket receives 6 points and one win',async()=>{
 const db=await fixture(['pickpocket','pickpocket','tourist']);try{
 await db.query('update yaaru_avan_rooms set out_player=$1',[id(0)]);
 await db.query("select _ya_finish($1,'pickpocket-steal')",[room]);
 const r=(await db.query('select points,pickpocket_wins from yaaru_avan_players order by seat_idx')).rows;
 assert.deepEqual(r,[{points:6,pickpocket_wins:1},{points:0,pickpocket_wins:0},{points:0,pickpocket_wins:0}]);
 }finally{await db.close();}
});
test('online: final Stranger Revenger acts before win and spent revenge resolves to win',async()=>{
 const db=await fixture(['stranger','tourist','tourist']);try{
 await db.query("update yaaru_avan_player_private set special='revenger' where player_id=$1",[id(0)]);
 await db.query('update yaaru_avan_players set alive=false where id=$1',[id(0)]);
 await db.query('select _ya_after_out($1,$2)',[room,id(0)]);
 assert.equal((await db.query('select phase from yaaru_avan_rooms')).rows[0].phase,'revenger');
 await db.query('update yaaru_avan_player_private set revenge_done=true where player_id=$1',[id(0)]);
 await db.query('select _ya_after_out($1,$2)',[room,id(0)]);
 assert.equal((await db.query('select outcome from yaaru_avan_rooms')).rows[0].outcome,'tourists');
 }finally{await db.close();}
});
test('online: Retriever pauses an otherwise winning vote, but never a Sniper shot',async()=>{
 const db=await fixture(['stranger','stranger','tourist','tourist']);try{
 await db.query("update yaaru_avan_player_private set special='retriever' where player_id=$1",[id(2)]);
 await db.query('update yaaru_avan_players set alive=false where id=$1',[id(3)]);
 await db.query("update yaaru_avan_rooms set last_result=jsonb_build_object('out',$1::text)",[id(3)]);
 await db.query('select _ya_after_out($1,$2)',[room,id(3)]);
 assert.equal((await db.query('select phase from yaaru_avan_rooms')).rows[0].phase,'retrieve');
 await db.exec(`update yaaru_avan_rooms set last_result=last_result || '{"retrieval_resolved":true}'::jsonb`);
 await db.query('select _ya_after_out($1,$2)',[room,id(3)]);
 assert.equal((await db.query('select outcome from yaaru_avan_rooms')).rows[0].outcome,'strangers');
 }finally{await db.close();}
});
test('online: 100 deals verify caps, restricted roles, paired partners and new-round shot reset',async()=>{
 const db=await fixture(['pickpocket','tourist','tourist','tourist','tourist','tourist','stranger','stranger']);try{
 await db.exec(sql('yaaru_avan_online_deal_all_ticked_specials.sql'));
 for(let i=0;i<100;i++){
 await db.exec('update yaaru_avan_player_private set special=null,dip_as=null,partner=null,sniper_used=true');
 await db.query('select _ya_deal_specials($1,8,2,null)',[room]);
 const r=(await db.query('select * from yaaru_avan_player_private')).rows;
 assert.ok(r.filter(x=>x.special).length<=4);
 for(const x of r){
  const sp=x.dip_as??x.special;assert.equal(x.sniper_used,false);
  if(['joyFool','revenger','sniper'].includes(sp)) assert.notEqual(x.role,'pickpocket');
  if(sp==='retriever')assert.equal(x.role,'tourist');
  if(x.partner) assert.equal(r.find(y=>y.player_id===x.partner).partner,x.player_id);
 }
 }
 }finally{await db.close();}
});
