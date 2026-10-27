import { test, expect, type Page } from '@playwright/test';
const seat=(name:string,role='tourist',extra={})=>({name,role,word:role==='pickpocket'?null:role==='stranger'?'Island':'Beach',seat:name,alive:true,...extra});
async function setup(page:Page,seats:ReturnType<typeof seat>[],specials=false) {
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4173')?route.continue():route.abort());
 await page.addInitScript(({seats,specials})=>{
  localStorage.setItem('ulaa:yaaru-avan:setup',JSON.stringify({names:seats.map(s=>s.name),strangers:seats.filter(s=>s.role==='stranger').length,pickpockets:seats.filter(s=>s.role==='pickpocket').length,specials,level:'medium'}));
  localStorage.setItem('ulaa:packbag:muted','1');
  (window as Window & { __fixture?: unknown }).__fixture={seats,touristWord:'Beach',strangerWord:'Island',pair:{id:'test',a:'Beach',b:'Island',category:'places',level:'medium'}};
 },{seats,specials});
 await page.goto('/tests/yaaru-avan/index.html');
 await page.getByRole('button',{name:'Deal boarding passes',exact:true}).click();
 for(let i=0;i<seats.length;i++) {
  await page.getByRole('button',{name:`I am ${seats[i].name}. Show my pass`,exact:true}).click();
  await page.getByRole('button',{name:'Hold to reveal',exact:true}).click();
  await page.getByRole('button',{name:i===seats.length-1?'Everyone has boarded. Start':'Hidden. Pass it on',exact:true}).click();
 }
 await describe(page);
}
async function describe(page:Page) {
 while(await page.getByRole('button',{name:/Done\. (Next speaker|Start the discussion)/}).count()) await page.getByRole('button',{name:/Done\. (Next speaker|Start the discussion)/}).click();
}
async function offboard(page:Page,name:string) {
 await page.getByRole('button',{name:new RegExp(`^${name}\\s*Seat ${name}$`)}).click();
 await page.getByRole('button',{name:`Offboard ${name}`,exact:true}).click();
}
test('without specials: deal, describe, vote out Stranger, Tourist win, next round',async({page})=>{
 await setup(page,[seat('S','stranger'),seat('A'),seat('B')]);
 await offboard(page,'S');await expect(page.getByRole('heading',{name:'Tourists win!',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/next round/}).click();await expect(page.getByText('Round 2 · Boarding 1 of 3')).toBeVisible();
});
test('without specials: correct Tourist word accepted with Stranger first in seating order',async({page})=>{
 await setup(page,[seat('S','stranger'),seat('P','pickpocket'),seat('A'),seat('B'),seat('C')]);
 await offboard(page,'P');await expect(page.getByRole('heading',{name:'P was the Pickpocket',exact:true})).toBeVisible();
 await page.getByRole('textbox').fill('Beach');await page.getByRole('button',{name:/Submit/}).click();
 await expect(page.getByRole('heading',{name:'The Pickpocket stole it!',exact:true})).toBeVisible();
});
test('without specials: wrong guess resumes play and surviving sneaky side wins at one Tourist',async({page})=>{
 await setup(page,[seat('S','stranger'),seat('P','pickpocket'),seat('A'),seat('B'),seat('C')]);
 await offboard(page,'P');await page.getByRole('button',{name:'Wrong',exact:true}).click();await describe(page);
 await offboard(page,'A');await expect(page.getByRole('heading',{name:'Describe your word'})).toBeVisible();await describe(page);
 await offboard(page,'B');await expect(page.getByRole('heading',{name:'The Strangers got away!',exact:true})).toBeVisible();
});
test('roles: last Stranger Revenger gets revenge before round ends',async({page})=>{
 await setup(page,[seat('S','stranger',{special:'revenger'}),seat('A'),seat('B'),seat('C'),seat('D')],true);
 await offboard(page,'S');await expect(page.getByRole('heading',{name:'S takes someone with them'})).toBeVisible();
 await page.getByRole('button',{name:/^A\s*Seat A$/}).click();await expect(page.getByRole('heading',{name:'Tourists win!',exact:true})).toBeVisible();
});
test('roles: Sniper backfire kills shooter, then game continues',async({page})=>{
 await setup(page,[seat('S','stranger'),seat('A','tourist',{special:'sniper'}),seat('B'),seat('C')],true);
 await page.getByRole('button',{name:'Sniper taking a shot?',exact:true}).click();
 await page.getByRole('button',{name:/^A\s*Seat A$/}).click();await page.getByRole('button',{name:/^B\s*Seat B$/}).click();
 await expect(page.getByText(/shot backfired and A goes offboard/)).toBeVisible();await expect(page.getByRole('heading',{name:'Describe your word'})).toBeVisible();
});
test('roles: Lovers leave together; Pickpocket partner still gets a guess',async({page})=>{
 await setup(page,[seat('S','stranger'),seat('P','pickpocket',{special:'lovers',partner:'A'}),seat('A','tourist',{special:'lovers',partner:'P'}),seat('B'),seat('C')],true);
 await offboard(page,'A');await expect(page.getByRole('heading',{name:'P was the Pickpocket'})).toBeVisible();
 await page.getByRole('button',{name:'Wrong',exact:true}).click();await expect(page.getByRole('heading',{name:'Describe your word'})).toBeVisible();
});
test('roles: Boomerang single voter bounces elimination to the voter',async({page})=>{
 await setup(page,[seat('S','stranger'),seat('A','tourist',{special:'boomerang'}),seat('B'),seat('C')],true);
 await page.getByRole('button',{name:/^A\s*Seat A$/}).click();await page.getByRole('button',{name:'S',exact:true}).click();
 await page.getByRole('button',{name:'Offboard A',exact:true}).click();await expect(page.getByText('A stays aboard!',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Tourists win!',exact:true})).toBeVisible({timeout:8000});
});
test('roles: Retriever private handoffs return only voted Tourist',async({page})=>{
 await setup(page,[seat('S','stranger'),seat('S2','stranger'),seat('R','tourist',{special:'retriever'}),seat('A'),seat('B')],true);
 await offboard(page,'A');await expect(page.getByRole('heading',{name:'Pass to S',exact:true})).toBeVisible();
 for(const name of ['S','S2','R','B']) {
  await page.getByRole('button',{name:'I have the phone',exact:true}).click();
  await page.getByRole('button',{name:name==='R'?'Retrieve A':'Hide and continue',exact:true}).click();
 }
 await expect(page.getByRole('heading',{name:'A is back!',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Continue',exact:true}).click();await describe(page);
 await expect(page.getByRole('button',{name:/^A\s*Seat A$/})).toBeVisible();
});
test('without specials: tied players describe again, then only tied candidates can be selected',async({page})=>{
 await setup(page,[seat('S','stranger'),seat('A'),seat('B'),seat('C')]);
 await page.getByRole('button',{name:'Vote tied?',exact:true}).click();
 await page.getByRole('button',{name:'S',exact:true}).click();await page.getByRole('button',{name:'A',exact:true}).click();
 await page.getByRole('button',{name:'Tied players describe once more',exact:true}).click();await describe(page);
 await expect(page.getByRole('button',{name:/^B\s*Seat B$/})).toHaveCount(0);
 await offboard(page,'S');await expect(page.getByRole('heading',{name:'Tourists win!',exact:true})).toBeVisible();
});
test('roles: eliminated Ghost is still available as a voter',async({page})=>{
 await setup(page,[seat('S','stranger'),seat('G','tourist',{special:'ghost'}),seat('A'),seat('B'),seat('C')],true);
 await offboard(page,'G');await expect(page.getByRole('heading',{name:'Describe your word'})).toBeVisible();await describe(page);
 await page.getByRole('button',{name:/^S\s*Seat S$/}).click();await expect(page.getByRole('button',{name:'G',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'G',exact:true}).click();await page.getByRole('button',{name:'Offboard S',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Tourists win!',exact:true})).toBeVisible();
});
test('roles: Goddess remains public and can decide ties after elimination',async({page})=>{
 await setup(page,[seat('S','stranger'),seat('G','tourist',{special:'goddess'}),seat('A'),seat('B'),seat('C')],true);
 await offboard(page,'G');await expect(page.getByRole('heading',{name:'Describe your word'})).toBeVisible();await describe(page);
 await page.getByRole('button',{name:'Vote tied?',exact:true}).click();await expect(page.getByText(/already out, but she still decides/)).toBeVisible();
 await offboard(page,'S');await expect(page.getByRole('heading',{name:'Tourists win!',exact:true})).toBeVisible();
});
test('roles: Sniper hits Pickpocket, whose last guess still runs',async({page})=>{
 await setup(page,[seat('S','stranger'),seat('P','pickpocket'),seat('A','tourist',{special:'sniper'}),seat('B'),seat('C')],true);
 await page.getByRole('button',{name:'Sniper taking a shot?',exact:true}).click();await page.getByRole('button',{name:/^A\s*Seat A$/}).click();
 await page.getByRole('button',{name:/^P\s*Seat P$/}).click();await expect(page.getByRole('heading',{name:'P was the Pickpocket'})).toBeVisible();
 await page.getByRole('button',{name:'Correct',exact:true}).click();await expect(page.getByRole('heading',{name:'The Pickpocket stole it!'})).toBeVisible();
});
test('without specials: Pickpocket-only survival win names the correct winner',async({page})=>{
 await setup(page,[seat('P','pickpocket'),seat('A'),seat('B')]);
 await offboard(page,'A');await expect(page.getByRole('heading',{name:'The Pickpocket got away!',exact:true})).toBeVisible();
});
test('roles: Duelist elimination displays a real minus sign for the penalty',async({page})=>{
 await setup(page,[seat('S','stranger',{special:'duelists',partner:'A'}),seat('A','tourist',{special:'duelists',partner:'S'}),seat('B'),seat('C'),seat('D')],true);
 await offboard(page,'S');await expect(page.getByRole('heading',{name:'Tourists win!',exact:true})).toBeVisible();
 await expect(page.getByText('-2',{exact:true})).toBeVisible();await expect(page.getByText('+-2',{exact:true})).toHaveCount(0);
});
test('roles: Falafel Vendor carrying Joy Fool gets the first-out bonus',async({page})=>{
 await setup(page,[seat('S','stranger',{special:'falafelVendor',dipAs:'joyFool'}),seat('A'),seat('B'),seat('C')],true);
 await offboard(page,'S');await expect(page.getByRole('heading',{name:'Tourists win!',exact:true})).toBeVisible();
 await expect(page.getByText('+4',{exact:true})).toBeVisible();
});
