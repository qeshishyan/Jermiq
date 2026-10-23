(() => {
  'use strict';
  const app = document.querySelector('#orders-admin-app');
  if (!app) return;
  const $ = selector => document.querySelector(selector);
  const texts = JSON.parse($('#site-translations')?.textContent || '{}');
  const t = value => texts[value] || value;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lang = document.documentElement.lang;
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'hy-AM';
  const price = value => value === null || value === undefined ? t('Գինը ճշտվում է') : Number(value).toLocaleString(locale, {maximumFractionDigits:2}) + ' ֏';
  const statuses = {new:'Նոր',confirmed:'Հաստատված',preparing:'Պատրաստվում է',shipped:'Ուղարկված',completed:'Ավարտված',cancelled:'Չեղարկված'};
  const statusHtml = value => `<span class="order-status order-status-${Object.hasOwn(statuses,value) ? value : 'new'}">${escape(t(statuses[value] || value))}</span>`;
  let page = 1, pageSize = 30, total = 0, orders = [], selectedId = '';
  let loading = false;
  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.method) { headers.set('Content-Type','application/json'); headers.set('X-CSRF-TOKEN',$('meta[name="csrf-token"]').content); }
    const response = await fetch(path,{credentials:'same-origin',...options,headers});
    let data;
    try { if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(); data = await response.json(); }
    catch { throw new Error(t('Սերվերից ստացվել է անսպասելի պատասխան։ Թարմացրեք էջը և փորձեք կրկին։')); }
    if (!response.ok) throw new Error(t(data.error) || t('Չհաջողվեց մշակել հարցումը։'));
    return data;
  }
  function error(message) { $('#orders-error').textContent = message; $('#orders-error').hidden = !message; }
  function date(value) { return new Date(value).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'}); }
  function renderList() {
    $('#orders-count').textContent = `${t('Պատվերներ')}: ${total}`;
    $('#orders-list').innerHTML = orders.length ? orders.map(order => `<button type="button" class="order-list-card${order.id===selectedId?' is-selected':''}" data-order-id="${escape(order.id)}" aria-pressed="${order.id===selectedId}"><div class="order-list-card-top"><strong>${escape(order.name)}</strong>${statusHtml(order.status)}</div><p>${escape(order.phone)} · ${escape(date(order.createdAt))}</p><div class="order-list-card-bottom"><span>${escape(order.id.slice(0,8))} · ${order.items.reduce((sum,item)=>sum+item.quantity,0)} ${escape(t('հատ'))}</span><b>${escape(order.subtotal===null ? t('Ճշտման ենթակա') : price(order.subtotal))}</b></div></button>`).join('') : `<div class="orders-empty">${escape(t('Պատվերներ չեն գտնվել։'))}</div>`;
    $('#orders-page').textContent = `${page} / ${Math.max(1,Math.ceil(total/pageSize))}`;
    $('#orders-prev').disabled = page <= 1;
    $('#orders-next').disabled = page * pageSize >= total;
  }
  function renderDetail(order) {
    const detail = $('#order-detail');
    if (!order) { detail.hidden=true; return; }
    detail.hidden=false;
    const field = (label,value,wide=false) => `<div${wide?' class="wide"':''}><dt>${escape(t(label))}</dt><dd>${escape(value || '—')}</dd></div>`;
    detail.innerHTML = `<div class="order-detail-heading"><div><h2>${escape(t('Պատվերի մանրամասները'))}</h2><div class="order-reference">${escape(order.id)}</div></div><button type="button" class="order-mobile-close" data-order-close aria-label="${escape(t('Փակել'))}">×</button></div><dl class="order-meta">${field('Անուն',order.name)}${field('Հեռախոս',order.phone)}${field('Էլ․ փոստ',order.email)}${field('Ստեղծված',date(order.createdAt))}${field('Ստացման եղանակ',t(order.deliveryMethod==='delivery'?'Առաքում':'Ինքնավերցում'))}${field('Վճարման եղանակ',t(order.paymentMethod==='cash'?'Կանխիկ':'Մենեջերի հետ համաձայնեցում'))}${field('Հասցե',order.address,true)}</dl><div class="order-items-scroll"><table class="order-items-table"><thead><tr><th>${escape(t('Ապրանք'))}</th><th class="number">${escape(t('Քանակ'))}</th><th class="number">${escape(t('Գին'))}</th><th class="number">${escape(t('Գումար'))}</th></tr></thead><tbody>${order.items.map(item=>`<tr><td>${escape(item.title)}${item.sku?`<small>${escape(t('Արտիկուլ'))}: ${escape(item.sku)}</small>`:''}${item.priceIsEstimate?`<small>${escape(t('Կողմնորոշիչ գին'))}</small>`:''}</td><td class="number">${item.quantity}</td><td class="number">${escape(price(item.unitPrice))}</td><td class="number">${escape(price(item.lineTotal))}</td></tr>`).join('')}</tbody></table></div><div class="order-totals"><span>${escape(t('Ապրանքների արժեքը'))}</span><strong>${escape(order.subtotal===null?t('Ճշտման ենթակա'):price(order.subtotal))}</strong></div>${order.subtotal===null?`<p class="text-sm">${escape(t('Նշված գներով մասի գումարը'))}: ${escape(price(order.knownSubtotal))}</p>`:''}<p class="order-confirmation-notice">${escape(t(order.deliveryMethod==='delivery'?'Առաքման արժեքը համաձայնեցվում է առանձին։':'Ինքնավերցում։ Ստացման պատրաստ լինելը հաստատում է մենեջերը։'))} ${order.requiresConfirmation?escape(t('Վերջնական գումարն ու առկայությունը անհրաժեշտ է համաձայնեցնել հաճախորդի հետ։')):''}</p>${order.message?`<h3>${escape(t('Հաճախորդի հաղորդագրությունը'))}</h3><p class="order-message">${escape(order.message)}</p>`:''}<form id="order-status-form" class="order-status-form"><label class="field">${escape(t('Կարգավիճակ'))}<select name="status" class="field-select">${Object.entries(statuses).map(([value,label])=>`<option value="${value}"${value===order.status?' selected':''}>${escape(t(label))}</option>`).join('')}</select></label><button class="btn" type="submit">${escape(t('Պահպանել կարգավիճակը'))}</button></form><p class="text-xs mt-4">${escape(t('Ապրանքների անվանումներն ու գները պահպանված են պատվերի ստեղծման պահից։'))}</p>`;
  }
  async function load() {
    if (loading) return;
    loading=true; error(''); $('#orders-refresh').disabled=true;
    try {
      const query = new URLSearchParams({page:String(page),q:$('#orders-query').value.trim(),status:$('#orders-status-filter').value,lang});
      const data = await api('/api/admin/orders?'+query);
      orders=data.orders; page=data.page; total=data.total; pageSize=data.pageSize;
      renderList(); renderDetail(orders.find(order=>order.id===selectedId));
    } catch (e) { error(e.message); }
    finally {loading=false; $('#orders-refresh').disabled=false;}
  }
  $('#orders-filter-form').addEventListener('submit',e=>{e.preventDefault();page=1;load();});
  $('#orders-refresh').addEventListener('click',load);
  $('#orders-prev').addEventListener('click',()=>{if(page>1){page--;load();}});
  $('#orders-next').addEventListener('click',()=>{if(page*pageSize<total){page++;load();}});
  $('#orders-list').addEventListener('click',event=>{
    const button=event.target.closest('[data-order-id]'); if(!button)return;
    selectedId=button.dataset.orderId; renderList(); renderDetail(orders.find(order=>order.id===selectedId));
    $('#order-detail').focus(); if(window.matchMedia?.('(max-width: 800px)')?.matches)$('#order-detail').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('#order-detail').addEventListener('click',event=>{if(event.target.closest('[data-order-close]')){selectedId='';renderList();renderDetail(null);}});
  $('#order-detail').addEventListener('submit',async event=>{
    if(event.target.id!=='order-status-form')return;
    event.preventDefault();const order=orders.find(x=>x.id===selectedId);if(!order)return;
    const button=event.target.querySelector('button[type="submit"]');button.disabled=true;error('');
    try{
      const data=await api('/api/admin/orders/'+encodeURIComponent(order.id)+'?lang='+encodeURIComponent(lang),{method:'PATCH',body:JSON.stringify({revision:order.revision,status:event.target.elements.status.value})});
      const index=orders.findIndex(x=>x.id===order.id);orders[index]=data.order;renderList();renderDetail(data.order);
      $('#orders-notice').textContent=t('Կարգավիճակը պահպանված է։');$('#orders-notice').hidden=false;
    }catch(e){error(e.message);button.disabled=false;}
  });
  load();
})();
