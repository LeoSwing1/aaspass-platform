'use client';
import { useEffect, useMemo, useState } from 'react';

const logo = '/branding/AasPass-LOGO.png';
const API = process.env.NEXT_PUBLIC_AASPASS_API_BASE_URL || 'http://localhost:4100/api/v1';

type Section = 'dashboard'|'orders'|'products'|'inventory'|'store'|'subscription'|'analytics'|'finance'|'staff'|'kyc'|'support';

type Order = {id:string; customer:string; items:string; amount:string; status:string; placed:string;};
type Product = {id:number; name:string; category:string; price:number; stock:number; image:string; active:boolean};

const products: Product[] = [
 {id:1,name:'Lay’s Classic Salted 52g',category:'Snacks & Chips',price:20,stock:36,image:'/branding/AasPass-icon.png',active:true},
 {id:2,name:'Haldiram’s Bhujia 200g',category:'Namkeen',price:68,stock:14,image:'/branding/AasPass-icon.png',active:true},
 {id:3,name:'Amul Taaza Milk 500ml',category:'Dairy & Bakery',price:31,stock:42,image:'/branding/AasPass-icon.png',active:true},
 {id:4,name:'Tata Salt 1kg',category:'Staples',price:30,stock:8,image:'/branding/AasPass-icon.png',active:true},
 {id:5,name:'Vim Dishwash 250ml',category:'Household',price:46,stock:4,image:'/branding/AasPass-icon.png',active:true},
 {id:6,name:'Dettol Soap 100g',category:'Personal Care',price:39,stock:0,image:'/branding/AasPass-icon.png',active:false},
];

const orders: Order[] = [
 {id:'#AP-10482',customer:'Aarav S.',items:'2 items',amount:'₹186',status:'NEW',placed:'2 min ago'},
 {id:'#AP-10481',customer:'Meera K.',items:'4 items',amount:'₹492',status:'PREPARING',placed:'8 min ago'},
 {id:'#AP-10479',customer:'Rahul P.',items:'1 item',amount:'₹86',status:'READY_FOR_PICKUP',placed:'12 min ago'},
 {id:'#AP-10473',customer:'Sana R.',items:'6 items',amount:'₹734',status:'OUT_FOR_DELIVERY',placed:'23 min ago'},
 {id:'#AP-10461',customer:'Kabir N.',items:'3 items',amount:'₹214',status:'DELIVERED',placed:'1 hr ago'},
];

function money(n:number){return `₹${n.toLocaleString('en-IN')}`}
function orderBadge(s:string){const map:any={NEW:['yellow','New'],PREPARING:['green','Preparing'],READY_FOR_PICKUP:['green','Ready'],OUT_FOR_DELIVERY:['green','Out for delivery'],DELIVERED:['','Delivered']};const [c,t]=map[s]??['',s];return <span className={`badge ${c}`}>{t}</span>}

