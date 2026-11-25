const $ = (id) => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(n)||0);
const today = () => new Date().toISOString().slice(0,10);
const dateTime = () => new Date().toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'});
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const starterProducts = [
 {id:1,name:'Bottled Water',barcode:'4801000000011',category:'Beverages',price:20,qty:32,limit:8,expiry:'2027-06-15'},
 {id:2,name:'Potato Chips',barcode:'4801000000012',category:'Snacks',price:15,qty:5,limit:8,expiry:'2026-12-20'},
 {id:3,name:'Instant Noodles',barcode:'4801000000013',category:'Food',price:18,qty:24,limit:8,expiry:'2027-02-10'},
 {id:4,name:'Chocolate Bar',barcode:'4801000000014',category:'Snacks',price:35,qty:3,limit:5,expiry:'2026-12-05'},
 {id:5,name:'Laundry Soap',barcode:'4801000000015',category:'Household',price:28,qty:18,limit:5,expiry:''},
 {id:6,name:'Milk Drink',barcode:'4801000000016',category:'Beverages',price:25,qty:0,limit:5,expiry:'2026-11-29'}
];
// Safe browser storage: corrupted old data must never stop the login screen.
function readStorageJSON(key, fallback){
 try {
  const raw=localStorage.getItem(key);
  if(raw===null || raw==='') return fallback;
  const value=JSON.parse(raw);
  return value===null || value===undefined ? fallback : value;
 } catch(error) {
  console.warn('Invalid saved data for '+key+'; using defaults.', error);
  return fallback;
 }
}
let products = readStorageJSON('sf_products', null);
if(!Array.isArray(products)) products=starterProducts;
let history = readStorageJSON('sf_history', null);
if(!Array.isArray(history)) history = [
 {product:'Bottled Water',action:'Stock In',qty:20,user:'Admin Owner',date:dateTime()},
 {product:'Potato Chips',action:'Stock Out',qty:5,user:'Admin Owner',date:dateTime()},
 {product:'Instant Noodles',action:'Added',qty:24,user:'Admin Owner',date:dateTime()}
];
let sales = readStorageJSON('sf_sales', []);
if(!Array.isArray(sales)) sales=[];
let cart = [];
let currentRole = 'owner';
let scannerStream = null, scanTimer = null;

function saveData(){localStorage.setItem('sf_products',JSON.stringify(products));localStorage.setItem('sf_history',JSON.stringify(history));localStorage.setItem('sf_sales',JSON.stringify(sales));}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2600);}
function addHistory(product,action,qty){history.unshift({product,action,qty,user:currentRole==='owner'?'Admin Owner':'Cashier',date:dateTime()});saveData();}
function lowItems(){return products.filter(p=>p.qty<=p.limit);}
function expiringItems(){const now=new Date();return products.filter(p=>p.expiry && (new Date(p.expiry)-now)/(86400000)<=30 && new Date(p.expiry)>=new Date(today()));}
function getProductIcon(category){return ({Beverages:'🥤',Snacks:'🍪',Food:'🍜',Household:'🧼',Personal:'🧴',Other:'📦'})[category]||'📦';}

function navigate(page){
 document.querySelectorAll('.page').forEach(p=>p.classList.remove('active-page'));
 const target=$('page-'+page);if(!target)return;
 target.classList.add('active-page');
 document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 const names={dashboard:'Dashboard',inventory:'Inventory',pos:'Point of Sale',scanner:'Barcode Scanner',history:'Inventory History',alerts:'Alerts & Notifications',users:'Users & Roles',reports:'Reports'};
 $('breadcrumbPage').textContent=names[page]||page;
 if(page==='scanner' && scannerStream) stopScanner();
 if(page==='users')renderCashierAccounts();
 renderAll();
 if(window.innerWidth<=760){$('sidebar').classList.remove('mobile-open');$('sidebarBackdrop')?.classList.remove('show');$('mobileMenuBtn')?.setAttribute('aria-expanded','false');}
}
document.querySelectorAll('.nav-link').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.page)));
document.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.go)));
$('collapseBtn').addEventListener('click',()=>{if(innerWidth<=760)$('sidebar').classList.toggle('mobile-open');else{$('sidebar').classList.toggle('collapsed');document.querySelector('.main-area').classList.toggle('expanded');}});
$('topAlertBtn').addEventListener('click',()=>navigate('alerts'));
$('helpBtn').addEventListener('click',()=>toast('Tip: Add products in Inventory, then sell them in Point of Sale.'));
$('logoutBtn').addEventListener('click',logout);

