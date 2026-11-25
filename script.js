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
let products = JSON.parse(localStorage.getItem('sf_products') || 'null') || starterProducts;
let history = JSON.parse(localStorage.getItem('sf_history') || 'null') || [
 {product:'Bottled Water',action:'Stock In',qty:20,user:'Admin Owner',date:dateTime()},
 {product:'Potato Chips',action:'Stock Out',qty:5,user:'Admin Owner',date:dateTime()},
 {product:'Instant Noodles',action:'Added',qty:24,user:'Admin Owner',date:dateTime()}
];
let sales = JSON.parse(localStorage.getItem('sf_sales') || '[]');
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
 renderAll();
 if(window.innerWidth<=760)$('sidebar').classList.remove('mobile-open');
}
document.querySelectorAll('.nav-link').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.page)));
document.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.go)));
$('collapseBtn').addEventListener('click',()=>{if(innerWidth<=760)$('sidebar').classList.toggle('mobile-open');else{$('sidebar').classList.toggle('collapsed');document.querySelector('.main-area').classList.toggle('expanded');}});
$('topAlertBtn').addEventListener('click',()=>navigate('alerts'));
$('helpBtn').addEventListener('click',()=>toast('Tip: Add products in Inventory, then sell them in Point of Sale.'));
$('logoutBtn').addEventListener('click',()=>toast('Demo mode: no real account is signed in.'));

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
$('roleSelect').addEventListener('change',e=>setRole(e.target.value));

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