export default function Page(){
 const [section,setSection]=useState<Section>('dashboard');
 const [logged,setLogged]=useState(false);
 const [otp,setOtp]=useState('');
 const [phone,setPhone]=useState('9999999999');
 const [apiLive,setApiLive]=useState(false);
 const [toast,setToast]=useState('');
 const [orderFilter,setOrderFilter]=useState('ALL');
 const [search,setSearch]=useState('');
 const [addOpen,setAddOpen]=useState(false);
 const [storeOpen,setStoreOpen]=useState(true);
 const [plan,setPlan]=useState('BUSINESS');
 const [localProducts,setLocalProducts]=useState(products);
 const [localOrders,setLocalOrders]=useState(orders);
 const [newProduct,setNewProduct]=useState({name:'',category:'Groceries',price:'',stock:'',unit:'1 unit'});

 const notify=(msg:string)=>{setToast(msg);setTimeout(()=>setToast(''),2500)};
const loadFromApi=async()=>{
  const token=typeof window!=='undefined'?localStorage.getItem('aaspass_access_token'):null;
  if(!token)return;
  try{
    const headers={Authorization:`Bearer ${token}`};
    const [dashR,prodR,orderR,subR]=await Promise.all([
      fetch(`${API}/vendor/dashboard`,{headers}),
      fetch(`${API}/vendor/products`,{headers}),
      fetch(`${API}/vendor/orders`,{headers}),
      fetch(`${API}/vendor/subscription`,{headers}),
    ]);
    if(dashR.ok){const d=await dashR.json();setApiLive(true);setStoreOpen(d.storeOpen??true);}
    if(prodR.ok){const d=await prodR.json();if(Array.isArray(d.products)&&d.products.length){setLocalProducts(d.products.map((p:any)=>({id:String(p.id),name:p.name,category:p.category_name||'Groceries',price:Number(p.price_paise||0)/100,stock:Number(p.stock_qty||0),image:p.image_url||'/branding/AasPass-icon.png',active:Boolean(p.is_active)})));}}
    if(orderR.ok){const d=await orderR.json();if(Array.isArray(d.orders)&&d.orders.length){setLocalOrders(d.orders.map((o:any)=>({id:o.id,customer:'Customer',items:'Order',amount:`₹${Math.round(Number(o.total_paise||0)/100)}`,status:o.status,placed:new Date(o.created_at).toLocaleString('en-IN')})));}}
    if(subR.ok){const d=await subR.json();const code=d.subscription?.code||d.subscription?.plan;if(code)setPlan(code);}
  }catch{setApiLive(false)}
};

const loginVendor=async()=>{
  if(otp!=='270303'){notify('Use OTP 270303 in development mode');return;}
  try{
    const r=await fetch(`${API}/auth/dev/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:'+91'+phone.replace(/\D/g,''),otp,role:'VENDOR_OWNER',name:'AasPass Vendor'})});
    if(r.ok){const d=await r.json();localStorage.setItem('aaspass_access_token',d.accessToken);setApiLive(true);setLogged(true);return;}
    notify('Development API login rejected');
  }catch{notify('API offline — local development mode');setLogged(true)}
};

useEffect(()=>{if(logged)loadFromApi()},[logged]);

 const nav:[Section,string][]=[['dashboard','Overview'],['orders','Orders'],['products','Products'],['inventory','Inventory'],['store','Store'],['subscription','Subscription'],['analytics','Analytics'],['finance','Finance & settlements'],['staff','Staff'],['kyc','KYC & verification'],['support','Support']];
 const filteredProducts=useMemo(()=>localProducts.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||p.category.toLowerCase().includes(search.toLowerCase())),[localProducts,search]);
 const filteredOrders=useMemo(()=>orderFilter==='ALL'?localOrders:localOrders.filter(o=>o.status===orderFilter),[localOrders,orderFilter]);
 const addProduct=()=>{
   if(!newProduct.name||!newProduct.price){notify('Add product name and price');return}
   setLocalProducts(p=>[{id:Date.now(),name:newProduct.name,category:newProduct.category,price:Number(newProduct.price),stock:Number(newProduct.stock)||0,image:'/branding/AasPass-icon.png',active:true},...p]);
   setNewProduct({name:'',category:'Groceries',price:'',stock:'',unit:'1 unit'});setAddOpen(false);notify('Product added to catalog');
 };
 const setOrderStatus=(id:string,status:string)=>{setLocalOrders(xs=>xs.map(o=>o.id===id?{...o,status}:o));notify(`Order ${id} moved to ${status.replaceAll('_',' ').toLowerCase()}`)};

 if(!logged) return <div className="login"><div className="loginCard"><img className="logo" src={logo}/><h1 style={{margin:'22px 0 8px'}}>Vendor workspace</h1><p className="muted">Sign in to manage your AasPass store, orders, catalog and settlements.</p><div className="field" style={{marginTop:20}}><label>Mobile number</label><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91 9XXXXXXXXX"/></div><div className="field" style={{marginTop:12}}><label>OTP</label><input value={otp} onChange={e=>setOtp(e.target.value)} placeholder="Developer OTP: 270303" maxLength={6}/></div><button className="btn primary" style={{width:'100%',marginTop:18}} onClick={loginVendor}>Continue</button><p style={{fontSize:11,color:'#8a9a92',marginTop:15}}>Development authentication only. Production uses the shared AasPass identity service.</p>{toast&&<div className="hero" style={{marginTop:16}}>{toast}</div>}</div></div>

 return <div className="shell">
   <aside className="sidebar">
     <div className="brand"><img src={logo}/><div><b>Vendor</b><small>AasPass merchant workspace</small></div></div>
     <nav className="nav">{nav.map(([key,label])=><button key={key} className={section===key?'active':''} onClick={()=>setSection(key)}>{label}</button>)}</nav>
     <div className="grow" style={{minHeight:24}} />
     <div className="miniCard"><b>Green Corner Mart</b><span>BI-VND-00124 • Verified</span><div style={{height:8}}/><span className="badge green">{storeOpen?'OPEN':'CLOSED'}</span></div>
   </aside>
   <main className="main">
    <header className="topbar"><div className="storeSwitch"><span className="statusDot"/><div><b>Green Corner Mart</b><div className="muted" style={{fontSize:11}}>Lucknow • Vendor ID BI-VND-00124</div></div></div><div style={{display:'flex',alignItems:'center',gap:12}}><button className="btn ghost" onClick={()=>setStoreOpen(v=>!v)}>{storeOpen?'Store is open':'Store is closed'}</button><span className={`badge ${apiLive?'green':'yellow'}`}>{apiLive?'LIVE API':'LOCAL MODE'}</span><div className="avatar">GC</div></div></header>
    <div className="content">
      {section==='dashboard'&&<Dashboard storeOpen={storeOpen} setSection={setSection} localOrders={localOrders} localProducts={localProducts} notify={notify}/>}      
      {section==='orders'&&<Orders orders={filteredOrders} filter={orderFilter} setFilter={setOrderFilter} onStatus={setOrderStatus}/>}      
      {section==='products'&&<Products products={filteredProducts} search={search} setSearch={setSearch} setAddOpen={setAddOpen} onToggle={(id)=>{setLocalProducts(xs=>xs.map(p=>p.id===id?{...p,active:!p.active}:p));notify('Catalog visibility updated')}}/>}
      {section==='inventory'&&<Inventory products={localProducts} notify={notify}/>}      
      {section==='store'&&<Store storeOpen={storeOpen} setStoreOpen={setStoreOpen} notify={notify}/>}      
      {section==='subscription'&&<Subscription plan={plan} setPlan={setPlan} notify={notify}/>}      
      {section==='analytics'&&<Analytics/>}
      {section==='finance'&&<Finance/>}
      {section==='staff'&&<Staff notify={notify}/>} 
      {section==='kyc'&&<KYC/>}
      {section==='support'&&<Support notify={notify}/>}    
    </div>
   </main>
   <div className="mobileNav">{nav.slice(0,5).map(([key,label])=><button key={key} onClick={()=>setSection(key)}>{label}</button>)}</div>
   {toast&&<div style={{position:'fixed',bottom:22,right:22,zIndex:40,background:'#153328',color:'#fff',padding:'12px 15px',borderRadius:12,boxShadow:'0 12px 35px rgba(0,0,0,.25)',fontSize:13}}>{toast}</div>}
   {addOpen&&<div className="modalWrap" onClick={()=>setAddOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}><h2>Add product</h2><div className="formGrid"><div className="field full"><label>Product name</label><input value={newProduct.name} onChange={e=>setNewProduct({...newProduct,name:e.target.value})} placeholder="e.g. Kurkure Masala Munch 90g"/></div><div className="field"><label>Category</label><select value={newProduct.category} onChange={e=>setNewProduct({...newProduct,category:e.target.value})}>{['Groceries','Snacks & Chips','Namkeen','Beverages','Dairy & Bakery','Household','Personal Care','Stationery','Electronics','Fresh Meat & Eggs'].map(x=><option key={x}>{x}</option>)}</select></div><div className="field"><label>Unit</label><input value={newProduct.unit} onChange={e=>setNewProduct({...newProduct,unit:e.target.value})}/></div><div className="field"><label>Price (₹)</label><input type="number" value={newProduct.price} onChange={e=>setNewProduct({...newProduct,price:e.target.value})}/></div><div className="field"><label>Opening stock</label><input type="number" value={newProduct.stock} onChange={e=>setNewProduct({...newProduct,stock:e.target.value})}/></div></div><div className="modalFoot"><button className="btn" onClick={()=>setAddOpen(false)}>Cancel</button><button className="btn primary" onClick={addProduct}>Add product</button></div></div></div>}
 </div>
}

function Dashboard({storeOpen,setSection,localOrders,localProducts,notify}:{storeOpen:boolean;setSection:(s:Section)=>void;localOrders:Order[];localProducts:Product[];notify:(s:string)=>void}){
 const low=localProducts.filter(p=>p.stock<10).length; const newOrders=localOrders.filter(o=>o.status==='NEW').length;
 return <><div className="titleRow"><div><h1>Good morning, Green Corner Mart</h1><p>Your AasPass store at a glance.</p></div><div className="actions"><button className="btn" onClick={()=>notify('Opening customer preview')}>Preview store</button><button className="btn primary" onClick={()=>setSection('products')}>Add product</button></div></div>
 <div className="hero" style={{marginBottom:18}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20,flexWrap:'wrap'}}><div><b>{storeOpen?'Your store is accepting orders':'Your store is currently closed'}</b><div className="muted" style={{fontSize:12,marginTop:4}}>{storeOpen?'Orders can be placed by nearby AasPass customers.':'Turn the store on to start receiving orders.'}</div></div><span className={`badge ${storeOpen?'green':'red'}`}>{storeOpen?'LIVE':'OFFLINE'}</span></div></div>
 <div className="grid4"><Stat label="Orders today" value={newOrders+23} sub="+18% vs yesterday"/><Stat label="Sales today" value="₹12,840" sub="From 31 completed orders"/><Stat label="Store rating" value="4.7" sub="286 customer reviews"/><Stat label="Low-stock SKUs" value={low} sub="Needs attention"/></div>
 <div className="two"><div className="card"><div className="cardHead"><h3>Today's orders</h3><button className="btn ghost" onClick={()=>setSection('orders')}>View all</button></div><div className="cardBody"><div className="row header"><div>Order</div><div>Customer</div><div>Amount</div><div>Status</div></div>{localOrders.slice(0,5).map(o=><div className="row" key={o.id}><div><b>{o.id}</b><div className="muted" style={{fontSize:11}}>{o.placed}</div></div><div>{o.customer}<div className="muted" style={{fontSize:11}}>{o.items}</div></div><div>{o.amount}</div><div>{orderBadge(o.status)}</div></div>)}</div></div>
 <div className="card"><div className="cardHead"><h3>Store health</h3></div><div className="cardBody"><div style={{display:'grid',gap:14}}><Health label="Catalog" value="92%" text="6 of 87 active SKUs need attention"/><Health label="Inventory" value="84%" text="18 SKUs are below reorder level"/><Health label="KYC" value="100%" text="Verified"/><Health label="Settlement" value="Good" text="Next scheduled settlement: Friday"/></div></div></div></div></>;
}
function Stat({label,value,sub}:{label:string;value:string|number;sub:string}){return <div className="stat"><div className="label">{label}</div><div className="value">{value}</div><div className="sub">{sub}</div></div>}
function Health({label,value,text}:{label:string;value:string;text:string}){return <div><div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><b>{label}</b><span className="muted">{value}</span></div><div style={{height:8,background:'#edf3ef',borderRadius:8,margin:'7px 0'}}><div style={{height:8,width:value.includes('%')?value:'86%',background:'#36a574',borderRadius:8}}/></div><div className="muted" style={{fontSize:11}}>{text}</div></div>}

function Orders({orders,filter,setFilter,onStatus}:{orders:Order[];filter:string;setFilter:(x:string)=>void;onStatus:(id:string,s:string)=>void}){const tabs=['ALL','NEW','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY','DELIVERED'];return <><div className="titleRow"><div><h1>Orders</h1><p>Accept, prepare and hand off every order.</p></div></div><div className="card"><div className="cardHead"><div className="tabs">{tabs.map(t=><button key={t} className={filter===t?'active':''} onClick={()=>setFilter(t)}>{t==='ALL'?'All':t.replaceAll('_',' ')}</button>)}</div><span className="muted" style={{fontSize:12}}>{orders.length} orders</span></div><div className="table"><div className="tableRow tableHead"><div>Order</div><div>Customer</div><div>Items</div><div>Amount</div><div>Status</div><div>Action</div></div>{orders.map(o=><div className="tableRow" key={o.id}><div><b>{o.id}</b><div className="muted" style={{fontSize:11}}>{o.placed}</div></div><div>{o.customer}</div><div>{o.items}</div><div><b>{o.amount}</b></div><div>{orderBadge(o.status)}</div><div>{o.status==='NEW'?<button className="btn primary" onClick={()=>onStatus(o.id,'PREPARING')}>Accept</button>:o.status==='PREPARING'?<button className="btn" onClick={()=>onStatus(o.id,'READY_FOR_PICKUP')}>Mark ready</button>:o.status==='READY_FOR_PICKUP'?<button className="btn" onClick={()=>onStatus(o.id,'OUT_FOR_DELIVERY')}>Hand off</button>:o.status==='OUT_FOR_DELIVERY'?<button className="btn" onClick={()=>onStatus(o.id,'DELIVERED')}>Complete</button>:<span className="muted">Done</span>}</div></div>)}</div></div></>}

function Products({products,search,setSearch,setAddOpen,onToggle}:{products:Product[];search:string;setSearch:(s:string)=>void;setAddOpen:(v:boolean)=>void;onToggle:(id:number)=>void}){return <><div className="titleRow"><div><h1>Products</h1><p>Manage your AasPass storefront catalog.</p></div><button className="btn primary" onClick={()=>setAddOpen(true)}>+ Add product</button></div><div className="searchbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search products or categories"/><button className="btn">Import</button><button className="btn">Export</button></div><div className="card"><div className="table"><div className="tableRow tableHead"><div>ID</div><div>Product</div><div>Price</div><div>Stock</div><div>Status</div><div>Manage</div></div>{products.map(p=><div className="tableRow" key={p.id}><div>PRD-{String(p.id).padStart(4,'0')}</div><div className="product"><img className="thumb" src={p.image}/><div><b>{p.name}</b><span>{p.category}</span></div></div><div><b>{money(p.price)}</b></div><div className={p.stock<10?'badge yellow':''}>{p.stock}</div><div><span className={`badge ${p.active?'green':'red'}`}>{p.active?'Active':'Hidden'}</span></div><div><button className="btn" onClick={()=>onToggle(p.id)}>{p.active?'Hide':'Publish'}</button></div></div>)}</div></div></>}

function Inventory({products,notify}:{products:Product[];notify:(s:string)=>void}){return <><div className="titleRow"><div><h1>Inventory</h1><p>Keep high-demand local products available.</p></div><button className="btn primary" onClick={()=>notify('Inventory sync queued')}>Sync inventory</button></div><div className="grid4"><Stat label="Total SKUs" value={products.length} sub="Across 18 categories"/><Stat label="In stock" value={products.filter(p=>p.stock>0).length} sub="Ready to sell"/><Stat label="Low stock" value={products.filter(p=>p.stock>0&&p.stock<10).length} sub="Below reorder point"/><Stat label="Out of stock" value={products.filter(p=>p.stock===0).length} sub="Hidden from customers"/></div><div className="card" style={{marginTop:18}}><div className="cardHead"><h3>Reorder queue</h3></div><div className="table"><div className="tableRow tableHead"><div>SKU</div><div>Product</div><div>Current stock</div><div>Suggested</div><div>Status</div><div>Action</div></div>{products.filter(p=>p.stock<10).map(p=><div className="tableRow" key={p.id}><div>PRD-{p.id}</div><div>{p.name}</div><div>{p.stock}</div><div>{Math.max(20,p.stock*3)}</div><div><span className={`badge ${p.stock===0?'red':'yellow'}`}>{p.stock===0?'Out of stock':'Low stock'}</span></div><div><button className="btn" onClick={()=>notify(`Reorder request created for ${p.name}`)}>Create reorder</button></div></div>)}</div></div></>}

function Store({storeOpen,setStoreOpen,notify}:{storeOpen:boolean;setStoreOpen:(v:boolean)=>void;notify:(s:string)=>void}){return <><div className="titleRow"><div><h1>Store</h1><p>Control your public storefront and operating hours.</p></div><button className="btn primary" onClick={()=>notify('Store settings saved')}>Save changes</button></div><div className="two"><div className="card"><div className="cardHead"><h3>Store profile</h3></div><div className="cardBody"><div className="formGrid"><div className="field full"><label>Store name</label><input defaultValue="Green Corner Mart"/></div><div className="field"><label>Phone</label><input defaultValue="+91 98XXXXXX24"/></div><div className="field"><label>Rating</label><input defaultValue="4.7 • 286 reviews" readOnly/></div><div className="field full"><label>Address</label><textarea defaultValue="12, Lohia Nagar, Lucknow, Uttar Pradesh" rows={3}/></div><div className="field"><label>Service radius</label><select defaultValue="3 km"><option>1 km</option><option>3 km</option><option>5 km</option></select></div><div className="field"><label>Preparation time</label><select defaultValue="15–25 min"><option>10–15 min</option><option>15–25 min</option><option>25–40 min</option></select></div></div></div></div><div className="card"><div className="cardHead"><h3>Order availability</h3></div><div className="cardBody"><div className="switch"><input type="checkbox" checked={storeOpen} onChange={e=>setStoreOpen(e.target.checked)}/><b>{storeOpen?'Accepting orders':'Not accepting orders'}</b></div><p className="muted" style={{fontSize:12}}>Customers in your service area can see live availability.</p><div style={{marginTop:20}}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=><div key={d} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderTop:'1px solid var(--line)',fontSize:12}}><span>{d}</span><span className="muted">09:00 – 22:00</span></div>)}</div></div></div></div></>}

function Subscription({plan,setPlan,notify}:{plan:string;setPlan:(p:string)=>void;notify:(s:string)=>void}){const data=[['STARTER',199,'For small local shops',['Storefront','Order management','Basic analytics']],['BUSINESS',499,'For growing vendors',['Everything in Starter','Promotions','Inventory insights','Customer insights']],['PRO',999,'For high-volume vendors',['Everything in Business','Advanced analytics','Priority support','Premium placement tools']]];return <><div className="titleRow"><div><h1>Subscription</h1><p>Choose the workspace that matches your store.</p></div><button className="btn primary" onClick={()=>notify(`Plan change requested: ${plan}`)}>Save plan</button></div><div className="planGrid">{data.map(([code,price,desc,features]:any)=><div key={code} className={`plan ${plan===code?'selected':''}`}><div style={{display:'flex',justifyContent:'space-between'}}><h3>{code}</h3>{plan===code&&<span className="badge green">Current</span>}</div><div className="price">₹{price}<span style={{fontSize:12,fontWeight:500,color:'var(--muted)'}}>/month</span></div><div className="muted" style={{fontSize:12}}>{desc}</div>{features.map((f:string)=><div className="feature" key={f}>✓ {f}</div>)}<button className={`btn ${plan===code?'primary':''}`} style={{width:'100%',marginTop:10}} onClick={()=>setPlan(code)}>{plan===code?'Selected':'Choose plan'}</button></div>)}</div></>}

function Analytics(){return <><div className="titleRow"><div><h1>Analytics</h1><p>Understand demand, products, customers and store performance.</p></div></div><div className="grid4"><Stat label="Orders (30d)" value="812" sub="+22%"/><Stat label="Sales (30d)" value="₹3.84L" sub="Before taxes/settlement adjustments"/><Stat label="Repeat customers" value="41%" sub="+6 pts"/><Stat label="Avg. basket" value="₹473" sub="Across completed orders"/></div><div className="two"><div className="card"><div className="cardHead"><h3>30-day order trend</h3></div><div className="cardBody"><div className="chart">{[28,40,35,48,56,46,62,72,58,82,74,92,86,79,96,88,105,98,112,104].map((h,i)=><div key={i} className="bar" style={{height:`${h}%`}}/>)}</div><div className="axis"><span>30 days ago</span><span>Today</span></div></div></div><div className="card"><div className="cardHead"><h3>Top categories</h3></div><div className="cardBody">{[['Snacks & Chips','28%'],['Groceries','21%'],['Dairy & Bakery','17%'],['Household','12%'],['Beverages','9%']].map(([n,v])=><div key={n} style={{padding:'11px 0',borderTop:'1px solid var(--line)',display:'flex',justifyContent:'space-between',fontSize:12}}><span>{n}</span><b>{v}</b></div>)}</div></div></div></>}

function Finance(){return <><div className="titleRow"><div><h1>Finance & settlements</h1><p>See vendor earnings, subscription charges and marketplace settlement status.</p></div></div><div className="grid4"><Stat label="Gross sales (30d)" value="₹3.84L" sub="Product value sold"/><Stat label="AasPass subscription" value="₹499" sub="Current Business plan"/><Stat label="Pending settlement" value="₹18,420" sub="Scheduled Friday"/><Stat label="Refunds" value="₹1,240" sub="3 orders"/></div><div className="card" style={{marginTop:18}}><div className="cardHead"><h3>Settlement ledger</h3><button className="btn">Download statement</button></div><div className="table"><div className="tableRow tableHead"><div>Date</div><div>Reference</div><div>Gross</div><div>Adjustments</div><div>Net</div><div>Status</div></div>{[['20 Sep','SET-20481','₹34,820','₹420','₹34,400','Scheduled'],['13 Sep','SET-20192','₹41,218','₹618','₹40,600','Paid'],['06 Sep','SET-19877','₹29,840','₹340','₹29,500','Paid']].map(r=><div className="tableRow" key={r[1]}>{r.map((x,i)=><div key={i}>{i===5?<span className="badge green">{x}</span>:x}</div>)}</div>)}</div></div></>}

function Staff({notify}:{notify:(s:string)=>void}){const people=[['Priya M.','Store Manager','Active'],['Aman S.','Order Desk','Active'],['Ritu K.','Catalog Staff','Invited']];return <><div className="titleRow"><div><h1>Staff</h1><p>Control access inside your store without sharing owner credentials.</p></div><button className="btn primary" onClick={()=>notify('Staff invitation started')}>Invite staff</button></div><div className="card"><div className="table"><div className="tableRow tableHead"><div>Name</div><div>Role</div><div>Status</div><div>Access</div><div>Last active</div><div>Manage</div></div>{people.map(p=><div className="tableRow" key={p[0]}><div><b>{p[0]}</b></div><div>{p[1]}</div><div><span className={`badge ${p[2]==='Active'?'green':'yellow'}`}>{p[2]}</span></div><div>Orders, Catalog</div><div className="muted">Today</div><div><button className="btn" onClick={()=>notify(`Editing access for ${p[0]}`)}>Manage</button></div></div>)}</div></div></>}

function KYC(){return <><div className="titleRow"><div><h1>KYC & verification</h1><p>Your vendor verification center.</p></div><span className="badge green">Verified</span></div><div className="two"><div className="card"><div className="cardHead"><h3>Business verification</h3></div><div className="cardBody"><div className="list">{['Business profile','Owner identity','Business address','Bank settlement details'].map(x=><div style={{padding:'14px 0',borderTop:'1px solid var(--line)',display:'flex',justifyContent:'space-between',fontSize:13}} key={x}><span>{x}</span><span className="badge green">Verified</span></div>)}</div></div></div><div className="card"><div className="cardHead"><h3>Documents</h3></div><div className="cardBody"><p className="muted" style={{fontSize:12}}>Documents are securely handled by the AasPass verification service. Replace or update a document only when the platform requests it.</p><button className="btn">View document checklist</button></div></div></div></>}

function Support({notify}:{notify:(s:string)=>void}){return <><div className="titleRow"><div><h1>Support</h1><p>Get help with orders, payouts, catalog and your AasPass account.</p></div><button className="btn primary" onClick={()=>notify('New support ticket started')}>Create ticket</button></div><div className="grid4"><Stat label="Open tickets" value="2" sub="1 needs your reply"/><Stat label="Average response" value="18m" sub="This month"/><Stat label="Resolved" value="47" sub="Last 30 days"/><Stat label="Help center" value="24/7" sub="Guides & FAQs"/></div></>}