function setRole(role){
 currentRole=role;document.body.classList.toggle('cashier-mode',role==='cashier');
 const name=role==='owner'?'Admin Owner':'Store Cashier';
 $('profileName').textContent=name;$('profileRole').textContent=role==='owner'?'Owner account':'Cashier account';
 $('welcomeName').textContent=role==='owner'?'Admin':'Cashier';
 $('profileName').parentElement.previousElementSibling.textContent=role==='owner'?'AD':'CS';
 $('topAlertBtn').style.display=role==='owner'?'':'none';
 if(role==='cashier' && ['users','reports','history','alerts'].includes(document.querySelector('.page.active-page')?.id.replace('page-','')))navigate('pos');
 renderAll();
}


function renderDashboard(){
 $('statProducts').textContent=products.length;
 $('statValue').textContent=money(products.reduce((s,p)=>s+p.price*p.qty,0));
 $('statLow').textContent=lowItems().length;
 const todays=sales.filter(s=>s.dateKey===today());
 $('statSales').textContent=money(todays.reduce((s,x)=>s+x.total,0));
 $('overviewList').innerHTML=products.slice(0,5).map(p=>`<div class="overview-item"><div class="item-icon">${getProductIcon(p.category)}</div><div class="item-info"><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.category)}</small><div class="stock-meter"><span style="width:${Math.min(100,p.qty/Math.max(1,p.limit*3)*100)}%;background:${p.qty<=p.limit?'#e8a14d':''}"></span></div></div><span class="stock-number">${p.qty} left</span></div>`).join('')||'<small>No products yet.</small>';
 const alerts=[...lowItems().map(p=>({p,type:'low'})),...expiringItems().map(p=>({p,type:'expiry'}))].slice(0,4);
 $('dashboardAlerts').innerHTML=alerts.map(a=>`<div class="alert-row"><i class="alert-dot ${a.type==='expiry'?'red':''}"></i><div><strong>${escapeHTML(a.p.name)}</strong><small>${a.type==='low'?'Stock is running low':'Expiring on '+a.p.expiry}</small></div><em>${a.type==='low'?a.p.qty+' left':'Expiry'}</em></div>`).join('')||'<p class="subheading">Everything looks good. No alerts right now.</p>';
 $('recentActivity').innerHTML=history.slice(0,5).map(h=>`<tr><td class="table-product">${escapeHTML(h.product)}</td><td>${escapeHTML(h.action)}</td><td>${h.qty}</td><td>${escapeHTML(h.date)}</td></tr>`).join('')||'<tr><td colspan="4">No activity yet.</td></tr>';
}
function renderInventory(){
 const q=($('inventorySearch').value||'').toLowerCase(),filter=$('stockFilter').value;
 const rows=products.filter(p=>(p.name.toLowerCase().includes(q)||p.barcode.includes(q)||p.category.toLowerCase().includes(q))&&(filter==='all'||(filter==='low'&&p.qty>0&&p.qty<=p.limit)||(filter==='out'&&p.qty===0)||(filter==='available'&&p.qty>p.limit)));
 $('inventoryTable').innerHTML=rows.map(p=>`<tr><td class="table-product">${escapeHTML(p.name)}</td><td>${escapeHTML(p.barcode)}</td><td>${escapeHTML(p.category)}</td><td>${money(p.price)}</td><td><span class="status ${p.qty===0?'out':p.qty<=p.limit?'low':'good'}">${p.qty===0?'Out of stock':p.qty<=p.limit?p.qty+' low':p.qty+' in stock'}</span></td><td>${p.expiry||'—'}</td><td class="action-cell owner-only"><button data-edit="${p.id}">Edit</button><button class="delete-btn" data-delete="${p.id}">Delete</button></td></tr>`).join('');
 $('inventoryEmpty').classList.toggle('hidden',rows.length>0);
 document.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openProductModal(Number(b.dataset.edit))));
 document.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>deleteProduct(Number(b.dataset.delete))));
}
$('inventorySearch').addEventListener('input',renderInventory);$('stockFilter').addEventListener('change',renderInventory);
function openProductModal(id=null){
 if(currentRole!=='owner')return toast('Only the owner can manage products.');
 const p=products.find(x=>x.id===id);$('productForm').reset();$('productId').value=p?.id||'';
 $('modalTitle').textContent=p?'Edit product':'Add product';
 $('productName').value=p?.name||'';$('productBarcode').value=p?.barcode||'';$('productCategory').value=p?.category||'';
 $('productPrice').value=p?.price??'';$('productQty').value=p?.qty??'';$('productLimit').value=p?.limit??5;$('productExpiry').value=p?.expiry||'';
 $('productModal').classList.add('show');
}
$('addProductBtn').addEventListener('click',()=>openProductModal());
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).classList.remove('show')));
$('productModal').addEventListener('click',e=>{if(e.target===$('productModal'))$('productModal').classList.remove('show');});
$('productForm').addEventListener('submit',e=>{
 e.preventDefault();const id=Number($('productId').value);
 const item={id:id||Date.now(),name:$('productName').value.trim(),barcode:$('productBarcode').value.trim(),category:$('productCategory').value.trim(),price:Number($('productPrice').value),qty:Number($('productQty').value),limit:Number($('productLimit').value),expiry:$('productExpiry').value};
 if(products.some(p=>p.barcode===item.barcode&&p.id!==id))return toast('That barcode is already registered.');
 if(id){const old=products.find(p=>p.id===id);const diff=item.qty-old.qty;products=products.map(p=>p.id===id?item:p);if(diff)addHistory(item.name,diff>0?'Stock In':'Stock Out',Math.abs(diff));}
 else{products.unshift(item);addHistory(item.name,'Added',item.qty);}
 saveData();$('productModal').classList.remove('show');renderAll();toast(id?'Product updated successfully.':'Product added successfully.');
});
function deleteProduct(id){if(!confirm('Delete this product?'))return;const p=products.find(x=>x.id===id);products=products.filter(x=>x.id!==id);addHistory(p.name,'Deleted',p.qty);renderAll();toast('Product deleted.');}

