const API = 'http://127.0.0.1:8000';
let state = { role: null, username: null, fullName: null, tcNo: null, token: null, isAdmin: false, cart: [], citizen: null };

/*tc kimlik dogrulama algoritması*/
function validateTurkishTC(tc) {
  if (!tc || !/^\d{11}$/.test(tc)) return false;
  if (tc[0] === '0') return false;
  
  const digits = tc.split('').map(Number);
  
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  
  const tenth = ((oddSum * 7) - evenSum) % 10;
  if (digits[9] !== tenth) return false;
  
  const eleventh = digits.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  if (digits[10] !== eleventh) return false;
  
  return true;
}

/* LOGIN */
async function doLogin() {
  const username = document.getElementById('in-user').value.trim();
  const pass = document.getElementById('in-pass').value;
  try {
    const result = await apiPost('/giris', { kullanici_adi: username, sifre: pass });
    document.getElementById('login-err').classList.add('hidden');
    state.role = result.rol;
    state.username = result.kullanici_adi;
    state.fullName = result.ad_soyad;
    state.tcNo = result.tc_no;
    state.token = result.token;
    state.isAdmin = result.rol === 'Yönetici';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    
    await loadPersonelLimit(); // 📌 Girişte güncel limiti çek
    applyRole(); 
    go('kasa'); 
    loadInventory();
  } catch(e) {
    document.getElementById('login-err').innerHTML = '<span>⚠️</span><span>' + e.message + '</span>';
    document.getElementById('login-err').classList.remove('hidden');
  }
}
document.getElementById('in-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

function doLogout() {
  state = { role: null, username: null, fullName: null, tcNo: null, token: null, isAdmin: false, cart: [], citizen: null };
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('in-pass').value = '';
  document.getElementById('in-user').value = '';
  document.getElementById('login-err').classList.add('hidden');
  document.getElementById('logged-user-name').textContent = '-';
  document.getElementById('logged-user-tc').textContent = 'T.C.: -';
}

function applyRole() {
  const tag = document.getElementById('role-tag-wrap');
  const txt = document.getElementById('role-tag-text');
  document.getElementById('logged-user-name').textContent = state.fullName || state.username || '-';
  document.getElementById('logged-user-tc').textContent = 'T.C.: ' + (state.tcNo || 'Tanımlı değil');
  txt.textContent = state.isAdmin ? '👑 Yönetici — Tam Yetki' : '👤 Personel — Kısıtlı Yetki';
  tag.className = 'role-tag ' + (state.isAdmin ? 'role-admin' : 'role-staff');

  const bakiyeBtn = document.getElementById('nav-bakiye');
  const addBtn = document.getElementById('tab-add-btn');
  const balanceInput = document.getElementById('bal-amount');

  if (state.isAdmin) {
    balanceInput.removeAttribute('max');
    bakiyeBtn.removeAttribute('disabled');
    document.getElementById('lock-bakiye').classList.add('hidden');
    addBtn.removeAttribute('disabled');
    document.getElementById('lock-add').classList.add('hidden');
    document.getElementById('nav-kullanicilar').removeAttribute('disabled');
    document.getElementById('lock-kullanicilar').classList.add('hidden');
  } else {
    // 📌 Dinamik limit uygulanır:
    balanceInput.setAttribute('max', currentPersonelLimit.toString());
    bakiyeBtn.removeAttribute('disabled');
    document.getElementById('lock-bakiye').classList.add('hidden');
    addBtn.setAttribute('disabled', 'disabled');
    document.getElementById('lock-add').classList.remove('hidden');
    document.getElementById('nav-kullanicilar').setAttribute('disabled', 'disabled');
    document.getElementById('lock-kullanicilar').classList.remove('hidden');
  }
}

/* NAV */
function go(page) {
  if (!state.isAdmin && page === 'kullanicilar') {
    toast('Bu bölüm yalnızca yönetici erişebilir.', 'error');
    return;
  }

  ['kasa','bakiye','sicil','envanter','kullanicilar'].forEach(p => {
    document.getElementById('p-'+p).classList.add('hidden');
    document.getElementById('nav-'+p).classList.remove('active');
  });
  document.getElementById('p-'+page).classList.remove('hidden');
  document.getElementById('nav-'+page).classList.add('active');
}

/* API */
async function apiGet(path) {
  const headers = state.token ? { Authorization: 'Bearer ' + state.token } : {};
  const r = await fetch(API + path, { headers });
  if (!r.ok) { const e = await r.json().catch(() => ({detail:'Sunucu hatası'})); throw new Error(e.detail||'Hata'); }
  return r.json();
}
async function apiPost(path, body) {
  const headers = { 'Content-Type':'application/json' };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const r = await fetch(API + path, { method:'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(() => ({detail:'Sunucu hatası'})); throw new Error(e.detail||'Hata'); }
  return r.json();
}

/* TOAST */
function toast(msg, type='info') {
  const w = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  w.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* HTML BUILDERS */
function alertHTML(type, msg) { return `<div class="alert ${type}">${msg}</div>`; }
function badgeHTML(type, txt) { return `<span class="badge ${type}">${txt}</span>`; }
function metricHTML(label, val, cls='') {
  return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value ${cls}">${val}</div></div>`;
}
function profRow(k, v) { return `<div class="prof-row"><div class="prof-key">${k}</div><div>${v}</div></div>`; }

/* KASA */
async function kasaQuery() {
  const tc = document.getElementById('kasa-tc').value.trim();
  if (!validateTurkishTC(tc)) { 
    toast('Lütfen geçerli bir T.C. Kimlik Numarası girin.', 'error'); 
    return; 
  }
  state.cart = []; renderCart();
  try {
    const v = await apiGet('/vatandaslar/' + tc);
    state.citizen = v;
    document.getElementById('kc-name').textContent = v.ad_soyad;
    document.getElementById('kc-tc').textContent = v.tc_no;
    document.getElementById('kc-pts').textContent = v.kredi_puani + ' Puan';
    document.getElementById('kasa-citizen').classList.remove('hidden');
    toast(v.ad_soyad + ' bulundu.', 'success');
  } catch(e) {
    state.citizen = null;
    document.getElementById('kasa-citizen').classList.add('hidden');
    toast('Vatandaş bulunamadı: ' + e.message, 'error');
  }
}

async function addToCart() {
  const barkod = document.getElementById('kasa-barkod').value.trim();
  const qty = parseInt(document.getElementById('kasa-qty').value);
  if (!barkod) { toast('Barkod giriniz.','error'); return; }
  if (!Number.isInteger(qty) || qty <= 0) { toast('Adet 0’dan büyük olmalıdır.','error'); return; }
  try {
    const u = await apiGet('/urunler/' + barkod);
    if (!addProductToCart(u, qty)) return;
    document.getElementById('kasa-barkod').value = '';
    document.getElementById('kasa-qty').value = 1;
    renderCart();
    toast(`"${u.urun_adi}" eklendi.`, 'success');
  } catch(e) { toast('Ürün bulunamadı: ' + e.message, 'error'); }
}

function addProductToCart(product, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    toast('Adet 0’dan büyük olmalıdır.', 'error');
    return false;
  }
  if (!product.stok_miktari || product.stok_miktari <= 0) {
    toast(`"${product.urun_adi}" stokta yok.`, 'error');
    return false;
  }
  const idx = state.cart.findIndex(item => item.barkod === product.barkod);
  const currentQuantity = idx >= 0 ? state.cart[idx].qty : 0;
  if (currentQuantity + quantity > product.stok_miktari) {
    toast(`"${product.urun_adi}" için yeterli stok yok. Mevcut stok: ${product.stok_miktari}, sepetteki miktar: ${currentQuantity}.`, 'error');
    return false;
  }
  if (idx >= 0) {
    state.cart[idx].qty += quantity;
    state.cart[idx].total = state.cart[idx].qty * state.cart[idx].pts;
  } else {
    state.cart.push({
      barkod: product.barkod,
      name: product.urun_adi,
      qty: quantity,
      pts: product.puan_degeri,
      total: product.puan_degeri * quantity
    });
  }
  renderCart();
  return true;
}

async function loadUsers() {
  if (!state.isAdmin) return;
  const wrap = document.getElementById('users-table-wrap');
  wrap.innerHTML = '<div class="cart-empty"><p>Kullanıcılar yükleniyor...</p></div>';
  
  try {
    const users = await apiGet('/kullanicilar');
    if (!users || !users.length) {
      wrap.innerHTML = alertHTML('warning', '⚠️ Sistemde kayıtlı kullanıcı bulunamadı.');
      return;
    }

    let html = `<div class="tbl-wrap"><table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Kullanıcı Adı</th>
          <th>Şifre</th>
          <th>Ad Soyad</th>
          <th>T.C. Kimlik No</th>
          <th>Rol</th>
        </tr>
      </thead>
      <tbody>`;

    users.forEach(u => {
      const badgeCls = u.rol === 'Yönetici' ? 'role-admin' : 'role-staff';
      html += `<tr>
        <td><span class="mono">#${u.id}</span></td>
        <td><strong>${u.kullanici_adi}</strong></td>
        <td><span class="mono" style="color:var(--purple); font-weight:700;">${u.sifre}</span></td>
        <td>${u.ad_soyad || '-'}</td>
        <td><span class="mono">${u.tc_no || '-'}</span></td>
        <td><span class="badge ${badgeCls}">${u.rol}</span></td>
      </tr>`;
    });

    html += `</tbody></table></div>`;
    wrap.innerHTML = html;
  } catch (e) {
    wrap.innerHTML = alertHTML('error', '❌ Kullanıcılar yüklenirken hata oluştu: ' + e.message);
  }
}


const oldGo = go;
go = function(page) {
  oldGo(page);
  if (page === 'kullanicilar' && state.isAdmin) {
    loadUsers();
  }
};

async function searchProducts() {
  const query = document.getElementById('kasa-urun-ara').value.trim().toLocaleLowerCase('tr-TR');
  const resultsEl = document.getElementById('kasa-urun-sonuclari');
  if (!query) {
    resultsEl.innerHTML = alertHTML('warning', '⚠️ Aramak istediğiniz ürün adını girin.');
    return;
  }
  resultsEl.innerHTML = '<div class="cart-empty" style="padding:16px 0">🔎 Ürünler aranıyor...</div>';
  try {
    const products = await apiGet('/urunler/');
    const matches = products.filter(product =>
      product.urun_adi.toLocaleLowerCase('tr-TR').includes(query)
    );
    if (!matches.length) {
      resultsEl.innerHTML = alertHTML('warning', '⚠️ Bu ada uygun ürün bulunamadı.');
      return;
    }
    resultsEl.innerHTML = matches.map((product, index) => `
      <div class="cart-row" style="gap:8px">
        <div class="cart-name">${product.urun_adi}<small>${product.barkod} · ${product.puan_degeri} P. · ${product.stok_miktari} adet stok</small></div>
        <button class="btn btn-green btn-sm" onclick="addSearchResultToCart(${index})">➕ Ekle</button>
      </div>`).join('');
    window.kasaSearchResults = matches;
  } catch(e) {
    resultsEl.innerHTML = alertHTML('error', '❌ Ürün araması yapılamadı: ' + e.message);
  }
}

function addSearchResultToCart(index) {
  const product = window.kasaSearchResults && window.kasaSearchResults[index];
  const quantity = parseInt(document.getElementById('kasa-qty').value) || 1;
  if (!product) return;
  if (!addProductToCart(product, quantity)) return;
  document.getElementById('kasa-qty').value = 1;
  toast(`"${product.urun_adi}" sepete eklendi.`, 'success');
}

function clearCart() { state.cart = []; renderCart(); }

function removeFromCart(i) { state.cart.splice(i,1); renderCart(); }

function renderCart() {
  const el = document.getElementById('cart-list');
  const sumEl = document.getElementById('cart-summary');
  if (!state.cart.length) {
    el.innerHTML = `<div class="cart-empty"><div style="font-size:32px;margin-bottom:8px">🛒</div>Sepet boş. Ürün barkodu okutun.</div>`;
    sumEl.classList.add('hidden'); return;
  }
  let total = 0, html = '';
  state.cart.forEach((item, i) => {
    total += item.total;
    html += `<div class="cart-row">
      <div class="cart-name">${item.name}<small>${item.barkod} · ${item.qty} adet × ${item.pts} P.</small></div>
      <div class="cart-pts">${item.total} P.</div>
      <button class="btn btn-red btn-sm" onclick="removeFromCart(${i})">✕</button>
    </div>`;
  });
  el.innerHTML = html;
  document.getElementById('cart-total-pts').textContent = total + ' Puan';
  sumEl.classList.remove('hidden');
}

async function checkout() {
  if (!state.citizen) { toast('Önce vatandaş sorgulayın!','error'); return; }
  if (!state.cart.length) { toast('Sepet boş!','error'); return; }
  try {
    const r = await apiPost('/satis/yap', {
      tc_no: state.citizen.tc_no,
      sepet: state.cart.map(x => ({ barkod: x.barkod, adet: x.qty }))
    });
    toast(`Satış tamamlandı! Kalan puan: ${r.kalan_puan}`, 'success');
    state.cart = []; state.citizen = null;
    document.getElementById('kasa-citizen').classList.add('hidden');
    document.getElementById('kasa-tc').value = '';
    renderCart();
  } catch(e) { toast('Satış hatası: ' + e.message, 'error'); }
}

/* BAKİYE */
async function balQuery() {
  const tc = document.getElementById('bal-tc').value.trim();
  if (!validateTurkishTC(tc)) { 
    toast('Lütfen geçerli bir T.C. Kimlik Numarası girin.','error'); 
    return; 
  }
  try {
    const v = await apiGet('/vatandaslar/' + tc);
    document.getElementById('bc-name').textContent = v.ad_soyad;
    document.getElementById('bc-tc').textContent = v.tc_no;
    document.getElementById('bc-pts').textContent = v.kredi_puani + ' Puan';
    document.getElementById('bal-citizen').classList.remove('hidden');
    document.getElementById('bal-msg').innerHTML = '';
  } catch(e) {
    document.getElementById('bal-citizen').classList.add('hidden');
    document.getElementById('bal-msg').innerHTML = alertHTML('error', '⚠️ ' + e.message);
  }
}

function balTypeChange() {
  const t = document.getElementById('bal-type').value;
  document.getElementById('bal-value').value = t==='dakika' ? 1 : t==='saat' ? 24 : 30;
}

async function loadBalance() {
  const tc     = document.getElementById('bal-tc').value.trim();
  const amount = parseInt(document.getElementById('bal-amount').value);
  const type   = document.getElementById('bal-type').value;
  const value  = parseInt(document.getElementById('bal-value').value);
  const msgEl  = document.getElementById('bal-msg');
  if (!amount || amount <= 0) { msgEl.innerHTML = alertHTML('warning','⚠️ Puan 0\'dan büyük olmalı.'); return; }
  if (!validateTurkishTC(tc)) { msgEl.innerHTML = alertHTML('warning','⚠️ Geçersiz T.C. Kimlik Numarası.'); return; }
  if (!state.isAdmin && amount > 50) {
    msgEl.innerHTML = alertHTML('warning', '⚠️ Personel tek seferde en fazla 50 puan yükleyebilir.');
    return;
  }
  try {
    const r = await apiPost('/vatandaslar/kredi-yukle', {
      tc_no: tc, yuklenecek_puan: amount, gecerlilik_tipi: type, gecerlilik_degeri: value
    });
    document.getElementById('bc-pts').textContent = r.kredi_puani + ' Puan';
    msgEl.innerHTML = alertHTML('success', `✅ ${amount} puan yüklendi! Yeni bakiye: <strong>${r.kredi_puani} Puan</strong>`);
    loadPoints(tc);
    toast(`${amount} puan başarıyla yüklendi.`, 'success');
  } catch(e) { msgEl.innerHTML = alertHTML('error', '❌ ' + e.message); }
}

/* SİCİL */
async function sicilSearch() {
  const q = document.getElementById('sicil-q').value.trim();
  if (!q) { toast('Arama terimi girin.','error'); return; }
  const resEl = document.getElementById('sicil-result');
  resEl.innerHTML = `<div class="cart-empty"><div style="font-size:32px">🔍</div><p>Aranıyor...</p></div>`;
  document.getElementById('detail-panel').classList.add('hidden');
  try {
    const list = await apiGet('/vatandaslar/sorgula/' + encodeURIComponent(q));
    if (!list || !list.length) { resEl.innerHTML = alertHTML('warning','⚠️ Eşleşen vatandaş bulunamadı.'); return; }
    if (list.length === 1) { resEl.innerHTML = ''; openDetail(list[0].tc_no); return; }
    let html = `<div class="card mb16"><div class="card-title">🔍 ${list.length} vatandaş bulundu — Seçin</div>
      <div class="tbl-wrap"><table><thead><tr>
        <th>Sicil</th><th>Ad Soyad</th><th>T.C.</th><th>Bakiye</th><th>Durum</th><th></th>
      </tr></thead><tbody>`;
    list.forEach(v => {
      html += `<tr>
        <td><span class="mono">#${v.id}</span></td>
        <td><strong>${v.ad_soyad}</strong></td>
        <td><span class="mono">${v.tc_no}</span></td>
        <td style="font-family:var(--mono);color:var(--blue)">${v.kredi_puani} P.</td>
        <td>${badgeHTML(v.durum?'aktif':'pasif', v.durum?'Aktif':'Pasif')}</td>
        <td><button class="btn btn-primary btn-sm" onclick="openDetail('${v.tc_no}')">Detay →</button></td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
    resEl.innerHTML = html;
  } catch(e) { resEl.innerHTML = alertHTML('error','❌ ' + e.message); }
}

async function addCitizen() {
  const tc = document.getElementById('new-citizen-tc').value.trim();
  const name = document.getElementById('new-citizen-name').value.trim();
  const birth = document.getElementById('new-citizen-birth').value.trim();
  const address = document.getElementById('new-citizen-address').value.trim();
  const points = parseInt(document.getElementById('new-citizen-points').value) || 0;
  const msgEl = document.getElementById('new-citizen-msg');
  if (!name) {
    msgEl.innerHTML = alertHTML('warning', '⚠️ Ad soyad zorunludur.');
    return;
  }
  if (!validateTurkishTC(tc)) {
    msgEl.innerHTML = alertHTML('warning', '⚠️ Geçersiz T.C. Kimlik Numarası. Lütfen geçerli bir T.C. numarası girin.');
    return;
  }
  try {
    const citizen = await apiPost('/vatandaslar/', {
      tc_no: tc, ad_soyad: name, dogum_tarihi: birth || null,
      adres: address || null, kredi_puani: points
    });
    msgEl.innerHTML = alertHTML('success', `✅ ${citizen.ad_soyad} başarıyla kaydedildi.`);
    document.getElementById('new-citizen-tc').value = '';
    document.getElementById('new-citizen-name').value = '';
    document.getElementById('new-citizen-birth').value = '';
    document.getElementById('new-citizen-address').value = '';
    document.getElementById('new-citizen-points').value = 0;
    document.getElementById('sicil-q').value = citizen.tc_no;
    citizenTab('search', document.querySelector('#p-sicil .tab-btn'));
    sicilSearch();
  } catch(e) {
    msgEl.innerHTML = alertHTML('error', '❌ ' + e.message);
  }
}

async function openDetail(tc) {
  const panel = document.getElementById('detail-panel');
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const v = await apiGet('/vatandaslar/' + tc);
    document.getElementById('detail-title').textContent = '👤 ' + v.ad_soyad + ' — Detay';
    document.getElementById('d-metrics').innerHTML =
      metricHTML('Sicil No', '#' + v.id) +
      metricHTML('T.C. Kimlik No', v.tc_no) +
      metricHTML('Mevcut Bakiye', v.kredi_puani + ' Puan', 'blue');
    
    // Durum ve işlem yapan yetkili bilgisi
    let durumMetni = v.durum ? '✅ Aktif (Yardım Alabilir)' : '🔴 Pasif (Yardım Alamaz)';
    if (v.durum_degistiren_kullanici) {
      const tarihStr = v.durum_degistirme_tarihi ? v.durum_degistirme_tarihi.replace('T', ' ').slice(0, 16) : '-';
      durumMetni += ` <br><small style="color:var(--text-2); font-weight:normal;">(Son işlem: <strong>${v.durum_degistiren_kullanici}</strong> | ${tarihStr})</small>`;
    }

    const butonMetni = v.durum ? '⛔ Hesabı Pasife Al' : '✅ Hesabı Aktif Et';
    const butonSinifi = v.durum ? 'btn-red' : 'btn-green';
    
    document.getElementById('d-profile').innerHTML =
      profRow('Ad Soyad', v.ad_soyad) +
      profRow('Doğum Tarihi', v.dogum_tarihi || 'Girilmemiş') +
      profRow('Hesap Durumu', durumMetni) +
      profRow('İkametgah', v.adres || 'Belirtilmedi') +
      `<div style="margin-top: 16px;">
        <button class="btn ${butonSinifi}" onclick="toggleCitizenStatus('${v.tc_no}')" ${state.isAdmin ? '' : 'disabled'}>
          ${butonMetni}
        </button>
        ${!state.isAdmin ? '<small style="color:var(--text-2);margin-left:8px;">(Sadece yönetici değiştirebilir)</small>' : ''}
      </div>`;

    tabSwitch('profil', document.querySelector('#p-sicil .tab-btn'));
    loadSales(tc); 
    loadPoints(tc);
  } catch(e) { 
    toast('Detay yüklenemedi: ' + e.message, 'error'); 
  }
}

//vatandaş pasif ve aktif etme işlemi
async function toggleCitizenStatus(tc) {
  if (!state.isAdmin) {
    toast('Bu işlemi yalnızca yönetici yapabilir.', 'error');
    return;
  }
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    
    const response = await fetch(`${API}/vatandaslar/durum-degistir/${tc}`, {
      method: 'PUT',
      headers
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Durum güncellenemedi.');
    }
    
    const updated = await response.json();
    toast(`${updated.ad_soyad} durumu güncellendi: ${updated.durum ? 'Aktif' : 'Pasif'}`, 'success');
    
    // Detay panelini ve arama listesini yenile
    openDetail(tc);
    const q = document.getElementById('sicil-q').value.trim();
    if (q) sicilSearch();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function loadSales(tc) {
  const el = document.getElementById('d-sales');
  try {
    const list = await apiGet('/satis/gecmis/' + tc);
    if (!list || !list.length) { el.innerHTML = `<div class="cart-empty"><div style="font-size:32px">🧾</div><p>Alışveriş kaydı yok.</p></div>`; return; }
    let html = alertHTML('info', `🧾 <strong>${list.length}</strong> adet geçmiş alışveriş fişi.`);
    [...list].reverse().forEach(s => {
      const t = s.tarih ? s.tarih.replace('T',' ').slice(0,16) : '-';
      html += `<div class="acc-item">
        <div class="acc-head" onclick="accToggle(this)">
          <div class="acc-left">🧾 Fiş #${s.id} &nbsp;|&nbsp; ${t} &nbsp;|&nbsp; İşlemi yapan: ${s.satan_kullanici||'Eski kayıt'}</div>
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-weight:700;color:var(--blue)">${s.toplam_puan} Puan</span>
            <span class="acc-arrow">▼</span>
          </div>
        </div>
        <div class="acc-body">
          <div class="tbl-wrap"><table><thead><tr>
            <th>Ürün Adı</th><th>Barkod</th><th>Adet</th><th>Birim Puan</th><th>Toplam</th>
          </tr></thead><tbody>
          ${s.detaylar.map(d => `<tr>
            <td><strong>${d.urun_adi||'Bilinmeyen'}</strong></td>
            <td><span class="mono">${d.barkod||'-'}</span></td>
            <td>${d.adet} adet</td>
            <td>${d.birim_puan} P.</td>
            <td style="font-family:var(--mono);color:var(--blue)">${d.adet*d.birim_puan} P.</td>
          </tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>`;
    });
    el.innerHTML = html;
  } catch(e) { el.innerHTML = alertHTML('error','❌ ' + e.message); }
}

async function loadPoints(tc) {
  const el = document.getElementById('d-points');
  try {
    const list = await apiGet('/vatandaslar/puan-gecmisi/' + tc);
    if (!list || !list.length) { el.innerHTML = `<div class="cart-empty"><div style="font-size:32px">📊</div><p>Puan yükleme kaydı yok.</p></div>`; return; }
    let html = alertHTML('info', `📊 <strong>${list.length}</strong> adet puan yükleme hareketi.`);
    html += `<div class="tbl-wrap"><table><thead><tr>
      <th>Yüklenen Puan</th><th>Yükleyen Kullanıcı</th><th>Yükleme Tarihi</th><th>Son Kullanma</th><th>Durum</th>
    </tr></thead><tbody>`;
    list.forEach(p => {
      html += `<tr>
        <td style="font-family:var(--mono);color:var(--green)">+${p.yuklenen_puan} Puan</td>
        <td><span class="mono">${p.yukleyen_kullanici||'Eski kayıt'}</span></td>
        <td>${p.yukleme_tarihi.replace('T',' ').slice(0,16)}</td>
        <td>${p.son_kullanma_tarihi.replace('T',' ').slice(0,16)}</td>
        <td>${badgeHTML(p.aktif?'aktif':'pasif', p.aktif?'✅ Aktif':'⏰ Süresi Doldu')}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;
  } catch(e) { el.innerHTML = alertHTML('error','❌ ' + e.message); }
}

function closeDetail() { document.getElementById('detail-panel').classList.add('hidden'); }

/* ENVANTER */
async function loadInventory() {
  const el = document.getElementById('inv-content');
  try {
    const list = await apiGet('/urunler/');
    if (!list || !list.length) { el.innerHTML = `<div class="cart-empty"><div style="font-size:32px">📦</div><p>Depoda ürün yok.</p></div>`; return; }
    let html = alertHTML('info', `📦 Depoda toplam <strong>${list.length}</strong> farklı ürün çeşidi mevcut.`);
    list.forEach(u => {
      const bad = u.stok_miktari < 10;
      html += `<div class="acc-item">
        <div class="acc-head" onclick="accToggle(this)">
          <div class="acc-left">${u.urun_adi} &nbsp;|&nbsp; <span class="mono">${u.barkod}</span></div>
          <div style="display:flex;align-items:center;gap:12px">
            <span class="${bad?'stock-bad':'stock-ok'}">${u.stok_miktari} Adet ${bad?'⚠️':'✅'}</span>
            <span class="acc-arrow">▼</span>
          </div>
        </div>
        <div class="acc-body">
          <div class="g3">
            ${metricHTML('Ürün Adı', u.urun_adi)}
            ${metricHTML('Puan Değeri', u.puan_degeri + ' Puan', 'blue')}
            ${metricHTML('Mevcut Stok', u.stok_miktari + ' Adet', bad ? '' : 'green')}
          </div>
          <p style="margin-top:12px;font-size:13px;color:var(--text-2)">
            Barkod: <span class="mono">${u.barkod}</span> &nbsp;|&nbsp; ID: <span class="mono">#${u.id}</span>
          </p>
        </div>
      </div>`;
    });
    el.innerHTML = html;
  } catch(e) { el.innerHTML = alertHTML('error','❌ Envanter yüklenemedi: ' + e.message); }
}

function generateAutoBarcode() {
  const now = new Date();
  const stamp = now.toISOString().slice(2, 19).replace(/[-T:]/g, '').replace(/\./g, '');
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `${stamp}${randomPart}`;
}

function syncBarcodeInputState() {
  const autoCb = document.getElementById('p-barkod-auto');
  const input = document.getElementById('p-barkod');
  const autoMode = autoCb.checked;
  input.disabled = autoMode;
  input.style.background = autoMode ? '#F8FAFC' : '#fff';
  if (autoMode && !input.value.trim()) {
    input.value = generateAutoBarcode();
  }
}

function ensureProductBarcode() {
  const autoCb = document.getElementById('p-barkod-auto');
  const input = document.getElementById('p-barkod');
  if (autoCb.checked) {
    input.value = generateAutoBarcode();
    input.disabled = true;
  } else {
    input.disabled = false;
    input.value = '';
    input.focus();
  }
}

async function addProduct() {
  const autoCb = document.getElementById('p-barkod-auto');
  const barkodInput = document.getElementById('p-barkod');
  const name   = document.getElementById('p-name').value.trim();
  const pts    = parseInt(document.getElementById('p-pts').value);
  const stock  = parseInt(document.getElementById('p-stock').value);
  const msgEl  = document.getElementById('add-prod-msg');
  if (!name) { msgEl.innerHTML = alertHTML('warning','⚠️ Ürün adı zorunludur.'); return; }

  let finalBarcode = barkodInput.value.trim();
  if (autoCb.checked) {
    finalBarcode = generateAutoBarcode();
  } else if (!finalBarcode) {
    msgEl.innerHTML = alertHTML('warning','⚠️ Manuel barkod girişi seçildiği için barkod zorunludur.');
    barkodInput.focus();
    return;
  }

  barkodInput.value = finalBarcode;

  try {
    const r = await apiPost('/urunler/', { barkod: finalBarcode, urun_adi: name, puan_degeri: pts, stok_miktari: stock });
    msgEl.innerHTML = alertHTML('success', `✅ "${r.urun_adi}" depoya eklendi/stok güncellendi! Stok: <strong>${r.stok_miktari}</strong> | Barkod: <strong>${r.barkod}</strong>`);
    document.getElementById('p-barkod').value = '';
    document.getElementById('p-name').value = '';
    document.getElementById('p-pts').value = 10;
    document.getElementById('p-stock').value = 100;
    document.getElementById('p-barkod-auto').checked = false;
    syncBarcodeInputState();
    loadInventory();
    toast(r.urun_adi + ' sisteme eklendi.', 'success');
  } catch(e) { msgEl.innerHTML = alertHTML('error','❌ ' + e.message); }
}

async function addUser() {
  const username = document.getElementById('new-username').value.trim();
  const fullName = document.getElementById('new-full-name').value.trim();
  const tcNo = document.getElementById('new-tc').value.trim();
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;
  const msgEl = document.getElementById('new-user-msg');
  if (!username || !fullName || !password) {
    msgEl.innerHTML = alertHTML('warning', '⚠️ Kullanıcı adı, ad soyad ve şifre zorunludur.');
    return;
  }
  if (!validateTurkishTC(tcNo)) {
    msgEl.innerHTML = alertHTML('warning', '⚠️ Geçersiz T.C. Kimlik Numarası. Lütfen geçerli bir T.C. numarası girin.');
    return;
  }
  try {
    const user = await apiPost('/kullanicilar', {
      kullanici_adi: username,
      sifre: password,
      ad_soyad: fullName,
      tc_no: tcNo,
      rol: role
    });
    msgEl.innerHTML = alertHTML('success', `✅ ${user.kullanici_adi} kullanıcısı ${user.rol} rolüyle oluşturuldu.`);
    document.getElementById('new-username').value = '';
    document.getElementById('new-full-name').value = '';
    document.getElementById('new-tc').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('show-new-password').checked = false;
    document.getElementById('new-password').type = 'password';
  } catch(e) {
    msgEl.innerHTML = alertHTML('error', '❌ ' + e.message);
  }
}

document.getElementById('show-new-password').addEventListener('change', function() {
  document.getElementById('new-password').type = this.checked ? 'text' : 'password';
});

function citizenTab(id, btn) {
  ['search', 'add'].forEach(tab => {
    document.getElementById('citizen-tab-' + tab).classList.toggle('hidden', tab !== id);
  });
  document.querySelectorAll('#p-sicil > .tab-bar .tab-btn').forEach(tabButton => tabButton.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

/* TABS */
function tabSwitch(id, btn) {
  ['profil','alisveris','puan'].forEach(t => document.getElementById('tab-'+t).classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  document.querySelectorAll('#p-sicil .tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function envTab(id, btn) {
  if (!state.isAdmin && id === 'add') {
    toast('Yeni ürün ekleme yalnızca yönetici tarafından yapılabilir.', 'error');
    return;
  }

  ['list','add'].forEach(t => document.getElementById('env-'+t).classList.remove('active'));
  document.getElementById('env-'+id).classList.add('active');
  document.querySelectorAll('#p-envanter .tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (id === 'add') {
    const autoCb = document.getElementById('p-barkod-auto');
    if (!autoCb) return;
    ensureProductBarcode();
  }
  if (id === 'list') loadInventory();
}
let currentPersonelLimit = 50;

// Sistemdeki güncel limiti sunucudan çeker
async function loadPersonelLimit() {
  try {
    const res = await apiGet('/ayarlar/personel-limiti');
    if (res && res.personel_puan_limiti !== undefined) {
      currentPersonelLimit = res.personel_puan_limiti;
      const inputCfg = document.getElementById('cfg-personel-limit');
      if (inputCfg) inputCfg.value = currentPersonelLimit;
      applyRole(); // Personelin bakiye giriş alanındaki max değerini günceller
    }
  } catch (e) {
    console.error("Limit çekilemedi:", e);
  }
}

// Yöneticinin yeni limit kaydetmesini sağlar
async function savePersonelLimit() {
  if (!state.isAdmin) return;
  const val = document.getElementById('cfg-personel-limit').value;
  const msgEl = document.getElementById('cfg-limit-msg');
  try {
    const res = await apiPost('/ayarlar/personel-limiti', {
      anahtar: 'personel_puan_limiti',
      deger: val.toString()
    });
    currentPersonelLimit = parseInt(val);
    msgEl.innerHTML = alertHTML('success', `✅ Personel limiti <strong>${val} puan</strong> olarak güncellendi.`);
    toast(`Personel limiti ${val} puan olarak ayarlandı.`, 'success');
    applyRole();
  } catch (e) {
    msgEl.innerHTML = alertHTML('error', '❌ ' + e.message);
  }
}

document.getElementById('p-barkod-auto').addEventListener('change', syncBarcodeInputState);

/* ACCORDION */
function accToggle(head) {
  const body = head.nextElementSibling;
  const open = head.classList.contains('open');
  head.classList.toggle('open', !open);
  body.classList.toggle('open', !open);
}

/* INIT */
document.getElementById('app').style.display = 'none';