function renderPOS(){
 const q=($('posSearch').value||'').toLowerCase();
 $('posProductGrid').innerHTML=products.filter(p=>p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)).map(p=>`<button class="product-tile" data-addcart="${p.id}" ${p.qty<=0?'disabled':''}><div class="tile-emoji">${getProductIcon(p.category)}</div><strong>${escapeHTML(p.name)}</strong><small>${p.qty} available</small><div class="tile-bottom"><b>${money(p.price)}</b><span>＋ Add</span></div></button>`).join('')||'<p class="subheading">No products found.</p>';
 document.querySelectorAll('[data-addcart]').forEach(b=>b.addEventListener('click',()=>addToCart(Number(b.dataset.addcart))));
 renderCart();
}
$('posSearch').addEventListener('input',renderPOS);
function addToCart(id){const p=products.find(x=>x.id===id),existing=cart.find(x=>x.id===id);if(existing){if(existing.qty>=p.qty)return toast('Not enough stock available.');existing.qty++;}else cart.push({id,qty:1});renderCart();}
function renderCart(){
 const count=cart.reduce((s,x)=>s+x.qty,0),total=cart.reduce((s,x)=>{const p=products.find(p=>p.id===x.id);return s+(p?p.price*x.qty:0)},0);
 $('cartCount').textContent=count+' item'+(count===1?'':'s');$('cartSubtotal').textContent=money(total);$('cartTotal').textContent=money(total);
 $('cartItems').innerHTML=cart.length?cart.map(x=>{const p=products.find(p=>p.id===x.id);return p?`<div class="cart-item"><div><strong>${escapeHTML(p.name)}</strong><small>${money(p.price)} each</small></div><div class="qty-control"><button data-qty="${p.id}" data-delta="-1">−</button><span>${x.qty}</span><button data-qty="${p.id}" data-delta="1">+</button></div></div>`:''}).join(''):'<div class="empty-cart">Your cart is empty.<br><small>Select a product to begin.</small></div>';
 document.querySelectorAll('[data-qty]').forEach(b=>b.addEventListener('click',()=>{const id=Number(b.dataset.qty),item=cart.find(x=>x.id===id),p=products.find(x=>x.id===id);item.qty+=Number(b.dataset.delta);if(item.qty<=0)cart=cart.filter(x=>x.id!==id);else if(item.qty>p.qty){item.qty=p.qty;toast('Maximum available stock reached.');}renderCart();}));
}
$('clearCartBtn').addEventListener('click',()=>{cart=[];renderCart();});
$('checkoutBtn').addEventListener('click',()=>{
 if(!cart.length)return toast('Your cart is empty.');
 for(const x of cart){const p=products.find(p=>p.id===x.id);if(!p||p.qty<x.qty)return toast('Stock changed. Please review your cart.');}
 let total=0;cart.forEach(x=>{const p=products.find(p=>p.id===x.id);p.qty-=x.qty;total+=p.price*x.qty;addHistory(p.name,'Sale',x.qty);});
 sales.push({total,dateKey:today(),date:dateTime(),items:cart.length});saveData();cart=[];renderAll();toast('Sale completed! Total: '+money(total));
});

function renderHistory(){
 const q=($('historySearch').value||'').toLowerCase(),filter=$('historyFilter').value;
 const rows=history.filter(h=>h.product.toLowerCase().includes(q)&&(filter==='all'||h.action===filter));
 $('historyTable').innerHTML=rows.map(h=>`<tr><td class="table-product">${escapeHTML(h.product)}</td><td>${escapeHTML(h.action)}</td><td>${h.qty}</td><td>${escapeHTML(h.user)}</td><td>${escapeHTML(h.date)}</td></tr>`).join('');
 $('historyEmpty').classList.toggle('hidden',rows.length>0);
}
$('historySearch').addEventListener('input',renderHistory);$('historyFilter').addEventListener('change',renderHistory);
function renderAlerts(){
 const low=lowItems(),exp=expiringItems();$('sideAlertCount').textContent=low.length+exp.length;$('topAlertDot').style.display=low.length+exp.length?'block':'none';
 $('alertSummary').innerHTML=`<article class="stat-card"><div class="stat-top">Low stock items <span class="stat-icon orange">⌁</span></div><h2>${low.length}</h2></article><article class="stat-card"><div class="stat-top">Expiring soon <span class="stat-icon blue">◷</span></div><h2>${exp.length}</h2></article><article class="stat-card"><div class="stat-top">Total alerts <span class="stat-icon purple">♧</span></div><h2>${low.length+exp.length}</h2></article>`;
 const list=[...low.map(p=>({p,type:'low'})),...exp.map(p=>({p,type:'expiry'}))];
 $('alertList').innerHTML=list.map(a=>`<article class="alert-card ${a.type==='expiry'?'expiry':''}"><div class="alert-symbol">${a.type==='low'?'⌁':'◷'}</div><div><strong>${escapeHTML(a.p.name)} — ${a.type==='low'?'Low stock':'Expiry reminder'}</strong><p>${a.type==='low'?`Only ${a.p.qty} item(s) remaining. Low stock limit is ${a.p.limit}.`:`Product expiry date: ${a.p.expiry}.`}</p></div><span>${a.type==='low'?'Restock soon':'Check product'}</span></article>`).join('')||'<article class="panel"><p class="subheading">No alerts. Your inventory is looking good!</p></article>';
}
function renderReports(){
 $('reportProducts').textContent=products.length;$('reportValue').textContent=money(products.reduce((s,p)=>s+p.price*p.qty,0));$('reportSales').textContent=money(sales.reduce((s,x)=>s+x.total,0));$('reportTransactions').textContent=sales.length;
 const cats={};products.forEach(p=>cats[p.category]=(cats[p.category]||0)+p.qty);const max=Math.max(1,...Object.values(cats));
 $('categoryReport').innerHTML=Object.entries(cats).map(([name,n])=>`<div class="category-row"><strong>${escapeHTML(name)}</strong><div class="category-bar"><span style="width:${n/max*100}%"></span></div><span>${n}</span></div>`).join('')||'<small class="subheading">No category data yet.</small>';
}
function renderAll(){renderDashboard();renderInventory();renderPOS();renderHistory();renderAlerts();renderReports();}
$('exportBtn').addEventListener('click',()=>{const rows=[['Name','Barcode','Category','Price','Quantity','Expiry'],...products.map(p=>[p.name,p.barcode,p.category,p.price,p.qty,p.expiry])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='stockflow-inventory.csv';a.click();URL.revokeObjectURL(a.href);toast('Inventory CSV exported.');});

function showScanResult(p){$('scanResult').innerHTML=p?`<span class="result-icon">✓</span><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.category)} · ${money(p.price)} · ${p.qty} in stock</small>`:`<span class="result-icon">?</span><strong>Product not found</strong><small>No product matches that barcode.</small>`;}
function lookupBarcode(code){const p=products.find(p=>p.barcode===code.trim());showScanResult(p);if(p)toast('Product found: '+p.name);else toast('No matching product found.');}
$('lookupBarcodeBtn').addEventListener('click',()=>lookupBarcode($('barcodeInput').value));
$('barcodeInput').addEventListener('keydown',e=>{if(e.key==='Enter')lookupBarcode(e.target.value);});
async function startScanner(){
 if(!navigator.mediaDevices?.getUserMedia)return toast('Camera scanning is not supported in this browser.');
 try{
  scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  $('scannerVideo').srcObject=scannerStream;await $('scannerVideo').play();$('scannerVideo').parentElement.classList.add('scanning');$('scannerPlaceholder').style.display='none';$('startScanBtn').disabled=true;$('stopScanBtn').disabled=false;
  if('BarcodeDetector' in window){
   let detector;try{detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','qr_code']});}catch{detector=new BarcodeDetector();}
   scanTimer=setInterval(async()=>{if(!$('scannerVideo').videoWidth)return;try{const codes=await detector.detect($('scannerVideo'));if(codes.length){$('barcodeInput').value=codes[0].rawValue;lookupBarcode(codes[0].rawValue);stopScanner();}}catch(e){}},500);
   $('cameraNote').textContent='Point your camera at a barcode. Keep it inside the scan frame.';
  }else $('cameraNote').textContent='Camera is on, but this browser does not support automatic barcode detection. Enter the barcode manually.';
 }catch(err){toast('Could not access camera. Check browser permission.');$('cameraNote').textContent='Camera access failed. Allow camera permission and try again.';}
}
function stopScanner(){if(scanTimer)clearInterval(scanTimer);scanTimer=null;if(scannerStream)scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null;$('scannerVideo').srcObject=null;$('scannerVideo').parentElement.classList.remove('scanning');$('scannerPlaceholder').style.display='flex';$('startScanBtn').disabled=false;$('stopScanBtn').disabled=true;}
$('startScanBtn').addEventListener('click',startScanner);$('stopScanBtn').addEventListener('click',stopScanner);

$('todayDate').textContent=new Date().toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
renderAll();


// Mobile drawer controls: the menu button is always available on phones.
const mobileMenuBtn = $('mobileMenuBtn');
const sidebarBackdrop = $('sidebarBackdrop');
function setMobileMenu(open){
  $('sidebar').classList.toggle('mobile-open', open);
  sidebarBackdrop.classList.toggle('show', open);
  mobileMenuBtn?.setAttribute('aria-expanded', String(open));
  mobileMenuBtn?.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
}
mobileMenuBtn?.addEventListener('click',()=>setMobileMenu(!$('sidebar').classList.contains('mobile-open')));
sidebarBackdrop?.addEventListener('click',()=>setMobileMenu(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){setMobileMenu(false);$('productModal').classList.remove('show');}});
window.addEventListener('resize',()=>{if(window.innerWidth>760)setMobileMenu(false);});


// Simple browser-only demo authentication. For production, use server-side
// authentication (e.g. PHP + MySQL) and never store passwords in localStorage.
const AUTH_USERS_KEY = 'sf_demo_users';
const AUTH_SESSION_KEY = 'sf_demo_session';
function getUsers(){
 const parsed=readStorageJSON(AUTH_USERS_KEY, []);
 return Array.isArray(parsed)?parsed.filter(u=>u&&typeof u==='object'&&u.email):[];
}
function saveUsers(users){
 try { localStorage.setItem(AUTH_USERS_KEY,JSON.stringify(users)); return true; }
 catch(error) { console.error('Could not save accounts',error); return false; }
}
function showAuthMessage(message,type='error'){
 const box=$('authMessage');
 if(!box)return;
 box.textContent=message;
 box.className='auth-message '+(type==='success'?'success':'error');
 box.style.display='block';
}
function clearAuthMessage(){const box=$('authMessage');if(box){box.textContent='';box.style.display='none';}}
function showAuthMode(mode){
 const login=mode==='login';
 $('loginForm').classList.toggle('hidden',!login);
 $('registerForm').classList.toggle('hidden',login);
 $('showLogin').classList.toggle('active',login);
 $('showRegister').classList.toggle('active',!login);
 $('authTitle').textContent=login?'Welcome back':'Create your account';
 $('authSubtitle').textContent=login?'Log in to continue to your store dashboard.':'Register to get access to StockFlow.';
 clearAuthMessage();
}
$('showLogin').addEventListener('click',()=>showAuthMode('login'));
$('showRegister').addEventListener('click',()=>showAuthMode('register'));
$('loginToRegister').addEventListener('click',()=>showAuthMode('register'));
$('registerToLogin').addEventListener('click',()=>showAuthMode('login'));

function openApp(user){
 applyStoreName();
 $('authScreen').classList.add('hidden');
 $('appShell').style.display='flex';
 currentRole=user.role==='owner'?'owner':'cashier';
 document.body.classList.toggle('cashier-mode',currentRole==='cashier');
 const displayName=user.name||'User';
 $('profileName').textContent=displayName;
 $('profileRole').textContent=currentRole==='owner'?'Owner account':'Cashier account';
 $('welcomeName').textContent=displayName.split(' ')[0];
 $('signedInName').textContent=displayName;
 const initials=displayName.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
 document.querySelector('.avatar').textContent=initials;
 document.querySelector('.top-avatar').textContent=initials;
 $('topAlertBtn').style.display=currentRole==='owner'?'':'none';
 document.querySelectorAll('.owner-only').forEach(el=>el.style.display=currentRole==='owner'?'':'none');
 document.querySelectorAll('.nav-link').forEach(el=>el.style.display='');
 if(currentRole==='cashier'){
   document.querySelectorAll('[data-page="users"],[data-page="reports"],[data-page="history"],[data-page="alerts"]').forEach(el=>el.style.display='none');
   navigate('pos');
 }else{
   navigate('dashboard');
 }
 renderAll();
}
function logout(){
 localStorage.removeItem(AUTH_SESSION_KEY);
 stopScanner();
 cart=[];
 $('appShell').style.display='none';
 $('authScreen').classList.remove('hidden');
 $('loginPassword').value='';
 showAuthMode('login');
 $('showRegister').style.display='';$('loginToRegister').style.display='';
}
$('loginForm').addEventListener('submit',e=>{
 e.preventDefault(); clearAuthMessage();
 const email=$('loginEmail').value.trim().toLowerCase();
 const password=$('loginPassword').value;
 const user=getUsers().find(u=>String(u.email||'').trim().toLowerCase()===email && String(u.password??'')===password);
 if(!user){showAuthMessage('Hindi makita ang account. Tingnan ang email at password, o mag-register muna.');return;}
 try { localStorage.setItem(AUTH_SESSION_KEY,JSON.stringify({email:user.email})); }
 catch(error){showAuthMessage('Hindi ma-save ang login session. I-enable ang browser storage at subukan ulit.');return;}
 $('loginForm').reset();
 openApp(user);
});
$('registerForm').addEventListener('submit',e=>{
 e.preventDefault(); clearAuthMessage();
 const name=$('registerName').value.trim();
 const email=$('registerEmail').value.trim().toLowerCase();
 const password=$('registerPassword').value;
 const confirm=$('confirmPassword').value;
 if(name.length<2){showAuthMessage('Ilagay ang buong pangalan (minimum 2 characters).');$('registerName').focus();return;}
 if(!email || !$('registerEmail').checkValidity()){showAuthMessage('Maglagay ng valid na email address.');$('registerEmail').focus();return;}
 if(password.length<6){showAuthMessage('Ang password ay dapat may hindi bababa sa 6 characters.');$('registerPassword').focus();return;}
 if(password!==confirm){showAuthMessage('Hindi magkapareho ang password at confirmation.');$('confirmPassword').focus();return;}
 const users=getUsers();
 if(users.some(u=>String(u.email||'').trim().toLowerCase()===email)){showAuthMessage('Ginagamit na ang email na ito. Gumamit ng ibang email o mag-log in.');$('registerEmail').focus();return;}
 const user={name,email,password,role:users.length===0?'owner':'cashier',createdAt:new Date().toISOString()};
 try {
  users.push(user);
  if(!saveUsers(users)) { showAuthMessage('Hindi ma-save ang account. I-enable ang browser storage at subukan ulit.'); return; }
  localStorage.setItem(AUTH_SESSION_KEY,JSON.stringify({email}));
 } catch(error){showAuthMessage('Hindi ma-save ang account. Baka puno o naka-block ang browser storage. Subukan sa normal browser window.');return;}
 $('registerForm').reset();
 openApp(user);
});
(function restoreSession(){
 $('appShell').style.display='none';
 let session=null;
 try{session=readStorageJSON(AUTH_SESSION_KEY,null);}catch(error){session=null;}
 const user=session&&getUsers().find(u=>String(u.email||'').trim().toLowerCase()===String(session.email||'').trim().toLowerCase());
 if(user)openApp(user);
 else{$('authScreen').classList.remove('hidden');showAuthMode('login');}
})();


// Owner-managed cashier accounts. Cashiers use these same credentials on the login screen.
function renderCashierAccounts(){
 const rows=getUsers().filter(u=>u.role==='cashier');
 $('cashierTable').innerHTML=rows.map(u=>`<tr><td class="table-product">${escapeHTML(u.name)}</td><td>${escapeHTML(u.email)}</td><td>Cashier</td><td><span class="cashier-status">Active</span></td><td><button type="button" class="delete-btn" data-remove-cashier="${escapeHTML(u.email)}">Remove</button></td></tr>`).join('');
 $('cashierEmpty').classList.toggle('hidden',rows.length>0);
 $('cashierTable').querySelectorAll('[data-remove-cashier]').forEach(button=>button.addEventListener('click',()=>removeCashier(button.dataset.removeCashier)));
}
function removeCashier(email){
 if(currentRole!=='owner'){toast('Only the owner can remove cashier accounts.');return;}
 const users=getUsers();
 const cashier=users.find(u=>u.role==='cashier'&&String(u.email).trim().toLowerCase()===String(email).trim().toLowerCase());
 if(!cashier)return toast('Cashier account not found.');
 if(!confirm(`Remove cashier account for ${cashier.name} (${cashier.email})? This account will no longer be able to log in.`))return;
 saveUsers(users.filter(u=>!(u.role==='cashier'&&String(u.email).trim().toLowerCase()===String(email).trim().toLowerCase())));
 renderCashierAccounts();
 toast('Cashier account removed.');
}
$('addCashierBtn')?.addEventListener('click',()=>{
 $('cashierFormWrap').classList.toggle('hidden');
 if(!$('cashierFormWrap').classList.contains('hidden'))$('cashierName').focus();
});
$('cancelCashierBtn')?.addEventListener('click',()=>{
 $('cashierForm').reset();$('cashierFormWrap').classList.add('hidden');
});
$('cashierForm')?.addEventListener('submit',e=>{
 e.preventDefault();
 if(currentRole!=='owner'){toast('Only the owner can add cashier accounts.');return;}
 const name=$('cashierName').value.trim();
 const email=$('cashierEmail').value.trim().toLowerCase();
 const password=$('cashierPassword').value;
 const confirm=$('cashierConfirm').value;
 if(password.length<6){toast('Password must be at least 6 characters.');return;}
 if(password!==confirm){toast('Passwords do not match.');return;}
 const users=getUsers();
 if(users.some(u=>u.email===email)){toast('This email already has an account.');return;}
 users.push({name,email,password,role:'cashier',createdAt:new Date().toISOString()});
 saveUsers(users);
 $('cashierForm').reset();
 $('cashierFormWrap').classList.add('hidden');
 renderCashierAccounts();
 toast('Cashier account created. They can now log in with this email and password.');
});


// Store name is shared by Owner and cashier sessions in this browser.
const STORE_NAME_KEY='sf_store_name';
function getStoreName(){return (localStorage.getItem(STORE_NAME_KEY)||'My Store').trim()||'My Store';}
function applyStoreName(){
 const name=getStoreName();
 const display=$('storeNameDisplay');
 if(display)display.textContent=name;
 const input=$('storeNameInput');
 if(input && document.activeElement!==input)input.value=name;
 document.title=`${name} | StockFlow Inventory System`;
}
$('storeNameForm')?.addEventListener('submit',e=>{
 e.preventDefault();
 if(currentRole!=='owner'){toast('Only the owner can edit the store name.');return;}
 const name=$('storeNameInput').value.trim();
 if(!name){toast('Please enter a store name.');return;}
 localStorage.setItem(STORE_NAME_KEY,name);
 applyStoreName();
 toast('Store name updated successfully.');
});
applyStoreName();
